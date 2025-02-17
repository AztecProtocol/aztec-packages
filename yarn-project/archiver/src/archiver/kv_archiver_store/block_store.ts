import { Body, type InBlock, L2Block, L2BlockHash, type TxEffect, type TxHash, TxReceipt } from '@aztec/circuit-types';
import { AppendOnlyTreeSnapshot, type AztecAddress, BlockHeader } from '@aztec/circuits.js';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncSingleton, Range } from '@aztec/kv-store';

import { type L1Published, type L1PublishedData } from '../structs/published.js';

type BlockIndexValue = [blockNumber: number, index: number];

type BlockStorage = {
  header: Buffer;
  archive: Buffer;
  l1: L1PublishedData;
};

/**
 * LMDB implementation of the ArchiverDataStore interface.
 */
export class BlockStore {
  /** Map block number to block data */
  #blocks: AztecAsyncMap<number, BlockStorage>;

  /** Map block hash to block body */
  #blockBodies: AztecAsyncMap<string, Buffer>;

  /** Stores L1 block number in which the last processed L2 block was included */
  #lastSynchedL1Block: AztecAsyncSingleton<bigint>;

  /** Stores l2 block number of the last proven block */
  #lastProvenL2Block: AztecAsyncSingleton<number>;

  /** Stores l2 epoch number of the last proven epoch */
  #lastProvenL2Epoch: AztecAsyncSingleton<number>;

  /** Index mapping transaction hash (as a string) to its location in a block */
  #txIndex: AztecAsyncMap<string, BlockIndexValue>;

  /** Index mapping a contract's address (as a string) to its location in a block */
  #contractIndex: AztecAsyncMap<string, BlockIndexValue>;

  #log = createLogger('archiver:block_store');

  constructor(private db: AztecAsyncKVStore) {
    this.#blocks = db.openMap('archiver_blocks');
    this.#blockBodies = db.openMap('archiver_block_bodies');
    this.#txIndex = db.openMap('archiver_tx_index');
    this.#contractIndex = db.openMap('archiver_contract_index');
    this.#lastSynchedL1Block = db.openSingleton('archiver_last_synched_l1_block');
    this.#lastProvenL2Block = db.openSingleton('archiver_last_proven_l2_block');
    this.#lastProvenL2Epoch = db.openSingleton('archiver_last_proven_l2_epoch');
  }

