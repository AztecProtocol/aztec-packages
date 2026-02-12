import { createLogger } from '@aztec/foundation/log';

import type { TxMetaData } from '../tx_metadata.js';
import type { EvictionConfig, PreAddPoolAccess, PreAddResult, PreAddRule } from './interfaces.js';

/**
 * Pre-add rule that checks if the pool is at capacity and handles low-priority eviction.
 *
 * When the pool is at capacity:
 * - If incoming tx has higher priority than the lowest priority tx, evict the lowest and accept incoming
 * - If incoming tx has equal or lower priority than the lowest, ignore incoming (it would be evicted anyway)
 */
export class LowPriorityPreAddRule implements PreAddRule {
  public readonly name = 'LowPriorityPreAdd';

  private log = createLogger('p2p:tx_pool_v2:low_priority_pre_add_rule');
  private maxPoolSize: number;

  constructor(config: { maxPoolSize: number }) {
    this.maxPoolSize = config.maxPoolSize;
  }

  check(incomingMeta: TxMetaData, poolAccess: PreAddPoolAccess): Promise<PreAddResult> {
    // Skip if max pool size is disabled (0 = unlimited)
    if (this.maxPoolSize === 0) {
      return Promise.resolve({ shouldIgnore: false, txHashesToEvict: [] });
    }

    const currentCount = poolAccess.getPendingTxCount();

    // If pool is not at capacity, accept the tx
    if (currentCount < this.maxPoolSize) {
      return Promise.resolve({ shouldIgnore: false, txHashesToEvict: [] });
    }

    // Pool is at capacity - need to compare priorities
    const lowestPriorityMeta = poolAccess.getLowestPriorityPendingTx();
    if (!lowestPriorityMeta) {
      // No pending txs (shouldn't happen if count > 0, but handle gracefully)
      return Promise.resolve({ shouldIgnore: false, txHashesToEvict: [] });
    }

    // If incoming tx has strictly higher priority, evict the lowest priority tx
    if (incomingMeta.priorityFee > lowestPriorityMeta.priorityFee) {
      this.log.debug(
        `Pool at capacity (${currentCount}/${this.maxPoolSize}), evicting ${lowestPriorityMeta.txHash} ` +
          `(priority ${lowestPriorityMeta.priorityFee}) for ${incomingMeta.txHash} (priority ${incomingMeta.priorityFee})`,
      );
      return Promise.resolve({
        shouldIgnore: false,
        txHashesToEvict: [lowestPriorityMeta.txHash],
      });
    }

    // Incoming tx has equal or lower priority - ignore it (it would be evicted anyway)
    this.log.debug(
      `Pool at capacity (${currentCount}/${this.maxPoolSize}), ignoring ${incomingMeta.txHash} ` +
        `(priority ${incomingMeta.priorityFee}) - lower than existing minimum (priority ${lowestPriorityMeta.priorityFee})`,
    );
    return Promise.resolve({
      shouldIgnore: true,
      txHashesToEvict: [],
      reason: `pool at capacity and tx has lower priority than existing transactions`,
    });
  }

  updateConfig(config: EvictionConfig): void {
    if (config.maxPendingTxCount !== undefined) {
      this.maxPoolSize = config.maxPendingTxCount;
    }
  }
}
