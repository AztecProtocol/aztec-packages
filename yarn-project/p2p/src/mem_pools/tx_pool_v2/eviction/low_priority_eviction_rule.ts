import { createLogger } from '@aztec/foundation/log';

import type { EvictionConfig, EvictionContext, EvictionResult, EvictionRule, PoolOperations } from './interfaces.js';
import { EvictionEvent } from './interfaces.js';

/**
 * Eviction rule that removes low-priority transactions when the pool exceeds configured limits.
 * Only triggers on TXS_ADDED events.
 */
export class LowPriorityEvictionRule implements EvictionRule {
  public readonly name = 'LowPriorityEviction';

  private log = createLogger('p2p:tx_pool_v2:low_priority_eviction_rule');
  private maxPoolSize: number;

  constructor(config: { maxPoolSize: number }) {
    this.maxPoolSize = config.maxPoolSize;
  }

  async evict(context: EvictionContext, pool: PoolOperations): Promise<EvictionResult> {
    if (context.event !== EvictionEvent.TXS_ADDED) {
      return {
        reason: 'low_priority',
        success: true,
        txsEvicted: [],
      };
    }

    if (this.maxPoolSize === 0) {
      return {
        reason: 'low_priority',
        success: true,
        txsEvicted: [],
      };
    }

    try {
      const currentTxCount = pool.getPendingTxCount();

      if (currentTxCount <= this.maxPoolSize) {
        this.log.trace(
          `Not evicting low priority txs. Pending tx count below limit ${currentTxCount} <= ${this.maxPoolSize}`,
        );
        return {
          reason: 'low_priority',
          success: true,
          txsEvicted: [],
        };
      }

      this.log.verbose(
        `Evicting low priority txs. Pending tx count above limit: ${currentTxCount} > ${this.maxPoolSize}`,
      );
      const numberToEvict = currentTxCount - this.maxPoolSize;
      const txsToEvict = pool.getLowestPriorityPending(numberToEvict);

      if (txsToEvict.length > 0) {
        await pool.deleteTxs(txsToEvict);
      }

      const numNewTxsEvicted = context.newTxHashes.filter(newTxHash => txsToEvict.includes(newTxHash)).length;

      this.log.verbose(`Evicted ${txsToEvict.length} low priority txs, including ${numNewTxsEvicted} newly added txs`);

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

  updateConfig(config: EvictionConfig): void {
    if (config.maxPendingTxCount !== undefined) {
      this.maxPoolSize = config.maxPendingTxCount;
    }
  }
}
