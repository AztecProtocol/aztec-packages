import { createLogger } from '@aztec/foundation/log';
import type { ReadonlyWorldStateAccess } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { TxHash } from '@aztec/stdlib/tx';

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

  public constructor(private worldState: ReadonlyWorldStateAccess) {}

  async evict(context: EvictionContext, txPool: TxPoolOperations): Promise<EvictionResult> {
    if (context.event !== 'chain_pruned') {
      return {
        reason: 'reorg_invalid_txs',
        success: true,
        txsEvicted: [],
      };
    }

    try {
      const candidateTxs = (await txPool.getPendingTxs()).filter(({ isEvictable }) => isEvictable);
      const db = this.worldState.getSnapshot(context.block.getBlockNumber());
      const results = await db.findLeafIndices(
        MerkleTreeId.ARCHIVE,
        candidateTxs.map(({ blockHash }) => blockHash),
      );
      const txsToEvict: TxHash[] = [];
      for (let i = 0; i < candidateTxs.length; i++) {
        if (results[i] === undefined) {
          txsToEvict.push(candidateTxs[i].txHash);
        }
      }

      if (txsToEvict.length > 0) {
        this.log.verbose(`Evicting ${txsToEvict.length} txs from pool due to referencing pruned blocks`);
        await txPool.deleteTxs(txsToEvict, true);
      }

      const keptCount = candidateTxs.length - txsToEvict.length;
      if (keptCount > 0) {
        this.log.verbose(`Kept ${keptCount} txs that did not reference pruned blocks`);
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
