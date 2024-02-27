import { Body } from '@aztec/circuit-types';
import { Fr, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { AztecKVStore, AztecMap } from '@aztec/kv-store';

/**
 * LMDB implementation of the ArchiverDataStore interface.
 */
export class BlockBodyStore {
  /** Map block number to block data */
  #blockBodies: AztecMap<string, Buffer>;

  constructor(private db: AztecKVStore) {
    this.#blockBodies = db.openMap('archiver_block_bodies');
  }

  /**
   * Append new blocks to the store's list.
   * @param blocks - The L2 blocks to be added to the store.
   * @returns True if the operation is successful.
   */
  addBlockBodies(blockBodies: Body[]): Promise<boolean> {
    return this.db.transaction(() => {
      for (const body of blockBodies) {
        body.l1ToL2Messages = padArrayEnd(
          body.l1ToL2Messages,
          Fr.ZERO,
          NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
        );

        void this.#blockBodies.set(body.getCalldataHash().toString('hex'), body.toBuffer());
      }

      return true;
    });
  }

  /**
   * Gets an L2 block.
   * @param blockNumber - The number of the block to return.
   * @returns The requested L2 block, without logs attached
   */
  async getBlockBodies(txsHashes: Buffer[]): Promise<Body[]> {
    const blockBodiesBuffer = await this.db.transaction(() =>
      txsHashes.map(txsHash => this.#blockBodies.get(txsHash.toString('hex'))),
    );

    if (blockBodiesBuffer.some(bodyBuffer => bodyBuffer === undefined)) {
      throw new Error('Weird');
    }

    return blockBodiesBuffer.map(blockBodyBuffer => Body.fromBuffer(blockBodyBuffer!));
  }

  // /**
  //  * Gets up to `limit` amount of L2 blocks starting from `from`.
  //  * @param start - Number of the first block to return (inclusive).
  //  * @param limit - The number of blocks to return.
  //  * @returns The requested L2 blocks, without logs attached
  //  */
  // *getBlockBodies(start: number, limit: number): IterableIterator<L2Block> {
  //   for (const blockCtx of this.#blocks.values(this.#computeBlockRange(start, limit))) {
  //     yield L2Block.fromBuffer(blockCtx.block);
  //   }
  // }

  /**
   * Gets an L2 block.
   * @param blockNumber - The number of the block to return.
   * @returns The requested L2 block, without logs attached
   */
  getBlockBody(txsHash: Buffer): Body | undefined {
    const blockBody = this.#blockBodies.get(txsHash.toString('hex'));

    return blockBody && Body.fromBuffer(blockBody);
  }
}
