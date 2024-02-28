import { Body } from '@aztec/circuit-types';
import { Fr, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { AztecKVStore, AztecMap } from '@aztec/kv-store';

export class BlockBodyStore {
  /** Map block body hash to block body */
  #blockBodies: AztecMap<string, Buffer>;

  constructor(private db: AztecKVStore) {
    this.#blockBodies = db.openMap('archiver_block_bodies');
  }

  /**
   * Append new block bodies to the store's map.
   * @param blockBodies - The L2 block bodies to be added to the store.
   * @returns True if the operation is successful.
   */
  addBlockBodies(blockBodies: Body[]): Promise<boolean> {
    return this.db.transaction(() => {
      for (const body of blockBodies) {
        body.l1ToL2Messages = padArrayEnd(body.l1ToL2Messages, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);

        void this.#blockBodies.set(body.getCalldataHash().toString('hex'), body.toBuffer());
      }

      return true;
    });
  }

  /**
   * Gets a list of L2 block bodies with its associated txsHashes
   * @param txsHashes - The txsHashes list that corresponds to the blockBodies we want to retrieve
   * @returns The requested L2 block bodies
   */
  async getBlockBodies(txsHashes: Buffer[]): Promise<Body[]> {
    const blockBodiesBuffer = await this.db.transaction(() =>
      txsHashes.map(txsHash => this.#blockBodies.get(txsHash.toString('hex'))),
    );

    if (blockBodiesBuffer.some(bodyBuffer => bodyBuffer === undefined)) {
      throw new Error('Block body buffer is undefined');
    }

    return blockBodiesBuffer.map(blockBodyBuffer => Body.fromBuffer(blockBodyBuffer!));
  }

  /**
   * Gets an L2 block body.
   * @param txsHash - The txHash of the the block body to return
   * @returns The requested L2 block body
   */
  getBlockBody(txsHash: Buffer): Body | undefined {
    const blockBody = this.#blockBodies.get(txsHash.toString('hex'));

    return blockBody && Body.fromBuffer(blockBody);
  }
}
