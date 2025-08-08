import { createLogger } from '@aztec/foundation/log';
import type { TxHash } from '@aztec/stdlib/tx';

import type { EvictionContext, EvictionResult, EvictionRule, TxPoolOperations } from './eviction_strategy.js';

export interface LowPriorityEvictionConfig {
  /** Maximum number of pending transactions before eviction kicks in */
  maxPoolSize: number;
}

/**
 * Eviction rule that removes low-priority transactions when the number of pending transactions exceeds configured limits.
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
      const currentTxCount = await txPool.getPendingTxCount();
      const maxCount = this.config.maxPoolSize;

      if (currentTxCount <= maxCount) {
        this.log.trace(`Not evicting low priority txs. Pending tx count below limit ${currentTxCount} <= ${maxCount}`);
        return {
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        };
      }

      this.log.verbose(`Evicting low priority txs. Pending tx count above limit: ${currentTxCount} > ${maxCount}`);
      const numberToEvict = currentTxCount - maxCount;
      const txsToEvict: TxHash[] = await txPool.getLowestPriorityEvictable(numberToEvict);

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
  }

  /**
   * Gets the current configuration
   */
  getConfig(): LowPriorityEvictionConfig {
    return { ...this.config };
  }
}
