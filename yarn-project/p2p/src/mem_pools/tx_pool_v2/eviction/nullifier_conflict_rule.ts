import { createLogger } from '@aztec/foundation/log';

import type { TxMetaData } from '../tx_metadata.js';
import type { PreAddPoolAccess, PreAddResult, PreAddRule } from './interfaces.js';

/**
 * Pre-add rule that checks for nullifier conflicts between incoming and existing transactions.
 *
 * When an incoming tx shares nullifiers with existing pending txs:
 * - If the incoming tx has strictly higher priority, evict all conflicting txs
 * - If any conflicting tx has equal or higher priority, ignore the incoming tx
 */
export class NullifierConflictRule implements PreAddRule {
  public readonly name = 'NullifierConflict';

  private log = createLogger('p2p:tx_pool_v2:nullifier_conflict_rule');

  async check(incomingMeta: TxMetaData, poolAccess: PreAddPoolAccess): Promise<PreAddResult> {
    const txHashesToEvict: string[] = [];

    for (const nullifier of incomingMeta.nullifiers) {
      const conflictingHashStr = poolAccess.getTxHashByNullifier(nullifier);

      if (!conflictingHashStr || conflictingHashStr === incomingMeta.txHash) {
        continue;
      }

      // Skip if already marked for eviction
      if (txHashesToEvict.includes(conflictingHashStr)) {
        continue;
      }

      const conflictingMeta = poolAccess.getMetadata(conflictingHashStr);
      if (!conflictingMeta) {
        continue;
      }

      // If incoming tx has strictly higher priority, mark for eviction
      // Otherwise, ignore incoming tx (ties go to existing tx)
      if (incomingMeta.priorityFee > conflictingMeta.priorityFee) {
        txHashesToEvict.push(conflictingHashStr);
      } else {
        this.log.debug(
          `Ignoring tx ${incomingMeta.txHash}: nullifier conflict with ${conflictingHashStr} which has higher or equal fee`,
        );
        return {
          shouldIgnore: true,
          txHashesToEvict: [],
          reason: `nullifier conflict with ${conflictingHashStr}`,
        };
      }
    }

    return { shouldIgnore: false, txHashesToEvict };
  }
}
