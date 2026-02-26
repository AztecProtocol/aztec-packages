import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { BlockHeader, TxHash } from '@aztec/stdlib/tx';

import type { TxMetaData } from '../tx_metadata.js';

/**
 * Events that trigger eviction checks.
 */
export const EvictionEvent = {
  TXS_ADDED: 'txs_added',
  BLOCK_MINED: 'block_mined',
  CHAIN_PRUNED: 'chain_pruned',
} as const;

export type EvictionEventType = (typeof EvictionEvent)[keyof typeof EvictionEvent];

/**
 * Context passed to eviction rules based on the triggering event.
 */
export type EvictionContext =
  | {
      event: typeof EvictionEvent.TXS_ADDED;
      newTxHashes: string[];
      feePayers: string[];
    }
  | {
      event: typeof EvictionEvent.CHAIN_PRUNED;
      blockNumber: BlockNumber;
    }
  | {
      event: typeof EvictionEvent.BLOCK_MINED;
      block: BlockHeader;
      newNullifiers: string[];
      feePayers: string[];
    };

/**
 * Result of an eviction operation.
 */
export interface EvictionResult {
  readonly txsEvicted: string[];
  readonly reason: string;
  readonly success: boolean;
  readonly error?: Error;
}

/**
 * Read-only access to pool state for pre-add checks.
 */
export interface PreAddPoolAccess {
  /** Get metadata for a pending tx by its hash string */
  getMetadata(txHashStr: string): TxMetaData | undefined;

  /** Get the pending tx hash that uses a specific nullifier (as string) */
  getTxHashByNullifier(nullifier: string): string | undefined;

  /** Get on-chain balance for a fee payer address */
  getFeePayerBalance(feePayer: string): Promise<bigint>;

  /** Get metadata for all pending txs from a specific fee payer */
  getFeePayerPendingTxs(feePayer: string): TxMetaData[];

  /** Get current count of pending transactions */
  getPendingTxCount(): number;

  /** Get the lowest priority pending tx metadata */
  getLowestPriorityPendingTx(): TxMetaData | undefined;
}

/** A single eviction tagged with the rule that caused it. */
export interface TaggedEviction {
  readonly txHash: string;
  readonly reason: string;
}

/**
 * Machine-readable rejection codes for pre-add rule rejections.
 */
export const TxPoolRejectionCode = {
  LOW_PRIORITY_FEE: 'LOW_PRIORITY_FEE',
  INSUFFICIENT_FEE_PAYER_BALANCE: 'INSUFFICIENT_FEE_PAYER_BALANCE',
  NULLIFIER_CONFLICT: 'NULLIFIER_CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type TxPoolRejectionCode = (typeof TxPoolRejectionCode)[keyof typeof TxPoolRejectionCode];

/** Structured rejection reason returned by pre-add rules. */
export type TxPoolRejectionError =
  | {
      code: typeof TxPoolRejectionCode.LOW_PRIORITY_FEE;
      message: string;
      minimumPriorityFee: bigint;
      txPriorityFee: bigint;
    }
  | {
      code: typeof TxPoolRejectionCode.INSUFFICIENT_FEE_PAYER_BALANCE;
      message: string;
      currentBalance: bigint;
      availableBalance: bigint;
      feeLimit: bigint;
    }
  | {
      code: typeof TxPoolRejectionCode.NULLIFIER_CONFLICT;
      message: string;
      conflictingTxHash: string;
      /** Minimum fee needed to replace the conflicting tx (only set when price bump applies). */
      minimumPriceBumpFee?: bigint;
      /** Incoming tx's priority fee. */
      txPriorityFee?: bigint;
    }
  | { code: typeof TxPoolRejectionCode.INTERNAL_ERROR; message: string };

/**
 * Result of a pre-add check for a single transaction.
 */
export interface PreAddResult {
  /** Whether the incoming tx should be ignored (valid but not desired) */
  readonly shouldIgnore: boolean;
  /** Tx hashes (as strings) that should be evicted if this tx is added */
  readonly txHashesToEvict: string[];
  /** Evictions tagged with the rule name that produced them. Populated by EvictionManager. */
  readonly evictions?: TaggedEviction[];
  /** Optional reason for ignoring */
  readonly reason?: TxPoolRejectionError;
}

/** Context passed to pre-add rules from addPendingTxs. */
export interface PreAddContext {
  /** If true, compare priority fee only (no tx hash tiebreaker). Used for RPC submissions. */
  feeComparisonOnly?: boolean;
  /** Percentage-based price bump required for tx replacement. Only set for RPC submissions. */
  priceBumpPercentage?: bigint;
}

/**
 * Pre-add rule interface. Rules check incoming txs before they're added to the pool.
 * All methods work with TxMetaData for efficiency.
 */
export interface PreAddRule {
  readonly name: string;

  /**
   * Check if incoming tx should be added and which existing txs to evict.
   * @param incomingMeta - Metadata for the incoming transaction
   * @param poolAccess - Read-only access to current pool state
   * @param context - Optional context from addPendingTxs caller
   * @returns Result indicating whether to ignore and what to evict
   */
  check(incomingMeta: TxMetaData, poolAccess: PreAddPoolAccess, context?: PreAddContext): Promise<PreAddResult>;

  /**
   * Updates the configuration for this rule.
   */
  updateConfig?(config: EvictionConfig): void;
}

/**
 * Operations that post-event eviction rules can perform on the pool.
 * All methods work with metadata and strings for efficiency.
 */
export interface PoolOperations {
  /** Get all pending tx metadata */
  getPendingTxs(): TxMetaData[];

  /** Get unique fee payers from pending transactions */
  getPendingFeePayers(): string[];

  /** Get metadata for all pending txs from a specific fee payer */
  getFeePayerPendingTxs(feePayer: string): TxMetaData[];

  /** Get current count of pending transactions */
  getPendingTxCount(): number;

  /** Get the N lowest priority pending tx hashes */
  getLowestPriorityPending(limit: number): string[];

  /** Delete transactions by hash, with an optional reason for metrics */
  deleteTxs(txHashes: string[], reason?: string): Promise<void>;
}

/**
 * Post-event eviction rule interface. Rules run after events to clean up the pool.
 */
export interface EvictionRule {
  readonly name: string;

  /**
   * Performs the eviction logic after an event.
   */
  evict(context: EvictionContext, pool: PoolOperations): Promise<EvictionResult>;

  /**
   * Updates the configuration for this rule.
   */
  updateConfig?(config: EvictionConfig): void;
}

/**
 * Configuration options for eviction rules.
 */
export interface EvictionConfig {
  /** Maximum number of pending transactions (0 = unlimited) */
  maxPendingTxCount?: number;
}

/**
 * Converts a TxHash to its string representation for use in eviction results.
 */
export function txHashToString(txHash: TxHash): string {
  return txHash.toString();
}

/**
 * Converts an array of TxHash to string array.
 */
export function txHashesToStrings(txHashes: TxHash[]): string[] {
  return txHashes.map(h => h.toString());
}
