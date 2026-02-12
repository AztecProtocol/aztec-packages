import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { L2Block, L2BlockId, L2BlockSource } from '@aztec/stdlib/block';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { BlockHeader, Tx, TxHash, TxValidator } from '@aztec/stdlib/tx';

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
};

/**
 * Default configuration values for TxPoolV2.
 */
export const DEFAULT_TX_POOL_V2_CONFIG: TxPoolV2Config = {
  maxPendingTxCount: 0, // 0 = disabled
  archivedTxLimit: 0, // 0 = disabled
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
  addPendingTxs(txs: Tx[], opts?: { source?: string }): Promise<AddTxsResult>;

  /**
   * Checks if a transaction can be added without modifying the pool.
   * Performs the same validation as addPendingTxs but doesn't persist changes.
   * @param tx - Transaction to check
   * @returns Result: 'accepted', 'ignored' (if already in pool or undesirable), or 'rejected' (if validation fails)
   */
  canAddPendingTx(tx: Tx): Promise<'accepted' | 'ignored' | 'rejected'>;

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
   * Prepares the pool for a new slot.
   * Unprotects transactions from earlier slots and validates them before
   * returning to pending state.
   * @param slotNumber - The slot number to prepare for
   */
  prepareForSlot(slotNumber: SlotNumber): Promise<void>;

  /**
   * Handles pruned blocks during a reorg.
   * Un-mines all transactions mined in blocks beyond the given latest block
   * and validates them before returning to pending.
   * @param latestBlock - The latest valid block ID after the prune
   */
  handlePrunedBlocks(latestBlock: L2BlockId): Promise<void>;

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

  /** Gets a transaction by its hash */
  getTxByHash(txHash: TxHash): Promise<Tx | undefined>;

  /** Gets multiple transactions by their hashes */
  getTxsByHash(txHashes: TxHash[]): Promise<(Tx | undefined)[]>;

  /** Checks if transactions exist in the pool */
  hasTxs(txHashes: TxHash[]): Promise<boolean[]>;

  /** Gets the status of a transaction */
  getTxStatus(txHash: TxHash): Promise<TxState | 'deleted' | undefined>;

  /** Gets pending transaction hashes sorted by priority (highest first) */
  getPendingTxHashes(): Promise<TxHash[]>;

  /** Gets the count of pending transactions */
  getPendingTxCount(): Promise<number>;

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
