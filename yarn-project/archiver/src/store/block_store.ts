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
  CommitteeAttestation,
  GENESIS_CHECKPOINT_HEADER_HASH,
  L2Block,
  type L2TipId,
  type L2Tips,
  type ValidateCheckpointResult,
  deserializeValidateCheckpointResult,
  serializeValidateCheckpointResult,
} from '@aztec/stdlib/block';
import {
  Checkpoint,
  type CheckpointData,
  type CommonCheckpointData,
  L1PublishedData,
  type ProposedCheckpointData,
  type ProposedCheckpointInput,
  PublishedCheckpoint,
} from '@aztec/stdlib/checkpoint';
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
  BlockCheckpointNumberNotSequentialError,
  BlockIndexNotSequentialError,
  BlockNotFoundError,
  BlockNumberNotSequentialError,
  CannotOverwriteCheckpointedBlockError,
  CheckpointNotFoundError,
  CheckpointNumberNotSequentialError,
  InitialCheckpointNumberNotSequentialError,
  NoProposedCheckpointToPromoteError,
  ProposedCheckpointArchiveRootMismatchError,
  ProposedCheckpointNotSequentialError,
  ProposedCheckpointPromotionNotSequentialError,
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

/** Reason a checkpoint was rejected during sync. */
export type RejectedCheckpointReason = 'invalid-attestations' | 'descends-from-invalid-attestations';

/**
 * A checkpoint observed on L1 that the archiver decided not to ingest, recorded so that
 * any descendant that builds on top of it can also be skipped (rather than throwing
 * `InitialCheckpointNumberNotSequentialError` and looping). An entry is dropped via
 * {@link BlockStore.removeRejectedCheckpointByArchiveRoot} once a checkpoint with the same
 * archive root is later ingested as valid (e.g. it gathered enough attestations), which
 * re-enables its descendants.
 */
export type RejectedCheckpoint = {
  /** Checkpoint number this entry represents. */
  checkpointNumber: CheckpointNumber;
  /** Archive root produced by this rejected checkpoint (matched against descendants' `lastArchiveRoot`). */
  archiveRoot: Fr;
  /** `lastArchiveRoot` from this checkpoint's header (the ancestor it built on). */
  parentArchiveRoot: Fr;
  /** Slot number of the rejected checkpoint. */
  slotNumber: SlotNumber;
  /** L1 publication data for the rejected checkpoint (block number, hash, timestamp). */
  l1: L1PublishedData;
  /** Why the entry was recorded. */
  reason: RejectedCheckpointReason;
};

type RejectedCheckpointStorage = {
  checkpointNumber: number;
  archiveRoot: Buffer;
  parentArchiveRoot: Buffer;
  slotNumber: number;
  l1: Buffer;
  reason: RejectedCheckpointReason;
};

/** Checkpoint Storage shared between Checkpoints + Proposed Checkpoints */
type CommonCheckpointStorage = {
  header: Buffer;
  archive: Buffer;
  checkpointOutHash: Buffer;
  checkpointNumber: number;
  startBlock: number;
  blockCount: number;
};

type CheckpointStorage = CommonCheckpointStorage & {
  l1: Buffer;
  attestations: Buffer[];
  feeAssetPriceModifier: string;
};

/** Storage format for a proposed checkpoint (attested but not yet L1-confirmed). */
type ProposedCheckpointStorage = CommonCheckpointStorage & {
  totalManaUsed: string;
  feeAssetPriceModifier: string;
};

export type RemoveCheckpointsResult = { blocksRemoved: L2Block[] | undefined };

/**
 * Single-block lookup with the chain-tip `tag` variant of {@link BlockQuery} already resolved
 * to a concrete block number. The `tag` branch is unrepresentable here so storage code does
 * not need to handle it at runtime.
 */
export type ResolvedBlockQuery = { number: BlockNumber } | { hash: BlockHash } | { archive: Fr };

/**
 * Range lookup with the `epoch` variant of {@link BlocksQuery} already resolved to a
 * `{ from, limit }` pair. Storage code never needs to map epoch numbers to block ranges.
 */
export type ResolvedBlocksQuery = { from: BlockNumber; limit: number; onlyCheckpointed?: boolean };

/**
 * LMDB-based block storage for the archiver.
 */
export class BlockStore {
  /** Map block number to block data */
  #blocks: AztecAsyncMap<number, BlockStorage>;

  /** Map keyed by checkpoint number holding proposed (locally-validated, not yet L1-confirmed) checkpoints. */
  #proposedCheckpoints: AztecAsyncMap<number, ProposedCheckpointStorage>;

  /** Map checkpoint number to checkpoint data for mined checkpoints only */
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

  /** Map rejected checkpoints (due to invalid attestations) by archive root */
  #rejectedCheckpoints: AztecAsyncMap<string, RejectedCheckpointStorage>;

