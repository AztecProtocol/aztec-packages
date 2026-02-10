import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncSet } from '@aztec/kv-store';

/**
 * State stored for each transaction from a pruned block.
 */
type DeletedTxState = {
  /** Block number in which the transaction was originally mined (before being un-mined by a prune) */
  minedAtBlock: BlockNumber;
  /** Whether the transaction has been soft-deleted (removed from indices) */
  softDeleted: boolean;
};

/**
 * Serializes DeletedTxState to a Buffer.
 * Format: 8 bytes for blockNumber (uint64) + 1 byte for softDeleted (0 or 1)
 */
function serializeState(state: DeletedTxState): Buffer {
  const buffer = Buffer.alloc(9);
  buffer.writeBigUInt64BE(BigInt(state.minedAtBlock), 0);
  buffer.writeUInt8(state.softDeleted ? 1 : 0, 8);
  return buffer;
}

/**
 * Deserializes a Buffer to DeletedTxState.
 */
function deserializeState(buffer: Buffer): DeletedTxState {
  return {
    minedAtBlock: BlockNumber(Number(buffer.readBigUInt64BE(0))),
    softDeleted: buffer.readUInt8(8) === 1,
  };
}

/**
 * Manages all transaction deletions in the pool.
 *
 * When a chain prune (reorg) happens, transactions from pruned blocks are tracked here.
 * This class is responsible for ALL deletion decisions:
 *
 * - Transactions from pruned blocks are "prune-soft-deleted" - removed from indices but kept
 *   in the database for later re-execution until their mined block is finalized
 * - Transactions NOT from pruned blocks are "slot-soft-deleted" - kept in the database
 *   until the next slot, so other nodes can still fetch them via reqresp
 *
 * When a block is finalized, prune-soft-deleted transactions that were originally mined at or
 * before that block number are permanently (hard) deleted. Slot-soft-deleted transactions
 * are hard-deleted when `prepareForSlot` advances to a new slot.
 */
export class DeletedPool {
  /** Persisted map: txHash -> DeletedTxState (serialized) - for prune-based soft deletions */
  #deletedTxsDB: AztecAsyncMap<string, Buffer>;

  /** Reference to the main txs database for hard deletion */
  #txsDB: AztecAsyncMap<string, Buffer>;

  /** In-memory state for transactions from pruned blocks */
  #state: Map<string, DeletedTxState> = new Map();

  /** In-memory tracking: txHash -> slot at which the tx was deleted */
  #slotDeletedTxs: Map<string, SlotNumber> = new Map();

  /** Persisted set tracking which txs are slot-deleted, for hydration cleanup. */
  #slotDeletedDB: AztecAsyncSet<string>;

  /** Current slot number, updated by cleanupSlotDeleted */
  #currentSlot: SlotNumber = SlotNumber(0);

  #log: Logger;

  constructor(store: AztecAsyncKVStore, txsDB: AztecAsyncMap<string, Buffer>, log: Logger) {
    this.#deletedTxsDB = store.openMap('deleted_txs');
    this.#slotDeletedDB = store.openSet('slot_deleted_txs');
    this.#txsDB = txsDB;
    this.#log = log;
  }

  /**
   * Loads state from the database on startup.
   * Slot-deleted txs are stale after restart and are immediately hard-deleted.
   */
  async hydrateFromDatabase(): Promise<void> {
    let prunedCount = 0;
    let softDeletedCount = 0;

    for await (const [txHash, buffer] of this.#deletedTxsDB.entriesAsync()) {
      const state = deserializeState(buffer);
      this.#state.set(txHash, state);
      prunedCount++;
      if (state.softDeleted) {
        softDeletedCount++;
      }
    }

    if (prunedCount > 0 || softDeletedCount > 0) {
      this.#log.info(`Loaded ${prunedCount} txs from pruned blocks, ${softDeletedCount} soft-deleted`);
    }

    // Slot-deleted txs are stale after restart - hard-delete them all
    let slotDeletedCount = 0;
    for await (const txHash of this.#slotDeletedDB.entriesAsync()) {
      await this.#txsDB.delete(txHash);
      await this.#slotDeletedDB.delete(txHash);
      slotDeletedCount++;
    }

    if (slotDeletedCount > 0) {
      this.#log.info(`Hard-deleted ${slotDeletedCount} stale slot-deleted txs on startup`);
    }
  }

  /**
   * Marks transactions as being from a pruned block.
   * Called during handlePrunedBlocks for ALL transactions that were un-mined.
   *
   * If a tx was previously tracked (e.g., mined at block 4, pruned, re-mined at block 5,
   * pruned again), updates to the higher block number. This ensures the tx is kept until
   * its most recent mined block is finalized.
   *
   * @param txs - Array of {txHash, minedAtBlock} pairs, where minedAtBlock is the block
   *              number in which the tx was mined before being un-mined
   */
  async markFromPrunedBlock(txs: { txHash: string; minedAtBlock: BlockNumber }[]): Promise<void> {
    if (txs.length === 0) {
      return;
    }

    let count = 0;
    for (const { txHash, minedAtBlock } of txs) {
      const existing = this.#state.get(txHash);
      // Update if not tracked, or if this is a higher mined block (tx was re-mined then pruned again)
      if (existing === undefined || minedAtBlock > existing.minedAtBlock) {
        const state: DeletedTxState = {
          minedAtBlock,
          softDeleted: existing?.softDeleted ?? false,
        };
        this.#state.set(txHash, state);
        await this.#deletedTxsDB.set(txHash, serializeState(state));
        count++;
      }
    }

    if (count > 0) {
      this.#log.debug(`Marked ${count} transactions from pruned blocks`);
    }
  }

