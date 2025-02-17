import {
  type AztecAddress,
  type Fr,
  type IndexedMerkleTree,
  IndexedMerkleTreeCalculator,
  ProtocolContractLeafPreimage,
} from '@aztec/circuits.js';
import { MAX_PROTOCOL_CONTRACTS, PROTOCOL_CONTRACT_TREE_HEIGHT } from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto';

export async function buildProtocolContractTree(
  contracts: { address: AztecAddress; leaf: Fr }[],
): Promise<IndexedMerkleTree<ProtocolContractLeafPreimage, typeof PROTOCOL_CONTRACT_TREE_HEIGHT>> {
  const hasher = {
    hash: async (l: Buffer, r: Buffer) => (await poseidon2Hash([l, r])).toBuffer(),
    hashInputs: async (i: Buffer[]) => (await poseidon2Hash(i)).toBuffer(),
  };
  const calculator = await IndexedMerkleTreeCalculator.create(
    PROTOCOL_CONTRACT_TREE_HEIGHT,
    hasher,
    ProtocolContractLeafPreimage,
  );

  const leaves = new Array(MAX_PROTOCOL_CONTRACTS).fill(Buffer.alloc(32));

  for (const contract of contracts) {
    const index = contract.address.toField().toNumber();
    leaves[index] = contract.leaf.toBuffer();
  }

  return calculator.computeTree(leaves);
}
