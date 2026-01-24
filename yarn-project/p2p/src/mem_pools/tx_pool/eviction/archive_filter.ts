import { insertIntoSortedArray } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import type { PrePendingFilter, PrePendingFilterContext, TxValidationFields } from './eviction_strategy.js';

/**
 * Pre-pending filter that validates transaction anchor block hashes.
 * Filters out transactions whose anchor block has been pruned from the archive.
 */
export class ArchiveFilter implements PrePendingFilter {
  public readonly name = 'ArchiveFilter';

  private log = createLogger('p2p:mempool:tx_pool:archive_filter');

  constructor(private worldState: WorldStateSynchronizer) {}

  async filterInvalid(txs: TxValidationFields[], ctx: PrePendingFilterContext): Promise<Set<string>> {
    const invalid = new Set<string>();

    // Only validate on chain prune - we need to check if anchor blocks are still valid
    if (ctx.event !== 'CHAIN_PRUNED') {
      return invalid;
    }

    if (txs.length === 0) {
      return invalid;
    }

    // Deduplicate block hashes to reduce redundant DB lookups
    const uniqueBlockHashes: Fr[] = [];
    const txsByBlockHash = new Map<string, TxValidationFields[]>();

    for (const tx of txs) {
      const blockHash = Fr.fromHexString(tx.anchorBlockHeaderHash as `0x${string}`);
      const blockHashStr = blockHash.toString();

      if (!txsByBlockHash.has(blockHashStr)) {
        txsByBlockHash.set(blockHashStr, []);
        insertIntoSortedArray(uniqueBlockHashes, blockHash, Fr.cmp, false);
      }
      txsByBlockHash.get(blockHashStr)!.push(tx);
    }

    // Sync world state and check which blocks exist in the archive
    await this.worldState.syncImmediate(ctx.blockNumber);
    const db = this.worldState.getSnapshot(ctx.blockNumber);
    const blocksFromDb = await db.findLeafIndices(MerkleTreeId.ARCHIVE, uniqueBlockHashes);

    // Mark txs as invalid if their anchor block was pruned
    for (let i = 0; i < uniqueBlockHashes.length; i++) {
      const blockHashStr = uniqueBlockHashes[i].toString();
      const blockPruned = blocksFromDb[i] === undefined;

      if (blockPruned) {
        const txsForBlock = txsByBlockHash.get(blockHashStr) || [];
        for (const tx of txsForBlock) {
          invalid.add(tx.txHash);
        }
      }
    }

    if (invalid.size > 0) {
      this.log.verbose(`Filtered ${invalid.size} txs with pruned anchor blocks`);
    }

    return invalid;
  }
}
