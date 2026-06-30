import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { L2Block, L2BlockId, L2BlockSource } from '@aztec/stdlib/block';
import type { BlockMinFeesProvider } from '@aztec/stdlib/gas';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { BlockHeader, Tx, TxHash, TxValidator } from '@aztec/stdlib/tx';

import type { TxPoolRejectionError } from './eviction/interfaces.js';
import type { TxMetaData, TxState } from './tx_metadata.js';

/**
 * Result of adding transactions to the pending pool.
 * Categorizes transactions by their outcome.
 */
export type AddTxsResult = {
  /** Transactions successfully added to the pool */
  accepted: TxHash[];
  /** Transactions ignored because they're valid but undesirable (e.g., duplicate, lower priority nullifier conflict) */
  ignored: TxHash[];
  /** Transactions rejected because they failed validation (e.g., invalid proof, expired timestamp) */
  rejected: TxHash[];
  /** Optional rejection errors, only present when there are rejections with structured errors. */
  errors?: Map<string, TxPoolRejectionError>;
};

/**
 * Events emitted by TxPoolV2.
 */
export type TxPoolV2Events = {
  /** Emitted when transactions are successfully added to the pool */
  'txs-added': (args: { txs: Tx[]; source?: string }) => void;
  /** Emitted when transactions are removed from the pool */
  'txs-removed': (args: { txHashes: TxHash[] }) => void;
};

/**
 * Configuration options for TxPoolV2.
 */
export type TxPoolV2Config = {
  /** Maximum number of pending transactions before low-priority eviction */
  maxPendingTxCount: number;
  /** Maximum number of archived transactions to retain (0 = disabled) */
  archivedTxLimit: number;
  /** Minimum age (ms) a transaction must have been in the pool before it's eligible for block building */
  minTxPoolAgeMs: number;
  /** Maximum number of evicted tx hashes to remember for metrics tracking */
  evictedTxCacheSize: number;
  /** The probability (0-1) that a transaction is discarded. 0 disables dropping. For testing purposes only. */
  dropTransactionsProbability: number;
  /** Minimum percentage fee increase required to replace an existing tx via RPC (0 = no bump). */
  priceBumpPercentage: bigint;
};

/**
 * Default configuration values for TxPoolV2.
 */
export const DEFAULT_TX_POOL_V2_CONFIG: TxPoolV2Config = {
  maxPendingTxCount: 0, // 0 = disabled
  archivedTxLimit: 0, // 0 = disabled
  minTxPoolAgeMs: 2_000,
  evictedTxCacheSize: 10_000,
  dropTransactionsProbability: 0,
  priceBumpPercentage: 10n,
};

/**
 * Dependencies required by TxPoolV2.
 */
export type TxPoolV2Dependencies = {
  /** Block source (Archiver) for checking mined status and verifying pruned blocks */
  l2BlockSource: L2BlockSource;
  /** World state synchronizer for validating transactions after chain prunes */
  worldStateSynchronizer: WorldStateSynchronizer;
  /** Factory that creates a validator for re-validating pool transactions using metadata */
  createTxValidator: () => Promise<TxValidator<TxMetaData>>;
  /** Checks whether a tx's setup-phase calls are on the allow list. Precomputed at receipt time. */
  checkAllowedSetupCalls: (tx: Tx) => Promise<boolean>;
  /** Provides projected minimum fees for the next block. Used by eviction rules instead of stale block header fees. */
  blockMinFeesProvider: BlockMinFeesProvider;
};

/**
 * Read-only access to pool state for pre-add checks.
 * Used by eviction rules to inspect pool state during transaction addition.
 */
export interface PoolReadAccess {
  /** Get metadata for a transaction by its hash (as string) */
  getMetadata(txHash: string): TxMetaData | undefined;
  /** Get the transaction hash that uses a specific nullifier (as string) */
  getTxHashByNullifier(nullifier: string): string | undefined;
  /** Get all transaction hashes for a fee payer (as string) */
  getTxHashesByFeePayer(feePayer: string): Set<string> | undefined;
  /** Get the current pending transaction count */
  getPendingTxCount(): number;
}

/**
 *
 * The pool manages transactions through a state machine:
 * - Pending: Transaction is awaiting inclusion in a block
 * - Protected: Transaction is being considered for a block proposal
 * - Mined: Transaction has been included in a block
 * - Deleted: Transaction has been removed from the pool
 *
 * All state-mutating operations are serialized through a handler queue
 * to prevent race conditions.
 */
export interface TxPoolV2 extends TypedEventEmitter<TxPoolV2Events> {
  // === Core Operations ===

  /**
   * Adds transactions to the pending pool with challenge and validation.
   * Handles nullifier conflicts via the challenge mechanism.
   * @param txs - Transactions to add
   * @param opts - Optional metadata (e.g., source for logging)
   * @returns Result categorizing each transaction as accepted, rejected, or ignored
   */
  addPendingTxs(txs: Tx[], opts?: { source?: string; feeComparisonOnly?: boolean }): Promise<AddTxsResult>;

  /**
   * Checks if the pool would accept a transaction without modifying state.
   * Used as a pre-check before expensive proof verification.
   * @param tx - Transaction to check
   * @returns 'accepted' if the pool would accept, 'ignored' if already in pool or undesirable
   */
  canAddPendingTx(tx: Tx): Promise<'accepted' | 'ignored'>;

  /**
   * Adds transactions as immediately protected for a given slot.
   * Used when receiving transactions from a block proposal we're validating.
   * @param txs - Transactions to add as protected
   * @param block - Block header providing slot context
   * @param opts - Optional metadata (e.g., source for logging)
   */
  addProtectedTxs(txs: Tx[], block: BlockHeader, opts?: { source?: string }): Promise<void>;

