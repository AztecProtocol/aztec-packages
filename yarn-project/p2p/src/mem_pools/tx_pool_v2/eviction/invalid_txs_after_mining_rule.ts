import { createLogger } from '@aztec/foundation/log';

import type { EvictionContext, EvictionResult, EvictionRule, PoolOperations } from './interfaces.js';
import { EvictionEvent } from './interfaces.js';

/**
 * Eviction rule that removes invalid transactions after a block is mined.
 * Only triggers on BLOCK_MINED events.
 *
 * Eviction criteria includes:
 * - Transactions with nullifiers that are already included in the mined block
 * - Transactions with an expiration timestamp less than or equal to the mined block timestamp
 */
export class InvalidTxsAfterMiningRule implements EvictionRule {
  public readonly name = 'InvalidTxsAfterMining';

  private log = createLogger('p2p:tx_pool_v2:invalid_txs_after_mining_rule');

  async evict(context: EvictionContext, pool: PoolOperations): Promise<EvictionResult> {
    if (context.event !== EvictionEvent.BLOCK_MINED) {
      return {
        reason: 'block_mined_invalid_txs',
        success: true,
        txsEvicted: [],
      };
    }

    try {
      const { timestamp } = context.block.globalVariables;
      const minedNullifiers = new Set(context.newNullifiers);

      const txsToEvict: string[] = [];
      const pendingTxs = pool.getPendingTxs();

      for (const meta of pendingTxs) {
        // Evict pending txs that share nullifiers with mined txs
        if (meta.nullifiers.some(nullifier => minedNullifiers.has(nullifier))) {
          this.log.verbose(`Evicting tx ${meta.txHash} from pool due to a duplicate nullifier with a mined tx`);
          txsToEvict.push(meta.txHash);
          continue;
        }

        // Evict pending txs with an expiration timestamp less than or equal to the mined block timestamp
        if (meta.includeByTimestamp <= timestamp) {
          this.log.verbose(
            `Evicting tx ${meta.txHash} from pool due to the tx being expired (includeByTimestamp: ${meta.includeByTimestamp}, mined block timestamp: ${timestamp})`,
          );
          txsToEvict.push(meta.txHash);
          continue;
        }
      }

      if (txsToEvict.length > 0) {
        await pool.deleteTxs(txsToEvict);
      }

      this.log.debug(`Evicted ${txsToEvict.length} invalid txs after block mined`);

      return {
        reason: 'block_mined_invalid_txs',
        success: true,
        txsEvicted: txsToEvict,
      };
    } catch (err) {
      this.log.error('Failed to evict invalid transactions after mining', { err });
      return {
        reason: 'block_mined_invalid_txs',
        success: false,
        txsEvicted: [],
        error: new Error('Failed to evict invalid txs after mining', { cause: err }),
      };
    }
  }
}
