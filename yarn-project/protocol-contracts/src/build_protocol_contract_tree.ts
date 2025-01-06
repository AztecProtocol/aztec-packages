import {
  type AztecAddress,
  type Fr,
  type MerkleTree,
  MerkleTreeCalculator,
  PROTOCOL_CONTRACT_TREE_HEIGHT,
} from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';

export function buildProtocolContractTree(contracts: { address: AztecAddress; leaf: Fr }[]): MerkleTree {
  const calculator = new MerkleTreeCalculator(PROTOCOL_CONTRACT_TREE_HEIGHT, Buffer.alloc(32), (a, b) =>
    poseidon2Hash([a, b]).toBuffer(),
  );

  const leaves = new Array(2 ** PROTOCOL_CONTRACT_TREE_HEIGHT).fill(Buffer.alloc(32));

  for (const contract of contracts) {
    const index = contract.address.toField().toNumber();
    leaves[index] = contract.leaf;
  }

  return calculator.computeTree(leaves);
}
