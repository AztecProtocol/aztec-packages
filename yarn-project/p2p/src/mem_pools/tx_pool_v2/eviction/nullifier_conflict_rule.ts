import { createLogger } from '@aztec/foundation/log';

import { type TxMetaData, checkNullifierConflict } from '../tx_metadata.js';
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

  check(incomingMeta: TxMetaData, poolAccess: PreAddPoolAccess): Promise<PreAddResult> {
    const result = checkNullifierConflict(
      incomingMeta,
      nullifier => poolAccess.getTxHashByNullifier(nullifier),
      txHash => poolAccess.getMetadata(txHash),
    );

    if (result.shouldIgnore) {
      this.log.debug(
        `Ignoring tx ${incomingMeta.txHash}: ${result.reason}`,
      );
    }

    return Promise.resolve(result);
  }
}
