import type { Logger } from '@aztec/foundation/log';
import type { PrivateKernelTailCircuitPublicInputs } from '@aztec/stdlib/kernel';
import type { TaggingIndexRange } from '@aztec/stdlib/logs';
import type { TxHash } from '@aztec/stdlib/tx';

import type { ChangeSetId } from '../storage/staged_write_coordinator.js';
import type { SenderTaggingStore } from '../storage/tagging_store/sender_tagging_store.js';
import { reconcileTaggingIndexRangesAgainstSurvivingTags } from './reconcile_tagging_index_ranges.js';

/**
 * Persists the tagging index ranges that a tx used as a sender, after reconciling them against the kernel's surviving
 * private logs.
 *
 * The tagging index cache reserves an index for every log emission attempted during private execution, but the kernel
 * may then squash some of those logs (e.g. when a note is created and nullified within the same tx). This function
 * shrinks the recorded ranges to match the actual on-chain footprint before writing them, so that what we persist is
 * consistent with what the network will see.
 *
 * @remarks Storing the recorded ranges in the DB may not be seen as necessary because we sync from chain before sending
 * new logs, but the sync can only see logs already included in blocks. If we sent another transaction before this one
 * was included from the same PXE, and that transaction contained a log with a tag derived from the same secret, we
 * would reuse the tag and the transactions would be linked. Persisting in the DB prevents that linkage.
 *
 * @param store - The sender tagging store.
 * @param recordedRanges - The tagging index ranges as recorded during private execution (pre-squash).
 * @param publicInputs - The final kernel public inputs, used to determine which private logs survived squashing.
 * @param getTxHash - Lazy accessor for the tx hash. Called only when there is something to persist, since computing
 * the tx hash is expensive.
 * @param changeSetId - Change set context for staged writes to the store. See {@link StagedWriteCoordinator} for more
 * details.
 * @param log - Logger.
 */
export async function persistSenderTaggingIndexRangesForTx(
  store: SenderTaggingStore,
  recordedRanges: TaggingIndexRange[],
  publicInputs: PrivateKernelTailCircuitPublicInputs,
  getTxHash: () => Promise<TxHash>,
  changeSetId: ChangeSetId,
  log: Logger,
): Promise<void> {
  if (recordedRanges.length === 0) {
    log.debug(`No tagging index ranges used in the tx`);
    return;
  }

  const survivingTags = new Set(
    publicInputs.getNonEmptyPrivateLogs().map(privateLog => privateLog.fields[0].toString()),
  );
  const reconciledRanges = await reconcileTaggingIndexRangesAgainstSurvivingTags(recordedRanges, survivingTags);

  if (reconciledRanges.length === 0) {
    log.debug(`All tagging index ranges used in the tx were squashed by the kernel`, { recordedRanges });
    return;
  }

  const txHash = await getTxHash();
  await store.storePendingIndexes(reconciledRanges, txHash, changeSetId);
  log.debug(`Stored used tagging index ranges as sender for the tx`, { recordedRanges, reconciledRanges });
}
