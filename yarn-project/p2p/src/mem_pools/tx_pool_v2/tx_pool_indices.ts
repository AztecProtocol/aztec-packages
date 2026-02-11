import { SlotNumber } from '@aztec/foundation/branded-types';
import type { L2BlockId } from '@aztec/stdlib/block';

import { type TxMetaData, type TxState, compareFee, compareTxHash } from './tx_metadata.js';

/**
 * Manages in-memory indices for the transaction pool.
 *
 * Tracks transaction metadata and maintains several indices for efficient querying:
 * - Metadata by txHash (primary store)
 * - Nullifier to txHash mapping (pending txs only)
 * - Fee payer to txHashes mapping (pending txs only)
 * - Priority-ordered pending txs
 * - Protected transaction tracking
 *
 * Key invariant: Only pending txs appear in nullifier/feePayer/priority indices.
 */
export class TxPoolIndices {
  /** Primary metadata store: txHash -> TxMetaData */
  #metadata: Map<string, TxMetaData> = new Map();
  /** Nullifier to txHash index (pending txs only) */
  #nullifierToTxHash: Map<string, string> = new Map();
  /** Fee payer to txHashes index (pending txs only) */
  #feePayerToTxHashes: Map<string, Set<string>> = new Map();
  /** Pending txHashes grouped by priority fee */
  #pendingByPriority: Map<bigint, Set<string>> = new Map();
  /** Protected transactions: txHash -> slotNumber */
  #protectedTransactions: Map<string, SlotNumber> = new Map();

  // ============================================================================
  // STATE QUERIES
  // ============================================================================

  /**
   * Derives the transaction state from its metadata and protection status.
   * A transaction is:
   * - 'mined' if it has a minedL2BlockId
   * - 'protected' if it's in the protectedTransactions map (but not mined)
   * - 'pending' otherwise
   */
  getTxState(meta: TxMetaData): TxState {
    if (meta.minedL2BlockId !== undefined) {
      return 'mined';
    } else if (this.#protectedTransactions.has(meta.txHash)) {
      return 'protected';
    } else {
      return 'pending';
    }
  }

  getMetadata(txHash: string): TxMetaData | undefined {
    return this.#metadata.get(txHash);
  }

  has(txHash: string): boolean {
    return this.#metadata.has(txHash);
  }

  isEmpty(): boolean {
    return this.#metadata.size === 0;
  }

  getTxCount(): number {
    return this.#metadata.size;
  }

  // ============================================================================
  // ITERATION
  // ============================================================================

