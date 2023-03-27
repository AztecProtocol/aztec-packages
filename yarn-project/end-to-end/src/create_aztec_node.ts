import { AztecNode } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/ethereum.js/eth_address';

export async function createAztecNode(
  rollupContract: EthAddress,
  yeeterContract: EthAddress,
  rpcUrl: string,
  publisherPrivateKey: Buffer,
) {
  return await AztecNode.createAndSync({
    rpcUrl,
    rollupContract,
    yeeterContract,
    retryIntervalMs: 10000,
    publisherPrivateKey: publisherPrivateKey,
    requiredConfirmations: 1,
    transactionPollingInterval: 1000,
  });
}