  /**
   * Protects existing transactions by hash for a given slot.
   * Returns hashes of transactions that weren't found in the pool.
   * Records unknown hashes for automatic protection when received via gossip.
   * @param txHashes - Hashes of transactions to protect
   * @param block - Block header providing slot context
   * @returns Hashes of transactions not found in the pool
   */
  protectTxs(txHashes: TxHash[], block: BlockHeader): Promise<TxHash[]>;

  /**
   * Adds transactions as already mined.
   * Used by prover nodes fetching transactions via request/response.
   * @param txs - Transactions to add as mined
   * @param block - Block header the transactions were mined in
   * @param opts - Optional metadata (e.g., source for logging)
   */
  addMinedTxs(txs: Tx[], block: BlockHeader, opts?: { source?: string }): Promise<void>;

  // === State Transition Handlers ===

  /**
   * Handles a mined block - marks transactions as mined and evicts conflicting pending txs.
   * Uses nullifiers directly from the block to evict pending transactions with conflicts.
   * @param block - The complete mined block
   */
  handleMinedBlock(block: L2Block): Promise<void>;

  /**
   * Prepares the pool for a new slot by unprotecting transactions from earlier
   * slots and re-validating them before returning to pending state.
   * @param slotNumber - The pipeline slot we are building for (i.e. the slot
   *   the resulting blocks will target on L1).
   */
  prepareForSlot(slotNumber: SlotNumber): Promise<void>;

  /**
   * Releases the protections a failed block proposal created and restores the txs to pending.
   * Only clears protection entries still recorded at exactly the given slot: a tx that another,
   * still-live proposal raised to a higher slot via {@link protectTxs} keeps its protection, and
   * mined txs (which carry no protection entry) are left untouched. Restored txs are re-validated
   * and resolved against nullifier conflicts before re-entering the pending indices.
   * @param txHashes - Hashes of the proposal's txs to release.
   * @param slotNumber - The slot the failed proposal targeted; protection is released only for this slot.
   */
  unprotectTxs(txHashes: TxHash[], slotNumber: SlotNumber): Promise<void>;

  /**
   * Handles pruned blocks during a reorg.
   * Un-mines all transactions mined in blocks beyond the given latest block
   * and validates them before returning to pending.
   * @param latestBlock - The latest valid block ID after the prune
   */
  handlePrunedBlocks(latestBlock: L2BlockId, options?: { deleteAllTxs?: boolean }): Promise<void>;

  /**
   * Handles failed transaction execution.
   * Deletes transactions that failed during block building.
   * @param txHashes - Hashes of transactions that failed
   */
  handleFailedExecution(txHashes: TxHash[]): Promise<void>;

  /**
   * Handles a finalized block.
   * Permanently deletes mined transactions and optionally archives them.
   * @param block - Header of the finalized block
   */
  handleFinalizedBlock(block: BlockHeader): Promise<void>;

  /** Gets a transaction by its hash. Set `includeProof: false` to skip loading the proof from the DB. */
  getTxByHash(txHash: TxHash, opts?: { includeProof?: boolean }): Promise<Tx | undefined>;

  /** Gets multiple transactions by their hashes. Set `includeProof: false` to skip loading proofs from the DB. */
  getTxsByHash(txHashes: TxHash[], opts?: { includeProof?: boolean }): Promise<(Tx | undefined)[]>;

  /** Checks if transactions exist in the pool */
  hasTxs(txHashes: TxHash[]): Promise<boolean[]>;

  /** Gets the status of a transaction */
  getTxStatus(txHash: TxHash): Promise<TxState | 'deleted' | undefined>;

  /** Gets pending transaction hashes sorted by priority (highest first) */
  getPendingTxHashes(): Promise<TxHash[]>;

  /** Gets pending transaction hashes that have been in the pool long enough per minTxPoolAgeMs, sorted by priority (highest first) */
  getEligiblePendingTxHashes(): Promise<TxHash[]>;

  /** Gets the count of pending transactions */
  getPendingTxCount(): Promise<number>;

  /**
   * Returns whether at least `minCount` pending transactions are old enough per minTxPoolAgeMs to be eligible
   * for block building. Stops scanning once the threshold is reached, so it is cheaper than counting all
   * eligible txs when only a few are needed.
   */
  hasEligiblePendingTxs(minCount: number): Promise<boolean>;

  /** Gets mined transaction hashes with their block IDs */
  getMinedTxHashes(): Promise<[TxHash, L2BlockId][]>;

  /** Gets the count of mined transactions */
  getMinedTxCount(): Promise<number>;

  /** Checks if the pool is empty */
  isEmpty(): Promise<boolean>;

  /** Gets an archived transaction by its hash */
  getArchivedTxByHash(txHash: TxHash): Promise<Tx | undefined>;

  /** Gets the lowest priority pending transactions */
  getLowestPriorityPending(limit: number): Promise<TxHash[]>;

  // === Configuration ===

  /** Updates the pool configuration */
  updateConfig(config: Partial<TxPoolV2Config>): Promise<void>;

  // === Lifecycle ===

  /**
   * Starts the pool and initializes state from persistence.
   * Must be called before other operations.
   * - Reads all transactions from the database
   * - Checks each against the Archiver to determine mined status
   * - Validates all non-mined transactions
   * - Populates in-memory indices
   */
  start(): Promise<void>;

  /** Stops the pool and releases resources */
  stop(): Promise<void>;
}
