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
  type PrePendingFilter,
  type PrePendingFilterContext,
  type PrePendingFilterResult,
  type TxPoolOperations,
  type TxValidationFields,
} from './eviction_strategy.js';

export class EvictionManager {
  private rules: EvictionRule[] = [];

  /** Pre-add eviction rules (run inside addTxs transaction) */
  private preAddRules: PreAddEvictionRule[] = [];

  /** Pre-pending filters (run before restoring txs to pending after reorg/unprotect) */
  private prePendingFilters: PrePendingFilter[] = [];

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

        if (result.shouldIgnore) {
          return { shouldIgnore: true, txHashesToEvict: [], reason: result.reason };
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
        // On error, ignore the tx to be safe
        return { shouldIgnore: true, txHashesToEvict: [], reason: `rule error: ${String(err)}` };
      }
    }

    return { shouldIgnore: false, txHashesToEvict: allTxHashesToEvict };
  }

  public registerRule(rule: EvictionRule) {
    this.rules.push(rule);
  }

  public registerPreAddRule(rule: PreAddEvictionRule) {
    this.preAddRules.push(rule);
  }

  public registerPrePendingFilter(filter: PrePendingFilter) {
    this.prePendingFilters.push(filter);
  }

  /**
   * Filters transactions before they are restored to pending state.
   * Used during reorgs (un-mining) and slot transitions (unprotecting) to avoid
   * adding transactions to pending indices only to immediately remove them.
   *
   * @param txs - Transaction metadata to validate
   * @param ctx - Context about why we're filtering
   * @returns Result with valid and invalid tx hashes
   */
  public async filterValidForPending(
    txs: TxValidationFields[],
    ctx: PrePendingFilterContext,
  ): Promise<PrePendingFilterResult> {
    if (txs.length === 0) {
      return { valid: [], invalid: [] };
    }

    // Collect all invalid tx hashes from all filters
    const allInvalid = new Set<string>();

    for (const filter of this.prePendingFilters) {
      try {
        const invalidFromFilter = await filter.filterInvalid(txs, ctx);
        for (const txHash of invalidFromFilter) {
          allInvalid.add(txHash);
        }
      } catch (err) {
        this.log.warn(`Pre-pending filter ${filter.name} unexpected error: ${String(err)}`, {
          err,
          filterName: filter.name,
          event: ctx.event,
        });
        // On error, don't filter out any txs - let them go to pending and be evicted later if needed
      }
    }

    // Partition into valid and invalid
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const tx of txs) {
      if (allInvalid.has(tx.txHash)) {
        invalid.push(tx.txHash);
      } else {
        valid.push(tx.txHash);
      }
    }

    if (invalid.length > 0) {
      this.log.verbose(`Pre-pending filter: ${invalid.length} invalid, ${valid.length} valid`, {
        event: ctx.event,
        invalidCount: invalid.length,
        validCount: valid.length,
      });
    }

    return { valid, invalid };
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
