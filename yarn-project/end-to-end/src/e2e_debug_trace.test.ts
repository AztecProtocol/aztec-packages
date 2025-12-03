import type { AztecNodeConfig } from '@aztec/aztec-node';
import { EthAddress, type Logger, type Wallet, retryUntil } from '@aztec/aztec.js';
import {
  type ExtendedViemWalletClient,
  L1Deployer,
  type PublisherManager,
  createExtendedL1Client,
} from '@aztec/ethereum';
import type { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { bufferToHex } from '@aztec/foundation/string';
import type { DateProvider } from '@aztec/foundation/timer';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { TestSequencerClient } from '@aztec/sequencer-client/test';
import type { AztecNodeAdmin, PXE } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';
import 'jest-extended';
import { type Hex, decodeFunctionData, encodeFunctionData, multicall3Abi } from 'viem';

import { getPrivateKeyFromIndex, setup } from './fixtures/utils.js';

// In this test we deploy a simple forwarder contract to L1, this serves as an additional proxy

// const source = `contract ForwarderProxy {
//     function forward(address target, bytes calldata data) external payable returns (bytes memory) {
//         (bool success, bytes memory result) = target.call{value: msg.value}(data);
//         require(success, "call failed");
//         return result;
//     }
// }`;

const abi = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'target',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: 'data',
        type: 'bytes',
      },
    ],
    name: 'forward',
    outputs: [
      {
        internalType: 'bytes',
        name: '',
        type: 'bytes',
      },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

const bytecode =
  '0x6080604052348015600e575f5ffd5b506103bf8061001c5f395ff3fe60806040526004361061001d575f3560e01c80636fadcf7214610021575b5f5ffd5b61003b600480360381019061003691906101d0565b610051565b604051610048919061029d565b60405180910390f35b60605f5f8573ffffffffffffffffffffffffffffffffffffffff1634868660405161007d9291906102f9565b5f6040518083038185875af1925050503d805f81146100b7576040519150601f19603f3d011682016040523d82523d5f602084013e6100bc565b606091505b509150915081610101576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016100f89061036b565b60405180910390fd5b80925050509392505050565b5f5ffd5b5f5ffd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61013e82610115565b9050919050565b61014e81610134565b8114610158575f5ffd5b50565b5f8135905061016981610145565b92915050565b5f5ffd5b5f5ffd5b5f5ffd5b5f5f83601f8401126101905761018f61016f565b5b8235905067ffffffffffffffff8111156101ad576101ac610173565b5b6020830191508360018202830111156101c9576101c8610177565b5b9250929050565b5f5f5f604084860312156101e7576101e661010d565b5b5f6101f48682870161015b565b935050602084013567ffffffffffffffff81111561021557610214610111565b5b6102218682870161017b565b92509250509250925092565b5f81519050919050565b5f82825260208201905092915050565b8281835e5f83830152505050565b5f601f19601f8301169050919050565b5f61026f8261022d565b6102798185610237565b9350610289818560208601610247565b61029281610255565b840191505092915050565b5f6020820190508181035f8301526102b58184610265565b905092915050565b5f81905092915050565b828183375f83830152505050565b5f6102e083856102bd565b93506102ed8385846102c7565b82840190509392505050565b5f6103058284866102d5565b91508190509392505050565b5f82825260208201905092915050565b7f63616c6c206661696c65640000000000000000000000000000000000000000005f82015250565b5f610355600b83610311565b915061036082610321565b602082019050919050565b5f6020820190508181035f83015261038281610349565b905091905056fea26469706673582212209a1c8cf638cf1569450a731ef9457b862f9e153b0a46e5555429bcf4dffd999564736f6c634300081e0033';

const ForwarderArtifact = {
  name: 'Forwarder',
  contractAbi: abi,
  contractBytecode: bytecode as Hex,
};

describe('e2e_debug_trace_transaction', () => {
  jest.setTimeout(5 * 60 * 1000); // 5 minutes

  let pxe: PXE;
  let logger: Logger;
  let owner: Wallet;
  let aztecNodeAdmin: AztecNodeAdmin;
  let sequencer: TestSequencerClient;
  let publisherManager: PublisherManager;
  let teardown: () => Promise<void>;
  let config: AztecNodeConfig;
  let forwarderAddress: EthAddress;
  let l1Client: ExtendedViemWalletClient;
  let coinbase = EthAddress.random();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('multi-txs block', () => {
    beforeAll(async () => {
      let sequencerClient: SequencerClient | undefined;
      let maybeAztecNodeAdmin: AztecNodeAdmin | undefined;
      let dateProvider: DateProvider | undefined;

      ({
        teardown,
        pxe,
        logger,
        aztecNodeAdmin: maybeAztecNodeAdmin,
        wallets: [owner],
        sequencer: sequencerClient,
        config,
        dateProvider,
      } = await setup(2, {
        archiverPollingIntervalMS: 200,
        transactionPollingIntervalMS: 200,
        worldStateBlockCheckIntervalMS: 200,
        blockCheckIntervalMS: 200,
        maxSpeedUpAttempts: 0, // Disable speed ups, so that cancellation txs never make it through
        minTxsPerBlock: 0,
        coinbase: coinbase,
      }));
      sequencer = sequencerClient! as TestSequencerClient;
      publisherManager = sequencer.publisherManager;
      aztecNodeAdmin = maybeAztecNodeAdmin!;

      logger.info('Deploying Forwarder contract to L1');
      l1Client = createExtendedL1Client(config.l1RpcUrls, bufferToHex(getPrivateKeyFromIndex(0)!));

      const deployer = new L1Deployer(l1Client, 0, dateProvider, false, logger, undefined, false);

      forwarderAddress = (await deployer.deploy(ForwarderArtifact, [])).address;
      logger.info(`Deployed Forwarder at ${forwarderAddress.toString()}`);
    });

    beforeEach(async () => {
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
    });

    afterEach(async () => {
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
      // Clean up any mocks
      jest.restoreAllMocks();
    });

    afterAll(() => teardown());

    it('can process blocks using debug trace', async () => {
      // We intercept calls to sendAndMonitorTransaction to forward inner calls via the forwarder
      const l1Utils: L1TxUtilsWithBlobs[] = (publisherManager as any).publishers;

      // Intercept sendAndMonitorTransaction to access blobInputs directly
      const originalSendAndMonitor = l1Utils[0].sendAndMonitorTransaction.bind(l1Utils[0]);

      // auto-dispose of this spy at the end of this function
      using _ = jest
        .spyOn(l1Utils[0], 'sendAndMonitorTransaction')
        .mockImplementation(async function (request, gasConfig, blobInputs) {
          logger.info(`Intercepted sendAndMonitorTransaction to ${request.to}`);
          logger.info(`Blobs present: ${!!blobInputs?.blobs}, count: ${blobInputs?.blobs?.length ?? 0}`);

          // Wrap the original Multicall3 call with the forwarder
          // Call chain: Forwarder -> Multicall3 -> Rollup
          const forwarderCalldata = encodeFunctionData({
            abi,
            functionName: 'forward',
            args: [request.to as Hex, request.data as Hex],
          });

          const forwardedRequest = {
            to: forwarderAddress.toString() as Hex,
            data: forwarderCalldata,
          };

          logger.info(`Forwarding call to ${request.to} via forwarder at ${forwarderAddress.toString()}`);

          try {
            const result = await originalSendAndMonitor(forwardedRequest, gasConfig, blobInputs);
            logger.info(`Forwarded call sent with hash ${result.receipt.transactionHash}`);
            return result;
          } catch (err: any) {
            logger.error(`Failed to send forwarded transaction: ${err.message}`, err);
            throw err;
          }
        });

      expect(await pxe.getBlockNumber()).toBeGreaterThanOrEqual(2);

      // The current config requires at least 1 tx per block, so the block number won't be increasing

      // We now want to set the sequencer config to allow blocks with 0 transactions
      // Wait until we have successfully moved forward by a few blocks
      const numBlocksToMine = 3;
      const startBlockNumber = await pxe.getBlockNumber();
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 0 });
      const result = await retryUntil(
        async () => {
          const blockNumber = await pxe.getBlockNumber();
          return blockNumber >= startBlockNumber + numBlocksToMine;
        },
        'block number check',
        30,
        1,
      );
      expect(result).toBeTrue();

      // Restore the original sendAndMonitorTransaction
      l1Utils[0].sendAndMonitorTransaction = originalSendAndMonitor;
    });

    it('can process blocks with a failing call followed by a successful call', async () => {
      // We intercept calls to sendAndMonitorTransaction to:
      // 1. Decode the Multicall3 aggregate3 call
      // 2. Duplicate the inner call to the rollup
      // 3. Corrupt the first call so it reverts (with allowFailure: true)
      // 4. Keep the second call intact so it succeeds
      const l1Utils: L1TxUtilsWithBlobs[] = (publisherManager as any).publishers;

      const originalSendAndMonitor = l1Utils[0].sendAndMonitorTransaction.bind(l1Utils[0]);

      using _ = jest
        .spyOn(l1Utils[0], 'sendAndMonitorTransaction')
        .mockImplementation(async function (request, gasConfig, blobInputs) {
          logger.info(`Intercepted sendAndMonitorTransaction to ${request.to}`);
          logger.info(`Blobs present: ${!!blobInputs?.blobs}, count: ${blobInputs?.blobs?.length ?? 0}`);

          const originalData = request.data ?? '0x';

          // Decode the aggregate3 call to get the inner calls
          const decoded = decodeFunctionData({
            abi: multicall3Abi,
            data: originalData as Hex,
          });

          if (decoded.functionName !== 'aggregate3') {
            // Not a multicall3 aggregate3 call, just forward as-is
            return originalSendAndMonitor(request, gasConfig, blobInputs);
          }

          const originalCalls = decoded.args[0] as readonly { target: Hex; allowFailure: boolean; callData: Hex }[];

          logger.info(`Found ${originalCalls.length} inner call(s) in Multicall3`);

          // Create a corrupted version of the first call by zeroing out the coinbase address
          // The coinbase is located within the ProposedHeader struct in the propose() calldata
          // We search for the known coinbase address and replace it with zeros
          const corruptedCalls = originalCalls.map((call, index) => {
            if (index === 0) {
              const callDataHex = call.callData.toLowerCase();
              // In the calldata it appears as the 20-byte address padded to 32 bytes
              const coinbasePattern = coinbase.toString().slice(2).toLowerCase();
              const coinbaseIndex = callDataHex.indexOf(coinbasePattern);

              if (coinbaseIndex === -1) {
                logger.warn('Coinbase address not found in calldata, using original');
                return call;
              } else {
                logger.info(`Found coinbase address ${coinbasePattern} in calldata at index ${coinbaseIndex}`);
              }

              // Replace the coinbase with zeros (20 bytes = 40 hex chars)
              const corruptedCallData = (call.callData.slice(0, coinbaseIndex) +
                '0'.repeat(40) +
                call.callData.slice(coinbaseIndex + 40)) as Hex;

              return {
                target: call.target,
                allowFailure: true, // Allow this call to fail without reverting the whole transaction
                callData: corruptedCallData,
              };
            }
            return call;
          });

          // Now prepend the corrupted call and keep the original calls
          // Result: [corrupted_call (fails), original_call (succeeds)]
          const newCalls = [
            corruptedCalls[0], // The corrupted call that will fail (coinbase = 0)
            ...originalCalls, // The original calls that will succeed
          ];

          logger.info(`New call sequence: ${newCalls.length} calls (first one corrupted, rest original)`);

          // Re-encode the aggregate3 call with the new calls
          const newMulticallData = encodeFunctionData({
            abi: multicall3Abi,
            functionName: 'aggregate3',
            args: [newCalls],
          });

          // Send directly to Multicall3 with the modified call sequence
          const modifiedRequest = {
            to: request.to,
            data: newMulticallData,
          };

          logger.info(`Sending modified Multicall3 call directly to ${request.to}`);

          try {
            const result = await originalSendAndMonitor(modifiedRequest, gasConfig, blobInputs);
            logger.info(`Modified call sent with hash ${result.receipt.transactionHash}`);
            return result;
          } catch (err: any) {
            logger.error(`Failed to send modified transaction: ${err.message}`, err);
            throw err;
          }
        });

      expect(await pxe.getBlockNumber()).toBeGreaterThanOrEqual(2);

      const numBlocksToMine = 3;
      const startBlockNumber = await pxe.getBlockNumber();
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 0 });
      const result = await retryUntil(
        async () => {
          const blockNumber = await pxe.getBlockNumber();
          return blockNumber >= startBlockNumber + numBlocksToMine;
        },
        'block number check',
        30,
        1,
      );
      expect(result).toBeTrue();

      // Restore the original sendAndMonitorTransaction
      l1Utils[0].sendAndMonitorTransaction = originalSendAndMonitor;
    });
  });
});
