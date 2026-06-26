import { INITIAL_CHECKPOINT_NUMBER, INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';
import { bufferToHex } from '@aztec/foundation/string';
import { isDefined } from '@aztec/foundation/types';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncSingleton, Range } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type BlockData,
  BlockHash,
  Body,
  CheckpointedL2Block,
  CommitteeAttestation,
  GENESIS_CHECKPOINT_HEADER_HASH,
  L2Block,
  type L2TipId,
  type L2Tips,
  type ValidateCheckpointResult,
  deserializeValidateCheckpointResult,
  serializeValidateCheckpointResult,
} from '@aztec/stdlib/block';
import { type CheckpointData, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { type L1RollupConstants, getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
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
  BlockAlreadyCheckpointedError,
  BlockArchiveNotConsistentError,
  BlockIndexNotSequentialError,
  BlockNotFoundError,
  BlockNumberNotSequentialError,
  CannotOverwriteCheckpointedBlockError,
  CheckpointNotFoundError,
  CheckpointNumberNotSequentialError,
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
  checkpointOutHash: Buffer;
  checkpointNumber: number;
  startBlock: number;
  blockCount: number;
  l1: Buffer;
  attestations: Buffer[];
};

export type RemoveCheckpointsResult = { blocksRemoved: L2Block[] | undefined };

/**
 * LMDB-based block storage for the archiver.
 */
export class BlockStore {
  /** Map block number to block data */
  #blocks: AztecAsyncMap<number, BlockStorage>;

  /** Map checkpoint number to checkpoint data */
  #checkpoints: AztecAsyncMap<number, CheckpointStorage>;

  /** Map slot number to checkpoint number, for looking up checkpoints by slot range. */
  #slotToCheckpoint: AztecAsyncMap<number, number>;

  /** Map block hash to list of tx hashes */
  #blockTxs: AztecAsyncMap<string, Buffer>;

  /** Tx hash to serialized IndexedTxEffect */
  #txEffects: AztecAsyncMap<string, Buffer>;

  /** Stores L1 block number in which the last processed L2 block was included */
  #lastSynchedL1Block: AztecAsyncSingleton<bigint>;

  /** Stores last proven checkpoint */
  #lastProvenCheckpoint: AztecAsyncSingleton<number>;

  /** Stores last finalized checkpoint (proven at or before the finalized L1 block) */
  #lastFinalizedCheckpoint: AztecAsyncSingleton<number>;

  /** Stores the pending chain validation status */
  #pendingChainValidationStatus: AztecAsyncSingleton<Buffer>;

  /** Index mapping a contract's address (as a string) to its location in a block */
  #contractIndex: AztecAsyncMap<string, BlockIndexValue>;

  /** Index mapping block hash to block number */
  #blockHashIndex: AztecAsyncMap<string, number>;

  /** Index mapping block archive to block number */
  #blockArchiveIndex: AztecAsyncMap<string, number>;

  #log = createLogger('archiver:block_store');

  constructor(private db: AztecAsyncKVStore) {
    this.#blocks = db.openMap('archiver_blocks');
    this.#blockTxs = db.openMap('archiver_block_txs');
    this.#txEffects = db.openMap('archiver_tx_effects');
    this.#contractIndex = db.openMap('archiver_contract_index');
    this.#blockHashIndex = db.openMap('archiver_block_hash_index');
    this.#blockArchiveIndex = db.openMap('archiver_block_archive_index');
    this.#lastSynchedL1Block = db.openSingleton('archiver_last_synched_l1_block');
    this.#lastProvenCheckpoint = db.openSingleton('archiver_last_proven_l2_checkpoint');
    this.#lastFinalizedCheckpoint = db.openSingleton('archiver_last_finalized_l2_checkpoint');
    this.#pendingChainValidationStatus = db.openSingleton('archiver_pending_chain_validation_status');
    this.#checkpoints = db.openMap('archiver_checkpoints');
    this.#slotToCheckpoint = db.openMap('archiver_slot_to_checkpoint');
  }

  /**
   * Returns the finalized L2 block number. An L2 block is finalized when it was proven
   * in an L1 block that has itself been finalized on Ethereum.
   * @returns The finalized block number.
   */
  async getFinalizedL2BlockNumber(): Promise<BlockNumber> {
    const finalizedCheckpointNumber = await this.getFinalizedCheckpointNumber();
    if (finalizedCheckpointNumber === INITIAL_CHECKPOINT_NUMBER - 1) {
      return BlockNumber(INITIAL_L2_BLOCK_NUM - 1);
    }
    const checkpointStorage = await this.#checkpoints.getAsync(finalizedCheckpointNumber);
    if (!checkpointStorage) {
      throw new CheckpointNotFoundError(finalizedCheckpointNumber);
    }
    return BlockNumber(checkpointStorage.startBlock + checkpointStorage.blockCount - 1);
  }

  /**
   * Append a new proposed block to the store.
   * This is an uncheckpointed block that has been proposed by the sequencer but not yet included in a checkpoint on L1.
   * For checkpointed blocks (already published to L1), use addCheckpoints() instead.
   * @param block - The proposed L2 block to be added to the store.
   * @returns True if the operation is successful.
   */
  async addProposedBlock(block: L2Block, opts: { force?: boolean } = {}): Promise<boolean> {
    return await this.db.transactionAsync(async () => {
      const blockNumber = block.number;
      const blockCheckpointNumber = block.checkpointNumber;
      const blockIndex = block.indexWithinCheckpoint;
      const blockLastArchive = block.header.lastArchive.root;

      // Extract the latest block and checkpoint numbers
      const previousBlockNumber = await this.getLatestBlockNumber();
      const previousCheckpointNumber = await this.getLatestCheckpointNumber();

      // Verify we're not overwriting checkpointed blocks
      const lastCheckpointedBlockNumber = await this.getCheckpointedL2BlockNumber();
      if (!opts.force && blockNumber <= lastCheckpointedBlockNumber) {
        // Check if the proposed block matches the already-checkpointed one
        const existingBlock = await this.getBlock(BlockNumber(blockNumber));
        if (existingBlock && existingBlock.archive.root.equals(block.archive.root)) {
          throw new BlockAlreadyCheckpointedError(blockNumber);
        }
        throw new CannotOverwriteCheckpointedBlockError(blockNumber, lastCheckpointedBlockNumber);
      }

      // Check that the block number is the expected one
      if (!opts.force && previousBlockNumber !== blockNumber - 1) {
        throw new BlockNumberNotSequentialError(blockNumber, previousBlockNumber);
      }

      // The same check as above but for checkpoints
      if (!opts.force && previousCheckpointNumber !== blockCheckpointNumber - 1) {
        throw new CheckpointNumberNotSequentialError(blockCheckpointNumber, previousCheckpointNumber);
      }

      // Extract the previous block if there is one and see if it is for the same checkpoint or not
      const previousBlockResult = await this.getBlock(previousBlockNumber);

      let expectedBlockIndex = 0;
      let previousBlockIndex: number | undefined = undefined;
      if (previousBlockResult !== undefined) {
        if (previousBlockResult.checkpointNumber === blockCheckpointNumber) {
          // The previous block is for the same checkpoint, therefore our index should follow it
          previousBlockIndex = previousBlockResult.indexWithinCheckpoint;
          expectedBlockIndex = previousBlockIndex + 1;
        }
        if (!previousBlockResult.archive.root.equals(blockLastArchive)) {
          throw new BlockArchiveNotConsistentError(
            blockNumber,
            previousBlockResult.number,
            blockLastArchive,
            previousBlockResult.archive.root,
          );
        }
      }

      // Now check that the block has the expected index value
      if (!opts.force && expectedBlockIndex !== blockIndex) {
        throw new BlockIndexNotSequentialError(blockIndex, previousBlockIndex);
      }

      await this.addBlockToDatabase(block, block.checkpointNumber, block.indexWithinCheckpoint);

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
      const firstCheckpointNumber = checkpoints[0].checkpoint.number;
      const previousCheckpointNumber = await this.getLatestCheckpointNumber();

      // Handle already-stored checkpoints at the start of the batch.
      // This can happen after an L1 reorg re-includes a checkpoint in a different L1 block.
      // We accept them if archives match (same content) and update their L1 metadata.
      if (!opts.force && firstCheckpointNumber <= previousCheckpointNumber) {
        checkpoints = await this.skipOrUpdateAlreadyStoredCheckpoints(checkpoints, previousCheckpointNumber);
        if (checkpoints.length === 0) {
          return true;
        }
        // Re-check sequentiality after skipping
        const newFirstNumber = checkpoints[0].checkpoint.number;
        if (previousCheckpointNumber !== newFirstNumber - 1) {
          throw new InitialCheckpointNumberNotSequentialError(newFirstNumber, previousCheckpointNumber);
        }
      } else if (previousCheckpointNumber !== firstCheckpointNumber - 1 && !opts.force) {
        throw new InitialCheckpointNumberNotSequentialError(firstCheckpointNumber, previousCheckpointNumber);
      }

      // Extract the previous checkpoint if there is one
      const currentFirstCheckpointNumber = checkpoints[0].checkpoint.number;
      let previousCheckpointData: CheckpointData | undefined = undefined;
      if (currentFirstCheckpointNumber - 1 !== INITIAL_CHECKPOINT_NUMBER - 1) {
        // There should be a previous checkpoint
        previousCheckpointData = await this.getCheckpointData(CheckpointNumber(currentFirstCheckpointNumber - 1));
        if (previousCheckpointData === undefined) {
          throw new CheckpointNotFoundError(CheckpointNumber(currentFirstCheckpointNumber - 1));
        }
      }

      let previousBlockNumber: BlockNumber | undefined = undefined;
      let previousBlock: L2Block | undefined = undefined;

      // If we have a previous checkpoint then we need to get the previous block number
      if (previousCheckpointData !== undefined) {
        previousBlockNumber = BlockNumber(previousCheckpointData.startBlock + previousCheckpointData.blockCount - 1);
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
          checkpointOutHash: checkpoint.checkpoint.getCheckpointOutHash().toBuffer(),
          l1: checkpoint.l1.toBuffer(),
          attestations: checkpoint.attestations.map(attestation => attestation.toBuffer()),
          checkpointNumber: checkpoint.checkpoint.number,
          startBlock: checkpoint.checkpoint.blocks[0].number,
          blockCount: checkpoint.checkpoint.blocks.length,
        });

        // Update slot-to-checkpoint index
        await this.#slotToCheckpoint.set(checkpoint.checkpoint.header.slotNumber, checkpoint.checkpoint.number);
      }

      await this.#lastSynchedL1Block.set(checkpoints[checkpoints.length - 1].l1.blockNumber);
      return true;
    });
  }

  /**
   * Handles checkpoints at the start of a batch that are already stored (e.g. due to L1 reorg).
   * Verifies the archive root matches, updates L1 metadata, and returns only the new checkpoints.
   */
  private async skipOrUpdateAlreadyStoredCheckpoints(
    checkpoints: PublishedCheckpoint[],
    latestStored: CheckpointNumber,
  ): Promise<PublishedCheckpoint[]> {
    let i = 0;
    for (; i < checkpoints.length && checkpoints[i].checkpoint.number <= latestStored; i++) {
      const incoming = checkpoints[i];
      const stored = await this.getCheckpointData(incoming.checkpoint.number);
      if (!stored) {
        // Should not happen if latestStored is correct, but be safe
        break;
      }
      // Verify the checkpoint content matches (archive root)
      if (!stored.archive.root.equals(incoming.checkpoint.archive.root)) {
        throw new Error(
          `Checkpoint ${incoming.checkpoint.number} already exists in store but with a different archive root. ` +
            `Stored: ${stored.archive.root}, incoming: ${incoming.checkpoint.archive.root}`,
        );
      }
      // Update L1 metadata and attestations for the already-stored checkpoint
      this.#log.warn(
        `Checkpoint ${incoming.checkpoint.number} already stored, updating L1 info ` +
          `(L1 block ${stored.l1.blockNumber} -> ${incoming.l1.blockNumber})`,
      );
      await this.#checkpoints.set(incoming.checkpoint.number, {
        header: incoming.checkpoint.header.toBuffer(),
        archive: incoming.checkpoint.archive.toBuffer(),
        checkpointOutHash: incoming.checkpoint.getCheckpointOutHash().toBuffer(),
        l1: incoming.l1.toBuffer(),
        attestations: incoming.attestations.map(a => a.toBuffer()),
        checkpointNumber: incoming.checkpoint.number,
        startBlock: incoming.checkpoint.blocks[0].number,
        blockCount: incoming.checkpoint.blocks.length,
      });
      // Update the sync point to reflect the new L1 block
      await this.#lastSynchedL1Block.set(incoming.l1.blockNumber);
    }
    return checkpoints.slice(i);
  }

  private async addBlockToDatabase(block: L2Block, checkpointNumber: number, indexWithinCheckpoint: number) {
    const blockHash = await block.hash();

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
  private async deleteBlock(block: L2Block): Promise<void> {
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
   * Removes all checkpoints with checkpoint number > checkpointNumber.
   * Also removes ALL blocks (both checkpointed and uncheckpointed) after the last block of the given checkpoint.
   * @param checkpointNumber - Remove all checkpoints strictly after this one.
   */
  async removeCheckpointsAfter(checkpointNumber: CheckpointNumber): Promise<RemoveCheckpointsResult> {
    return await this.db.transactionAsync(async () => {
      const latestCheckpointNumber = await this.getLatestCheckpointNumber();

      if (checkpointNumber >= latestCheckpointNumber) {
        this.#log.warn(`No checkpoints to remove after ${checkpointNumber} (latest is ${latestCheckpointNumber})`);
        return { blocksRemoved: undefined };
      }

      // If the proven checkpoint is beyond the target, update it
      const proven = await this.getProvenCheckpointNumber();
      if (proven > checkpointNumber) {
        this.#log.warn(`Updating proven checkpoint ${proven} to last valid checkpoint ${checkpointNumber}`);
        await this.setProvenCheckpointNumber(checkpointNumber);
      }

      // Find the last block number to keep (last block of the given checkpoint, or 0 if no checkpoint)
      let lastBlockToKeep: BlockNumber;
      if (checkpointNumber <= 0) {
        lastBlockToKeep = BlockNumber(INITIAL_L2_BLOCK_NUM - 1);
      } else {
        const targetCheckpoint = await this.#checkpoints.getAsync(checkpointNumber);
        if (!targetCheckpoint) {
          throw new Error(`Target checkpoint ${checkpointNumber} not found in store`);
        }
        lastBlockToKeep = BlockNumber(targetCheckpoint.startBlock + targetCheckpoint.blockCount - 1);
      }

      // Remove all blocks after lastBlockToKeep (both checkpointed and uncheckpointed)
      const blocksRemoved = await this.removeBlocksAfter(lastBlockToKeep);

      // Remove all checkpoints after the target
      for (let c = latestCheckpointNumber; c > checkpointNumber; c = CheckpointNumber(c - 1)) {
        const checkpointStorage = await this.#checkpoints.getAsync(c);
        if (checkpointStorage) {
          const slotNumber = CheckpointHeader.fromBuffer(checkpointStorage.header).slotNumber;
          await this.#slotToCheckpoint.delete(slotNumber);
        }
        await this.#checkpoints.delete(c);
        this.#log.debug(`Removed checkpoint ${c}`);
      }

      return { blocksRemoved };
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

  /** Returns checkpoint data for all checkpoints whose slot falls within the given range (inclusive). */
  async getCheckpointDataForSlotRange(startSlot: SlotNumber, endSlot: SlotNumber): Promise<CheckpointData[]> {
    const result: CheckpointData[] = [];
    for await (const [, checkpointNumber] of this.#slotToCheckpoint.entriesAsync({
      start: startSlot,
      end: endSlot + 1,
    })) {
      const checkpointStorage = await this.#checkpoints.getAsync(checkpointNumber);
      if (checkpointStorage) {
        result.push(this.checkpointDataFromCheckpointStorage(checkpointStorage));
      }
    }
    return result;
  }

  private checkpointDataFromCheckpointStorage(checkpointStorage: CheckpointStorage): CheckpointData {
    return {
      header: CheckpointHeader.fromBuffer(checkpointStorage.header),
      archive: AppendOnlyTreeSnapshot.fromBuffer(checkpointStorage.archive),
      checkpointOutHash: Fr.fromBuffer(checkpointStorage.checkpointOutHash),
      checkpointNumber: CheckpointNumber(checkpointStorage.checkpointNumber),
      startBlock: BlockNumber(checkpointStorage.startBlock),
      blockCount: checkpointStorage.blockCount,
      l1: L1PublishedData.fromBuffer(checkpointStorage.l1),
      attestations: checkpointStorage.attestations.map(buf => CommitteeAttestation.fromBuffer(buf)),
    };
  }

  async getBlocksForCheckpoint(checkpointNumber: CheckpointNumber): Promise<L2Block[] | undefined> {
    const checkpoint = await this.#checkpoints.getAsync(checkpointNumber);
    if (!checkpoint) {
      return undefined;
    }

    const blocksForCheckpoint = await toArray(
      this.#blocks.entriesAsync({
        start: checkpoint.startBlock,
        end: checkpoint.startBlock + checkpoint.blockCount,
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
  async getBlocksForSlot(slotNumber: SlotNumber): Promise<L2Block[]> {
    const blocks: L2Block[] = [];

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
   * Does not remove any associated checkpoints.
   * @param blockNumber - The block number to remove after.
   * @returns The removed blocks (for event emission).
   */
  async removeBlocksAfter(blockNumber: BlockNumber): Promise<L2Block[]> {
    return await this.db.transactionAsync(async () => {
      const removedBlocks: L2Block[] = [];

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
      return BlockNumber(checkpointStorage.startBlock + checkpointStorage.blockCount - 1);
    }
  }

  async getLatestBlockNumber(): Promise<BlockNumber> {
    const [latestBlocknumber] = await toArray(this.#blocks.keysAsync({ reverse: true, limit: 1 }));
    return typeof latestBlocknumber === 'number'
      ? BlockNumber(latestBlocknumber)
      : BlockNumber(INITIAL_L2_BLOCK_NUM - 1);
  }

  /**
   * Resolves all L2 chain tips in a single read transaction so the snapshot is internally consistent.
   * The result is guaranteed to satisfy finalized <= proven <= checkpointed <= proposed by block number.
   */
  async getL2TipsData(genesisBlockHash: Fr): Promise<L2Tips> {
    return await this.db.transactionAsync(async () => {
      const genesisBlockNumber = BlockNumber(INITIAL_L2_BLOCK_NUM - 1);
      const genesisCheckpointNumber = CheckpointNumber(INITIAL_CHECKPOINT_NUMBER - 1);
      const genesisBlockId = { number: genesisBlockNumber, hash: genesisBlockHash.toString() };
      const genesisCheckpointId = {
        number: genesisCheckpointNumber,
        hash: GENESIS_CHECKPOINT_HEADER_HASH.toString(),
      };
      const genesisTip: L2TipId = { block: genesisBlockId, checkpoint: genesisCheckpointId };

      const [latestBlockEntry] = await toArray(this.#blocks.entriesAsync({ reverse: true, limit: 1 }));
      const [latestCheckpointEntry] = await toArray(this.#checkpoints.entriesAsync({ reverse: true, limit: 1 }));
      const latestCheckpointNumber = latestCheckpointEntry
        ? CheckpointNumber(latestCheckpointEntry[0])
        : genesisCheckpointNumber;

      const [provenRaw, finalizedRaw] = await Promise.all([
        this.#lastProvenCheckpoint.getAsync(),
        this.#lastFinalizedCheckpoint.getAsync(),
      ]);

      const provenCheckpointNumber = CheckpointNumber(Math.min(provenRaw ?? 0, latestCheckpointNumber));
      const finalizedCheckpointNumber = CheckpointNumber(Math.min(finalizedRaw ?? 0, provenCheckpointNumber));

      const checkpointStorageCache = new Map<CheckpointNumber, CheckpointStorage>();
      if (latestCheckpointEntry) {
        checkpointStorageCache.set(CheckpointNumber(latestCheckpointEntry[0]), latestCheckpointEntry[1]);
      }

      const loadCheckpointStorage = async (
        checkpointNumber: CheckpointNumber,
      ): Promise<CheckpointStorage | undefined> => {
        if (checkpointNumber === genesisCheckpointNumber) {
          return undefined;
        }
        if (!checkpointStorageCache.has(checkpointNumber)) {
          const checkpointStorage = await this.#checkpoints.getAsync(checkpointNumber);
          if (!checkpointStorage) {
            throw new CheckpointNotFoundError(checkpointNumber);
          }
          checkpointStorageCache.set(checkpointNumber, checkpointStorage);
        }
        return checkpointStorageCache.get(checkpointNumber)!;
      };

      const [provenCheckpoint, finalizedCheckpoint] = await Promise.all([
        loadCheckpointStorage(provenCheckpointNumber),
        loadCheckpointStorage(finalizedCheckpointNumber),
      ]);

      const blockHashCache = new Map<BlockNumber, string>();
      blockHashCache.set(genesisBlockNumber, genesisBlockHash.toString());
      if (latestBlockEntry) {
        blockHashCache.set(
          BlockNumber(latestBlockEntry[0]),
          BlockHash.fromBuffer(latestBlockEntry[1].blockHash).toString(),
        );
      }

      const loadBlockHash = async (blockNumber: BlockNumber): Promise<string> => {
        if (!blockHashCache.has(blockNumber)) {
          const blockStorage = await this.#blocks.getAsync(blockNumber);
          if (!blockStorage) {
            throw new BlockNotFoundError(blockNumber);
          }
          blockHashCache.set(blockNumber, BlockHash.fromBuffer(blockStorage.blockHash).toString());
        }
        return blockHashCache.get(blockNumber)!;
      };

      const proposed =
        latestBlockEntry === undefined
          ? genesisBlockId
          : {
              number: BlockNumber(latestBlockEntry[0]),
              hash: BlockHash.fromBuffer(latestBlockEntry[1].blockHash).toString(),
            };

      const buildTipFromCheckpoint = async (stored: CheckpointStorage | undefined): Promise<L2TipId> => {
        if (!stored) {
          return genesisTip;
        }
        const blockNumber = BlockNumber(stored.startBlock + stored.blockCount - 1);
        return {
          block: { number: blockNumber, hash: await loadBlockHash(blockNumber) },
          checkpoint: {
            number: CheckpointNumber(stored.checkpointNumber),
            hash: CheckpointHeader.fromBuffer(stored.header).hash().toString(),
          },
        };
      };

      const [checkpointed, proven, finalized] = await Promise.all([
        buildTipFromCheckpoint(latestCheckpointEntry?.[1]),
        buildTipFromCheckpoint(provenCheckpoint),
        buildTipFromCheckpoint(finalizedCheckpoint),
      ]);

      if (proposed.number < checkpointed.block.number) {
        throw new Error(
          `Inconsistent block store: latest block ${proposed.number} is behind checkpointed block ${checkpointed.block.number}`,
        );
      }

      if (
        finalized.checkpoint.number > proven.checkpoint.number ||
        proven.checkpoint.number > checkpointed.checkpoint.number
      ) {
        throw new Error(
          `Inconsistent checkpoint numbers in chain tips: finalized=${finalized.checkpoint.number} proven=${proven.checkpoint.number} checkpointed=${checkpointed.checkpoint.number}`,
        );
      }

      if (
        finalized.block.number > proven.block.number ||
        proven.block.number > checkpointed.block.number ||
        checkpointed.block.number > proposed.number
      ) {
        throw new Error(
          `Inconsistent block numbers in chain tips: finalized=${finalized.block.number} proven=${proven.block.number} checkpointed=${checkpointed.block.number} proposed=${proposed.number}`,
        );
      }

      return { proposed, checkpointed, proven, finalized };
    });
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

  async getCheckpointedBlockByHash(blockHash: BlockHash): Promise<CheckpointedL2Block | undefined> {
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
  async *getBlocks(start: BlockNumber, limit: number): AsyncIterableIterator<L2Block> {
    for await (const [blockNumber, blockStorage] of this.getBlockStorages(start, limit)) {
      const block = await this.getBlockFromBlockStorage(blockNumber, blockStorage);
      if (block) {
        yield block;
      }
    }
  }

  /**
   * Gets block metadata (without tx data) by block number.
   * @param blockNumber - The number of the block to return.
   * @returns The requested block data.
   */
  async getBlockData(blockNumber: BlockNumber): Promise<BlockData | undefined> {
    const blockStorage = await this.#blocks.getAsync(blockNumber);
    if (!blockStorage || !blockStorage.header) {
      return undefined;
    }
    return this.getBlockDataFromBlockStorage(blockStorage);
  }

  /**
   * Gets block metadata (without tx data) by archive root.
   * @param archive - The archive root of the block to return.
   * @returns The requested block data.
   */
  async getBlockDataByArchive(archive: Fr): Promise<BlockData | undefined> {
    const blockNumber = await this.#blockArchiveIndex.getAsync(archive.toString());
    if (blockNumber === undefined) {
      return undefined;
    }
    return this.getBlockData(BlockNumber(blockNumber));
  }

  /**
   * Gets an L2 block.
   * @param blockNumber - The number of the block to return.
   * @returns The requested L2 block.
   */
  async getBlock(blockNumber: BlockNumber): Promise<L2Block | undefined> {
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
  async getBlockByHash(blockHash: BlockHash): Promise<L2Block | undefined> {
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
  async getBlockByArchive(archive: Fr): Promise<L2Block | undefined> {
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
  async getBlockHeaderByHash(blockHash: BlockHash): Promise<BlockHeader | undefined> {
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

  private getBlockDataFromBlockStorage(blockStorage: BlockStorage): BlockData {
    return {
      header: BlockHeader.fromBuffer(blockStorage.header),
      archive: AppendOnlyTreeSnapshot.fromBuffer(blockStorage.archive),
      blockHash: Fr.fromBuffer(blockStorage.blockHash),
      checkpointNumber: CheckpointNumber(blockStorage.checkpointNumber),
      indexWithinCheckpoint: IndexWithinCheckpoint(blockStorage.indexWithinCheckpoint),
    };
  }

  private async getBlockFromBlockStorage(
    blockNumber: number,
    blockStorage: BlockStorage,
  ): Promise<L2Block | undefined> {
    const { header, archive, blockHash, checkpointNumber, indexWithinCheckpoint } =
      this.getBlockDataFromBlockStorage(blockStorage);
    header.setHash(blockHash);
    const blockHashString = bufferToHex(blockStorage.blockHash);
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
    const block = new L2Block(archive, header, body, checkpointNumber, indexWithinCheckpoint);

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
  async getSettledTxReceipt(
    txHash: TxHash,
    l1Constants?: Pick<L1RollupConstants, 'epochDuration'>,
  ): Promise<TxReceipt | undefined> {
    const txEffect = await this.getTxEffect(txHash);
    if (!txEffect) {
      return undefined;
    }

    const blockNumber = BlockNumber(txEffect.l2BlockNumber);

    // Use existing archiver methods to determine finalization level
    const [provenBlockNumber, checkpointedBlockNumber, finalizedBlockNumber, blockData] = await Promise.all([
      this.getProvenBlockNumber(),
      this.getCheckpointedL2BlockNumber(),
      this.getFinalizedL2BlockNumber(),
      this.getBlockData(blockNumber),
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

    const epochNumber =
      blockData && l1Constants ? getEpochAtSlot(blockData.header.globalVariables.slotNumber, l1Constants) : undefined;

    return new TxReceipt(
      txHash,
      status,
      TxReceipt.executionResultFromRevertCode(txEffect.data.revertCode),
      undefined,
      txEffect.data.transactionFee.toBigInt(),
      txEffect.l2BlockHash,
      blockNumber,
      epochNumber,
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
    return BlockNumber(checkpoint.startBlock + checkpoint.blockCount - 1);
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

  async getFinalizedCheckpointNumber(): Promise<CheckpointNumber> {
    const [latestCheckpointNumber, finalizedCheckpointNumber] = await Promise.all([
      this.getLatestCheckpointNumber(),
      this.#lastFinalizedCheckpoint.getAsync(),
    ]);
    return (finalizedCheckpointNumber ?? 0) > latestCheckpointNumber
      ? latestCheckpointNumber
      : CheckpointNumber(finalizedCheckpointNumber ?? 0);
  }

  setFinalizedCheckpointNumber(checkpointNumber: CheckpointNumber) {
    return this.#lastFinalizedCheckpoint.set(checkpointNumber);
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
