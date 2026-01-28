import type { BlockNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type BlockHeader, type Tx, TxHash } from '@aztec/stdlib/tx';

import { getFeePayerBalanceDelta } from '../../../msg_validators/tx_validator/fee_payer_balance.js';
import { getTxPriorityFee } from '../priority.js';
import type { TxPoolOptions } from '../tx_pool.js';

export const EvictionEvent = {
  TXS_ADDED: 'txs_added',
  BLOCK_MINED: 'block_mined',
  CHAIN_PRUNED: 'chain_pruned',
} as const;

type EvictionEvent = (typeof EvictionEvent)[keyof typeof EvictionEvent];

export type EvictionContext =
  | {
      event: typeof EvictionEvent.TXS_ADDED;
      newTxs: TxHash[];
      feePayers: AztecAddress[];
    }
  | {
      event: typeof EvictionEvent.CHAIN_PRUNED;
      blockNumber: BlockNumber;
    }
  | {
      event: typeof EvictionEvent.BLOCK_MINED;
      block: BlockHeader;
      newNullifiers: Fr[];
      feePayers: AztecAddress[];
    };

/**
 * Result of an eviction operation
 */
export interface EvictionResult {
  readonly txsEvicted: TxHash[];
  readonly reason: string;
  readonly success: boolean;
  readonly error?: Error;
}

/**
 * Information about a pending transaction
 */
export interface PendingTxInfo {
  txHash: TxHash;
  blockHash: Fr;
  isEvictable: boolean;
}

/**
 * Information about a transaction that references a specific block
 */
export interface TxBlockReference {
  txHash: TxHash;
  blockHash: Fr;
  isEvictable: boolean;
}

/**
 * Operations that eviction strategies can perform on the pool
 */
export interface TxPoolOperations {
  getTxByHash(txHash: TxHash): Promise<Tx | undefined>;
  getPendingTxInfos(): Promise<PendingTxInfo[]>;
  getPendingTxsReferencingBlocks(blockHashes: Fr[]): Promise<TxBlockReference[]>;
  getPendingFeePayers(): Promise<AztecAddress[]>;
  getFeePayerTxInfos(feePayer: AztecAddress): AsyncIterable<FeePayerTxInfo>;
  /** Cheap count of current pending transactions. */
  getPendingTxCount(): Promise<number>;
  /**
   * Returns up to `limit` lowest-priority evictable pending tx hashes.
   * Ordering should be from lowest priority upwards.
   */
  getLowestPriorityEvictable(limit: number): Promise<TxHash[]>;
  deleteTxs(txHashes: TxHash[], opts?: { permanently?: boolean }): Promise<void>;
}

/**
 * Strategy interface for different eviction behaviors
 */
export interface EvictionRule {
  readonly name: string;

  /**
   * Performs the eviction logic
   */
  evict(context: EvictionContext, txPool: TxPoolOperations): Promise<EvictionResult>;

  /**
   * Updates the configuration for this eviction rule.
   * Rules should ignore config options that don't apply to them.
   */
  updateConfig(config: TxPoolOptions): void;
}

/**
 * Balance-related information about a transaction for a fee payer.
 */
export class FeePayerTxInfo {
  txHash: TxHash;
  priority: bigint;
  feeLimit: bigint;
  claimAmount: bigint;
  isEvictable: boolean;

  constructor(fields: {
    txHash: TxHash;
    priority: bigint;
    feeLimit: bigint;
    claimAmount: bigint;
    isEvictable: boolean;
  }) {
    this.txHash = fields.txHash;
    this.priority = fields.priority;
    this.feeLimit = fields.feeLimit;
    this.claimAmount = fields.claimAmount;
    this.isEvictable = fields.isEvictable;
  }

  static async encode(tx: Tx, txHash: string | TxHash): Promise<Buffer> {
    const { feeLimit, claimAmount } = await getFeePayerBalanceDelta(tx, ProtocolContractAddress.FeeJuice);
    const priority = Buffer32.fromBigInt(getTxPriorityFee(tx)).toBuffer();
    const hashBuffer = (typeof txHash === 'string' ? TxHash.fromString(txHash) : txHash).toBuffer();
    const feeLimitBuffer = Buffer32.fromBigInt(feeLimit).toBuffer();
    const claimAmountBuffer = Buffer32.fromBigInt(claimAmount).toBuffer();
    return Buffer.concat([priority, hashBuffer, feeLimitBuffer, claimAmountBuffer]);
  }

