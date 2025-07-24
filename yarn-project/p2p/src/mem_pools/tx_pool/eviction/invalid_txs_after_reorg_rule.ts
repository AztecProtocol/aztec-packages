import { createLogger } from '@aztec/foundation/log';

import type { EvictionContext, EvictionResult, EvictionRule, TxPoolOperations } from './eviction_strategy.js';

/**
 * Eviction rule that removes invalid transactions after a blockchain reorganization.
 * Only triggers on CHAIN_PRUNED events.
 *
 * Eviction criteria includes:
 * - Transactions that reference pruned block hashes (invalid by definition)
 */
export class InvalidTxsAfterReorgRule implements EvictionRule {
  public readonly name = 'InvalidTxsAfterReorg';

  private log = createLogger('p2p:mempool:tx_pool:invalid_txs_after_reorg_rule');

  async evict(context: EvictionContext, txPool: TxPoolOperations): Promise<EvictionResult> {
    if (context.event !== 'chain_pruned') {
      return {
        reason: 'reorg_invalid_txs',
        success: true,
        txsEvicted: [],
      };
    }

    if (!context.prunedBlockHashes || context.prunedBlockHashes.length === 0) {
      return {
        reason: 'reorg_invalid_txs',
        success: true,
        txsEvicted: [],
      };
    }

    try {
      // Efficiently get all transactions that reference the pruned block hashes
      // These transactions are invalid by definition since they reference pruned blocks
      const candidateTxs = await txPool.getTxsReferencingBlocks(context.prunedBlockHashes);
      const txsToEvict = candidateTxs.filter(({ isEvictable }) => isEvictable).map(({ txHash }) => txHash);

      if (txsToEvict.length > 0) {
        this.log.verbose(`Evicting ${txsToEvict.length} txs from pool due to referencing pruned blocks`);
        await txPool.deleteTxs(txsToEvict);
      }

      const skippedCount = candidateTxs.length - txsToEvict.length;
      if (skippedCount > 0) {
        this.log.verbose(`Skipped ${skippedCount} non-evictable txs that reference pruned blocks`);
      }

      this.log.debug(`Evicted ${txsToEvict.length} invalid txs after reorg`);

      return {
        reason: 'reorg_invalid_txs',
        success: true,
        txsEvicted: txsToEvict,
      };
    } catch (err) {
      this.log.error('Failed to evict invalid transactions after reorg', { err });
      return {
        reason: 'reorg_invalid_txs',
        success: false,
        txsEvicted: [],
        error: new Error('Failed to evict invalid txs after reorg', { cause: err }),
      };
    }
  }
}
