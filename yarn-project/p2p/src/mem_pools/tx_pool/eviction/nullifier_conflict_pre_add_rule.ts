import { findIndexInSortedArray, insertIntoSortedArray } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { type Tx, TxHash } from '@aztec/stdlib/tx';

import type { PreAddEvictionResult, PreAddEvictionRule, PreAddPoolAccess } from './eviction_strategy.js';

const cmpTxHash = (a: TxHash, b: TxHash) => Fr.cmp(a.hash, b.hash);

/**
 * Pre-add eviction rule that checks for nullifier conflicts between incoming and existing transactions.
 *
 * When an incoming tx shares nullifiers with existing pending txs:
 * - If the incoming tx has strictly higher priority fee, evict all conflicting txs
 * - If any conflicting tx has equal or higher priority fee, reject the incoming tx
 *
 * This prevents nullifier spam attacks where an attacker floods the mempool with
 * transactions spending the same nullifiers.
 */
export class NullifierConflictPreAddRule implements PreAddEvictionRule {
  public readonly name = 'NullifierConflictPreAdd';

  private log = createLogger('p2p:mempool:tx_pool:nullifier_conflict_pre_add_rule');

  /**
   * Check if the incoming transaction conflicts with existing transactions via nullifiers.
   *
   * @param tx - The incoming transaction
   * @param poolAccess - Read-only access to pool state
   * @returns Result with rejection status and txs to evict
   */
  async check(tx: Tx, poolAccess: PreAddPoolAccess): Promise<PreAddEvictionResult> {
    const txHash = tx.getTxHash();
    const nullifiers = tx.data.getNonEmptyNullifiers();
    const txHashesToEvict: TxHash[] = [];
    const incomingPriority = poolAccess.getTxPriority(tx);

    for (const nullifier of nullifiers) {
      const conflictingHash = await poolAccess.getTxHashByNullifier(nullifier);

      if (
        !conflictingHash ||
        conflictingHash.equals(txHash) ||
        findIndexInSortedArray(txHashesToEvict, conflictingHash, cmpTxHash) !== -1
      ) {
        continue;
      }

      // Get the conflicting tx's priority
      const conflictingTx = await poolAccess.getPendingTxByHash(conflictingHash);
      if (!conflictingTx) {
        continue;
      }

      const conflictingPriority = poolAccess.getTxPriority(conflictingTx);

      // If incoming tx has strictly higher priority, mark for eviction
      // Otherwise, ignore incoming tx (ties go to existing tx)
      if (incomingPriority > conflictingPriority) {
        insertIntoSortedArray(txHashesToEvict, conflictingHash, cmpTxHash);
      } else {
        this.log.debug(
          `Ignoring tx ${txHash.toString()}: nullifier conflict with ${conflictingHash.toString()} which has higher or equal fee`,
        );
        return {
          shouldIgnore: true,
          txHashesToEvict: [],
          reason: `nullifier conflict with ${conflictingHash.toString()}`,
        };
      }
    }

    return { shouldIgnore: false, txHashesToEvict };
  }
}
