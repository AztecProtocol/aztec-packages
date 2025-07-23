import type { Fr } from '@aztec/foundation/fields';
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
      mempoolSize: number;
      newTxs: TxHash[];
    }
  | {
      event: typeof EvictionEvent.CHAIN_PRUNED;
      prunedBlockHashes: Array<Fr>;
    }
  | {
      event: typeof EvictionEvent.BLOCK_MINED;
      block: BlockHeader;
      newNullifiers: Set<string>;
      feePayers: Set<string>;
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
 * Operations that eviction strategies can perform on the pool
 */
export interface TxPoolOperations {
  getTxByHash(txHash: TxHash): Promise<Tx | undefined>;
  getTxSize(txHash: TxHash): Promise<number>;
  getPendingTxHashes(): Promise<TxHash[]>;
  getTxReferencingBlock(blockHash: Fr): Promise<TxHash[]>;
  deleteTxs(txHashes: TxHash[]): Promise<void>;
  isEvictable(txHash: TxHash): boolean;
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
