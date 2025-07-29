import type { Fr } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';

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
    }
  | {
      event: typeof EvictionEvent.CHAIN_PRUNED;
      blockNumber: number;
    }
  | {
      event: typeof EvictionEvent.BLOCK_MINED;
      block: BlockHeader;
      newNullifiers: Fr[];
      minedFeePayers: AztecAddress[];
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
 * Operations that eviction strategies can perform on the pool
 */
/**
 * Information about a transaction that references a specific block
 */
export interface TxBlockReference {
  txHash: TxHash;
  blockHash: Fr;
  isEvictable: boolean;
}

export interface TxPoolOperations {
  getTxByHash(txHash: TxHash): Promise<Tx | undefined>;
  getPendingTxs(): Promise<PendingTxInfo[]>;
  getPendingTxsReferencingBlocks(blockHashes: Fr[]): Promise<TxBlockReference[]>;
  getPendingTxsWithFeePayer(feePayer: AztecAddress[]): Promise<PendingTxInfo[]>;
  /** Cheap count of current pending transactions. */
  getPendingTxCount(): Promise<number>;
  /**
   * Returns up to `limit` lowest-priority evictable pending tx hashes.
   * Ordering should be from lowest priority upwards.
   */
  getLowestPriorityEvictable(limit: number): Promise<TxHash[]>;
  deleteTxs(txHashes: TxHash[], eviction?: boolean): Promise<void>;
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
}
