import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';
import { bufferToHex } from '@aztec/foundation/string';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncSingleton, Range } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Body, CommitteeAttestation, L2Block, L2BlockHash, L2BlockHeader } from '@aztec/stdlib/block';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import {
  BlockHeader,
  type IndexedTxEffect,
  TxEffect,
  TxHash,
  TxReceipt,
  deserializeIndexedTxEffect,
  serializeIndexedTxEffect,
} from '@aztec/stdlib/tx';

import { BlockNumberNotSequentialError, InitialBlockNumberNotSequentialError } from '../errors.js';
import type { L1PublishedData, PublishedL2Block } from '../structs/published.js';

export { TxReceipt, type TxEffect, type TxHash } from '@aztec/stdlib/tx';

type BlockIndexValue = [blockNumber: number, index: number];

type BlockStorage = {
  header: Buffer;
  blockHash: Buffer;
  archive: Buffer;
  l1: L1PublishedData;
  attestations: Buffer[];
};

/**
 * LMDB implementation of the ArchiverDataStore interface.
 */
export class BlockStore {
  /** Map block number to block data */
  #blocks: AztecAsyncMap<number, BlockStorage>;

  /** Map block hash to list of tx hashes */
  #blockTxs: AztecAsyncMap<string, Buffer>;

  /** Tx hash to serialized IndexedTxEffect */
  #txEffects: AztecAsyncMap<string, Buffer>;

  /** Stores L1 block number in which the last processed L2 block was included */
  #lastSynchedL1Block: AztecAsyncSingleton<bigint>;

  /** Stores l2 block number of the last proven block */
  #lastProvenL2Block: AztecAsyncSingleton<number>;

  /** Index mapping a contract's address (as a string) to its location in a block */
  #contractIndex: AztecAsyncMap<string, BlockIndexValue>;

  #log = createLogger('archiver:block_store');

  constructor(private db: AztecAsyncKVStore) {
    this.#blocks = db.openMap('archiver_blocks');
    this.#blockTxs = db.openMap('archiver_block_txs');
    this.#txEffects = db.openMap('archiver_tx_effects');
    this.#contractIndex = db.openMap('archiver_contract_index');
    this.#lastSynchedL1Block = db.openSingleton('archiver_last_synched_l1_block');
    this.#lastProvenL2Block = db.openSingleton('archiver_last_proven_l2_block');
  }

