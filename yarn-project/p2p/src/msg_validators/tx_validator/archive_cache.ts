import type { Fr } from '@aztec/foundation/fields';
import type { ArchiveSource } from '@aztec/p2p';
import type { MerkleTreeReadOperations } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';

/**
 * Implements an archive source by checking a DB and an in-memory collection.
 * Intended for validating transactions as they are added to a block.
 */
export class ArchiveCache implements ArchiveSource {
  archives: Map<string, bigint>;

  constructor(private db: MerkleTreeReadOperations) {
    this.archives = new Map<string, bigint>();
  }

  public async getArchiveIndices(archives: Fr[]): Promise<(bigint | undefined)[]> {
    const toCheckDb = archives.filter(n => !this.archives.has(n.toString()));
    const dbHits = await this.db.findLeafIndices(MerkleTreeId.ARCHIVE, toCheckDb);
    dbHits.forEach((x, index) => {
      if (x !== undefined) {
        this.archives.set(toCheckDb[index].toString(), x);
      }
    });

    return archives.map(n => this.archives.get(n.toString()));
  }
}
