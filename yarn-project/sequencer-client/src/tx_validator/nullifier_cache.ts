import { MerkleTreeId, type MerkleTreeReadOperations } from '@aztec/circuit-types';
import { type NullifierSource } from '@aztec/p2p';

/**
 * Implements a nullifier source by checking a DB and an in-memory collection.
 * Intended for validating transactions as they are added to a block.
 */
export class NullifierCache implements NullifierSource {
  nullifiers: Set<string>;

  constructor(private db: MerkleTreeReadOperations) {
    this.nullifiers = new Set();
  }

  async nullifiersExist(nullifiers: Buffer[]): Promise<boolean[]> {
    const dbIndices = await this.db.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, nullifiers);
    return nullifiers.map((n, index) => this.nullifiers.has(n.toString()) || dbIndices[index] !== undefined);
  }

  addNullifiers(nullifiers: Buffer[]) {
    for (const nullifier of nullifiers) {
      this.nullifiers.add(nullifier.toString());
    }
  }
}