  /**
   * Append new blocks to the store's list.
   * @param blocks - The L2 blocks to be added to the store.
   * @returns True if the operation is successful.
   */
  async addBlocks(blocks: L1Published<L2Block>[]): Promise<boolean> {
    if (blocks.length === 0) {
      return true;
    }

    return await this.db.transactionAsync(async () => {
      for (const block of blocks) {
        await this.#blocks.set(block.data.number, {
          header: block.data.header.toBuffer(),
          archive: block.data.archive.toBuffer(),
          l1: block.l1,
        });

        for (let i = 0; i < block.data.body.txEffects.length; i++) {
          const txEffect = block.data.body.txEffects[i];
          await this.#txIndex.set(txEffect.txHash.toString(), [block.data.number, i]);
        }

        await this.#blockBodies.set((await block.data.hash()).toString(), block.data.body.toBuffer());
      }

      await this.#lastSynchedL1Block.set(blocks[blocks.length - 1].l1.blockNumber);
      return true;
    });
  }

  /**
   * Unwinds blocks from the database
   * @param from -  The tip of the chain, passed for verification purposes,
   *                ensuring that we don't end up deleting something we did not intend
   * @param blocksToUnwind - The number of blocks we are to unwind
   * @returns True if the operation is successful
   */
  async unwindBlocks(from: number, blocksToUnwind: number) {
    return await this.db.transactionAsync(async () => {
      const last = await this.getSynchedL2BlockNumber();
      if (from !== last) {
        throw new Error(`Can only unwind blocks from the tip (requested ${from} but current tip is ${last})`);
      }

      for (let i = 0; i < blocksToUnwind; i++) {
        const blockNumber = from - i;
        const block = await this.getBlock(blockNumber);

        if (block === undefined) {
          throw new Error(`Cannot remove block ${blockNumber} from the store, we don't have it`);
        }
        await this.#blocks.delete(block.data.number);
        await Promise.all(block.data.body.txEffects.map(tx => this.#txIndex.delete(tx.txHash.toString())));
        const blockHash = (await block.data.hash()).toString();
        await this.#blockBodies.delete(blockHash);
        this.#log.debug(`Unwound block ${blockNumber} ${blockHash}`);
      }

      return true;
    });
  }

  /**
   * Gets up to `limit` amount of L2 blocks starting from `from`.
   * @param start - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 blocks
   */
  async *getBlocks(start: number, limit: number): AsyncIterableIterator<L1Published<L2Block>> {
    for await (const blockStorage of this.#blocks.valuesAsync(this.#computeBlockRange(start, limit))) {
      const block = await this.getBlockFromBlockStorage(blockStorage);
      yield block;
    }
  }

  /**
   * Gets an L2 block.
   * @param blockNumber - The number of the block to return.
   * @returns The requested L2 block.
   */
  async getBlock(blockNumber: number): Promise<L1Published<L2Block> | undefined> {
    const blockStorage = await this.#blocks.getAsync(blockNumber);
    if (!blockStorage || !blockStorage.header) {
      return Promise.resolve(undefined);
    }

    return this.getBlockFromBlockStorage(blockStorage);
  }

  /**
   * Gets the headers for a sequence of L2 blocks.
   * @param start - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 block headers
   */
  async *getBlockHeaders(start: number, limit: number): AsyncIterableIterator<BlockHeader> {
    for await (const blockStorage of this.#blocks.valuesAsync(this.#computeBlockRange(start, limit))) {
      yield BlockHeader.fromBuffer(blockStorage.header);
    }
  }

  private async getBlockFromBlockStorage(blockStorage: BlockStorage) {
    const header = BlockHeader.fromBuffer(blockStorage.header);
    const archive = AppendOnlyTreeSnapshot.fromBuffer(blockStorage.archive);
    const blockHash = (await header.hash()).toString();
    const blockBodyBuffer = await this.#blockBodies.getAsync(blockHash);
    if (blockBodyBuffer === undefined) {
      throw new Error(
        `Could not retrieve body for block ${header.globalVariables.blockNumber.toNumber()} ${blockHash}`,
      );
    }
    const body = Body.fromBuffer(blockBodyBuffer);

    const l2Block = new L2Block(archive, header, body);
    return { data: l2Block, l1: blockStorage.l1 };
  }

  /**
   * Gets a tx effect.
   * @param txHash - The txHash of the tx corresponding to the tx effect.
   * @returns The requested tx effect (or undefined if not found).
   */
  async getTxEffect(txHash: TxHash): Promise<InBlock<TxEffect> | undefined> {
    const [blockNumber, txIndex] = (await this.getTxLocation(txHash)) ?? [];
    if (typeof blockNumber !== 'number' || typeof txIndex !== 'number') {
      return undefined;
    }

    const block = await this.getBlock(blockNumber);
    if (!block) {
      return undefined;
    }

    return {
      data: block.data.body.txEffects[txIndex],
      l2BlockNumber: block.data.number,
      l2BlockHash: (await block.data.hash()).toString(),
    };
  }

  /**
   * Gets a receipt of a settled tx.
   * @param txHash - The hash of a tx we try to get the receipt for.
   * @returns The requested tx receipt (or undefined if not found).
   */
  async getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    const [blockNumber, txIndex] = (await this.getTxLocation(txHash)) ?? [];
    if (typeof blockNumber !== 'number' || typeof txIndex !== 'number') {
      return undefined;
    }

    const block = (await this.getBlock(blockNumber))!;
    const tx = block.data.body.txEffects[txIndex];

    return new TxReceipt(
      txHash,
      TxReceipt.statusFromRevertCode(tx.revertCode),
      '',
      tx.transactionFee.toBigInt(),
      L2BlockHash.fromField(await block.data.hash()),
      block.data.number,
    );
  }

  /**
   * Looks up which block included the requested tx effect.
   * @param txHash - The txHash of the tx.
   * @returns The block number and index of the tx.
   */
  getTxLocation(txHash: TxHash): Promise<[blockNumber: number, txIndex: number] | undefined> {
    return this.#txIndex.getAsync(txHash.toString());
  }

  /**
   * Looks up which block deployed a particular contract.
   * @param contractAddress - The address of the contract to look up.
   * @returns The block number and index of the contract.
   */
  getContractLocation(contractAddress: AztecAddress): Promise<[blockNumber: number, index: number] | undefined> {
    return this.#contractIndex.getAsync(contractAddress.toString());
  }

  /**
   * Gets the number of the latest L2 block processed.
   * @returns The number of the latest L2 block processed.
   */
  async getSynchedL2BlockNumber(): Promise<number> {
    const [lastBlockNumber] = await toArray(this.#blocks.keysAsync({ reverse: true, limit: 1 }));
    return typeof lastBlockNumber === 'number' ? lastBlockNumber : INITIAL_L2_BLOCK_NUM - 1;
  }

  /**
   * Gets the most recent L1 block processed.
   * @returns The L1 block that published the latest L2 block
   */
  getSynchedL1BlockNumber(): Promise<bigint | undefined> {
    return this.#lastSynchedL1Block.getAsync();
  }

  setSynchedL1BlockNumber(l1BlockNumber: bigint) {
    return this.#lastSynchedL1Block.set(l1BlockNumber);
  }

  async getProvenL2BlockNumber(): Promise<number> {
    return (await this.#lastProvenL2Block.getAsync()) ?? 0;
  }

  setProvenL2BlockNumber(blockNumber: number) {
    return this.#lastProvenL2Block.set(blockNumber);
  }

  getProvenL2EpochNumber(): Promise<number | undefined> {
    return this.#lastProvenL2Epoch.getAsync();
  }

  setProvenL2EpochNumber(epochNumber: number) {
    return this.#lastProvenL2Epoch.set(epochNumber);
  }

  #computeBlockRange(start: number, limit: number): Required<Pick<Range<number>, 'start' | 'limit'>> {
    if (limit < 1) {
      throw new Error(`Invalid limit: ${limit}`);
    }

    if (start < INITIAL_L2_BLOCK_NUM) {
      throw new Error(`Invalid start: ${start}`);
    }

    return { start, limit };
  }
}