  /**
   * Append new blocks to the store's list.
   * @param blocks - The L2 blocks to be added to the store.
   * @returns True if the operation is successful.
   */
  async addBlocks(blocks: PublishedL2Block[], opts: { force?: boolean } = {}): Promise<boolean> {
    if (blocks.length === 0) {
      return true;
    }

    return await this.db.transactionAsync(async () => {
      // Check that the block immediately before the first block to be added is present in the store.
      const firstBlockNumber = blocks[0].block.number;
      const [previousBlockNumber] = await toArray(
        this.#blocks.keysAsync({ reverse: true, limit: 1, end: firstBlockNumber - 1 }),
      );
      const hasPreviousBlock =
        firstBlockNumber === INITIAL_L2_BLOCK_NUM ||
        (previousBlockNumber !== undefined && previousBlockNumber === firstBlockNumber - 1);
      if (!opts.force && !hasPreviousBlock) {
        throw new InitialBlockNumberNotSequentialError(firstBlockNumber, previousBlockNumber);
      }

      // Iterate over blocks array and insert them, checking that the block numbers are sequential.
      let previousBlock: PublishedL2Block | undefined = undefined;
      for (const block of blocks) {
        if (!opts.force && previousBlock && previousBlock.block.number + 1 !== block.block.number) {
          throw new BlockNumberNotSequentialError(block.block.number, previousBlock.block.number);
        }
        previousBlock = block;
        const blockHash = L2BlockHash.fromField(await block.block.hash());

        await this.#blocks.set(block.block.number, {
          header: block.block.header.toBuffer(),
          blockHash: blockHash.toBuffer(),
          archive: block.block.archive.toBuffer(),
          l1: block.l1,
          attestations: block.attestations.map(attestation => attestation.toBuffer()),
        });

        for (let i = 0; i < block.block.body.txEffects.length; i++) {
          const txEffect: IndexedTxEffect = {
            data: block.block.body.txEffects[i],
            l2BlockNumber: block.block.number,
            l2BlockHash: blockHash,
            txIndexInBlock: i,
          };
          await this.#txEffects.set(txEffect.data.txHash.toString(), serializeIndexedTxEffect(txEffect));
        }

        await this.#blockTxs.set(
          blockHash.toString(),
          Buffer.concat(block.block.body.txEffects.map(tx => tx.txHash.toBuffer())),
        );
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

      const proven = await this.getProvenL2BlockNumber();
      if (from - blocksToUnwind < proven) {
        await this.setProvenL2BlockNumber(from - blocksToUnwind);
      }

      for (let i = 0; i < blocksToUnwind; i++) {
        const blockNumber = from - i;
        const block = await this.getBlock(blockNumber);

        if (block === undefined) {
          this.#log.warn(`Cannot remove block ${blockNumber} from the store since we don't have it`);
          continue;
        }
        await this.#blocks.delete(block.block.number);
        await Promise.all(block.block.body.txEffects.map(tx => this.#txEffects.delete(tx.txHash.toString())));
        const blockHash = (await block.block.hash()).toString();
        await this.#blockTxs.delete(blockHash);
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
  async *getBlocks(start: number, limit: number): AsyncIterableIterator<PublishedL2Block> {
    for await (const [blockNumber, blockStorage] of this.getBlockStorages(start, limit)) {
      const block = await this.getBlockFromBlockStorage(blockNumber, blockStorage);
      if (block) {
        yield block;
      }
    }
  }

  /**
   * Gets an L2 block.
   * @param blockNumber - The number of the block to return.
   * @returns The requested L2 block.
   */
  async getBlock(blockNumber: number): Promise<PublishedL2Block | undefined> {
    const blockStorage = await this.#blocks.getAsync(blockNumber);
    if (!blockStorage || !blockStorage.header) {
      return Promise.resolve(undefined);
    }
    return this.getBlockFromBlockStorage(blockNumber, blockStorage);
  }

  /**
   * Gets the headers for a sequence of L2 blocks.
   * @param start - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 block headers
   */
  async *getBlockHeaders(start: number, limit: number): AsyncIterableIterator<BlockHeader> {
    for await (const [blockNumber, blockStorage] of this.getBlockStorages(start, limit)) {
      const header = L2BlockHeader.fromBuffer(blockStorage.header).toBlockHeader();
      if (header.getBlockNumber() !== blockNumber) {
        throw new Error(
          `Block number mismatch when retrieving block header from archive (expected ${blockNumber} but got ${header.getBlockNumber()})`,
        );
      }
      yield header;
    }
  }

  private async *getBlockStorages(start: number, limit: number) {
    let expectedBlockNumber = start;
    for await (const [blockNumber, blockStorage] of this.#blocks.entriesAsync(this.#computeBlockRange(start, limit))) {
      if (blockNumber !== expectedBlockNumber) {
        throw new Error(
          `Block number mismatch when iterating blocks from archive (expected ${expectedBlockNumber} but got ${blockNumber})`,
        );
      }
      expectedBlockNumber++;
      yield [blockNumber, blockStorage] as const;
    }
  }

  private async getBlockFromBlockStorage(blockNumber: number, blockStorage: BlockStorage) {
    const header = L2BlockHeader.fromBuffer(blockStorage.header);
    const archive = AppendOnlyTreeSnapshot.fromBuffer(blockStorage.archive);
    const blockHash = blockStorage.blockHash;
    const blockHashString = bufferToHex(blockHash);
    const blockTxsBuffer = await this.#blockTxs.getAsync(blockHashString);
    if (blockTxsBuffer === undefined) {
      this.#log.warn(`Could not find body for block ${header.globalVariables.blockNumber} ${blockHash}`);
      return undefined;
    }

    const txEffects: TxEffect[] = [];
    const reader = BufferReader.asReader(blockTxsBuffer);
    while (!reader.isEmpty()) {
      const txHash = reader.readObject(TxHash);
      const txEffect = await this.#txEffects.getAsync(txHash.toString());
      if (txEffect === undefined) {
        this.#log.warn(`Could not find tx effect for tx ${txHash} in block ${blockNumber}`);
        return undefined;
      }
      txEffects.push(deserializeIndexedTxEffect(txEffect).data);
    }
    const body = new Body(txEffects);
    const block = new L2Block(archive, header, body, Fr.fromBuffer(blockHash));

    if (block.number !== blockNumber) {
      throw new Error(
        `Block number mismatch when retrieving block from archive (expected ${blockNumber} but got ${
          block.number
        } with hash ${blockHashString})`,
      );
    }
    const attestations = blockStorage.attestations.map(CommitteeAttestation.fromBuffer);
    return { block, l1: blockStorage.l1, attestations };
  }

  /**
   * Gets a tx effect.
   * @param txHash - The hash of the tx corresponding to the tx effect.
   * @returns The requested tx effect with block info (or undefined if not found).
   */
  async getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    const buffer = await this.#txEffects.getAsync(txHash.toString());
    if (!buffer) {
      return undefined;
    }
    return deserializeIndexedTxEffect(buffer);
  }

  /**
   * Gets a receipt of a settled tx.
   * @param txHash - The hash of a tx we try to get the receipt for.
   * @returns The requested tx receipt (or undefined if not found).
   */
  async getSettledTxReceipt(txHash: TxHash): Promise<TxReceipt | undefined> {
    const txEffect = await this.getTxEffect(txHash);
    if (!txEffect) {
      return undefined;
    }

    return new TxReceipt(
      txHash,
      TxReceipt.statusFromRevertCode(txEffect.data.revertCode),
      '',
      txEffect.data.transactionFee.toBigInt(),
      txEffect.l2BlockHash,
      txEffect.l2BlockNumber,
    );
  }

  /**
   * Looks up which block included the requested tx effect.
   * @param txHash - The txHash of the tx.
   * @returns The block number and index of the tx.
   */
  public async getTxLocation(txHash: TxHash): Promise<[blockNumber: number, txIndex: number] | undefined> {
    const txEffect = await this.#txEffects.getAsync(txHash.toString());
    if (!txEffect) {
      return undefined;
    }
    const { l2BlockNumber, txIndexInBlock } = deserializeIndexedTxEffect(txEffect);
    return [l2BlockNumber, txIndexInBlock];
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
    const [latestBlockNumber, provenBlockNumber] = await Promise.all([
      this.getSynchedL2BlockNumber(),
      this.#lastProvenL2Block.getAsync(),
    ]);
    return (provenBlockNumber ?? 0) > latestBlockNumber ? latestBlockNumber : (provenBlockNumber ?? 0);
  }

  setProvenL2BlockNumber(blockNumber: number) {
    return this.#lastProvenL2Block.set(blockNumber);
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