  static decode(value: Buffer, isEvictable = true): FeePayerTxInfo {
    const priority = Buffer32.fromBuffer(value.subarray(0, Buffer32.SIZE)).toBigInt();
    const hashOffset = Buffer32.SIZE;
    const feeLimitOffset = hashOffset + TxHash.SIZE;
    const claimOffset = feeLimitOffset + Buffer32.SIZE;

    return new FeePayerTxInfo({
      txHash: TxHash.fromBuffer(value.subarray(hashOffset, feeLimitOffset)),
      priority,
      feeLimit: Buffer32.fromBuffer(value.subarray(feeLimitOffset, claimOffset)).toBigInt(),
      claimAmount: Buffer32.fromBuffer(value.subarray(claimOffset, claimOffset + Buffer32.SIZE)).toBigInt(),
      isEvictable,
    });
  }
}

/**
 * Metadata about a transaction for pre-pending validation.
 * Contains the essential fields needed to validate without loading the full Tx.
 */
export interface TxValidationFields {
  /** Transaction hash as string */
  txHash: string;
  /** Hash of the anchor block header */
  anchorBlockHeaderHash: string;
  /** Fee payer address as string */
  feePayer: string;
  /** Maximum fee the tx is willing to pay */
  feeLimit: bigint;
}

/**
 * Context for pre-pending filter operations.
 */
export type PrePendingFilterContext =
  | {
      event: 'CHAIN_PRUNED';
      /** The latest valid block number after the prune */
      blockNumber: BlockNumber;
    }
  | {
      event: 'UNPROTECT';
    };

/**
 * Result of a pre-pending filter operation.
 */
export interface PrePendingFilterResult {
  /** Transaction hashes that are valid and can be added to pending */
  valid: string[];
  /** Transaction hashes that are invalid and should be deleted */
  invalid: string[];
}

/**
 * Strategy interface for filtering transactions before they enter the pending pool.
 * Used during reorgs (un-mining) and slot transitions (unprotecting) to avoid
 * adding transactions to pending indices only to immediately remove them.
 */
export interface PrePendingFilter {
  readonly name: string;

  /**
   * Filters transactions, returning which are invalid and should not be added to pending.
   *
   * @param txs - Transaction metadata to validate
   * @param ctx - Context about why we're filtering (reorg vs unprotect)
   * @returns Set of tx hashes that are INVALID (should not be added to pending)
   */
  filterInvalid(txs: TxValidationFields[], ctx: PrePendingFilterContext): Promise<Set<string>>;
}

/**
 * Read-only access to pool state for pre-add eviction checks.
 * Passed to pre-add rules during the addTxs transaction.
 */
export interface PreAddPoolAccess {
  /**
   * Get the pending tx hash that uses a specific nullifier, if any.
   * Returns undefined if no pending tx uses this nullifier.
   */
  getTxHashByNullifier(nullifier: Fr): Promise<TxHash | undefined>;

  /**
   * Get a pending transaction by its hash.
   */
  getPendingTxByHash(hash: TxHash): Promise<Tx | undefined>;

  /**
   * Get the priority string for a transaction (for fee comparison).
   */
  getTxPriority(tx: Tx): string;
}

/**
 * Result of a pre-add eviction check for a single transaction.
 */
export interface PreAddEvictionResult {
  /** Whether the incoming tx should be rejected */
  readonly shouldReject: boolean;
  /** Sorted array of existing tx hashes that should be evicted if this tx is added */
  readonly txHashesToEvict: TxHash[];
  /** Optional reason for rejection */
  readonly reason?: string;
}

/**
 * Strategy interface for pre-add eviction rules.
 * These run inside the addTxs transaction before a tx is added,
 * deciding whether to evict existing txs or reject the incoming tx.
 */
export interface PreAddEvictionRule {
  readonly name: string;

  /**
   * Check if incoming tx should be added and which existing txs to evict.
   * Called inside the addTxs database transaction for atomicity.
   *
   * @param tx - The incoming transaction to check
   * @param poolAccess - Read-only access to current pool state
   * @returns Result indicating whether to reject and what to evict
   */
  check(tx: Tx, poolAccess: PreAddPoolAccess): Promise<PreAddEvictionResult>;

  /**
   * Updates the configuration for this rule.
   * Rules should ignore config options that don't apply to them.
   */
  updateConfig?(config: TxPoolOptions): void;
}
