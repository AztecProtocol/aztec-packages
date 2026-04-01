import { findIndexInSortedArray, insertIntoSortedArray } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { TxHash } from '@aztec/stdlib/tx';

import type { TxPoolOptions } from '../tx_pool.js';
import {
  type EvictionContext,
  EvictionEvent,
  type EvictionResult,
  type EvictionRule,
  type TxPoolOperations,
} from './eviction_strategy.js';

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

  public constructor(private worldState: WorldStateSynchronizer) {}

  async evict(context: EvictionContext, txPool: TxPoolOperations): Promise<EvictionResult> {
    if (context.event !== EvictionEvent.CHAIN_PRUNED) {
      return {
        reason: 'reorg_invalid_txs',
        success: true,
        txsEvicted: [],
      };
    }

    try {
      const candidateTxs = (await txPool.getPendingTxInfos()).filter(({ isEvictable }) => isEvictable);

      // Deduplicate block hashes to reduce redundant DB lookups (many txs may share the same blockHash).
      const uniqueBlockHashes: Fr[] = [];
      candidateTxs.forEach(({ blockHash }) => {
        insertIntoSortedArray(uniqueBlockHashes, blockHash, Fr.cmp, false);
      });

      // Ensure world state is synced to this block before accessing the snapshot.
      await this.worldState.syncImmediate(context.blockNumber);
      const db = this.worldState.getSnapshot(context.blockNumber);
      const blocksFromDb = await db.findLeafIndices(MerkleTreeId.ARCHIVE, uniqueBlockHashes);

      // Identify txs whose blockHash is not found in the archive (pruned)
      const txsToEvict: TxHash[] = [];
      for (const tx of candidateTxs) {
        const idx = findIndexInSortedArray(uniqueBlockHashes, tx.blockHash, Fr.cmp);
        const blockPruned = idx === -1 || blocksFromDb[idx] === undefined;
        if (blockPruned) {
          txsToEvict.push(tx.txHash);
        }
      }

      if (txsToEvict.length > 0) {
        this.log.verbose(`Evicting ${txsToEvict.length} txs from pool due to referencing pruned blocks`);
        await txPool.deleteTxs(txsToEvict);
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

  updateConfig(_config: TxPoolOptions): void {}
}