  /**
   * Iterates pending transaction hashes in priority order.
   * @param order - 'desc' for highest priority first, 'asc' for lowest priority first
   */
  *iteratePendingByPriority(order: 'asc' | 'desc', filter?: (hash: string) => boolean): Generator<string> {
    // Use compareFee from tx_metadata, swap args for descending order
    const feeCompareFn = order === 'desc' ? (a: bigint, b: bigint) => compareFee(b, a) : compareFee;
    const hashCompareFn = order === 'desc' ? (a: string, b: string) => compareTxHash(b, a) : compareTxHash;

    const sortedFees = [...this.#pendingByPriority.keys()].sort(feeCompareFn);

    for (const fee of sortedFees) {
      const hashesAtFee = this.#pendingByPriority.get(fee)!;
      // Use compareTxHash from tx_metadata, swap args for descending order
      const sortedHashes = [...hashesAtFee].sort(hashCompareFn);
      for (const hash of sortedHashes) {
        if (filter === undefined || filter(hash)) {
          yield hash;
        }
      }
    }
  }

  /**
   * Iterates pending transaction hashes in priority order, skipping txs received after maxReceivedAt.
   * @param order - 'desc' for highest priority first, 'asc' for lowest priority first
   * @param maxReceivedAt - Only yield txs with receivedAt <= this value
   */
  *iterateEligiblePendingByPriority(order: 'asc' | 'desc', maxReceivedAt: number): Generator<string> {
    const filter = (hash: string) => {
      const meta = this.#metadata.get(hash);
      return meta !== undefined && meta.receivedAt <= maxReceivedAt;
    };

    yield* this.iteratePendingByPriority(order, filter);
  }

  /** Iterates all metadata entries */
  *iterateMetadata(): Generator<[string, TxMetaData]> {
    yield* this.#metadata;
  }

  // ============================================================================
  // INDEX MODIFICATIONS
  // ============================================================================

  /** Adds a new pending transaction to all indices */
  addPending(meta: TxMetaData): void {
    this.#metadata.set(meta.txHash, meta);
    this.#addToPendingIndices(meta);
  }

  /** Adds a new protected transaction (not added to pending indices) */
  addProtected(meta: TxMetaData, slot: SlotNumber): void {
    this.#metadata.set(meta.txHash, meta);
    this.#protectedTransactions.set(meta.txHash, slot);
  }

  /** Adds a new mined transaction (not added to pending indices) */
  addMined(meta: TxMetaData): void {
    this.#metadata.set(meta.txHash, meta);
  }

  /** Marks an existing transaction as mined and removes from pending indices */
  markAsMined(meta: TxMetaData, blockId: L2BlockId): void {
    meta.minedL2BlockId = blockId;
    // Safe to call unconditionally - removeFromPendingIndices is idempotent
    this.#removeFromPendingIndices(meta);
  }

  /** Clears the mined status from a transaction */
  markAsUnmined(meta: TxMetaData): void {
    meta.minedL2BlockId = undefined;
  }

  /**
   * Updates protection status for an existing transaction.
   * Removes from pending indices if transitioning from pending to protected.
   */
  updateProtection(txHash: string, slotNumber: SlotNumber): void {
    const currentSlot = this.#protectedTransactions.get(txHash);

    // Only update if not already protected at an equal or later slot
    if (currentSlot !== undefined && currentSlot >= slotNumber) {
      return;
    }

    // Remove from pending indices if transitioning from pending to protected
    if (currentSlot === undefined) {
      const meta = this.#metadata.get(txHash);
      if (meta) {
        this.#removeFromPendingIndices(meta);
      }
    }

    this.#protectedTransactions.set(txHash, slotNumber);
  }

  /** Sets protection for a txHash that may not have metadata yet */
  setProtection(txHash: string, slotNumber: SlotNumber): void {
    this.#protectedTransactions.set(txHash, slotNumber);
  }

  /** Gets the protection slot for a txHash, if protected */
  getProtectionSlot(txHash: string): SlotNumber | undefined {
    return this.#protectedTransactions.get(txHash);
  }

  /** Removes protection from tx hashes */
  clearProtection(txHashes: string[]): void {
    for (const txHash of txHashes) {
      this.#protectedTransactions.delete(txHash);
    }
  }

  /** Removes a transaction from all indices */
  remove(txHash: string): void {
    const meta = this.#metadata.get(txHash);
    if (!meta) {
      return;
    }

    this.#metadata.delete(txHash);
    this.#protectedTransactions.delete(txHash);
    this.#removeFromPendingIndices(meta);
  }

  /** Removes a transaction from pending indices only (not metadata) */
  removeFromPendingIndices(meta: TxMetaData): void {
    this.#removeFromPendingIndices(meta);
  }

  /** Adds a transaction to pending indices (used during conflict resolution) */
  addToPendingIndices(meta: TxMetaData): void {
    this.#addToPendingIndices(meta);
  }

  // ============================================================================
  // QUERIES FOR EVICTION RULES
  // ============================================================================

  /** Gets all pending transactions for a given fee payer */
  getFeePayerPendingTxs(feePayer: string): TxMetaData[] {
    const txHashes = this.#feePayerToTxHashes.get(feePayer);
    if (!txHashes) {
      return [];
    }
    const result: TxMetaData[] = [];
    for (const txHash of txHashes) {
      const meta = this.#metadata.get(txHash);
      if (meta && this.getTxState(meta) === 'pending') {
        result.push(meta);
      }
    }
    return result;
  }

  /** Gets the count of pending transactions */
  getPendingTxCount(): number {
    let count = 0;
    for (const hashes of this.#pendingByPriority.values()) {
      count += hashes.size;
    }
    return count;
  }

  /** Gets the lowest priority pending transaction hashes (up to limit) */
  getLowestPriorityPending(limit: number): string[] {
    if (limit <= 0) {
      return [];
    }

    const result: string[] = [];
    for (const hash of this.iteratePendingByPriority('asc')) {
      result.push(hash);
      if (result.length >= limit) {
        break;
      }
    }
    return result;
  }

  /** Gets the lowest priority pending transaction */
  getLowestPriorityPendingTx(): TxMetaData | undefined {
    for (const txHash of this.iteratePendingByPriority('asc')) {
      const meta = this.#metadata.get(txHash);
      if (meta) {
        return meta;
      }
    }
    return undefined;
  }

  /** Gets all pending transactions */
  getPendingTxs(): TxMetaData[] {
    const result: TxMetaData[] = [];
    for (const hashSet of this.#pendingByPriority.values()) {
      for (const txHash of hashSet) {
        const meta = this.#metadata.get(txHash);
        if (meta) {
          result.push(meta);
        }
      }
    }
    return result;
  }

  /** Gets all fee payers with pending transactions */
  getPendingFeePayers(): string[] {
    return Array.from(this.#feePayerToTxHashes.keys());
  }

  /** Gets the txHash that uses a given nullifier (pending txs only) */
  getTxHashByNullifier(nullifier: string): string | undefined {
    return this.#nullifierToTxHash.get(nullifier);
  }

  /** Gets txHashes for a fee payer */
  getTxHashesByFeePayer(feePayer: string): Set<string> | undefined {
    return this.#feePayerToTxHashes.get(feePayer);
  }

  // ============================================================================
  // FIND/FILTER OPERATIONS
  // ============================================================================

  /** Finds all transactions mined in blocks after the given block number */
  findTxsMinedAfter(blockNumber: number): TxMetaData[] {
    const result: TxMetaData[] = [];
    for (const meta of this.#metadata.values()) {
      if (meta.minedL2BlockId !== undefined && meta.minedL2BlockId.number > blockNumber) {
        result.push(meta);
      }
    }
    return result;
  }

  /** Finds tx hashes mined at or before the given block number */
  findTxsMinedAtOrBefore(blockNumber: number): string[] {
    const result: string[] = [];
    for (const [txHash, meta] of this.#metadata) {
      if (meta.minedL2BlockId !== undefined && meta.minedL2BlockId.number <= blockNumber) {
        result.push(txHash);
      }
    }
    return result;
  }

  /** Finds protected tx hashes from slots earlier than the given slot number */
  findExpiredProtectedTxs(slotNumber: SlotNumber): string[] {
    const result: string[] = [];
    for (const [txHash, protectedSlot] of this.#protectedTransactions) {
      if (protectedSlot < slotNumber) {
        result.push(txHash);
      }
    }
    return result;
  }

  /** Filters out transactions that are currently protected */
  filterUnprotected(txs: TxMetaData[]): TxMetaData[] {
    return txs.filter(meta => !this.#protectedTransactions.has(meta.txHash));
  }

  /** Filters to transactions that have metadata and are not mined */
  filterRestorable(txHashes: string[]): TxMetaData[] {
    const result: TxMetaData[] = [];
    for (const txHash of txHashes) {
      const meta = this.#metadata.get(txHash);
      if (meta && meta.minedL2BlockId === undefined) {
        result.push(meta);
      }
    }
    return result;
  }

  // ============================================================================
  // METRICS
  // ============================================================================

  /** Counts transactions by state and estimates total metadata memory usage */
  countTxs(): { pending: number; protected: number; mined: number; totalMetadataBytes: number } {
    let pending = 0;
    let protected_ = 0;
    let mined = 0;
    let totalMetadataBytes = 0;

    for (const meta of this.#metadata.values()) {
      totalMetadataBytes += meta.estimatedSizeBytes;
      const state = this.getTxState(meta);
      if (state === 'pending') {
        pending++;
      } else if (state === 'protected') {
        protected_++;
      } else if (state === 'mined') {
        mined++;
      }
    }

    return { pending, protected: protected_, mined, totalMetadataBytes };
  }

  /** Returns the estimated total memory consumed by all metadata objects */
  getTotalMetadataBytes(): number {
    let total = 0;
    for (const meta of this.#metadata.values()) {
      total += meta.estimatedSizeBytes;
    }
    return total;
  }

  /** Gets all mined transactions with their block IDs */
  getMinedTxs(): [string, L2BlockId][] {
    const result: [string, L2BlockId][] = [];
    for (const [txHash, meta] of this.#metadata) {
      if (meta.minedL2BlockId !== undefined) {
        result.push([txHash, meta.minedL2BlockId]);
      }
    }
    return result;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  #addToPendingIndices(meta: TxMetaData): void {
    // Add to nullifier index
    for (const nullifier of meta.nullifiers) {
      this.#nullifierToTxHash.set(nullifier, meta.txHash);
    }

    // Add to fee payer index
    let feePayerSet = this.#feePayerToTxHashes.get(meta.feePayer);
    if (!feePayerSet) {
      feePayerSet = new Set();
      this.#feePayerToTxHashes.set(meta.feePayer, feePayerSet);
    }
    feePayerSet.add(meta.txHash);

    // Add to priority bucket
    let prioritySet = this.#pendingByPriority.get(meta.priorityFee);
    if (!prioritySet) {
      prioritySet = new Set();
      this.#pendingByPriority.set(meta.priorityFee, prioritySet);
    }
    prioritySet.add(meta.txHash);
  }

  #removeFromPendingIndices(meta: TxMetaData): void {
    // Remove from nullifier index
    for (const nullifier of meta.nullifiers) {
      this.#nullifierToTxHash.delete(nullifier);
    }

    // Remove from fee payer index
    const feePayerSet = this.#feePayerToTxHashes.get(meta.feePayer);
    if (feePayerSet) {
      feePayerSet.delete(meta.txHash);
      if (feePayerSet.size === 0) {
        this.#feePayerToTxHashes.delete(meta.feePayer);
      }
    }

    // Remove from priority map
    const hashSet = this.#pendingByPriority.get(meta.priorityFee);
    if (hashSet) {
      hashSet.delete(meta.txHash);
      if (hashSet.size === 0) {
        this.#pendingByPriority.delete(meta.priorityFee);
      }
    }
  }
}
