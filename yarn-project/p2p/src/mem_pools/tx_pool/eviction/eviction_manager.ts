import { findIndexInSortedArray, insertIntoSortedArray } from '@aztec/foundation/array';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';

import type { TxPoolOptions } from '../tx_pool.js';
import {
  type EvictionContext,
  EvictionEvent,
  type EvictionRule,
  type PreAddEvictionResult,
  type PreAddEvictionRule,
  type PreAddPoolAccess,
  type TxPoolOperations,
} from './eviction_strategy.js';

export class EvictionManager {
  private rules: EvictionRule[] = [];

  /** Pre-add eviction rules (run inside addTxs transaction) */
  private preAddRules: PreAddEvictionRule[] = [];

  constructor(
    private txPool: TxPoolOperations,
    private log = createLogger('p2p:mempool:tx_pool:eviction_manager'),
  ) {}

  public async evictAfterNewTxs(newTxs: TxHash[], feePayers: AztecAddress[]): Promise<void> {
    const ctx: EvictionContext = {
      event: EvictionEvent.TXS_ADDED,
      newTxs,
      feePayers,
    };
    await this.runEvictionRules(ctx);
  }

  public async evictAfterNewBlock(
    block: BlockHeader,
    newNullifiers: Fr[],
    minedFeePayers: AztecAddress[],
  ): Promise<void> {
    const ctx: EvictionContext = {
      event: EvictionEvent.BLOCK_MINED,
      block,
      newNullifiers,
      feePayers: minedFeePayers,
    };

    await this.runEvictionRules(ctx);
  }

  public async evictAfterChainPrune(blockNumber: BlockNumber): Promise<void> {
    const ctx: EvictionContext = {
      event: EvictionEvent.CHAIN_PRUNED,
      blockNumber,
    };
    await this.runEvictionRules(ctx);
  }

  /**
   * Runs pre-add eviction rules to determine if an incoming tx should be added
   * and which existing txs should be evicted.
   * Called from inside the addTxs database transaction for atomicity.
   *
   * @param tx - The incoming transaction
   * @param poolAccess - Read-only access to pool state
   * @returns Combined result from all pre-add rules
   */
  public async runPreAddRules(tx: Tx, poolAccess: PreAddPoolAccess): Promise<PreAddEvictionResult> {
    const allTxHashesToEvict: TxHash[] = [];
    const cmpTxHash = (a: TxHash, b: TxHash) => Fr.cmp(a.hash, b.hash);

    for (const rule of this.preAddRules) {
      try {
        const result = await rule.check(tx, poolAccess);

        if (result.shouldReject) {
          return { shouldReject: true, txHashesToEvict: [], reason: result.reason };
        }

        for (const txHashToEvict of result.txHashesToEvict) {
          // Only add if not already present (dedup)
          if (findIndexInSortedArray(allTxHashesToEvict, txHashToEvict, cmpTxHash) === -1) {
            insertIntoSortedArray(allTxHashesToEvict, txHashToEvict, cmpTxHash);
          }
        }
      } catch (err) {
        this.log.warn(`Pre-add eviction rule ${rule.name} unexpected error: ${String(err)}`, {
          err,
          preAddRule: rule.name,
        });
        // On error, reject the tx to be safe
        return { shouldReject: true, txHashesToEvict: [], reason: `rule error: ${String(err)}` };
      }
    }

    return { shouldReject: false, txHashesToEvict: allTxHashesToEvict };
  }

  public registerRule(rule: EvictionRule) {
    this.rules.push(rule);
  }

  public registerPreAddRule(rule: PreAddEvictionRule) {
    this.preAddRules.push(rule);
  }

  public updateConfig(config: TxPoolOptions): void {
    for (const rule of this.rules) {
      rule.updateConfig(config);
    }
    for (const rule of this.preAddRules) {
      rule.updateConfig?.(config);
    }
  }

  private async runEvictionRules(ctx: EvictionContext): Promise<void> {
    for (const rule of this.rules) {
      try {
        await rule.evict(ctx, this.txPool);
      } catch (err) {
        this.log.warn(`Eviction rule ${rule.name} unexpected error: ${String(err)}`, {
          err,
          evictionRule: rule.name,
          evictionEvent: ctx.event,
        });
      }
    }
  }
}
