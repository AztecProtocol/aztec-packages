import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { TxMetaData } from '../tx_metadata.js';
import {
  type EvictionConfig,
  type EvictionContext,
  EvictionEvent,
  type EvictionRule,
  type PoolOperations,
  type PreAddPoolAccess,
  type PreAddResult,
  type PreAddRule,
} from './interfaces.js';

/**
 * Manages eviction rules for the transaction pool.
 * Coordinates pre-add rules (run during addPendingTxs) and post-event rules (run after events).
 */
export class EvictionManager {
  private preAddRules: PreAddRule[] = [];
  private postEventRules: EvictionRule[] = [];

  constructor(
    private pool: PoolOperations,
    private log: Logger,
  ) {}

  /**
   * Registers a pre-add rule that runs during transaction addition.
   */
  registerPreAddRule(rule: PreAddRule): void {
    this.preAddRules.push(rule);
    this.log.debug(`Registered pre-add rule: ${rule.name}`);
  }

  /**
   * Registers a post-event eviction rule that runs after events.
   */
  registerRule(rule: EvictionRule): void {
    this.postEventRules.push(rule);
    this.log.debug(`Registered eviction rule: ${rule.name}`);
  }

  /**
   * Runs all pre-add rules for an incoming transaction.
   * Returns combined result of all rules.
   */
  async runPreAddRules(incomingMeta: TxMetaData, poolAccess: PreAddPoolAccess): Promise<PreAddResult> {
    const allTxHashesToEvict: string[] = [];

    for (const rule of this.preAddRules) {
      try {
        const result = await rule.check(incomingMeta, poolAccess);

        if (result.shouldIgnore) {
          return result;
        }

        // Collect txs to evict from all rules
        for (const txHash of result.txHashesToEvict) {
          if (!allTxHashesToEvict.includes(txHash)) {
            allTxHashesToEvict.push(txHash);
          }
        }
      } catch (err) {
        this.log.error(`Error running pre-add rule ${rule.name}`, { err, txHash: incomingMeta.txHash });
        // On error, ignore the transaction to be safe
        return {
          shouldIgnore: true,
          txHashesToEvict: [],
          reason: `pre-add rule ${rule.name} error: ${err}`,
        };
      }
    }

    return {
      shouldIgnore: false,
      txHashesToEvict: allTxHashesToEvict,
    };
  }

  /**
   * Runs post-event eviction after new transactions are added.
   */
  async evictAfterNewTxs(newTxHashes: string[], feePayers: string[]): Promise<void> {
    const context: EvictionContext = {
      event: EvictionEvent.TXS_ADDED,
      newTxHashes,
      feePayers,
    };

    await this.runPostEventRules(context);
  }

  /**
   * Runs post-event eviction after a block is mined.
   */
  async evictAfterNewBlock(block: BlockHeader, newNullifiers: string[], feePayers: string[]): Promise<void> {
    const context: EvictionContext = {
      event: EvictionEvent.BLOCK_MINED,
      block,
      newNullifiers,
      feePayers,
    };

    await this.runPostEventRules(context);
  }

  /**
   * Runs post-event eviction after a chain prune (reorg).
   */
  async evictAfterChainPrune(blockNumber: BlockNumber): Promise<void> {
    const context: EvictionContext = {
      event: EvictionEvent.CHAIN_PRUNED,
      blockNumber,
    };

    await this.runPostEventRules(context);
  }

  /**
   * Updates configuration for all rules.
   */
  updateConfig(config: EvictionConfig): void {
    for (const rule of this.preAddRules) {
      rule.updateConfig?.(config);
    }
    for (const rule of this.postEventRules) {
      rule.updateConfig?.(config);
    }
  }

  private async runPostEventRules(context: EvictionContext): Promise<void> {
    for (const rule of this.postEventRules) {
      try {
        const result = await rule.evict(context, this.pool);
        if (!result.success) {
          this.log.warn(`Eviction rule ${rule.name} failed`, { error: result.error });
        }
      } catch (err) {
        this.log.error(`Error running eviction rule ${rule.name}`, { err });
      }
    }
  }
}
