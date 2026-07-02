import type { Fr } from '@aztec/foundation/curves/bn254';

import type { ResolvedTx } from './resolved_tx.js';

/**
 * Represents a pending tagged log as it is stored in the pending tagged log array to which the fetchTaggedLogs oracle
 * inserts found private logs. A TS version of `pending_tagged_log.nr`.
 */
export type PendingTaggedLog = {
  log: Fr[];
  context: ResolvedTx;
};
