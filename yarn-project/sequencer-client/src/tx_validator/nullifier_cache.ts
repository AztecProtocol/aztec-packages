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

  public async nullifiersExist(nullifiers: Buffer[]): Promise<boolean[]> {
    const cacheResults = nullifiers.map(n => this.nullifiers.has(n.toString()));
    const toCheckDb = nullifiers.filter((_n, index) => !cacheResults[index]);
    const dbHits = await this.db.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, toCheckDb);

    let dbIndex = 0;
    return nullifiers.map((_n, index) => cacheResults[index] || dbHits[dbIndex++] !== undefined);
  }

  public addNullifiers(nullifiers: Buffer[]) {
    for (const nullifier of nullifiers) {
      this.nullifiers.add(nullifier.toString());
    }
  }
}
