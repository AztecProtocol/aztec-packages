import { createLogger } from '@aztec/foundation/log';
import type { Tx } from '@aztec/stdlib/tx';

import { getTxPriorityFee } from '../priority.js';
import type { TxPoolOptions } from '../tx_pool.js';
import type { PreAddEvictionResult, PreAddEvictionRule, PreAddPoolAccess } from './eviction_strategy.js';

/**
 * Pre-add rule that checks if the pool is at capacity and handles low-priority eviction.
 *
 * When the pool is at capacity:
 * - If incoming tx has higher priority than the lowest priority tx, evict the lowest and accept incoming
 * - If incoming tx has equal or lower priority than the lowest, ignore incoming (it would be evicted anyway)
 *
 * This prevents adding transactions that would immediately be evicted due to pool size limits.
 */
export class LowPriorityPreAddRule implements PreAddEvictionRule {
  public readonly name = 'LowPriorityPreAdd';

  private log = createLogger('p2p:mempool:tx_pool:low_priority_pre_add_rule');
  private maxPoolSize: number;

  constructor(config: { maxPoolSize: number }) {
    this.maxPoolSize = config.maxPoolSize;
  }

  async check(tx: Tx, poolAccess: PreAddPoolAccess): Promise<PreAddEvictionResult> {
    // Skip if pool access doesn't support the required methods
    if (!poolAccess.getPendingTxCount || !poolAccess.getLowestPriorityPendingTx) {
      return { shouldIgnore: false, txHashesToEvict: [] };
    }

    // Skip if max pool size is disabled (0 = unlimited)
    if (this.maxPoolSize === 0) {
      return { shouldIgnore: false, txHashesToEvict: [] };
    }

    const currentCount = poolAccess.getPendingTxCount();

    // If pool is not at capacity, accept the tx
    if (currentCount < this.maxPoolSize) {
      return { shouldIgnore: false, txHashesToEvict: [] };
    }

    // Pool is at capacity - need to compare priorities
    const lowestPriorityTx = poolAccess.getLowestPriorityPendingTx();
    if (!lowestPriorityTx) {
      // No pending txs (shouldn't happen if count > 0, but handle gracefully)
      return { shouldIgnore: false, txHashesToEvict: [] };
    }

    const incomingPriority = getTxPriorityFee(tx);
    const incomingTxHash = tx.getTxHash();

    // If incoming tx has strictly higher priority, evict the lowest priority tx
    if (incomingPriority > lowestPriorityTx.priority) {
      this.log.debug(
        `Pool at capacity (${currentCount}/${this.maxPoolSize}), evicting ${lowestPriorityTx.txHash.toString()} ` +
          `(priority ${lowestPriorityTx.priority}) for ${incomingTxHash.toString()} (priority ${incomingPriority})`,
      );
      return {
        shouldIgnore: false,
        txHashesToEvict: [lowestPriorityTx.txHash],
      };
    }

    // Incoming tx has equal or lower priority - ignore it (it would be evicted anyway)
    this.log.debug(
      `Pool at capacity (${currentCount}/${this.maxPoolSize}), ignoring ${incomingTxHash.toString()} ` +
        `(priority ${incomingPriority}) - lower than existing minimum (priority ${lowestPriorityTx.priority})`,
    );
    return {
      shouldIgnore: true,
      txHashesToEvict: [],
      reason: `pool at capacity and tx has lower priority than existing transactions`,
    };
  }

  updateConfig(config: TxPoolOptions): void {
    if (config.maxPendingTxCount !== undefined) {
      this.maxPoolSize = config.maxPendingTxCount;
    }
  }
}
