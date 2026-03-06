import { createLogger } from '@aztec/foundation/log';

import type { EvictionConfig, EvictionContext, EvictionResult, EvictionRule, PoolOperations } from './interfaces.js';
import { EvictionEvent } from './interfaces.js';

/**
 * Eviction rule that removes low-priority transactions when the pool exceeds configured limits.
 * Triggers on TXS_ADDED and CHAIN_PRUNED events.
 */
export class LowPriorityEvictionRule implements EvictionRule {
  public readonly name = 'LowPriorityEviction';

  private log = createLogger('p2p:tx_pool_v2:low_priority_eviction_rule');
  private maxPoolSize: number;

  constructor(config: { maxPoolSize: number }) {
    this.maxPoolSize = config.maxPoolSize;
  }

  async evict(context: EvictionContext, pool: PoolOperations): Promise<EvictionResult> {
    if (context.event !== EvictionEvent.TXS_ADDED && context.event !== EvictionEvent.CHAIN_PRUNED) {
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

      this.log.info(`Evicting low priority txs. Pending tx count above limit: ${currentTxCount} > ${this.maxPoolSize}`);
      const numberToEvict = currentTxCount - this.maxPoolSize;
      const txsToEvict = pool.getLowestPriorityPending(numberToEvict);

      if (txsToEvict.length > 0) {
        if (context.event === EvictionEvent.TXS_ADDED) {
          const toEvictSet = new Set(txsToEvict);
          const numNewTxsEvicted = context.newTxHashes.filter(newTxHash => toEvictSet.has(newTxHash)).length;
          this.log.info(`Evicted ${txsToEvict.length} low priority txs, including ${numNewTxsEvicted} newly added txs`);
        } else {
          this.log.info(`Evicted ${txsToEvict.length} low priority txs after chain prune`);
        }
        await pool.deleteTxs(txsToEvict, this.name);
      }

      this.log.debug(`Evicted ${txsToEvict.length} low priority txs`, {
        txHashes: txsToEvict,
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

  updateConfig(config: EvictionConfig): void {
    if (config.maxPendingTxCount !== undefined) {
      this.maxPoolSize = config.maxPendingTxCount;
    }
  }
}
