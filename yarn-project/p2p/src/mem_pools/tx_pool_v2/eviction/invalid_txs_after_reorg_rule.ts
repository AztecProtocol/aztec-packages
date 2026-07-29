import { createLogger } from '@aztec/foundation/log';
import { BlockHash } from '@aztec/stdlib/block';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import type { EvictionContext, EvictionResult, EvictionRule, PoolOperations } from './interfaces.js';
import { EvictionEvent } from './interfaces.js';

/**
 * Eviction rule that removes invalid transactions after a blockchain reorganization.
 * Only triggers on CHAIN_PRUNED events.
 *
 * Eviction criteria includes:
 * - Transactions that reference pruned block hashes (invalid by definition)
 */
export class InvalidTxsAfterReorgRule implements EvictionRule {
  public readonly name = 'InvalidTxsAfterReorg';

  private log = createLogger('p2p:tx_pool_v2:invalid_txs_after_reorg_rule');

  constructor(private worldState: WorldStateSynchronizer) {}

  async evict(context: EvictionContext, pool: PoolOperations): Promise<EvictionResult> {
    if (context.event !== EvictionEvent.CHAIN_PRUNED) {
      return {
        reason: 'reorg_invalid_txs',
        success: true,
        txsEvicted: [],
      };
    }

    try {
      const pendingTxs = pool.getPendingTxs();

      // Deduplicate block hashes to reduce redundant DB lookups
      const uniqueBlockHashes = new Map<string, BlockHash>();
      const txsByBlockHash = new Map<string, string[]>();

      for (const meta of pendingTxs) {
        const blockHashStr = meta.anchorBlockHeaderHash;
        if (!txsByBlockHash.has(blockHashStr)) {
          txsByBlockHash.set(blockHashStr, []);
          uniqueBlockHashes.set(blockHashStr, BlockHash.fromString(blockHashStr));
        }
        txsByBlockHash.get(blockHashStr)!.push(meta.txHash);
      }

      // Sync without a block number to ensure the world state processes the prune event.
      await this.worldState.syncImmediate();
      const db = this.worldState.getSnapshot(context.blockNumber);

      // Check which blocks exist in the archive
      const blockHashArray = Array.from(uniqueBlockHashes.values());
      const blocksFromDb = await db.findLeafIndices(MerkleTreeId.ARCHIVE, blockHashArray);

      // Build set of pruned block hashes
      const prunedBlockHashes = new Set<string>();
      let i = 0;
      for (const [blockHashStr] of uniqueBlockHashes) {
        if (blocksFromDb[i] === undefined) {
          prunedBlockHashes.add(blockHashStr);
        }
        i++;
      }

      // Identify txs whose anchor block was pruned
      const txsToEvict: string[] = [];
      for (const [blockHashStr, txHashes] of txsByBlockHash) {
        if (prunedBlockHashes.has(blockHashStr)) {
          txsToEvict.push(...txHashes);
        }
      }

      if (txsToEvict.length > 0) {
        this.log.info(`Evicting ${txsToEvict.length} txs from pool referencing pruned blocks`, { txsToEvict });
        await pool.deleteTxs(txsToEvict, this.name);
      }

      const keptCount = pendingTxs.length - txsToEvict.length;
      if (keptCount > 0) {
        this.log.debug(`Kept ${keptCount} txs that did not reference pruned blocks`);
      }

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