  /** Index mapping a rejected checkpoint's number to its archive root, so the latest can be read in reverse order */
  #rejectedCheckpointsByNumber: AztecAsyncMap<number, string>;

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
    this.#proposedCheckpoints = db.openMap('archiver_proposed_checkpoints');
    this.#rejectedCheckpoints = db.openMap('archiver_rejected_checkpoints');
    this.#rejectedCheckpointsByNumber = db.openMap('archiver_rejected_checkpoints_by_number');
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
      const previousBlockNumber = await this.getLatestL2BlockNumber();
      const latestCheckpointNumber = await this.getLatestCheckpointNumber();

      // Verify we're not overwriting checkpointed blocks
      const lastCheckpointedBlockNumber = await this.getCheckpointedL2BlockNumber();
      if (!opts.force && blockNumber <= lastCheckpointedBlockNumber) {
        // Check if the proposed block matches the already-checkpointed one
        const existingBlock = await this.getBlockData({ number: BlockNumber(blockNumber) });
        if (existingBlock && existingBlock.archive.root.equals(block.archive.root)) {
          throw new BlockAlreadyCheckpointedError(blockNumber);
        }
        throw new CannotOverwriteCheckpointedBlockError(blockNumber, lastCheckpointedBlockNumber);
      }

      // Check that the block number is the expected one
      if (!opts.force && previousBlockNumber !== blockNumber - 1) {
        throw new BlockNumberNotSequentialError(blockNumber, previousBlockNumber);
      }

