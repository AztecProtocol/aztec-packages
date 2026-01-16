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
      blockNumber: number;
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
