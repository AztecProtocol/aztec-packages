import { createLogger } from '@aztec/foundation/log';
import type { TxHash } from '@aztec/stdlib/tx';

import type { EvictionContext, EvictionResult, EvictionRule, TxPoolOperations } from './eviction_strategy.js';

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

  private log = createLogger('p2p:mempool:tx_pool:invalid_txs_after_mining_rule');

  async evict(context: EvictionContext, txPool: TxPoolOperations): Promise<EvictionResult> {
    if (context.event !== 'block_mined') {
      return {
        reason: 'block_mined_invalid_txs',
        success: true,
        txsEvicted: [],
      };
    }

    if (!context.block || !context.newNullifiers) {
      this.log.warn('Invalid context for block mined eviction', { context });
      return {
        reason: 'block_mined_invalid_txs',
        success: false,
        txsEvicted: [],
        error: new Error('Invalid block mined context'),
      };
    }

    try {
      const { timestamp } = context.block.globalVariables;

      const txsToEvict: TxHash[] = [];
      const pendingTxs = await txPool.getPendingTxs();
      const minedNullifiers = new Set(context.newNullifiers.map(n => n.toString()));

      for (const { txHash, isEvictable } of pendingTxs) {
        const tx = await txPool.getTxByHash(txHash);
        if (!tx) {
          continue;
        }

        // Skip non-evictable transactions
        if (!isEvictable) {
          continue;
        }

        // Evict pending txs that share nullifiers with mined txs
        const txNullifiers = tx.data.getNonEmptyNullifiers();
        if (txNullifiers.some(nullifier => minedNullifiers.has(nullifier.toString()))) {
          this.log.verbose(`Evicting tx ${txHash} from pool due to a duplicate nullifier with a mined tx`);
          txsToEvict.push(txHash);
          continue;
        }

        // Evict pending txs with an expiration timestamp less than or equal to the mined block timestamp
        const includeByTimestamp = tx.data.includeByTimestamp;
        if (includeByTimestamp <= timestamp) {
          this.log.verbose(
            `Evicting tx ${txHash} from pool due to the tx being expired (includeByTimestamp: ${includeByTimestamp}, mined block timestamp: ${timestamp})`,
          );
          txsToEvict.push(txHash);
          continue;
        }
      }

      if (txsToEvict.length > 0) {
        await txPool.deleteTxs(txsToEvict, true);
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
