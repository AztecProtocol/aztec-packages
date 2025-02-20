import type { InBlock, L2Block } from '@aztec/circuit-types';
import type { Fr } from '@aztec/circuits.js';
import { MAX_NULLIFIERS_PER_TX } from '@aztec/constants';
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
    const blockHashes = await Promise.all(blocks.map(block => block.hash()));
    await this.db.transactionAsync(async () => {
      await Promise.all(
        blocks.map((block, i) => {
          const dataStartIndexForBlock =
            block.header.state.partial.nullifierTree.nextAvailableLeafIndex -
            block.body.txEffects.length * MAX_NULLIFIERS_PER_TX;
          return Promise.all(
            block.body.txEffects.map((txEffects, txIndex) => {
              const dataStartIndexForTx = dataStartIndexForBlock + txIndex * MAX_NULLIFIERS_PER_TX;
              return Promise.all(
                txEffects.nullifiers.map(async (nullifier, nullifierIndex) => {
                  await this.#nullifiersToBlockNumber.set(nullifier.toString(), block.number);
                  await this.#nullifiersToBlockHash.set(nullifier.toString(), blockHashes[i].toString());
                  await this.#nullifiersToIndex.set(nullifier.toString(), dataStartIndexForTx + nullifierIndex);
                }),
              );
            }),
          );
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
    const asStrings = nullifiers.map(x => x.toString());

    const maybeNullifiers = await Promise.all(
      asStrings.map(async nullifier => {
        const [data, l2BlockNumber, l2BlockHash] = await Promise.all([
          this.#nullifiersToIndex.getAsync(nullifier),
          this.#nullifiersToBlockNumber.getAsync(nullifier),
          this.#nullifiersToBlockHash.getAsync(nullifier),
        ]);
        return {
          data,
          l2BlockNumber,
          l2BlockHash,
        };
      }),
    );
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
