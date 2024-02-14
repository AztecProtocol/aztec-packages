import { INITIAL_L2_BLOCK_NUM, L2Block, L2BlockBody, L2Tx, TxHash } from '@aztec/circuit-types';
import { AztecAddress, Fr, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { AztecKVStore, AztecMap, Range } from '@aztec/kv-store';

type BlockIndexValue = [blockNumber: number, index: number];

/**
 * LMDB implementation of the ArchiverDataStore interface.
 */
export class BlockBodyStore {
  /** Map block number to block data */
  #blockBodies: AztecMap<string, Buffer>;

  /** Index mapping transaction hash (as a string) to its location in a block */
  #txIndex: AztecMap<string, BlockIndexValue>;

  /** Index mapping a contract's address (as a string) to its location in a block */
  #contractIndex: AztecMap<string, BlockIndexValue>;

  #log = createDebugLogger('aztec:archiver:block_body_store');

  constructor(private db: AztecKVStore) {
    this.#blockBodies = db.openMap('archiver_block_bodies');

    this.#txIndex = db.openMap('archiver_tx_index_block_bodies');
    this.#contractIndex = db.openMap('archiver_contract_index_block_bodies');
  }

  /**
   * Append new blocks to the store's list.
   * @param blocks - The L2 blocks to be added to the store.
   * @returns True if the operation is successful.
   */
  addBlockBodies(blockBodies: L2BlockBody[]): Promise<boolean> {
    return this.db.transaction(() => {
      for (const body of blockBodies) {
        // body.l1ToL2Messages = padArrayEnd(
        //   body.l1ToL2Messages,
        //   Fr.ZERO,
        //   NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
        // );

        void this.#blockBodies.set(body.getCalldataHash().toString('hex'), body.toBuffer(true));
      }

      return true;
    });
  }

  /**
 * Gets an L2 block.
 * @param blockNumber - The number of the block to return.
 * @returns The requested L2 block, without logs attached
 */
  async getBlockBodies(txsHashes: Buffer[]): Promise<L2BlockBody[]> {
    const blockBodiesBuffer = await this.db.transaction(() => txsHashes.map(txsHash => this.#blockBodies.get(txsHash.toString('hex'))));

    if (blockBodiesBuffer.some(bodyBuffer => bodyBuffer === undefined)) {
      throw new Error('Weird')
    }

    return blockBodiesBuffer.map(blockBodyBuffer => L2BlockBody.fromBuffer(blockBodyBuffer!, true));
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
  getBlockBody(txsHash: Buffer): L2BlockBody | undefined {
    const blockBody = this.#blockBodies.get(txsHash.toString('hex'));

    return blockBody && L2BlockBody.fromBuffer(blockBody);
  }
}
