import type { Fr } from '@aztec/foundation/curves/bn254';

import type { MessageContext } from './message_context.js';
import type { ResolvedTx } from './resolved_tx.js';

/**
 * Represents a pending tagged log as it is stored in the pending tagged log array to which the fetchTaggedLogs oracle
 * inserts found private logs. A TS version of `pending_tagged_log.nr`.
 */
export type PendingTaggedLog = {
  log: Fr[];
  context: ResolvedTx;
};

/**
 * The block-less variant of {@link PendingTaggedLog} carried by the original `getPendingTaggedLogs` oracle: its context
 * is a {@link MessageContext} rather than a {@link ResolvedTx}. Retained only so the PXE can keep serving that oracle to
 * already-deployed contracts; current syncs use `getPendingTaggedLogsV2`.
 */
export type PendingTaggedLogV1 = {
  log: Fr[];
  context: MessageContext;
};
