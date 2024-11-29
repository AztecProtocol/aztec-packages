import { type InBlock, type L2Block, TxEffect } from '@aztec/circuit-types';
import { type Fr, MAX_NULLIFIERS_PER_TX } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { type AztecKVStore, type AztecMap } from '@aztec/kv-store';

export class NullifierStore {
  #nullifiersToBlockNumber: AztecMap<string, number>;
  #nullifiersToBlockHash: AztecMap<string, string>;
  #nullifiersToIndex: AztecMap<string, number>;
  #log = createDebugLogger('aztec:archiver:log_store');

  constructor(private db: AztecKVStore) {
    this.#nullifiersToBlockNumber = db.openMap('archiver_nullifiers_to_block_number');
    this.#nullifiersToBlockHash = db.openMap('archiver_nullifiers_to_block_hash');
    this.#nullifiersToIndex = db.openMap('archiver_nullifiers_to_index');
  }

  async #addNullifier(nullifier: Fr, blockNumber: number, blockHash: string, index: number) {
    await this.#nullifiersToBlockNumber.set(nullifier.toString(), blockNumber);
    await this.#nullifiersToBlockHash.set(nullifier.toString(), blockHash);
    await this.#nullifiersToIndex.set(nullifier.toString(), index);
  }

  async #addNullifiersInTxEffect(
    blockNumber: number,
    blockHash: string,
    txIndex: number,
    txEffects: TxEffect,
    dataStartIndexForBlock: number,
  ) {
    const dataStartIndexForTx = dataStartIndexForBlock + txIndex * MAX_NULLIFIERS_PER_TX;
    await Promise.all(
      txEffects.nullifiers.map(async (nullifier, nullifierIndex) =>
        this.#addNullifier(nullifier, blockNumber, blockHash, dataStartIndexForTx + nullifierIndex),
      ),
    );
  }

  async #addNullifiersInBlock(block: L2Block) {
    const dataStartIndexForBlock =
      block.header.state.partial.nullifierTree.nextAvailableLeafIndex -
      block.body.numberOfTxsIncludingPadded * MAX_NULLIFIERS_PER_TX;
    await Promise.all(
      block.body.txEffects.map((txEffects, txIndex) =>
        this.#addNullifiersInTxEffect(
          block.number,
          block.hash().toString(),
          txIndex,
          txEffects,
          dataStartIndexForBlock,
        ),
      ),
    );
  }

  async addNullifiers(blocks: L2Block[]): Promise<boolean> {
    await Promise.all(blocks.map(this.#addNullifiersInBlock));
    return true;
  }

  async deleteNullifiers(blocks: L2Block[]): Promise<boolean> {
    for (const block of blocks) {
      for (const nullifier of block.body.txEffects.flatMap(tx => tx.nullifiers)) {
        await this.#nullifiersToBlockNumber.delete(nullifier.toString());
        await this.#nullifiersToBlockHash.delete(nullifier.toString());
        await this.#nullifiersToIndex.delete(nullifier.toString());
      }
    }
    return true;
  }

  async findNullifiersIndexesWithBlock(
    blockNumber: number,
    nullifiers: Fr[],
  ): Promise<(InBlock<bigint> | undefined)[]> {
    const maybeNullifiers = await Promise.all(
      nullifiers.map(async nullifier => ({
        data: await this.#nullifiersToIndex.get(nullifier.toString()),
        l2BlockNumber: await this.#nullifiersToBlockNumber.get(nullifier.toString()),
        l2BlockHash: await this.#nullifiersToBlockHash.get(nullifier.toString()),
      })),
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