      // Accept the block if either the confirmed checkpoint or a pending checkpoint matches
      // the expected predecessor. We look for a pending entry at exactly blockCheckpointNumber - 1.
      const expectedCheckpointNumber = blockCheckpointNumber - 1;
      const hasPendingAtExpected = await this.#proposedCheckpoints.hasAsync(expectedCheckpointNumber);
      if (!opts.force && latestCheckpointNumber !== expectedCheckpointNumber && !hasPendingAtExpected) {
        const [latestPendingKey] = await toArray(this.#proposedCheckpoints.keysAsync({ reverse: true, limit: 1 }));
        const previous = CheckpointNumber(Math.max(latestCheckpointNumber, latestPendingKey ?? 0));
        throw new BlockCheckpointNumberNotSequentialError(BlockNumber(blockNumber), blockCheckpointNumber, previous);
      }

      // Extract the previous block if there is one and see if it is for the same checkpoint or not
      const previousBlockResult = await this.getBlockData({ number: previousBlockNumber });

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
            previousBlockResult.header.globalVariables.blockNumber,
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
   * Append new checkpoints to the store's list.
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

      // Get the last block of the previous checkpoint for archive chaining
      let previousBlock = await this.getPreviousCheckpointBlock(checkpoints[0].checkpoint.number);

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

        // Validate block sequencing, indexes, and archive chaining
        this.validateCheckpointBlocks(checkpoint.checkpoint.blocks, previousBlock);

        // Store every block in the database (may already exist, but L1 data is authoritative)
        for (let i = 0; i < checkpoint.checkpoint.blocks.length; i++) {
          await this.addBlockToDatabase(checkpoint.checkpoint.blocks[i], checkpoint.checkpoint.number, i);
        }
        previousBlock = checkpoint.checkpoint.blocks.at(-1);

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
          feeAssetPriceModifier: checkpoint.checkpoint.feeAssetPriceModifier.toString(),
        });

        // Update slot-to-checkpoint index
        await this.#slotToCheckpoint.set(checkpoint.checkpoint.header.slotNumber, checkpoint.checkpoint.number);

        // Remove proposed checkpoint if it exists, since L1 is authoritative
        await this.#proposedCheckpoints.delete(checkpoint.checkpoint.number);

        // Drop any rejected entry for this archive root: a checkpoint that was previously rejected
        // (e.g. invalid attestations) is now being ingested as valid, so its descendants are allowed.
        await this.removeRejectedCheckpointByArchiveRoot(checkpoint.checkpoint.archive.root);
      }

      await this.advanceSynchedL1BlockNumber(checkpoints[checkpoints.length - 1].l1.blockNumber);
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
        feeAssetPriceModifier: incoming.checkpoint.feeAssetPriceModifier.toString(),
      });
      // Update the sync point to reflect the new L1 block
      await this.advanceSynchedL1BlockNumber(incoming.l1.blockNumber);
    }
    return checkpoints.slice(i);
  }

  /**
   * Gets the last block of the checkpoint before the given one.
   * Returns undefined if there is no previous checkpoint (i.e. genesis).
   */
  private async getPreviousCheckpointBlock(checkpointNumber: CheckpointNumber): Promise<L2Block | undefined> {
    const previousCheckpointNumber = CheckpointNumber(checkpointNumber - 1);
    if (previousCheckpointNumber === INITIAL_CHECKPOINT_NUMBER - 1) {
      return undefined;
    }

    // Check across both proposed and mined checkpoints
    const predecessor =
      (await this.getProposedCheckpointByNumber(previousCheckpointNumber)) ??
      (await this.getCheckpointData(previousCheckpointNumber));

    if (!predecessor) {
      throw new CheckpointNotFoundError(previousCheckpointNumber);
    }

    const previousBlockNumber = BlockNumber(predecessor.startBlock + predecessor.blockCount - 1);
    const previousBlock = await this.getBlock({ number: previousBlockNumber });
    if (previousBlock === undefined) {
      throw new BlockNotFoundError(previousBlockNumber);
    }
    return previousBlock;
  }

  /**
   * Validates that blocks are sequential, have correct indexes, and chain via archive roots.
   * This is the same validation used for both confirmed checkpoints (addCheckpoints) and
   * proposed checkpoints (addProposedCheckpoint).
   */
  private validateCheckpointBlocks(blocks: L2Block[], previousBlock: L2Block | undefined): void {
    for (const block of blocks) {
      if (previousBlock) {
        if (previousBlock.number !== block.number - 1) {
          throw new BlockNumberNotSequentialError(block.number, previousBlock.number);
        }
        if (previousBlock.checkpointNumber === block.checkpointNumber) {
          if (previousBlock.indexWithinCheckpoint !== block.indexWithinCheckpoint - 1) {
            throw new BlockIndexNotSequentialError(block.indexWithinCheckpoint, previousBlock.indexWithinCheckpoint);
          }
        } else if (block.indexWithinCheckpoint !== 0) {
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
        if (block.indexWithinCheckpoint !== 0) {
          throw new BlockIndexNotSequentialError(block.indexWithinCheckpoint, undefined);
        }
        if (block.number !== INITIAL_L2_BLOCK_NUM) {
          throw new BlockNumberNotSequentialError(block.number, undefined);
        }
      }
      previousBlock = block;
    }
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

      // Evict all pending checkpoints > checkpointNumber (their base chain no longer exists)
      await this.evictProposedCheckpointsFrom(CheckpointNumber(checkpointNumber + 1));

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

  /**
   * Returns the checkpoint numbers for all checkpoints whose slot falls within the given range (inclusive).
   * Lighter than {@link getCheckpointDataForSlotRange} when callers only need to identify which
   * checkpoints fall in the range and will fetch full data for at most a few of them.
   */
  async getCheckpointNumbersForSlotRange(startSlot: SlotNumber, endSlot: SlotNumber): Promise<CheckpointNumber[]> {
    const result: CheckpointNumber[] = [];
    for await (const [, checkpointNumber] of this.#slotToCheckpoint.entriesAsync({
      start: startSlot,
      end: endSlot + 1,
    })) {
      result.push(CheckpointNumber(checkpointNumber));
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
      feeAssetPriceModifier: BigInt(checkpointStorage.feeAssetPriceModifier),
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
      const latestBlockNumber = await this.getLatestL2BlockNumber();

      // Iterate from blockNumber + 1 to latestBlockNumber
      for (let bn = blockNumber + 1; bn <= latestBlockNumber; bn++) {
        const block = await this.getBlock({ number: BlockNumber(bn) });

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

  async getLatestCheckpointNumber(): Promise<CheckpointNumber> {
    const [latestCheckpointNumber] = await toArray(this.#checkpoints.keysAsync({ reverse: true, limit: 1 }));
    if (latestCheckpointNumber === undefined) {
      return CheckpointNumber(INITIAL_CHECKPOINT_NUMBER - 1);
    }
    return CheckpointNumber(latestCheckpointNumber);
  }

  async hasProposedCheckpoint(): Promise<boolean> {
    const [key] = await toArray(this.#proposedCheckpoints.keysAsync({ limit: 1 }));
    return key !== undefined;
  }

  /** Deletes all pending proposed checkpoints from storage. */
  async deleteProposedCheckpoints(): Promise<void> {
    for await (const key of this.#proposedCheckpoints.keysAsync()) {
      await this.#proposedCheckpoints.delete(key);
    }
  }

  /**
   * Promotes a specific pending checkpoint to a confirmed checkpoint entry.
   * This persists the checkpoint to the store, removes only that pending entry, and updates the L1 sync point.
   * Remaining pending entries (e.g. N+1, N+2) are left intact — they chain off the just-promoted one.
   * @param checkpointNumber - The checkpoint number to promote.
   * @param l1 - L1 published data for the checkpoint.
   * @param attestations - Committee attestations.
   * @param expectedArchiveRoot - Archive root guard against races.
   */
  async promoteProposedToCheckpointed(
    checkpointNumber: CheckpointNumber,
    l1: L1PublishedData,
    attestations: CommitteeAttestation[],
    expectedArchiveRoot: Fr,
  ): Promise<void> {
    return await this.db.transactionAsync(async () => {
      const proposed = await this.getProposedCheckpointByNumber(checkpointNumber);
      if (!proposed) {
        throw new NoProposedCheckpointToPromoteError();
      }
      if (!proposed.archive.root.equals(expectedArchiveRoot)) {
        throw new ProposedCheckpointArchiveRootMismatchError(expectedArchiveRoot, proposed.archive.root);
      }

      // Verify sequentiality: promoted checkpoint must follow the latest confirmed one
      const latestCheckpointNumber = await this.getLatestCheckpointNumber();
      if (latestCheckpointNumber !== proposed.checkpointNumber - 1) {
        throw new ProposedCheckpointPromotionNotSequentialError(proposed.checkpointNumber, latestCheckpointNumber);
      }

      // Write the checkpoint entry
      await this.#checkpoints.set(proposed.checkpointNumber, {
        header: proposed.header.toBuffer(),
        archive: proposed.archive.toBuffer(),
        checkpointOutHash: proposed.checkpointOutHash.toBuffer(),
        l1: l1.toBuffer(),
        attestations: attestations.map(attestation => attestation.toBuffer()),
        checkpointNumber: proposed.checkpointNumber,
        startBlock: proposed.startBlock,
        blockCount: proposed.blockCount,
        feeAssetPriceModifier: proposed.feeAssetPriceModifier.toString(),
      });

      // Update the slot-to-checkpoint index
      await this.#slotToCheckpoint.set(proposed.header.slotNumber, proposed.checkpointNumber);

      // Remove only this pending entry — remaining entries N+1, N+2, ... stay valid
      await this.#proposedCheckpoints.delete(proposed.checkpointNumber);

      // Drop any rejected entry for this archive root: a checkpoint that was previously rejected
      // (e.g. invalid attestations) is now being promoted as valid, so its descendants are allowed.
      await this.removeRejectedCheckpointByArchiveRoot(proposed.archive.root);

      // Update the last synced L1 block
      await this.advanceSynchedL1BlockNumber(l1.blockNumber);
    });
  }

  /**
   * Returns the latest pending checkpoint (highest-numbered entry), or undefined if none.
   * No fallback to confirmed.
   */
  async getLastProposedCheckpoint(): Promise<ProposedCheckpointData | undefined> {
    const [key] = await toArray(this.#proposedCheckpoints.keysAsync({ reverse: true, limit: 1 }));
    if (key === undefined) {
      return undefined;
    }
    const stored = await this.#proposedCheckpoints.getAsync(key);
    return stored ? this.convertToProposedCheckpointData(stored) : undefined;
  }

  /** Returns the pending checkpoint for a specific checkpoint number, or undefined if not found. */
  async getProposedCheckpointByNumber(n: CheckpointNumber): Promise<ProposedCheckpointData | undefined> {
    const stored = await this.#proposedCheckpoints.getAsync(n);
    return stored ? this.convertToProposedCheckpointData(stored) : undefined;
  }

  /**
   * Returns the pending checkpoint whose header slot matches the given slot, or undefined if not found.
   * Iterates `#proposedCheckpoints` rather than reading an index because the map carries 0–1 entries
   * in normal operation (bounded by the proposer pipelining window). Returns the first match.
   */
  async getProposedCheckpointBySlot(slot: SlotNumber): Promise<ProposedCheckpointData | undefined> {
    for await (const [, stored] of this.#proposedCheckpoints.entriesAsync()) {
      const header = CheckpointHeader.fromBuffer(stored.header);
      if (header.slotNumber === slot) {
        return this.convertToProposedCheckpointData(stored);
      }
    }
    return undefined;
  }

  /**
   * Evicts all pending checkpoints with checkpoint number >= fromNumber.
   * Used for divergent-mined-checkpoint cleanup: when L1 mines checkpoint N with a different archive,
   * all pending >= N must be evicted since they chain off the now-invalid pending N.
   */
  async evictProposedCheckpointsFrom(fromNumber: CheckpointNumber): Promise<void> {
    const keysToDelete: number[] = [];
    for await (const key of this.#proposedCheckpoints.keysAsync()) {
      if (key >= fromNumber) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      await this.#proposedCheckpoints.delete(key);
    }
  }

  /**
   * Gets the checkpoint at the proposed tip:
   * - latest pending checkpoint if any exist
   * - fallsback to latest confirmed checkpoint otherwise
   */
  async getLastCheckpoint(): Promise<CommonCheckpointData | undefined> {
    const latest = await this.getLastProposedCheckpoint();
    if (!latest) {
      return this.getCheckpointData(await this.getLatestCheckpointNumber());
    }
    return latest;
  }

  private convertToProposedCheckpointData(stored: ProposedCheckpointStorage): ProposedCheckpointData {
    return {
      checkpointNumber: CheckpointNumber(stored.checkpointNumber),
      header: CheckpointHeader.fromBuffer(stored.header),
      archive: AppendOnlyTreeSnapshot.fromBuffer(stored.archive),
      checkpointOutHash: Fr.fromBuffer(stored.checkpointOutHash),
      startBlock: BlockNumber(stored.startBlock),
      blockCount: stored.blockCount,
      totalManaUsed: BigInt(stored.totalManaUsed),
      feeAssetPriceModifier: BigInt(stored.feeAssetPriceModifier),
    };
  }

  /**
   * Attempts to get the proposedCheckpoint's number, if there is not one, then fallback to the latest confirmed checkpoint number.
   * @returns CheckpointNumber
   */
  async getProposedCheckpointNumber(): Promise<CheckpointNumber> {
    const proposed = await this.getLastCheckpoint();
    if (!proposed) {
      return await this.getLatestCheckpointNumber();
    }
    return CheckpointNumber(proposed.checkpointNumber);
  }

  /**
   * Attempts to get the proposedCheckpoint's block number, if there is not one, then fallback to the checkpointed block number
   * @returns BlockNumber
   */
  async getProposedCheckpointL2BlockNumber(): Promise<BlockNumber> {
    const proposed = await this.getLastCheckpoint();
    if (!proposed) {
      return await this.getCheckpointedL2BlockNumber();
    }
    return BlockNumber(proposed.startBlock + proposed.blockCount - 1);
  }

  /** Returns the checkpoint number that contains the given slot (or undefined if not found). */
  async getCheckpointNumberBySlot(slot: SlotNumber): Promise<CheckpointNumber | undefined> {
    const checkpointNumber = await this.#slotToCheckpoint.getAsync(slot);
    return checkpointNumber === undefined ? undefined : CheckpointNumber(checkpointNumber);
  }

  /** Gets a single L2 block matching the given resolved query. */
  async getBlock(query: ResolvedBlockQuery): Promise<L2Block | undefined> {
    const blockNumber = await this.getBlockNumber(query);
    if (blockNumber === undefined) {
      return undefined;
    }
    const blockStorage = await this.#blocks.getAsync(blockNumber);
    if (!blockStorage) {
      return undefined;
    }
    return this.getBlockFromBlockStorage(blockNumber, blockStorage);
  }

  /** Gets a collection of L2 blocks for a resolved range. */
  getBlocks(query: ResolvedBlocksQuery): Promise<L2Block[]> {
    return toArray(this.iterateBlocks(query));
  }

  /** Gets single block metadata matching the given resolved query. */
  async getBlockData(query: ResolvedBlockQuery): Promise<BlockData | undefined> {
    const blockNumber = await this.getBlockNumber(query);
    if (blockNumber === undefined) {
      return undefined;
    }
    const blockStorage = await this.#blocks.getAsync(blockNumber);
    if (!blockStorage || !blockStorage.header) {
      return undefined;
    }
    return this.getBlockDataFromBlockStorage(blockStorage);
  }

  /** Gets a collection of block metadata entries for a resolved range. */
  getBlocksData(query: ResolvedBlocksQuery): Promise<BlockData[]> {
    return toArray(this.iterateBlocksData(query));
  }

  /** Async iterator over L2 blocks for a resolved range. */
  private async *iterateBlocks(query: ResolvedBlocksQuery): AsyncIterableIterator<L2Block> {
    const cap = query.onlyCheckpointed ? await this.getCheckpointedL2BlockNumber() : undefined;
    for await (const [blockNumber, blockStorage] of this.getBlockStorages(query.from, query.limit)) {
      if (cap !== undefined && blockNumber > cap) {
        break;
      }
      const block = await this.getBlockFromBlockStorage(blockNumber, blockStorage);
      if (block) {
        yield block;
      }
    }
  }

  /** Async iterator over block metadata for a resolved range. */
  private async *iterateBlocksData(query: ResolvedBlocksQuery): AsyncIterableIterator<BlockData> {
    const cap = query.onlyCheckpointed ? await this.getCheckpointedL2BlockNumber() : undefined;
    for await (const [blockNumber, blockStorage] of this.getBlockStorages(query.from, query.limit)) {
      if (cap !== undefined && blockNumber > cap) {
        break;
      }
      yield this.getBlockDataFromBlockStorage(blockStorage);
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

  /** Resolves a ResolvedBlockQuery discriminant to a block number, or undefined if not found. */
  async getBlockNumber(query: ResolvedBlockQuery): Promise<BlockNumber | undefined> {
    let blockNumber: BlockNumber | undefined;
    if ('number' in query) {
      blockNumber = query.number;
    } else if ('hash' in query) {
      const n = await this.#blockHashIndex.getAsync(query.hash.toString());
      blockNumber = n !== undefined ? BlockNumber(n) : undefined;
    } else {
      const n = await this.#blockArchiveIndex.getAsync(query.archive.toString());
      blockNumber = n !== undefined ? BlockNumber(n) : undefined;
    }
    if (blockNumber === undefined) {
      return undefined;
    }
    return blockNumber;
  }

  private getBlockDataFromBlockStorage(blockStorage: BlockStorage): BlockData {
    return {
      header: BlockHeader.fromBuffer(blockStorage.header),
      archive: AppendOnlyTreeSnapshot.fromBuffer(blockStorage.archive),
      blockHash: BlockHash.fromBuffer(blockStorage.blockHash),
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
      this.getBlockData({ number: blockNumber }),
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
   * Resolves all five L2 chain tips (proposed, proposedCheckpoint, checkpointed, proven, finalized)
   * in a single read-only transaction so the snapshot is internally consistent. Each underlying
   * record is read at most once: latest block, latest confirmed checkpoint, and latest pending
   * checkpoint are each loaded directly (no separate "find the number, then look up data" hop),
   * the proven/finalized checkpoint singletons are read once and their storage entries are
   * reused if they coincide with the latest checkpoint, and per-tip block hashes are deduped
   * when two tips land on the same block (e.g. finalized == proven, or proposedCheckpoint falls
   * back to checkpointed when no pending checkpoint exists).
   *
   * The result is guaranteed to satisfy `finalized <= proven <= checkpointed <= proposed` (by
   * block number). Genesis is represented by `(INITIAL_L2_BLOCK_NUM - 1)` and the supplied
   * `genesisBlockHash`, paired with the synthetic genesis checkpoint id.
   *
   * @param genesisBlockHash - Block hash to report for the synthetic pre-initial block (used when
   *   a tip is still at genesis).
   */
  async getL2TipsData(genesisBlockHash: BlockHash): Promise<L2Tips> {
    return await this.db.transactionAsync(async () => {
      // Define genesis tips
      const genesisBlockNumber = BlockNumber(INITIAL_L2_BLOCK_NUM - 1);
      const genesisCheckpointNumber = CheckpointNumber(INITIAL_CHECKPOINT_NUMBER - 1);
      const genesisBlockId = { number: genesisBlockNumber, hash: genesisBlockHash.toString() };
      const genesisCheckpointId = {
        number: genesisCheckpointNumber,
        hash: GENESIS_CHECKPOINT_HEADER_HASH.toString(),
      };
      const genesisTip: L2TipId = { block: genesisBlockId, checkpoint: genesisCheckpointId };

      // Load latest block and checkpoint entries
      const [latestBlockEntry] = await toArray(this.#blocks.entriesAsync({ reverse: true, limit: 1 }));
      const [proposedCheckpointEntry] = await toArray(
        this.#proposedCheckpoints.entriesAsync({ reverse: true, limit: 1 }),
      );
      const [latestCheckpointEntry] = await toArray(this.#checkpoints.entriesAsync({ reverse: true, limit: 1 }));
      const latestCheckpointNumber = latestCheckpointEntry
        ? CheckpointNumber(latestCheckpointEntry[0])
        : genesisCheckpointNumber;

      // Load proven and finalized checkpoint number pointers
      const [provenRaw, finalizedRaw] = await Promise.all([
        this.#lastProvenCheckpoint.getAsync(),
        this.#lastFinalizedCheckpoint.getAsync(),
      ]);

      // Clamp to enforce finalized <= proven <= checkpointed.
      const provenCheckpointNumber = CheckpointNumber(Math.min(provenRaw ?? 0, latestCheckpointNumber));
      const finalizedCheckpointNumber = CheckpointNumber(Math.min(finalizedRaw ?? 0, provenCheckpointNumber));

      // Avoid loading the same checkpoint more than once
      const checkpointStorageCache = new Map<CheckpointNumber, CheckpointStorage>();
      if (latestCheckpointEntry) {
        checkpointStorageCache.set(CheckpointNumber(latestCheckpointEntry[0]), latestCheckpointEntry[1]);
      }
      const loadCheckpointStorage = async (n: CheckpointNumber): Promise<CheckpointStorage | undefined> => {
        if (n === 0) {
          return undefined;
        }
        if (!checkpointStorageCache.has(n)) {
          const checkpointStorage = await this.#checkpoints.getAsync(n);
          if (!checkpointStorage) {
            throw new CheckpointNotFoundError(n);
          }
          checkpointStorageCache.set(n, checkpointStorage);
        }
        return checkpointStorageCache.get(n)!;
      };

      // Load proven and finalized checkpoint storage entries
      const provenCheckpoint = await loadCheckpointStorage(provenCheckpointNumber);
      const finalizedCheckpoint = await loadCheckpointStorage(finalizedCheckpointNumber);

      // Avoid loading the same block hash multiple times when tips land on the same block
      const blockHashCache = new Map<number, string>();
      blockHashCache.set(genesisBlockNumber, genesisBlockHash.toString());
      if (latestBlockEntry) {
        blockHashCache.set(latestBlockEntry[0], BlockHash.fromBuffer(latestBlockEntry[1].blockHash).toString());
      }
      const loadBlockHash = async (n: BlockNumber): Promise<string> => {
        if (!blockHashCache.has(n)) {
          const blockStorage = await this.#blocks.getAsync(n);
          if (!blockStorage) {
            throw new BlockNotFoundError(n);
          }
          const blockHash = BlockHash.fromBuffer(blockStorage.blockHash).toString();
          blockHashCache.set(n, blockHash);
        }
        return blockHashCache.get(n)!;
      };

      // Build proposed chain tip (this one has block only, no checkpoint)
      const proposedBlockId =
        latestBlockEntry === undefined
          ? genesisBlockId
          : {
              number: BlockNumber(latestBlockEntry[0]),
              hash: BlockHash.fromBuffer(latestBlockEntry[1].blockHash).toString(),
            };

      // Build other tips from checkpoint data, reading corresponding block data from the cache
      const buildTipFromCheckpoint = async (
        stored: ProposedCheckpointStorage | CheckpointStorage | undefined,
      ): Promise<L2TipId> => {
        if (!stored) {
          return genesisTip;
        }
        const blockNumber = BlockNumber(stored.startBlock + stored.blockCount - 1);
        const blockHash = await loadBlockHash(blockNumber);
        const header = CheckpointHeader.fromBuffer(stored.header);
        return {
          block: { number: blockNumber, hash: blockHash },
          checkpoint: { number: CheckpointNumber(stored.checkpointNumber), hash: header.hash().toString() },
        };
      };

      const checkpointedTip = await buildTipFromCheckpoint(latestCheckpointEntry?.[1]);
      const provenTip = await buildTipFromCheckpoint(provenCheckpoint);
      const finalizedTip = await buildTipFromCheckpoint(finalizedCheckpoint);

      // Proposed checkpoint falls back to the checkpoint tip if it's not set. And if local storage is
      // inconsistent and the proposed checkpoint is behind the checkpointed tip, we patch that and
      // report the checkpointed tip as the proposed checkpoint to maintain the invariant.
      const proposedCheckpointTip =
        proposedCheckpointEntry === undefined || proposedCheckpointEntry[0] <= latestCheckpointNumber
          ? checkpointedTip
          : await buildTipFromCheckpoint(proposedCheckpointEntry[1]);

      // A checkpointed block past the latest stored block would mean a checkpoint
      // references blocks that aren't in blocks.
      if (proposedBlockId.number < checkpointedTip.block.number) {
        throw new Error(
          `Inconsistent block store: latest block ${proposedBlockId.number} is behind checkpointed block ${checkpointedTip.block.number}`,
        );
      }

      // Assert that checkpoint numbers are increasing
      if (
        finalizedTip.checkpoint.number > provenTip.checkpoint.number ||
        provenTip.checkpoint.number > checkpointedTip.checkpoint.number ||
        checkpointedTip.checkpoint.number > proposedCheckpointTip.checkpoint.number
      ) {
        throw new Error(
          `Inconsistent checkpoint numbers in chain tips: finalized=${finalizedTip.checkpoint.number} proven=${provenTip.checkpoint.number} checkpointed=${checkpointedTip.checkpoint.number} proposed=${proposedCheckpointTip.checkpoint.number}`,
        );
      }

      // Assert block numbers are increasing
      if (
        finalizedTip.block.number > provenTip.block.number ||
        provenTip.block.number > checkpointedTip.block.number ||
        checkpointedTip.block.number > proposedCheckpointTip.block.number ||
        proposedCheckpointTip.block.number > proposedBlockId.number
      ) {
        throw new Error(
          `Inconsistent block numbers in chain tips: finalized=${finalizedTip.block.number} proven=${provenTip.block.number} checkpointed=${checkpointedTip.block.number} proposedCheckpoint=${proposedCheckpointTip.block.number} proposed=${proposedBlockId.number}`,
        );
      }

      return {
        proposed: proposedBlockId,
        proposedCheckpoint: proposedCheckpointTip,
        checkpointed: checkpointedTip,
        proven: provenTip,
        finalized: finalizedTip,
      };
    });
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

  /**
   * Adds a proposed checkpoint to the pending queue.
   * Accepts proposed.checkpointNumber === latestTip + 1, where latestTip is the highest of
   * confirmed and the highest pending checkpoint number.
   * Computes archive and checkpointOutHash from the stored blocks.
   */
  async addProposedCheckpoint(proposed: ProposedCheckpointInput) {
    return await this.db.transactionAsync(async () => {
      const confirmed = await this.getLatestCheckpointNumber();
      const [latestPendingKey] = await toArray(this.#proposedCheckpoints.keysAsync({ reverse: true, limit: 1 }));
      const latestTip = CheckpointNumber(
        latestPendingKey !== undefined ? Math.max(latestPendingKey, confirmed) : confirmed,
      );

      if (proposed.checkpointNumber !== latestTip + 1) {
        throw new ProposedCheckpointNotSequentialError(proposed.checkpointNumber, latestTip);
      }

      // Ensure the predecessor block (from pending or confirmed chain) exists
      const previousBlock = await this.getPreviousCheckpointBlock(proposed.checkpointNumber);
      const blocks: L2Block[] = [];
      for (let i = 0; i < proposed.blockCount; i++) {
        const block = await this.getBlock({ number: BlockNumber(proposed.startBlock + i) });
        if (!block) {
          throw new BlockNotFoundError(proposed.startBlock + i);
        }
        blocks.push(block);
      }
      this.validateCheckpointBlocks(blocks, previousBlock);

      const archive = blocks[blocks.length - 1].archive;
      const checkpointOutHash = Checkpoint.getCheckpointOutHash(blocks);

      await this.#proposedCheckpoints.set(proposed.checkpointNumber, {
        header: proposed.header.toBuffer(),
        archive: archive.toBuffer(),
        checkpointOutHash: checkpointOutHash.toBuffer(),
        checkpointNumber: proposed.checkpointNumber,
        startBlock: proposed.startBlock,
        blockCount: proposed.blockCount,
        totalManaUsed: proposed.totalManaUsed.toString(),
        feeAssetPriceModifier: proposed.feeAssetPriceModifier.toString(),
      });
    });
  }

  async getProvenCheckpointNumber(): Promise<CheckpointNumber> {
    return await this.db.transactionAsync(async () => {
      const [latestCheckpointNumber, provenCheckpointNumber] = await Promise.all([
        this.getLatestCheckpointNumber(),
        this.#lastProvenCheckpoint.getAsync(),
      ]);
      return (provenCheckpointNumber ?? 0) > latestCheckpointNumber
        ? latestCheckpointNumber
        : CheckpointNumber(provenCheckpointNumber ?? 0);
    });
  }

  async setProvenCheckpointNumber(checkpointNumber: CheckpointNumber) {
    const result = await this.#lastProvenCheckpoint.set(checkpointNumber);
    return result;
  }

  async getFinalizedCheckpointNumber(): Promise<CheckpointNumber> {
    return await this.db.transactionAsync(async () => {
      const [provenCheckpointNumber, finalizedCheckpointNumber] = await Promise.all([
        this.getProvenCheckpointNumber(),
        this.#lastFinalizedCheckpoint.getAsync(),
      ]);
      return (finalizedCheckpointNumber ?? 0) > provenCheckpointNumber
        ? provenCheckpointNumber
        : CheckpointNumber(finalizedCheckpointNumber ?? 0);
    });
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

  /** Records a rejected-checkpoint entry, keyed by its own archive root. */
  async addRejectedCheckpoint(entry: RejectedCheckpoint): Promise<void> {
    const archiveRootHex = entry.archiveRoot.toString();
    await this.#rejectedCheckpoints.set(archiveRootHex, {
      checkpointNumber: entry.checkpointNumber,
      archiveRoot: entry.archiveRoot.toBuffer(),
      parentArchiveRoot: entry.parentArchiveRoot.toBuffer(),
      slotNumber: entry.slotNumber,
      l1: entry.l1.toBuffer(),
      reason: entry.reason,
    });
    await this.#rejectedCheckpointsByNumber.set(entry.checkpointNumber, archiveRootHex);
    await this.advanceSynchedL1BlockNumber(entry.l1.blockNumber);
  }

  /** Returns the rejected-checkpoint entry with the given archive root, or undefined if not present. */
  async getRejectedCheckpointByArchiveRoot(archiveRoot: Fr): Promise<RejectedCheckpoint | undefined> {
    const stored = await this.#rejectedCheckpoints.getAsync(archiveRoot.toString());
    return stored ? this.rejectedCheckpointFromStorage(stored) : undefined;
  }

  /** Returns the rejected-checkpoint entry recorded for the given checkpoint number, or undefined if none. */
  async getRejectedCheckpointByNumber(checkpointNumber: CheckpointNumber): Promise<RejectedCheckpoint | undefined> {
    const archiveRootHex = await this.#rejectedCheckpointsByNumber.getAsync(checkpointNumber);
    if (archiveRootHex === undefined) {
      return undefined;
    }
    const stored = await this.#rejectedCheckpoints.getAsync(archiveRootHex);
    return stored ? this.rejectedCheckpointFromStorage(stored) : undefined;
  }

  /** Returns the highest checkpoint number recorded across all rejected entries, or `INITIAL_CHECKPOINT_NUMBER - 1` if none. */
  async getLatestRejectedCheckpointNumber(): Promise<CheckpointNumber> {
    const [latest] = await toArray(this.#rejectedCheckpointsByNumber.keysAsync({ reverse: true, limit: 1 }));
    return CheckpointNumber(latest ?? INITIAL_CHECKPOINT_NUMBER - 1);
  }

  /** Removes a rejected-checkpoint entry by its archive root (used when an entry no longer matches L1). */
  async removeRejectedCheckpointByArchiveRoot(archiveRoot: Fr): Promise<void> {
    const archiveRootHex = archiveRoot.toString();
    const stored = await this.#rejectedCheckpoints.getAsync(archiveRootHex);
    await this.#rejectedCheckpoints.delete(archiveRootHex);
    if (stored) {
      // Only clear the by-number index if it still points at this archive root, so a distinct
      // entry that shares the checkpoint number (e.g. an L1 reorg replacement) is not dropped.
      const indexed = await this.#rejectedCheckpointsByNumber.getAsync(stored.checkpointNumber);
      if (indexed === archiveRootHex) {
        await this.#rejectedCheckpointsByNumber.delete(stored.checkpointNumber);
      }
    }
  }

  /**
   * Advances the stored last-synched L1 block number to `l1BlockNumber` only if it is strictly
   * greater than the current value. Use this whenever ingesting checkpoint-shaped data so the
   * sync pointer never walks backwards on out-of-order writes (e.g. an invalid checkpoint
   * advance followed by a valid-checkpoint commit landing at an earlier L1 block).
   */
  private async advanceSynchedL1BlockNumber(l1BlockNumber: bigint): Promise<void> {
    const current = await this.#lastSynchedL1Block.getAsync();
    if (current === undefined || l1BlockNumber > current) {
      await this.#lastSynchedL1Block.set(l1BlockNumber);
    }
  }

  private rejectedCheckpointFromStorage(stored: RejectedCheckpointStorage): RejectedCheckpoint {
    return {
      checkpointNumber: CheckpointNumber(stored.checkpointNumber),
      archiveRoot: Fr.fromBuffer(stored.archiveRoot),
      parentArchiveRoot: Fr.fromBuffer(stored.parentArchiveRoot),
      slotNumber: SlotNumber(stored.slotNumber),
      l1: L1PublishedData.fromBuffer(stored.l1),
      reason: stored.reason,
    };
  }
}
