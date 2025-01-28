import {
  type AztecAddress,
  type Fr,
  type MerkleTree,
  MerkleTreeCalculator,
  PROTOCOL_CONTRACT_TREE_HEIGHT,
} from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';

export async function buildProtocolContractTree(contracts: { address: AztecAddress; leaf: Fr }[]): Promise<MerkleTree> {
  const calculator = await MerkleTreeCalculator.create(PROTOCOL_CONTRACT_TREE_HEIGHT, Buffer.alloc(32), async (a, b) =>
    (await poseidon2Hash([a, b])).toBuffer(),
  );

  const leaves = new Array(2 ** PROTOCOL_CONTRACT_TREE_HEIGHT).fill(Buffer.alloc(32));

  for (const contract of contracts) {
    const index = contract.address.toField().toNumber();
    leaves[index] = contract.leaf;
  }

  return calculator.computeTree(leaves);
}
