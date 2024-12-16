import { Body, type InBlock, L2Block, L2BlockHash, type TxEffect, type TxHash, TxReceipt } from '@aztec/circuit-types';
import { AppendOnlyTreeSnapshot, type AztecAddress, BlockHeader, INITIAL_L2_BLOCK_NUM } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { type AztecKVStore, type AztecMap, type AztecSingleton, type Range } from '@aztec/kv-store';

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
  #blocks: AztecMap<number, BlockStorage>;

  /** Map block hash to block body */
  #blockBodies: AztecMap<string, Buffer>;

  /** Stores L1 block number in which the last processed L2 block was included */
  #lastSynchedL1Block: AztecSingleton<bigint>;

  /** Stores l2 block number of the last proven block */
  #lastProvenL2Block: AztecSingleton<number>;

  /** Stores l2 epoch number of the last proven epoch */
  #lastProvenL2Epoch: AztecSingleton<number>;

  /** Index mapping transaction hash (as a string) to its location in a block */
  #txIndex: AztecMap<string, BlockIndexValue>;

  /** Index mapping a contract's address (as a string) to its location in a block */
  #contractIndex: AztecMap<string, BlockIndexValue>;

  #log = createLogger('archiver:block_store');

  constructor(private db: AztecKVStore) {
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
  addBlocks(blocks: L1Published<L2Block>[]): Promise<boolean> {
    if (blocks.length === 0) {
      return Promise.resolve(true);
    }

    return this.db.transaction(() => {
      for (const block of blocks) {
        void this.#blocks.set(block.data.number, {
          header: block.data.header.toBuffer(),
          archive: block.data.archive.toBuffer(),
          l1: block.l1,
        });

        block.data.body.txEffects.forEach((tx, i) => {
          void this.#txIndex.set(tx.txHash.toString(), [block.data.number, i]);
        });

        void this.#blockBodies.set(block.data.hash().toString(), block.data.body.toBuffer());
      }

      void this.#lastSynchedL1Block.set(blocks[blocks.length - 1].l1.blockNumber);

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
  unwindBlocks(from: number, blocksToUnwind: number) {
    return this.db.transaction(() => {
      const last = this.getSynchedL2BlockNumber();
      if (from != last) {
        throw new Error(`Can only unwind blocks from the tip (requested ${from} but current tip is ${last})`);
      }

      for (let i = 0; i < blocksToUnwind; i++) {
        const blockNumber = from - i;
        const block = this.getBlock(blockNumber);

        if (block === undefined) {
          throw new Error(`Cannot remove block ${blockNumber} from the store, we don't have it`);
        }
        void this.#blocks.delete(block.data.number);
        block.data.body.txEffects.forEach(tx => {
          void this.#txIndex.delete(tx.txHash.toString());
        });
        const blockHash = block.data.hash().toString();
        void this.#blockBodies.delete(blockHash);
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
  *getBlocks(start: number, limit: number): IterableIterator<L1Published<L2Block>> {
    for (const blockStorage of this.#blocks.values(this.#computeBlockRange(start, limit))) {
      yield this.getBlockFromBlockStorage(blockStorage);
    }
  }

  /**
   * Gets an L2 block.
   * @param blockNumber - The number of the block to return.
   * @returns The requested L2 block.
   */
  getBlock(blockNumber: number): L1Published<L2Block> | undefined {
    const blockStorage = this.#blocks.get(blockNumber);
    if (!blockStorage || !blockStorage.header) {
      return undefined;
    }

    return this.getBlockFromBlockStorage(blockStorage);
  }

  /**
   * Gets the headers for a sequence of L2 blocks.
   * @param start - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 block headers
   */
  *getBlockHeaders(start: number, limit: number): IterableIterator<BlockHeader> {
    for (const blockStorage of this.#blocks.values(this.#computeBlockRange(start, limit))) {
      yield BlockHeader.fromBuffer(blockStorage.header);
    }
  }

  private getBlockFromBlockStorage(blockStorage: BlockStorage) {
    const header = BlockHeader.fromBuffer(blockStorage.header);
    const archive = AppendOnlyTreeSnapshot.fromBuffer(blockStorage.archive);
    const blockHash = header.hash().toString();
    const blockBodyBuffer = this.#blockBodies.get(blockHash);
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
  getTxEffect(txHash: TxHash): InBlock<TxEffect> | undefined {
    const [blockNumber, txIndex] = this.getTxLocation(txHash) ?? [];
    if (typeof blockNumber !== 'number' || typeof txIndex !== 'number') {
      return undefined;
    }

    const block = this.getBlock(blockNumber);
    if (!block) {
      return undefined;
    }

    return {
      data: block.data.body.txEffects[txIndex],
      l2BlockNumber: block.data.number,
      l2BlockHash: block.data.hash().toString(),
    };
  }

  /**
   * Gets a receipt of a settled tx.
   * @param txHash - The hash of a tx we try to get the receipt for.
   * @returns The requested tx receipt (or undefined if not found).
   */
  getSettledTxReceipt(txHash: TxHash): TxReceipt | undefined {
    const [blockNumber, txIndex] = this.getTxLocation(txHash) ?? [];
    if (typeof blockNumber !== 'number' || typeof txIndex !== 'number') {
      return undefined;
    }

    const block = this.getBlock(blockNumber)!;
    const tx = block.data.body.txEffects[txIndex];

    return new TxReceipt(
      txHash,
      TxReceipt.statusFromRevertCode(tx.revertCode),
      '',
      tx.transactionFee.toBigInt(),
      L2BlockHash.fromField(block.data.hash()),
      block.data.number,
    );
  }

  /**
   * Looks up which block included the requested tx effect.
   * @param txHash - The txHash of the tx.
   * @returns The block number and index of the tx.
   */
  getTxLocation(txHash: TxHash): [blockNumber: number, txIndex: number] | undefined {
    return this.#txIndex.get(txHash.toString());
  }

  /**
   * Looks up which block deployed a particular contract.
   * @param contractAddress - The address of the contract to look up.
   * @returns The block number and index of the contract.
   */
  getContractLocation(contractAddress: AztecAddress): [blockNumber: number, index: number] | undefined {
    return this.#contractIndex.get(contractAddress.toString());
  }

  /**
   * Gets the number of the latest L2 block processed.
   * @returns The number of the latest L2 block processed.
   */
  getSynchedL2BlockNumber(): number {
    const [lastBlockNumber] = this.#blocks.keys({ reverse: true, limit: 1 });
    return typeof lastBlockNumber === 'number' ? lastBlockNumber : INITIAL_L2_BLOCK_NUM - 1;
  }

  /**
   * Gets the most recent L1 block processed.
   * @returns The L1 block that published the latest L2 block
   */
  getSynchedL1BlockNumber(): bigint | undefined {
    return this.#lastSynchedL1Block.get();
  }

  setSynchedL1BlockNumber(l1BlockNumber: bigint) {
    void this.#lastSynchedL1Block.set(l1BlockNumber);
  }

  getProvenL2BlockNumber(): number {
    return this.#lastProvenL2Block.get() ?? 0;
  }

  setProvenL2BlockNumber(blockNumber: number) {
    void this.#lastProvenL2Block.set(blockNumber);
  }

  getProvenL2EpochNumber(): number | undefined {
    return this.#lastProvenL2Epoch.get();
  }

  setProvenL2EpochNumber(epochNumber: number) {
    void this.#lastProvenL2Epoch.set(epochNumber);
  }

  #computeBlockRange(start: number, limit: number): Required<Pick<Range<number>, 'start' | 'end'>> {
    if (limit < 1) {
      throw new Error(`Invalid limit: ${limit}`);
    }

    if (start < INITIAL_L2_BLOCK_NUM) {
      throw new Error(`Invalid start: ${start}`);
    }

    const end = start + limit;
    return { start, end };
  }
}
