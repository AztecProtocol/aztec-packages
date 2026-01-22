import { INITIAL_CHECKPOINT_NUMBER, INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import type { Logger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';
import { bufferToHex } from '@aztec/foundation/string';
import { isDefined } from '@aztec/foundation/types';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncSingleton, Range } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  Body,
  CheckpointedL2Block,
  CommitteeAttestation,
  L2BlockHash,
  L2BlockNew,
  type ValidateCheckpointResult,
  deserializeValidateCheckpointResult,
  serializeValidateCheckpointResult,
} from '@aztec/stdlib/block';
import { L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import {
  BlockHeader,
  type IndexedTxEffect,
  TxEffect,
  TxHash,
  TxReceipt,
  TxStatus,
  deserializeIndexedTxEffect,
  serializeIndexedTxEffect,
} from '@aztec/stdlib/tx';

import {
  BlockArchiveNotConsistentError,
  BlockIndexNotSequentialError,
  BlockNotFoundError,
  BlockNumberNotSequentialError,
  CheckpointNotFoundError,
  CheckpointNumberNotConsistentError,
  CheckpointNumberNotSequentialError,
  InitialBlockNumberNotSequentialError,
  InitialCheckpointNumberNotSequentialError,
} from '../errors.js';

export { TxReceipt, type TxEffect, type TxHash } from '@aztec/stdlib/tx';

type BlockIndexValue = [blockNumber: number, index: number];

type BlockStorage = {
  header: Buffer;
  blockHash: Buffer;
  archive: Buffer;
  checkpointNumber: number;
  indexWithinCheckpoint: number;
};

type CheckpointStorage = {
  header: Buffer;
  archive: Buffer;
  checkpointNumber: number;
  startBlock: number;
  numBlocks: number;
  l1: Buffer;
  attestations: Buffer[];
};

export type CheckpointData = {
  checkpointNumber: CheckpointNumber;
  header: CheckpointHeader;
  archive: AppendOnlyTreeSnapshot;
  startBlock: number;
  numBlocks: number;
  l1: L1PublishedData;
  attestations: Buffer[];
};

/**
 * LMDB-based block storage for the archiver.
 */
export class BlockStore {
  /** Map block number to block data */
  #blocks: AztecAsyncMap<number, BlockStorage>;

  /** Map checkpoint number to checkpoint data */
  #checkpoints: AztecAsyncMap<number, CheckpointStorage>;

  /** Map block hash to list of tx hashes */
  #blockTxs: AztecAsyncMap<string, Buffer>;

  /** Tx hash to serialized IndexedTxEffect */
  #txEffects: AztecAsyncMap<string, Buffer>;

  /** Stores L1 block number in which the last processed L2 block was included */
  #lastSynchedL1Block: AztecAsyncSingleton<bigint>;

  /** Stores last proven checkpoint */
  #lastProvenCheckpoint: AztecAsyncSingleton<number>;

  /** Stores the pending chain validation status */
  #pendingChainValidationStatus: AztecAsyncSingleton<Buffer>;

  /** Index mapping a contract's address (as a string) to its location in a block */
  #contractIndex: AztecAsyncMap<string, BlockIndexValue>;

  /** Index mapping block hash to block number */
  #blockHashIndex: AztecAsyncMap<string, number>;

  /** Index mapping block archive to block number */
  #blockArchiveIndex: AztecAsyncMap<string, number>;

  #log: Logger;

  constructor(
    private db: AztecAsyncKVStore,
    log: Logger,
    private l1Constants: Pick<L1RollupConstants, 'epochDuration'>,
  ) {
    this.#log = log;
    this.#blocks = db.openMap('archiver_blocks');
    this.#blockTxs = db.openMap('archiver_block_txs');
    this.#txEffects = db.openMap('archiver_tx_effects');
    this.#contractIndex = db.openMap('archiver_contract_index');
    this.#blockHashIndex = db.openMap('archiver_block_hash_index');
    this.#blockArchiveIndex = db.openMap('archiver_block_archive_index');
    this.#lastSynchedL1Block = db.openSingleton('archiver_last_synched_l1_block');
    this.#lastProvenCheckpoint = db.openSingleton('archiver_last_proven_l2_checkpoint');
    this.#pendingChainValidationStatus = db.openSingleton('archiver_pending_chain_validation_status');
    this.#checkpoints = db.openMap('archiver_checkpoints');
  }

  /**
   * Computes the finalized block number based on the proven block number.
   * A block is considered finalized when it's 2 epochs behind the proven block.
   * TODO(#13569): Compute proper finalized block number based on L1 finalized block.
   * TODO(palla/mbps): Even the provisional computation is wrong, since it should subtract checkpoints, not blocks
   * @returns The finalized block number.
   */
  async getFinalizedL2BlockNumber(): Promise<BlockNumber> {
    const provenBlockNumber = await this.getProvenBlockNumber();
    return BlockNumber(Math.max(provenBlockNumber - this.l1Constants.epochDuration * 2, 0));
  }

  /**
   * Append new blocks to the store's list. All blocks must be for the 'current' checkpoint
   * @param blocks - The L2 blocks to be added to the store.
   * @returns True if the operation is successful.
   */
  async addBlocks(blocks: L2BlockNew[], opts: { force?: boolean } = {}): Promise<boolean> {
    if (blocks.length === 0) {
      return true;
    }

    return await this.db.transactionAsync(async () => {
      // Check that the block immediately before the first block to be added is present in the store.
      const firstBlockNumber = blocks[0].number;
      const firstBlockCheckpointNumber = blocks[0].checkpointNumber;
      const firstBlockIndex = blocks[0].indexWithinCheckpoint;
      const firstBlockLastArchive = blocks[0].header.lastArchive.root;

      // Extract the latest block and checkpoint numbers
      const previousBlockNumber = await this.getLatestBlockNumber();
      const previousCheckpointNumber = await this.getLatestCheckpointNumber();

      // Check that the first block number is the expected one
      if (!opts.force && previousBlockNumber !== firstBlockNumber - 1) {
        throw new InitialBlockNumberNotSequentialError(firstBlockNumber, previousBlockNumber);
      }

      // The same check as above but for checkpoints
      if (!opts.force && previousCheckpointNumber !== firstBlockCheckpointNumber - 1) {
        throw new InitialCheckpointNumberNotSequentialError(firstBlockCheckpointNumber, previousCheckpointNumber);
      }

      // Extract the previous block if there is one and see if it is for the same checkpoint or not
      const previousBlockResult = await this.getBlock(previousBlockNumber);

      let expectedFirstblockIndex = 0;
      let previousBlockIndex: number | undefined = undefined;
      if (previousBlockResult !== undefined) {
        if (previousBlockResult.checkpointNumber === firstBlockCheckpointNumber) {
          // The previous block is for the same checkpoint, therefore our index should follow it
          previousBlockIndex = previousBlockResult.indexWithinCheckpoint;
          expectedFirstblockIndex = previousBlockIndex + 1;
        }
        if (!previousBlockResult.archive.root.equals(firstBlockLastArchive)) {
          throw new BlockArchiveNotConsistentError(
            firstBlockNumber,
            previousBlockResult.number,
            firstBlockLastArchive,
            previousBlockResult.archive.root,
          );
        }
      }

      // Now check that the first block has the expected index value
      if (!opts.force && expectedFirstblockIndex !== firstBlockIndex) {
        throw new BlockIndexNotSequentialError(firstBlockIndex, previousBlockIndex);
      }

      // Iterate over blocks array and insert them, checking that the block numbers and indexes are sequential. Also check they are for the correct checkpoint.
      let previousBlock: L2BlockNew | undefined = undefined;
      for (const block of blocks) {
        if (!opts.force && previousBlock) {
          if (previousBlock.number + 1 !== block.number) {
            throw new BlockNumberNotSequentialError(block.number, previousBlock.number);
          }
          if (previousBlock.indexWithinCheckpoint + 1 !== block.indexWithinCheckpoint) {
            throw new BlockIndexNotSequentialError(block.indexWithinCheckpoint, previousBlock.indexWithinCheckpoint);
          }
          if (!previousBlock.archive.root.equals(block.header.lastArchive.root)) {
            throw new BlockArchiveNotConsistentError(
              block.number,
              previousBlock.number,
              block.header.lastArchive.root,
              previousBlock.archive.root,
            );
          }
        }
        if (!opts.force && firstBlockCheckpointNumber !== block.checkpointNumber) {
          throw new CheckpointNumberNotConsistentError(block.checkpointNumber, firstBlockCheckpointNumber);
        }
        previousBlock = block;
        await this.addBlockToDatabase(block, block.checkpointNumber, block.indexWithinCheckpoint);
      }

      return true;
    });
  }

  /**
   * Append new cheskpoints to the store's list.
   * @param checkpoints - The L2 checkpoints to be added to the store.
   * @returns True if the operation is successful.
   */
  async addCheckpoints(checkpoints: PublishedCheckpoint[], opts: { force?: boolean } = {}): Promise<boolean> {
    if (checkpoints.length === 0) {
      return true;
    }

    return await this.db.transactionAsync(async () => {
      // Check that the checkpoint immediately before the first block to be added is present in the store.
      const firstCheckpointNumber = checkpoints[0].checkpoint.number;
      const previousCheckpointNumber = await this.getLatestCheckpointNumber();

      if (previousCheckpointNumber !== firstCheckpointNumber - 1 && !opts.force) {
        throw new InitialCheckpointNumberNotSequentialError(firstCheckpointNumber, previousCheckpointNumber);
      }

      // Extract the previous checkpoint if there is one
      let previousCheckpointData: CheckpointData | undefined = undefined;
      if (previousCheckpointNumber !== INITIAL_CHECKPOINT_NUMBER - 1) {
        // There should be a previous checkpoint
        previousCheckpointData = await this.getCheckpointData(previousCheckpointNumber);
        if (previousCheckpointData === undefined) {
          throw new CheckpointNotFoundError(previousCheckpointNumber);
        }
      }

      let previousBlockNumber: BlockNumber | undefined = undefined;
      let previousBlock: L2BlockNew | undefined = undefined;

      // If we have a previous checkpoint then we need to get the previous block number
      if (previousCheckpointData !== undefined) {
        previousBlockNumber = BlockNumber(previousCheckpointData.startBlock + previousCheckpointData.numBlocks - 1);
        previousBlock = await this.getBlock(previousBlockNumber);
        if (previousBlock === undefined) {
          // We should be able to get the required previous block
          throw new BlockNotFoundError(previousBlockNumber);
        }
      }

      // Iterate over checkpoints array and insert them, checking that the block numbers are sequential.
      let previousCheckpoint: PublishedCheckpoint | undefined = undefined;
      for (const checkpoint of checkpoints) {
        if (
          !opts.force &&
          previousCheckpoint &&
          previousCheckpoint.checkpoint.number + 1 !== checkpoint.checkpoint.number
        ) {
          throw new CheckpointNumberNotSequentialError(
            checkpoint.checkpoint.number,
            previousCheckpoint.checkpoint.number,
          );
        }
        previousCheckpoint = checkpoint;

        // Store every block in the database. the block may already exist, but this has come from chain and is assumed to be correct.
        for (let i = 0; i < checkpoint.checkpoint.blocks.length; i++) {
          const block = checkpoint.checkpoint.blocks[i];
          if (previousBlock) {
            // The blocks should have a sequential block number
            if (previousBlock.number !== block.number - 1) {
              throw new BlockNumberNotSequentialError(block.number, previousBlock.number);
            }
            // If the blocks are for the same checkpoint then they should have sequential indexes
            if (
              previousBlock.checkpointNumber === block.checkpointNumber &&
              previousBlock.indexWithinCheckpoint !== block.indexWithinCheckpoint - 1
            ) {
              throw new BlockIndexNotSequentialError(block.indexWithinCheckpoint, previousBlock.indexWithinCheckpoint);
            }
            if (!previousBlock.archive.root.equals(block.header.lastArchive.root)) {
              throw new BlockArchiveNotConsistentError(
                block.number,
                previousBlock.number,
                block.header.lastArchive.root,
                previousBlock.archive.root,
              );
            }
          } else {
            // No previous block, must be block 1 at checkpoint index 0
            if (block.indexWithinCheckpoint !== 0) {
              throw new BlockIndexNotSequentialError(block.indexWithinCheckpoint, undefined);
            }
            if (block.number !== INITIAL_L2_BLOCK_NUM) {
              throw new BlockNumberNotSequentialError(block.number, undefined);
            }
          }

          previousBlock = block;
          await this.addBlockToDatabase(block, checkpoint.checkpoint.number, i);
        }

        // Store the checkpoint in the database
        await this.#checkpoints.set(checkpoint.checkpoint.number, {
          header: checkpoint.checkpoint.header.toBuffer(),
          archive: checkpoint.checkpoint.archive.toBuffer(),
          l1: checkpoint.l1.toBuffer(),
          attestations: checkpoint.attestations.map(attestation => attestation.toBuffer()),
          checkpointNumber: checkpoint.checkpoint.number,
          startBlock: checkpoint.checkpoint.blocks[0].number,
          numBlocks: checkpoint.checkpoint.blocks.length,
        });
      }

      await this.#lastSynchedL1Block.set(checkpoints[checkpoints.length - 1].l1.blockNumber);
      return true;
    });
  }

  private async addBlockToDatabase(block: L2BlockNew, checkpointNumber: number, indexWithinCheckpoint: number) {
    const blockHash = L2BlockHash.fromField(await block.hash());

    await this.#blocks.set(block.number, {
      header: block.header.toBuffer(),
      blockHash: blockHash.toBuffer(),
      archive: block.archive.toBuffer(),
      checkpointNumber,
      indexWithinCheckpoint,
    });

    for (let i = 0; i < block.body.txEffects.length; i++) {
      const txEffect: IndexedTxEffect = {
        data: block.body.txEffects[i],
        l2BlockNumber: block.number,
        l2BlockHash: blockHash,
        txIndexInBlock: i,
      };
      await this.#txEffects.set(txEffect.data.txHash.toString(), serializeIndexedTxEffect(txEffect));
    }

    await this.#blockTxs.set(blockHash.toString(), Buffer.concat(block.body.txEffects.map(tx => tx.txHash.toBuffer())));

    // Update indices for block hash and archive
    await this.#blockHashIndex.set(blockHash.toString(), block.number);
    await this.#blockArchiveIndex.set(block.archive.root.toString(), block.number);
  }

  /** Deletes a block and all associated data (tx effects, indices). */
  private async deleteBlock(block: L2BlockNew): Promise<void> {
    // Delete the block from the main blocks map
    await this.#blocks.delete(block.number);

    // Delete all tx effects for this block
    await Promise.all(block.body.txEffects.map(tx => this.#txEffects.delete(tx.txHash.toString())));

    // Delete block txs mapping
    const blockHash = (await block.hash()).toString();
    await this.#blockTxs.delete(blockHash);

    // Clean up indices
    await this.#blockHashIndex.delete(blockHash);
    await this.#blockArchiveIndex.delete(block.archive.root.toString());
  }

  /**
   * Unwinds checkpoints from the database
   * @param from -  The tip of the chain, passed for verification purposes,
   *                ensuring that we don't end up deleting something we did not intend
   * @param checkpointsToUnwind - The number of checkpoints we are to unwind
   * @returns True if the operation is successful
   */
  async unwindCheckpoints(from: CheckpointNumber, checkpointsToUnwind: number) {
    return await this.db.transactionAsync(async () => {
      const last = await this.getLatestCheckpointNumber();
      if (from !== last) {
        throw new Error(`Can only unwind checkpoints from the tip (requested ${from} but current tip is ${last})`);
      }

      const proven = await this.getProvenCheckpointNumber();
      if (from - checkpointsToUnwind < proven) {
        await this.setProvenCheckpointNumber(CheckpointNumber(from - checkpointsToUnwind));
      }

      for (let i = 0; i < checkpointsToUnwind; i++) {
        const checkpointNumber = from - i;
        const checkpoint = await this.#checkpoints.getAsync(checkpointNumber);

        if (checkpoint === undefined) {
          this.#log.warn(`Cannot remove checkpoint ${checkpointNumber} from the store since we don't have it`);
          continue;
        }
        await this.#checkpoints.delete(checkpointNumber);
        const maxBlock = checkpoint.startBlock + checkpoint.numBlocks - 1;

        for (let blockNumber = checkpoint.startBlock; blockNumber <= maxBlock; blockNumber++) {
          const block = await this.getBlock(BlockNumber(blockNumber));

          if (block === undefined) {
            this.#log.warn(`Cannot remove block ${blockNumber} from the store since we don't have it`);
            continue;
          }

          await this.deleteBlock(block);
          this.#log.debug(
            `Unwound block ${blockNumber} ${(await block.hash()).toString()} for checkpoint ${checkpointNumber}`,
          );
        }
      }

      return true;
    });
  }

  async getCheckpointData(checkpointNumber: CheckpointNumber): Promise<CheckpointData | undefined> {
    const checkpointStorage = await this.#checkpoints.getAsync(checkpointNumber);
    if (!checkpointStorage) {
      return undefined;
    }
    return this.checkpointDataFromCheckpointStorage(checkpointStorage);
  }

  async getRangeOfCheckpoints(from: CheckpointNumber, limit: number): Promise<CheckpointData[]> {
    const checkpoints: CheckpointData[] = [];
    for (let checkpointNumber = from; checkpointNumber < from + limit; checkpointNumber++) {
      const checkpoint = await this.#checkpoints.getAsync(checkpointNumber);
      if (!checkpoint) {
        break;
      }
      checkpoints.push(this.checkpointDataFromCheckpointStorage(checkpoint));
    }
    return checkpoints;
  }

  private checkpointDataFromCheckpointStorage(checkpointStorage: CheckpointStorage) {
    const data: CheckpointData = {
      header: CheckpointHeader.fromBuffer(checkpointStorage.header),
      archive: AppendOnlyTreeSnapshot.fromBuffer(checkpointStorage.archive),
      checkpointNumber: CheckpointNumber(checkpointStorage.checkpointNumber),
      startBlock: checkpointStorage.startBlock,
      numBlocks: checkpointStorage.numBlocks,
      l1: L1PublishedData.fromBuffer(checkpointStorage.l1),
      attestations: checkpointStorage.attestations,
    };
    return data;
  }

  async getBlocksForCheckpoint(checkpointNumber: CheckpointNumber): Promise<L2BlockNew[] | undefined> {
    const checkpoint = await this.#checkpoints.getAsync(checkpointNumber);
    if (!checkpoint) {
      return undefined;
    }

    const blocksForCheckpoint = await toArray(
      this.#blocks.entriesAsync({
        start: checkpoint.startBlock,
        end: checkpoint.startBlock + checkpoint.numBlocks,
      }),
    );

    const converted = await Promise.all(blocksForCheckpoint.map(x => this.getBlockFromBlockStorage(x[0], x[1])));
    return converted.filter(isDefined);
  }

  /**
   * Gets all blocks that have the given slot number.
   * Iterates backwards through blocks for efficiency since we usually query for the last slot.
   * @param slotNumber - The slot number to search for.
   * @returns All blocks with the given slot number, in ascending block number order.
   */
  async getBlocksForSlot(slotNumber: SlotNumber): Promise<L2BlockNew[]> {
    const blocks: L2BlockNew[] = [];

    // Iterate backwards through all blocks and filter by slot number
    // This is more efficient since we usually query for the most recent slot
    for await (const [blockNumber, blockStorage] of this.#blocks.entriesAsync({ reverse: true })) {
      const block = await this.getBlockFromBlockStorage(blockNumber, blockStorage);
      const blockSlot = block?.header.globalVariables.slotNumber;
      if (block && blockSlot === slotNumber) {
        blocks.push(block);
      } else if (blockSlot && blockSlot < slotNumber) {
        break; // Blocks are stored in slot ascending order, so we can stop searching
      }
    }

    // Reverse to return blocks in ascending order (block number order)
    return blocks.reverse();
  }

  /**
   * Removes all blocks with block number > blockNumber.
   * @param blockNumber - The block number to remove after.
   * @returns The removed blocks (for event emission).
   */
  async unwindBlocksAfter(blockNumber: BlockNumber): Promise<L2BlockNew[]> {
    return await this.db.transactionAsync(async () => {
      const removedBlocks: L2BlockNew[] = [];

      // Get the latest block number to determine the range
      const latestBlockNumber = await this.getLatestBlockNumber();

      // Iterate from blockNumber + 1 to latestBlockNumber
      for (let bn = blockNumber + 1; bn <= latestBlockNumber; bn++) {
        const block = await this.getBlock(BlockNumber(bn));

        if (block === undefined) {
          this.#log.warn(`Cannot remove block ${bn} from the store since we don't have it`);
          continue;
        }

        removedBlocks.push(block);
        await this.deleteBlock(block);
        this.#log.debug(`Removed block ${bn} ${(await block.hash()).toString()}`);
      }

      return removedBlocks;
    });
  }

  async getProvenBlockNumber(): Promise<BlockNumber> {
    const provenCheckpointNumber = await this.getProvenCheckpointNumber();
    if (provenCheckpointNumber === INITIAL_CHECKPOINT_NUMBER - 1) {
      return BlockNumber(INITIAL_L2_BLOCK_NUM - 1);
    }
    const checkpointStorage = await this.#checkpoints.getAsync(provenCheckpointNumber);
    if (!checkpointStorage) {
      throw new CheckpointNotFoundError(provenCheckpointNumber);
    } else {
      return BlockNumber(checkpointStorage.startBlock + checkpointStorage.numBlocks - 1);
    }
  }

  async getLatestBlockNumber(): Promise<BlockNumber> {
    const [latestBlocknumber] = await toArray(this.#blocks.keysAsync({ reverse: true, limit: 1 }));
    return typeof latestBlocknumber === 'number'
      ? BlockNumber(latestBlocknumber)
      : BlockNumber(INITIAL_L2_BLOCK_NUM - 1);
  }

  async getLatestCheckpointNumber(): Promise<CheckpointNumber> {
    const [latestCheckpointNumber] = await toArray(this.#checkpoints.keysAsync({ reverse: true, limit: 1 }));
    if (latestCheckpointNumber === undefined) {
      return CheckpointNumber(INITIAL_CHECKPOINT_NUMBER - 1);
    }
    return CheckpointNumber(latestCheckpointNumber);
  }

  async getCheckpointedBlock(number: BlockNumber): Promise<CheckpointedL2Block | undefined> {
    const blockStorage = await this.#blocks.getAsync(number);
    if (!blockStorage) {
      return undefined;
    }
    const checkpoint = await this.#checkpoints.getAsync(blockStorage.checkpointNumber);
    if (!checkpoint) {
      return undefined;
    }
    const block = await this.getBlockFromBlockStorage(number, blockStorage);
    if (!block) {
      return undefined;
    }
    return new CheckpointedL2Block(
      CheckpointNumber(checkpoint.checkpointNumber),
      block,
      L1PublishedData.fromBuffer(checkpoint.l1),
      checkpoint.attestations.map(buf => CommitteeAttestation.fromBuffer(buf)),
    );
  }

  /**
   * Gets up to `limit` amount of Checkpointed L2 blocks starting from `from`.
   * @param start - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 blocks
   */
  async *getCheckpointedBlocks(start: BlockNumber, limit: number): AsyncIterableIterator<CheckpointedL2Block> {
    const checkpointCache = new Map<CheckpointNumber, CheckpointStorage>();
    for await (const [blockNumber, blockStorage] of this.getBlockStorages(start, limit)) {
      const block = await this.getBlockFromBlockStorage(blockNumber, blockStorage);
      if (block) {
        const checkpoint =
          checkpointCache.get(CheckpointNumber(blockStorage.checkpointNumber)) ??
          (await this.#checkpoints.getAsync(blockStorage.checkpointNumber));
        if (checkpoint) {
          checkpointCache.set(CheckpointNumber(blockStorage.checkpointNumber), checkpoint);
          const checkpointedBlock = new CheckpointedL2Block(
            CheckpointNumber(checkpoint.checkpointNumber),
            block,
            L1PublishedData.fromBuffer(checkpoint.l1),
            checkpoint.attestations.map(buf => CommitteeAttestation.fromBuffer(buf)),
          );
          yield checkpointedBlock;
        }
      }
    }
  }

  async getCheckpointedBlockByHash(blockHash: Fr): Promise<CheckpointedL2Block | undefined> {
    const blockNumber = await this.#blockHashIndex.getAsync(blockHash.toString());
    if (blockNumber === undefined) {
      return undefined;
    }
    return this.getCheckpointedBlock(BlockNumber(blockNumber));
  }

  async getCheckpointedBlockByArchive(archive: Fr): Promise<CheckpointedL2Block | undefined> {
    const blockNumber = await this.#blockArchiveIndex.getAsync(archive.toString());
    if (blockNumber === undefined) {
      return undefined;
    }
    return this.getCheckpointedBlock(BlockNumber(blockNumber));
  }

  /**
   * Gets up to `limit` amount of L2 blocks starting from `from`.
   * @param start - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 blocks
   */
  async *getBlocks(start: BlockNumber, limit: number): AsyncIterableIterator<L2BlockNew> {
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
  async getBlock(blockNumber: BlockNumber): Promise<L2BlockNew | undefined> {
    const blockStorage = await this.#blocks.getAsync(blockNumber);
    if (!blockStorage || !blockStorage.header) {
      return Promise.resolve(undefined);
    }
    return this.getBlockFromBlockStorage(blockNumber, blockStorage);
  }

  /**
   * Gets an L2 block by its hash.
   * @param blockHash - The hash of the block to return.
   * @returns The requested L2 block.
   */
  async getBlockByHash(blockHash: L2BlockHash): Promise<L2BlockNew | undefined> {
    const blockNumber = await this.#blockHashIndex.getAsync(blockHash.toString());
    if (blockNumber === undefined) {
      return undefined;
    }
    return this.getBlock(BlockNumber(blockNumber));
  }

  /**
   * Gets an L2 block by its archive root.
   * @param archive - The archive root of the block to return.
   * @returns The requested L2 block.
   */
  async getBlockByArchive(archive: Fr): Promise<L2BlockNew | undefined> {
    const blockNumber = await this.#blockArchiveIndex.getAsync(archive.toString());
    if (blockNumber === undefined) {
      return undefined;
    }
    return this.getBlock(BlockNumber(blockNumber));
  }

  /**
   * Gets a block header by its hash.
   * @param blockHash - The hash of the block to return.
   * @returns The requested block header.
   */
  async getBlockHeaderByHash(blockHash: L2BlockHash): Promise<BlockHeader | undefined> {
    const blockNumber = await this.#blockHashIndex.getAsync(blockHash.toString());
    if (blockNumber === undefined) {
      return undefined;
    }
    const blockStorage = await this.#blocks.getAsync(blockNumber);
    if (!blockStorage || !blockStorage.header) {
      return undefined;
    }
    return BlockHeader.fromBuffer(blockStorage.header);
  }

  /**
   * Gets a block header by its archive root.
   * @param archive - The archive root of the block to return.
   * @returns The requested block header.
   */
  async getBlockHeaderByArchive(archive: Fr): Promise<BlockHeader | undefined> {
    const blockNumber = await this.#blockArchiveIndex.getAsync(archive.toString());
    if (blockNumber === undefined) {
      return undefined;
    }
    const blockStorage = await this.#blocks.getAsync(blockNumber);
    if (!blockStorage || !blockStorage.header) {
      return undefined;
    }
    return BlockHeader.fromBuffer(blockStorage.header);
  }

  /**
   * Gets the headers for a sequence of L2 blocks.
   * @param start - Number of the first block to return (inclusive).
   * @param limit - The number of blocks to return.
   * @returns The requested L2 block headers
   */
  async *getBlockHeaders(start: BlockNumber, limit: number): AsyncIterableIterator<BlockHeader> {
    for await (const [blockNumber, blockStorage] of this.getBlockStorages(start, limit)) {
      const header = BlockHeader.fromBuffer(blockStorage.header);
      if (header.getBlockNumber() !== blockNumber) {
        throw new Error(
          `Block number mismatch when retrieving block header from archive (expected ${blockNumber} but got ${header.getBlockNumber()})`,
        );
      }
      yield header;
    }
  }

  private async *getBlockStorages(start: BlockNumber, limit: number) {
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

  private async getBlockFromBlockStorage(
    blockNumber: number,
    blockStorage: BlockStorage,
  ): Promise<L2BlockNew | undefined> {
    const header = BlockHeader.fromBuffer(blockStorage.header);
    const archive = AppendOnlyTreeSnapshot.fromBuffer(blockStorage.archive);
    const blockHash = blockStorage.blockHash;
    header.setHash(Fr.fromBuffer(blockHash));
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
    const block = new L2BlockNew(
      archive,
      header,
      body,
      CheckpointNumber(blockStorage.checkpointNumber!),
      IndexWithinCheckpoint(blockStorage.indexWithinCheckpoint),
    );

    if (block.number !== blockNumber) {
      throw new Error(
        `Block number mismatch when retrieving block from archive (expected ${blockNumber} but got ${
          block.number
        } with hash ${blockHashString})`,
      );
    }
    return block;
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

    const blockNumber = BlockNumber(txEffect.l2BlockNumber);

    // Use existing archiver methods to determine finalization level
    const [provenBlockNumber, checkpointedBlockNumber, finalizedBlockNumber] = await Promise.all([
      this.getProvenBlockNumber(),
      this.getCheckpointedL2BlockNumber(),
      this.getFinalizedL2BlockNumber(),
    ]);

    let status: TxStatus;
    if (blockNumber <= finalizedBlockNumber) {
      status = TxStatus.FINALIZED;
    } else if (blockNumber <= provenBlockNumber) {
      status = TxStatus.PROVEN;
    } else if (blockNumber <= checkpointedBlockNumber) {
      status = TxStatus.CHECKPOINTED;
    } else {
      status = TxStatus.PROPOSED;
    }

    return new TxReceipt(
      txHash,
      status,
      TxReceipt.executionResultFromRevertCode(txEffect.data.revertCode),
      undefined,
      txEffect.data.transactionFee.toBigInt(),
      txEffect.l2BlockHash,
      blockNumber,
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
   * Gets the number of the latest L2 block checkpointed.
   * @returns The number of the latest L2 block checkpointed.
   */
  async getCheckpointedL2BlockNumber(): Promise<BlockNumber> {
    const latestCheckpointNumber = await this.getLatestCheckpointNumber();
    const checkpoint = await this.getCheckpointData(latestCheckpointNumber);
    if (!checkpoint) {
      return BlockNumber(INITIAL_L2_BLOCK_NUM - 1);
    }
    return BlockNumber(checkpoint.startBlock + checkpoint.numBlocks - 1);
  }

  async getLatestL2BlockNumber(): Promise<BlockNumber> {
    const [lastBlockNumber] = await toArray(this.#blocks.keysAsync({ reverse: true, limit: 1 }));
    return typeof lastBlockNumber === 'number' ? BlockNumber(lastBlockNumber) : BlockNumber(INITIAL_L2_BLOCK_NUM - 1);
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

  async getProvenCheckpointNumber(): Promise<CheckpointNumber> {
    const [latestCheckpointNumber, provenCheckpointNumber] = await Promise.all([
      this.getLatestCheckpointNumber(),
      this.#lastProvenCheckpoint.getAsync(),
    ]);
    return (provenCheckpointNumber ?? 0) > latestCheckpointNumber
      ? latestCheckpointNumber
      : CheckpointNumber(provenCheckpointNumber ?? 0);
  }

  async setProvenCheckpointNumber(checkpointNumber: CheckpointNumber) {
    const result = await this.#lastProvenCheckpoint.set(checkpointNumber);
    return result;
  }

  #computeBlockRange(start: BlockNumber, limit: number): Required<Pick<Range<number>, 'start' | 'limit'>> {
    if (limit < 1) {
      throw new Error(`Invalid limit: ${limit}`);
    }

    if (start < INITIAL_L2_BLOCK_NUM) {
      throw new Error(`Invalid start: ${start}`);
    }

    return { start, limit };
  }

  /**
   * Gets the pending chain validation status.
   * @returns The validation status or undefined if not set.
   */
  async getPendingChainValidationStatus(): Promise<ValidateCheckpointResult | undefined> {
    const buffer = await this.#pendingChainValidationStatus.getAsync();
    if (!buffer) {
      return undefined;
    }
    return deserializeValidateCheckpointResult(buffer);
  }

  /**
   * Sets the pending chain validation status.
   * @param status - The validation status to store.
   */
  async setPendingChainValidationStatus(status: ValidateCheckpointResult | undefined): Promise<void> {
    if (status) {
      const buffer = serializeValidateCheckpointResult(status);
      await this.#pendingChainValidationStatus.set(buffer);
    } else {
      await this.#pendingChainValidationStatus.delete();
    }
  }
}
