import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';

import {
  type Abi,
  type Address,
  type BlockOverrides,
  type Hex,
  type RequiredBy,
  type StateOverride,
  type TransactionReceipt,
  decodeFunctionResult,
  encodeFunctionData,
  multicall3Abi,
} from 'viem';

import type { L1BlobInputs, L1TxConfig, L1TxRequest, L1TxUtils } from '../l1_tx_utils/index.js';
import type { ExtendedViemWalletClient } from '../types.js';
import { tryDecodeRevertReason } from '../utils.js';

export const MULTI_CALL_3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

/**
 * Thrown by `Multicall3.forward` when the forwarder transaction lands but the receipt reports a
 * reverted status. This is not expected (aggregate3 uses allowFailure: true), so callers should
 * treat it as a fatal on-chain failure rather than retrying on a different publisher.
 */
export class MulticallForwarderRevertedError extends Error {
  constructor(public readonly receipt: TransactionReceipt) {
    super(`Multicall3 forwarder tx reverted: ${receipt.transactionHash}`);
    this.name = 'MulticallForwarderRevertedError';
  }
}

/** ABI fragment for aggregate3Value — not included in viem's multicall3Abi. */
export const aggregate3ValueAbi = [
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'target', type: 'address' },
          { internalType: 'bool', name: 'allowFailure', type: 'bool' },
          { internalType: 'uint256', name: 'value', type: 'uint256' },
          { internalType: 'bytes', name: 'callData', type: 'bytes' },
        ],
        internalType: 'struct Multicall3.Call3Value[]',
        name: 'calls',
        type: 'tuple[]',
      },
    ],
    name: 'aggregate3Value',
    outputs: [
      {
        components: [
          { internalType: 'bool', name: 'success', type: 'bool' },
          { internalType: 'bytes', name: 'returnData', type: 'bytes' },
        ],
        internalType: 'struct Multicall3.Result[]',
        name: 'returnData',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

/** A single call to embed inside an aggregate3 simulation. The abi is used to decode revert reasons. */
export type SimulateAggregate3Request = {
  to: Address;
  data: Hex;
  /** Optional ABI used to decode the revert reason if this entry reverts. */
  abi?: Abi;
};

export type SimulateAggregate3EntryResult = {
  success: boolean;
  /** Decoded revert reason text when `success === false` and a request abi was provided. */
  revertReason?: string;
  /** Raw return data hex. `'0x'` for successful entries with void return. */
  returnData: Hex;
};

/**
 * Outcome of a bundle simulation.
 * - `decoded`: eth_simulateV1 ran and produced a per-entry Result[]. Use `entries` for filtering.
 * - `fallback`: the node does not support eth_simulateV1; `fallbackGasEstimate` was returned and no
 *    per-entry info is available. Caller should send the bundle as-is with a conservative gas cap.
 */
export type SimulateAggregate3Result =
  | { kind: 'decoded'; entries: SimulateAggregate3EntryResult[]; gasUsed: bigint }
  | { kind: 'fallback'; gasUsed: bigint };

export type SimulateAggregate3Options = {
  blockOverrides?: BlockOverrides<bigint, number>;
  stateOverrides?: StateOverride;
  /**
   * If set, append a state override that fakes the sender's balance during the simulation so a
   * low or zero balance does not cause the simulate to fail with insufficient funds. The fake
   * balance is applied to `l1TxUtils.getSenderAddress()`.
   */
  fakeSenderBalance?: bigint;
  /** Gas cap to pass on the simulate call itself (defaults to viem's behavior). */
  gas?: bigint;
  /** When eth_simulateV1 is unavailable, fall back to this gas estimate instead of throwing. */
  fallbackGasEstimate?: bigint;
};

export class Multicall3 {
  /**
   * Returns true iff Multicall3 bytecode is deployed at MULTI_CALL_3_ADDRESS. An empty result from
   * a non-existent contract would otherwise silently validate any bundle that uses Multicall3.
   */
  static async hasCode(l1TxUtils: L1TxUtils): Promise<boolean> {
    const code = await l1TxUtils.getCode(EthAddress.fromString(MULTI_CALL_3_ADDRESS));
    return !!code && code !== '0x';
  }

  /**
   * Simulates an aggregate3 call composed of the given requests via eth_simulateV1 and decodes the
   * per-entry Result[]. Entries that revert are returned with a decoded revertReason (if the request
   * provided an abi).
   *
   * Use this to pre-validate a bundle before sending it through `Multicall3.forward`. The caller can
   * drop reverted entries from the bundle and re-simulate with the reduced list to get an accurate
   * `gasUsed`.
   */
  static async simulateAggregate3(
    requests: SimulateAggregate3Request[],
    l1TxUtils: L1TxUtils,
    opts: SimulateAggregate3Options = {},
  ): Promise<SimulateAggregate3Result> {
    const calldata = encodeFunctionData({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      args: [
        requests.map(r => ({
          target: r.to,
          callData: r.data,
          allowFailure: true,
        })),
      ],
    });

    const stateOverrides: StateOverride = [...(opts.stateOverrides ?? [])];
    if (opts.fakeSenderBalance !== undefined) {
      stateOverrides.push({
        address: l1TxUtils.getSenderAddress().toString(),
        balance: opts.fakeSenderBalance,
      });
    }

    const simResult = await l1TxUtils.simulate(
      { to: MULTI_CALL_3_ADDRESS, data: calldata, gas: opts.gas },
      opts.blockOverrides,
      stateOverrides,
      multicall3Abi,
      { fallbackGasEstimate: opts.fallbackGasEstimate },
    );

    if (simResult.result === '0x') {
      return { kind: 'fallback', gasUsed: simResult.gasUsed };
    }

    const decoded = decodeFunctionResult({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      data: simResult.result,
    }) as readonly { success: boolean; returnData: `0x${string}` }[];

    const entries: SimulateAggregate3EntryResult[] = decoded.map((entry, i) => {
      if (entry.success) {
        return { success: true, returnData: entry.returnData };
      }
      const abi = requests[i].abi;
      const revertReason = abi ? tryDecodeRevertReason(entry.returnData, abi) : undefined;
      return { success: false, returnData: entry.returnData, revertReason };
    });

    return { kind: 'decoded', entries, gasUsed: simResult.gasUsed };
  }

  /**
   * Sends a batch of requests through aggregate3. Individual calls may fail (allowFailure: true),
   * but the top-level multicall is expected to land successfully. Throws if the send fails or if
   * the receipt reports a reverted status.
   */
  static async forward<TOptGasLimitRequired extends boolean>(
    requests: L1TxRequest[],
    l1TxUtils: L1TxUtils,
    gasConfig: TOptGasLimitRequired extends true ? RequiredBy<L1TxConfig, 'gasLimit'> : L1TxConfig | undefined,
    blobConfig: L1BlobInputs | undefined,
    opts: { gasLimitRequired?: TOptGasLimitRequired } = {},
  ) {
    if (opts.gasLimitRequired && !gasConfig?.gasLimit) {
      throw new Error('Multicall gasLimit is required when gasLimitRequired is true');
    }

    const args = requests
      .filter(request => request.to !== null)
      .map(r => ({
        target: r.to!,
        callData: r.data!,
        allowFailure: true,
      }));
    const encodedForwarderData = encodeFunctionData({
      abi: multicall3Abi,
      functionName: 'aggregate3',
      args: [args],
    });

    const { receipt } = await l1TxUtils.sendAndMonitorTransaction(
      {
        to: MULTI_CALL_3_ADDRESS,
        data: encodedForwarderData,
        abi: multicall3Abi,
      },
      gasConfig,
      blobConfig,
    );

    // This shouldn't happen. Any failure in individual calls is swallowed by forward since we set
    // allowFailure to true for all calls, so a reverted status here would indicate a problem with
    // the Multicall3 contract itself or the forwarder transaction (such as an out-of-gas).
    if (receipt.status !== 'success') {
      throw new MulticallForwarderRevertedError(receipt);
    }

    const stats = await l1TxUtils.getTransactionStats(receipt.transactionHash);
    return { receipt, stats, multicallData: encodedForwarderData };
  }

  /** Batch multiple value transfers into a single aggregate3Value call on Multicall3. */
  static async forwardValue(calls: { to: Address; value: bigint }[], l1TxUtils: L1TxUtils, logger: Logger) {
    const args = calls.map(c => ({
      target: c.to,
      allowFailure: false,
      value: c.value,
      callData: '0x' as Hex,
    }));

    const data = encodeFunctionData({
      abi: aggregate3ValueAbi,
      functionName: 'aggregate3Value',
      args: [args],
    });

    const totalValue = calls.reduce((sum, c) => sum + c.value, 0n);

    logger.info(`Sending aggregate3Value with ${calls.length} calls`, { totalValue });
    const { receipt } = await l1TxUtils.sendAndMonitorTransaction({
      to: MULTI_CALL_3_ADDRESS,
      data,
      value: totalValue,
    });

    if (receipt.status !== 'success') {
      throw new Error(`aggregate3Value transaction reverted: ${receipt.transactionHash}`);
    }

    return { receipt };
  }
}

export async function deployMulticall3(l1Client: ExtendedViemWalletClient, logger: Logger) {
  const existing = await l1Client.getCode({ address: MULTI_CALL_3_ADDRESS });
  if (existing && existing !== '0x') {
    logger.verbose('Multicall3 already deployed', { address: MULTI_CALL_3_ADDRESS });
    return;
  }

  const deployer = '0x05f32b3cc3888453ff71b01135b34ff8e41263f2';
  const sendEth = await l1Client.sendTransaction({ to: deployer, value: 10n ** 17n });
  logger.info('Sent 0.1 ETH to deployer', { deployer, value: 10n ** 17n });
  const sendEthReceipt = await l1Client.waitForTransactionReceipt({ hash: sendEth });
  if (sendEthReceipt.status !== 'success') {
    logger.error('Failed to send ETH to deployer', undefined, { sendEthReceipt });
    throw new Error('Failed to send ETH to deployer');
  } else {
    logger.info('Sent 0.1 ETH to deployer', { deployer, value: 10n ** 17n });
  }

  const tx =
    '0xf90f538085174876e800830f42408080b90f00608060405234801561001057600080fd5b50610ee0806100206000396000f3fe6080604052600436106100f35760003560e01c80634d2301cc1161008a578063a8b0574e11610059578063a8b0574e1461025a578063bce38bd714610275578063c3077fa914610288578063ee82ac5e1461029b57600080fd5b80634d2301cc146101ec57806372425d9d1461022157806382ad56cb1461023457806386d516e81461024757600080fd5b80633408e470116100c65780633408e47014610191578063399542e9146101a45780633e64a696146101c657806342cbb15c146101d957600080fd5b80630f28c97d146100f8578063174dea711461011a578063252dba421461013a57806327e86d6e1461015b575b600080fd5b34801561010457600080fd5b50425b6040519081526020015b60405180910390f35b61012d610128366004610a85565b6102ba565b6040516101119190610bbe565b61014d610148366004610a85565b6104ef565b604051610111929190610bd8565b34801561016757600080fd5b50437fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0140610107565b34801561019d57600080fd5b5046610107565b6101b76101b2366004610c60565b610690565b60405161011193929190610cba565b3480156101d257600080fd5b5048610107565b3480156101e557600080fd5b5043610107565b3480156101f857600080fd5b50610107610207366004610ce2565b73ffffffffffffffffffffffffffffffffffffffff163190565b34801561022d57600080fd5b5044610107565b61012d610242366004610a85565b6106ab565b34801561025357600080fd5b5045610107565b34801561026657600080fd5b50604051418152602001610111565b61012d610283366004610c60565b61085a565b6101b7610296366004610a85565b610a1a565b3480156102a757600080fd5b506101076102b6366004610d18565b4090565b60606000828067ffffffffffffffff8111156102d8576102d8610d31565b60405190808252806020026020018201604052801561031e57816020015b6040805180820190915260008152606060208201528152602001906001900390816102f65790505b5092503660005b8281101561047757600085828151811061034157610341610d60565b6020026020010151905087878381811061035d5761035d610d60565b905060200281019061036f9190610d8f565b6040810135958601959093506103886020850185610ce2565b73ffffffffffffffffffffffffffffffffffffffff16816103ac6060870187610dcd565b6040516103ba929190610e32565b60006040518083038185875af1925050503d80600081146103f7576040519150601f19603f3d011682016040523d82523d6000602084013e6103fc565b606091505b50602080850191909152901515808452908501351761046d577f08c379a000000000000000000000000000000000000000000000000000000000600052602060045260176024527f4d756c746963616c6c333a2063616c6c206661696c656400000000000000000060445260846000fd5b5050600101610325565b508234146104e6576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601a60248201527f4d756c746963616c6c333a2076616c7565206d69736d6174636800000000000060448201526064015b60405180910390fd5b50505092915050565b436060828067ffffffffffffffff81111561050c5761050c610d31565b60405190808252806020026020018201604052801561053f57816020015b606081526020019060019003908161052a5790505b5091503660005b8281101561068657600087878381811061056257610562610d60565b90506020028101906105749190610e42565b92506105836020840184610ce2565b73ffffffffffffffffffffffffffffffffffffffff166105a66020850185610dcd565b6040516105b4929190610e32565b6000604051808303816000865af19150503d80600081146105f1576040519150601f19603f3d011682016040523d82523d6000602084013e6105f6565b606091505b5086848151811061060957610609610d60565b602090810291909101015290508061067d576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601760248201527f4d756c746963616c6c333a2063616c6c206661696c656400000000000000000060448201526064016104dd565b50600101610546565b5050509250929050565b43804060606106a086868661085a565b905093509350939050565b6060818067ffffffffffffffff8111156106c7576106c7610d31565b60405190808252806020026020018201604052801561070d57816020015b6040805180820190915260008152606060208201528152602001906001900390816106e55790505b5091503660005b828110156104e657600084828151811061073057610730610d60565b6020026020010151905086868381811061074c5761074c610d60565b905060200281019061075e9190610e76565b925061076d6020840184610ce2565b73ffffffffffffffffffffffffffffffffffffffff166107906040850185610dcd565b60405161079e929190610e32565b6000604051808303816000865af19150503d80600081146107db576040519150601f19603f3d011682016040523d82523d6000602084013e6107e0565b606091505b506020808401919091529015158083529084013517610851577f08c379a000000000000000000000000000000000000000000000000000000000600052602060045260176024527f4d756c746963616c6c333a2063616c6c206661696c656400000000000000000060445260646000fd5b50600101610714565b6060818067ffffffffffffffff81111561087657610876610d31565b6040519080825280602002602001820160405280156108bc57816020015b6040805180820190915260008152606060208201528152602001906001900390816108945790505b5091503660005b82811015610a105760008482815181106108df576108df610d60565b602002602001015190508686838181106108fb576108fb610d60565b905060200281019061090d9190610e42565b925061091c6020840184610ce2565b73ffffffffffffffffffffffffffffffffffffffff1661093f6020850185610dcd565b60405161094d929190610e32565b6000604051808303816000865af19150503d806000811461098a576040519150601f19603f3d011682016040523d82523d6000602084013e61098f565b606091505b506020830152151581528715610a07578051610a07576040517f08c379a000000000000000000000000000000000000000000000000000000000815260206004820152601760248201527f4d756c746963616c6c333a2063616c6c206661696c656400000000000000000060448201526064016104dd565b506001016108c3565b5050509392505050565b6000806060610a2b60018686610690565b919790965090945092505050565b60008083601f840112610a4b57600080fd5b50813567ffffffffffffffff811115610a6357600080fd5b6020830191508360208260051b8501011115610a7e57600080fd5b9250929050565b60008060208385031215610a9857600080fd5b823567ffffffffffffffff811115610aaf57600080fd5b610abb85828601610a39565b90969095509350505050565b6000815180845260005b81811015610aed57602081850181015186830182015201610ad1565b81811115610aff576000602083870101525b50601f017fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe0169290920160200192915050565b600082825180855260208086019550808260051b84010181860160005b84811015610bb1578583037fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe001895281518051151584528401516040858501819052610b9d81860183610ac7565b9a86019a9450505090830190600101610b4f565b5090979650505050505050565b602081526000610bd16020830184610b32565b9392505050565b600060408201848352602060408185015281855180845260608601915060608160051b870101935082870160005b82811015610c52577fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa0888703018452610c40868351610ac7565b95509284019290840190600101610c06565b509398975050505050505050565b600080600060408486031215610c7557600080fd5b83358015158114610c8557600080fd5b9250602084013567ffffffffffffffff811115610ca157600080fd5b610cad86828701610a39565b9497909650939450505050565b838152826020820152606060408201526000610cd96060830184610b32565b95945050505050565b600060208284031215610cf457600080fd5b813573ffffffffffffffffffffffffffffffffffffffff81168114610bd157600080fd5b600060208284031215610d2a57600080fd5b5035919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b600082357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff81833603018112610dc357600080fd5b9190910192915050565b60008083357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe1843603018112610e0257600080fd5b83018035915067ffffffffffffffff821115610e1d57600080fd5b602001915036819003821315610a7e57600080fd5b8183823760009101908152919050565b600082357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc1833603018112610dc357600080fd5b600082357fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa1833603018112610dc357600080fdfea2646970667358221220bb2b5c71a328032f97c676ae39a1ec2148d3e5d6f73d95e9b17910152d61f16264736f6c634300080c00331ca0edce47092c0f398cebf3ffc267f05c8e7076e3b89445e0fe50f6332273d4569ba01b0b9d000e19b24c5869b0fc3b22b0d6fa47cd63316875cbbd577d76e6fde086';

  const deployTx = await l1Client.sendRawTransaction({
    serializedTransaction: tx,
  });
  const deployTxReceipt = await l1Client.waitForTransactionReceipt({ hash: deployTx });
  if (deployTxReceipt.status !== 'success') {
    logger.error('Failed to deploy Multicall3', undefined, { deployTxReceipt });
    throw new Error('Failed to deploy Multicall3');
  } else {
    logger.info('Deployed Multicall3');
  }
}
