import { type InBlock, type L2Block } from '@aztec/circuit-types';
import { type Fr, MAX_NULLIFIERS_PER_TX } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';

export class NullifierStore {
  #nullifiersToBlockNumber: AztecAsyncMap<string, number>;
  #nullifiersToBlockHash: AztecAsyncMap<string, string>;
  #nullifiersToIndex: AztecAsyncMap<string, number>;
  #log = createLogger('archiver:log_store');

  constructor(private db: AztecAsyncKVStore) {
    this.#nullifiersToBlockNumber = db.openMap('archiver_nullifiers_to_block_number');
    this.#nullifiersToBlockHash = db.openMap('archiver_nullifiers_to_block_hash');
    this.#nullifiersToIndex = db.openMap('archiver_nullifiers_to_index');
  }

  async addNullifiers(blocks: L2Block[]): Promise<boolean> {
    await this.db.transactionAsync(async () => {
      await Promise.all(
        blocks.map(block => {
          const dataStartIndexForBlock =
            block.header.state.partial.nullifierTree.nextAvailableLeafIndex -
            block.body.txEffects.length * MAX_NULLIFIERS_PER_TX;
          return block.body.txEffects.map((txEffects, txIndex) => {
            const dataStartIndexForTx = dataStartIndexForBlock + txIndex * MAX_NULLIFIERS_PER_TX;
            return txEffects.nullifiers.map((nullifier, nullifierIndex) =>
              Promise.all([
                ,
                this.#nullifiersToBlockNumber.set(nullifier.toString(), block.number),
                this.#nullifiersToBlockHash.set(nullifier.toString(), block.hash().toString()),
                this.#nullifiersToIndex.set(nullifier.toString(), dataStartIndexForTx + nullifierIndex),
              ]),
            );
          });
        }),
      );
    });
    return true;
  }

  async deleteNullifiers(blocks: L2Block[]): Promise<boolean> {
    await this.db.transactionAsync(async () => {
      for (const block of blocks) {
        for (const nullifier of block.body.txEffects.flatMap(tx => tx.nullifiers)) {
          await Promise.all([
            this.#nullifiersToBlockNumber.delete(nullifier.toString()),
            this.#nullifiersToBlockHash.delete(nullifier.toString()),
            this.#nullifiersToIndex.delete(nullifier.toString()),
          ]);
        }
      }
    });
    return true;
  }

  async findNullifiersIndexesWithBlock(
    blockNumber: number,
    nullifiers: Fr[],
  ): Promise<(InBlock<bigint> | undefined)[]> {
    const maybeNullifiers = await this.db.transactionAsync(async () => {
      return Promise.all(
        nullifiers.map(async nullifier => ({
          data: await this.#nullifiersToIndex.getAsync(nullifier.toString()),
          l2BlockNumber: await this.#nullifiersToBlockNumber.getAsync(nullifier.toString()),
          l2BlockHash: await this.#nullifiersToBlockHash.getAsync(nullifier.toString()),
        })),
      );
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
