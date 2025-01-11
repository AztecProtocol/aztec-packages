import { type InBlock, type L2Block } from '@aztec/circuit-types';
import { type Fr, MAX_NULLIFIERS_PER_TX } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { type AztecKVStore, type AztecMap } from '@aztec/kv-store';

export class NullifierStore {
  #nullifiersToBlockNumber: AztecMap<string, number>;
  #nullifiersToBlockHash: AztecMap<string, string>;
  #nullifiersToIndex: AztecMap<string, number>;
  #log = createLogger('archiver:log_store');

  constructor(private db: AztecKVStore) {
    this.#nullifiersToBlockNumber = db.openMap('archiver_nullifiers_to_block_number');
    this.#nullifiersToBlockHash = db.openMap('archiver_nullifiers_to_block_hash');
    this.#nullifiersToIndex = db.openMap('archiver_nullifiers_to_index');
  }

  async addNullifiers(blocks: L2Block[]): Promise<boolean> {
    await this.db.transaction(() => {
      blocks.forEach(block => {
        const dataStartIndexForBlock =
          block.header.state.partial.nullifierTree.nextAvailableLeafIndex -
          block.body.txEffects.length * MAX_NULLIFIERS_PER_TX;
        block.body.txEffects.forEach((txEffects, txIndex) => {
          const dataStartIndexForTx = dataStartIndexForBlock + txIndex * MAX_NULLIFIERS_PER_TX;
          txEffects.nullifiers.forEach((nullifier, nullifierIndex) => {
            void this.#nullifiersToBlockNumber.set(nullifier.toString(), block.number);
            void this.#nullifiersToBlockHash.set(nullifier.toString(), block.hash().toString());
            void this.#nullifiersToIndex.set(nullifier.toString(), dataStartIndexForTx + nullifierIndex);
          });
        });
      });
    });
    return true;
  }

  async deleteNullifiers(blocks: L2Block[]): Promise<boolean> {
    await this.db.transaction(() => {
      for (const block of blocks) {
        for (const nullifier of block.body.txEffects.flatMap(tx => tx.nullifiers)) {
          void this.#nullifiersToBlockNumber.delete(nullifier.toString());
          void this.#nullifiersToBlockHash.delete(nullifier.toString());
          void this.#nullifiersToIndex.delete(nullifier.toString());
        }
      }
    });
    return true;
  }

  async findNullifiersIndexesWithBlock(
    blockNumber: number,
    nullifiers: Fr[],
  ): Promise<(InBlock<bigint> | undefined)[]> {
    const maybeNullifiers = await this.db.transaction(() => {
      return nullifiers.map(nullifier => ({
        data: this.#nullifiersToIndex.get(nullifier.toString()),
        l2BlockNumber: this.#nullifiersToBlockNumber.get(nullifier.toString()),
        l2BlockHash: this.#nullifiersToBlockHash.get(nullifier.toString()),
      }));
    });
    return maybeNullifiers.map(({ data, l2BlockNumber, l2BlockHash }) => {
      if (
        data === undefined ||
        l2BlockNumber === undefined ||
        l2BlockHash === undefined ||
        l2BlockNumber > blockNumber
      ) {
        return undefined;
      } else {
        return {
          data: BigInt(data),
          l2BlockNumber,
          l2BlockHash,
        } as InBlock<bigint>;
      }
    });
  }
}