  /**
   * Deletes a transaction. This is the single entry point for ALL deletions.
   * The tx is always soft-deleted (kept in DB):
   *
   * - If the tx is from a pruned block: prune-soft-delete (kept until finalized)
   * - If the tx is NOT from a pruned block: slot-soft-delete (kept until next slot)
   */
  async deleteTx(txHash: string): Promise<void> {
    const existing = this.#state.get(txHash);
    if (existing !== undefined) {
      // Prune-soft-delete - keep in DB until finalized
      const state: DeletedTxState = {
        minedAtBlock: existing.minedAtBlock,
        softDeleted: true,
      };
      this.#state.set(txHash, state);
      await this.#deletedTxsDB.set(txHash, serializeState(state));
    } else {
      // Slot-soft-delete - keep in DB until next slot
      this.#slotDeletedTxs.set(txHash, this.#currentSlot);
      await this.#slotDeletedDB.add(txHash);
    }
  }

  /**
   * Clears tracking for a transaction if it re-mines at a block number >= the tracked minedAtBlock.
   *
   * When a tx re-mines at a higher (or equal) block, the old high-water mark is no longer needed:
   * any future prune would re-add the tx with an even higher block number. Clearing keeps
   * DeletedPool consistent — only txs that are actually un-mined should be tracked here.
   *
   * When a tx re-mines at a lower block, we must preserve the existing entry to retain
   * the high-water mark for re-execution purposes.
   */
  async clearIfMinedHigher(txHash: string, minedAtBlock: BlockNumber): Promise<void> {
    const existing = this.#state.get(txHash);
    if (existing !== undefined && minedAtBlock >= existing.minedAtBlock) {
      this.#state.delete(txHash);
      await this.#deletedTxsDB.delete(txHash);
      this.#log.debug(
        `Cleared tracking for tx ${txHash}: re-mined at block ${minedAtBlock} (was ${existing.minedAtBlock})`,
      );
    }
  }

  /**
   * Checks if a transaction is from a pruned block.
   */
  isFromPrunedBlock(txHash: string): boolean {
    return this.#state.has(txHash);
  }

  /**
   * Checks if a transaction is soft-deleted (either prune-based or slot-based).
   */
  isSoftDeleted(txHash: string): boolean {
    return (this.#state.get(txHash)?.softDeleted ?? false) || this.#slotDeletedTxs.has(txHash);
  }

  /**
   * Gets the block number in which a transaction was originally mined.
   */
  getMinedAtBlock(txHash: string): BlockNumber | undefined {
    return this.#state.get(txHash)?.minedAtBlock;
  }

  /**
   * Finalizes transactions when a block is finalized.
   * Hard-deletes transactions that were originally mined at or before the finalized block.
   *
   * @returns The hashes of transactions that were hard-deleted
   */
  async finalizeBlock(finalizedBlockNumber: BlockNumber): Promise<string[]> {
    const toHardDelete: string[] = [];
    for (const [txHash, state] of this.#state) {
      if (state.softDeleted && state.minedAtBlock <= finalizedBlockNumber) {
        toHardDelete.push(txHash);
      }
    }

    if (toHardDelete.length === 0) {
      return [];
    }

    // Hard-delete from all stores
    for (const txHash of toHardDelete) {
      this.#state.delete(txHash);
      await this.#deletedTxsDB.delete(txHash);
      await this.#txsDB.delete(txHash);
    }

    this.#log.debug(`Finalized ${toHardDelete.length} txs from pruned blocks at block ${finalizedBlockNumber}`);
    return toHardDelete;
  }

  /**
   * Cleans up slot-deleted transactions from previous slots.
   * Called at the start of prepareForSlot. Updates #currentSlot and hard-deletes
   * any txs that were deleted in an earlier slot.
   */
  async cleanupSlotDeleted(currentSlot: SlotNumber): Promise<void> {
    const previousSlot = this.#currentSlot;
    this.#currentSlot = currentSlot;

    const toHardDelete: string[] = [];
    for (const [txHash, deletedAtSlot] of this.#slotDeletedTxs) {
      if (deletedAtSlot < currentSlot) {
        toHardDelete.push(txHash);
      }
    }

    if (toHardDelete.length === 0) {
      return;
    }

    for (const txHash of toHardDelete) {
      this.#slotDeletedTxs.delete(txHash);
      await this.#slotDeletedDB.delete(txHash);
      await this.#txsDB.delete(txHash);
    }

    this.#log.debug(
      `Cleaned up ${toHardDelete.length} slot-deleted txs from slot ${previousSlot} (now slot ${currentSlot})`,
    );
  }

  /**
   * Clears soft-deletion status for a transaction being re-added to the pool.
   * Removes slot-deleted tracking entirely, and resets the prune-soft-deleted flag
   * while preserving the prune tracking itself (so a subsequent delete still uses
   * the prune path).
   */
  async clearSoftDeleted(txHash: string): Promise<void> {
    if (this.#slotDeletedTxs.has(txHash)) {
      this.#slotDeletedTxs.delete(txHash);
      await this.#slotDeletedDB.delete(txHash);
    }
    const existing = this.#state.get(txHash);
    if (existing?.softDeleted) {
      const state: DeletedTxState = { minedAtBlock: existing.minedAtBlock, softDeleted: false };
      this.#state.set(txHash, state);
      await this.#deletedTxsDB.set(txHash, serializeState(state));
    }
  }

  /**
   * Gets the count of transactions from pruned blocks.
   */
  getCount(): number {
    return this.#state.size;
  }

  /**
   * Gets all transaction hashes from pruned blocks.
   */
  getPrunedTxHashes(): string[] {
    return Array.from(this.#state.keys());
  }
}
