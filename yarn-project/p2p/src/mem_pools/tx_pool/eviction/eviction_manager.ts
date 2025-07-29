import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHeader, TxHash } from '@aztec/stdlib/tx';

import { type EvictionContext, EvictionEvent, type EvictionRule, type TxPoolOperations } from './eviction_strategy.js';

export class EvictionManager {
  private rules: EvictionRule[] = [];

  constructor(
    private txPool: TxPoolOperations,
    private log = createLogger('p2p:mempool:tx_pool:eviction_manager'),
  ) {}

  public async evictAfterNewTxs(newTxs: TxHash[], mempoolSize: number): Promise<void> {
    const ctx: EvictionContext = {
      event: EvictionEvent.TXS_ADDED,
      mempoolSize,
      newTxs,
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
      minedFeePayers,
    };

    await this.runEvictionRules(ctx);
  }

  public async evictAfterChainPrune(block: BlockHeader): Promise<void> {
    const ctx: EvictionContext = {
      event: EvictionEvent.CHAIN_PRUNED,
      block,
    };
    await this.runEvictionRules(ctx);
  }

  public registerRule(rule: EvictionRule) {
    this.rules.push(rule);
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
