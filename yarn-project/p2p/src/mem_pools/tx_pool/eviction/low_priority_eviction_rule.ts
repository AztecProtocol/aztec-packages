import { createLogger } from '@aztec/foundation/log';
import type { TxHash } from '@aztec/stdlib/tx';

import type { EvictionContext, EvictionResult, EvictionRule, TxPoolOperations } from './eviction_strategy.js';

export interface LowPriorityEvictionConfig {
  /** Maximum pool size in bytes before eviction kicks in */
  maxPoolSize: number;

  /** Factor by which pool can grow above maxPoolSize before eviction starts */
  overflowFactor: number;
}

/**
 * Eviction rule that removes low-priority transactions when the mempool size exceeds configured limits.
 * Only triggers on TXS_ADDED events and respects non-evictable transactions.
 */
export class LowPriorityEvictionRule implements EvictionRule {
  public readonly name = 'LowPriorityEviction';

  private log = createLogger('p2p:mempool:tx_pool:low_priority_eviction_rule');

  constructor(private config: LowPriorityEvictionConfig) {}

  public async evict(context: EvictionContext, txPool: TxPoolOperations): Promise<EvictionResult> {
    if (context.event !== 'txs_added') {
      return {
        reason: 'low_priority',
        success: true,
        txsEvicted: [],
      };
    }

    if (this.config.maxPoolSize === 0) {
      return {
        reason: 'low_priority',
        success: true,
        txsEvicted: [],
      };
    }

    try {
      const thresholdSize = this.config.maxPoolSize * this.config.overflowFactor;

      if (context.mempoolSize <= thresholdSize) {
        this.log.trace(`Not evicting low priority txs. Mempool below limit ${context.mempoolSize} <= ${thresholdSize}`);
        return {
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        };
      }

      this.log.verbose(`Evicting low priority txs. Mempool above limit: ${context.mempoolSize} > ${thresholdSize}`);
      const txsToEvict: TxHash[] = [];
      let currentSize = context.mempoolSize;
      const targetSize = this.config.maxPoolSize;

      const pendingTxs = await txPool.getPendingTxs();

      for (const { txHash, size: txSize, isEvictable } of pendingTxs) {
        if (!isEvictable) {
          continue;
        }

        this.log.verbose(`Evicting tx ${txHash} from pool due to low priority to satisfy max tx size limit`, {
          txHash: txHash.toString(),
          txSize,
          currentSize,
          targetSize,
        });

        txsToEvict.push(txHash);
        currentSize -= txSize;

        if (currentSize <= targetSize) {
          break;
        }
      }

      if (txsToEvict.length > 0) {
        await txPool.deleteTxs(txsToEvict, true);
      }

      const numNewTxsEvicted = context.newTxs.filter(newTxHash =>
        txsToEvict.some(evictedTx => evictedTx.equals(newTxHash)),
      ).length;

      this.log.verbose(`Evicted ${txsToEvict.length} low priority txs, including ${numNewTxsEvicted} newly added txs`, {
        txsEvicted: txsToEvict,
      });

      return {
        reason: 'low_priority',
        success: true,
        txsEvicted: txsToEvict,
      };
    } catch (err) {
      this.log.error('Failed to evict low priority transactions', { err });
      return {
        reason: 'low_priority',
        success: false,
        txsEvicted: [],
        error: new Error('Failed to evict low priority txs', { cause: err }),
      };
    }
  }

  /**
   * Updates the configuration for this eviction rule
   */
  updateConfig(config: Partial<LowPriorityEvictionConfig>): void {
    if (config.maxPoolSize !== undefined) {
      this.config.maxPoolSize = config.maxPoolSize;
    }
    if (config.overflowFactor !== undefined) {
      this.config.overflowFactor = config.overflowFactor;
    }
  }

  /**
   * Gets the current configuration
   */
  getConfig(): LowPriorityEvictionConfig {
    return { ...this.config };
  }
}
