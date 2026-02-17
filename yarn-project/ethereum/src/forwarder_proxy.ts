/* eslint-disable no-console */
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

import { type Hex, extractChain } from 'viem';
import { anvil, mainnet, sepolia } from 'viem/chains';

import { L1Deployer } from './deploy_l1_contract.js';
import type { ExtendedViemWalletClient } from './types.js';

export const FORWARDER_SOLIDITY_SOURCE = `
contract ForwarderProxy {
  function forward(address target, bytes calldata data) external payable returns (bytes memory) {
    (bool success, bytes memory result) = target.call{value: msg.value}(data);
    require(success, "call failed");
    return result;
  }
}`;

export const FORWARDER_ABI = [
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

export const FORWARDER_BYTECODE =
  '0x6080604052348015600e575f5ffd5b506103bf8061001c5f395ff3fe60806040526004361061001d575f3560e01c80636fadcf7214610021575b5f5ffd5b61003b600480360381019061003691906101d0565b610051565b604051610048919061029d565b60405180910390f35b60605f5f8573ffffffffffffffffffffffffffffffffffffffff1634868660405161007d9291906102f9565b5f6040518083038185875af1925050503d805f81146100b7576040519150601f19603f3d011682016040523d82523d5f602084013e6100bc565b606091505b509150915081610101576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016100f89061036b565b60405180910390fd5b80925050509392505050565b5f5ffd5b5f5ffd5b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61013e82610115565b9050919050565b61014e81610134565b8114610158575f5ffd5b50565b5f8135905061016981610145565b92915050565b5f5ffd5b5f5ffd5b5f5ffd5b5f5f83601f8401126101905761018f61016f565b5b8235905067ffffffffffffffff8111156101ad576101ac610173565b5b6020830191508360018202830111156101c9576101c8610177565b5b9250929050565b5f5f5f604084860312156101e7576101e661010d565b5b5f6101f48682870161015b565b935050602084013567ffffffffffffffff81111561021557610214610111565b5b6102218682870161017b565b92509250509250925092565b5f81519050919050565b5f82825260208201905092915050565b8281835e5f83830152505050565b5f601f19601f8301169050919050565b5f61026f8261022d565b6102798185610237565b9350610289818560208601610247565b61029281610255565b840191505092915050565b5f6020820190508181035f8301526102b58184610265565b905092915050565b5f81905092915050565b828183375f83830152505050565b5f6102e083856102bd565b93506102ed8385846102c7565b82840190509392505050565b5f6103058284866102d5565b91508190509392505050565b5f82825260208201905092915050565b7f63616c6c206661696c65640000000000000000000000000000000000000000005f82015250565b5f610355600b83610311565b915061036082610321565b602082019050919050565b5f6020820190508181035f83015261038281610349565b905091905056fea26469706673582212209a1c8cf638cf1569450a731ef9457b862f9e153b0a46e5555429bcf4dffd999564736f6c634300081e0033' as Hex;

const FORWARDER_ARTIFACT = {
  name: 'Forwarder',
  contractAbi: FORWARDER_ABI,
  contractBytecode: FORWARDER_BYTECODE,
};

/**
 * Deploys the forwarder proxy contract to L1.
 * @param client - The L1 client to use for deployment
 * @param logger - Optional logger
 * @returns The deployed forwarder contract address
 */
export async function deployForwarderProxy(client: ExtendedViemWalletClient, logger?: Logger): Promise<EthAddress> {
  const log = logger ?? createLogger('ethereum:forwarder');
  const nonce = await client.getTransactionCount({ address: client.account.address });
  const deployer = new L1Deployer(client, nonce, new DateProvider(), false, log, undefined, false);

  log.info('Deploying forwarder proxy contract');
  const deployment = await deployer.deploy(FORWARDER_ARTIFACT, []);
  log.info(`Forwarder proxy deployed at ${deployment.address.toString()}`);

  return deployment.address;
}

/**
 * Main function for deploying the forwarder proxy from command line.
 * Usage: node forwarder_proxy.js <private_key> <rpc_url>
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('Usage: node forwarder_proxy.js <private_key> <rpc_url> <chain_id>');
    process.exit(1);
  }

  const [privateKey, rpcUrl, chainId] = args;

  // Dynamic import to avoid pulling in dependencies at module load time
  const { createExtendedL1Client } = await import('./client.js');

  const client = createExtendedL1Client(
    [rpcUrl],
    privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`,
    extractChain({ chains: [mainnet, sepolia, anvil], id: parseInt(chainId) as any }),
  );
  const address = await deployForwarderProxy(client);

  console.log(`Forwarder proxy deployed at: ${address.toString()}`);
}

// Only run main if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Failed to deploy forwarder proxy:', err);
    process.exit(1);
  });
}
