import { BlockNumber } from '@aztec/foundation/branded-types';
import { isDefined } from '@aztec/foundation/types';
import type { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { AppTaggingSecret, LogResult } from '@aztec/stdlib/logs';
import { AppTaggingSecretKind, SiloedTag } from '@aztec/stdlib/logs';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import { INITIAL_CONSTRAINED_PROBE_LEN, UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../constants.js';
import { getAllPrivateLogsByTags } from '../get_all_logs_by_tags.js';
import { findHighestIndexes } from './utils/find_highest_indexes.js';

/**
 * Fetches and syncs tagged private logs for multiple sender-recipient pairs, batching tag queries across all secrets
 * into shared RPC calls. Handles both constrained and unconstrained secrets, which differ in their scan strategy
 * but share the same batching infrastructure.
 *
 * # Unconstrained secrets
 *
 * For each unconstrained secret we sync logs that correspond to the tagging index range
 * (highestAgedIndex, highestFinalizedIndex + WINDOW_LEN]
 *
 * highestAgedIndex is the highest index that was used in a tx that is included in a block at least
 *                  `MAX_TX_LIFETIME` seconds ago.
 * highestFinalizedIndex is the highest index that was used in a tx that is included in a finalized block.
 *
 * "(" denotes an open end of the range - the index is not included in the range.
 * "]" denotes a closed end of the range - the index is included in the range.
 *
 * ## Explanation of highestAgedIndex
 *
 * highestAgedIndex is chosen such that for all tagging indexes `i <= highestAgedIndex` we know that no new logs can
 * ever appear.
 *
 * This relies on the "maximum inclusion timestamp" rule enforced by the kernel and rollup circuits:
 * - a transaction's maximum inclusion timestamp is at most `MAX_TX_LIFETIME` seconds after
 *   the timestamp of its anchor block; and
 * - a rollup only includes transactions whose inclusion timestamp is >= the L2 block's timestamp.
 *
 * Suppose some device used index `I` in a transaction anchored to block `B_N` at time `N`, and that block is now at
 * least `MAX_TX_LIFETIME` seconds in the past. Then there is no possibility of any *other* device
 * trying to use an index <= `I` while anchoring to a *newer* block than `B_N` because if we were anchoring to
 * a newer block than `B_N` then we would already have seen the log with index `I` and hence the device would have
 * chosen a larger index.
 *    If that *other* device would anchor to a block older than `B_N` then that tx could never be included in a block
 * because it would already have been expired.
 *
 * Therefore, once we see that index `I` has been used in a block that is at least `MAX_TX_LIFETIME`
 * seconds old, we can safely stop syncing logs for all indexes <= `I` and set highestAgedIndex = `I`.
 *
 * ## Explanation of the upper bound `highestFinalizedIndex + WINDOW_LEN`
 *
 * When a sender chooses a tagging index, they will select an index that is at most `WINDOW_LEN` greater than
 * the highest finalized index. If that index was already used, they will throw an error. For this reason we
 * don't have to look further than `highestFinalizedIndex + WINDOW_LEN`.
 *
 * # Constrained secrets
 *
 * Constrained delivery enforces a contiguous index sequence (each send proves the predecessor's nullifier,
 * chaining back to the handshake), so there is only one sender and indexes are sequential. This means:
 * - The lower bound is `highestFinalizedIndex + 1`. The `highestAgedIndex` mechanism is unnecessary because
 *   the nullifier chain prevents out-of-order index usage: no device can fill in a lower index after a higher
 *   one is already on-chain.
 * - Because the sequence is gapless, the scan stops at the first missing index: that gap proves the sequence has
 *   ended and no further logs exist. We exploit this by probing only a small initial window
 *   (`INITIAL_CONSTRAINED_PROBE_LEN`) and growing to the full window only when every probed index has a log, so a
 *   steady-state sync with no new logs costs a single tag instead of the whole window.
 * - The upper bound is the same as unconstrained: `highestFinalizedIndex + WINDOW_LEN`. Advancing the probe is
 *   decoupled from persisting the finalized cursor, so unfinalized logs at the top of the run are still fetched
 *   while only the finalized prefix is persisted.
 *
 * # Batching across secrets
 *
 * Instead of running one RPC call per secret, we merge tags from all pending secrets (both constrained and
 * unconstrained) into a single flat array, make one batched `getAllPrivateLogsByTags` call (which internally
 * chunks at MAX_RPC_LEN), then split results back per secret using tracked offsets. Only secrets whose window
 * advanced are kept for the next iteration.
 */
export async function syncTaggedPrivateLogs(
  secrets: AppTaggingSecret[],
  aztecNode: AztecNode,
  taggingStore: RecipientTaggingStore,
  anchorBlockHeader: BlockHeader,
  finalizedBlockNumber: BlockNumber,
  jobId: string,
): Promise<LogResult[]> {
  if (secrets.length === 0) {
    return [];
  }

  const anchorBlockNumber = anchorBlockHeader.getBlockNumber();
  const anchorBlockHash = await anchorBlockHeader.hash();
  const currentTimestamp = anchorBlockHeader.globalVariables.timestamp;

  // Read stored indexes from the db and compute the initial [start, end) range for each secret
  let pending = await getIndexRangesForSecrets(secrets, taggingStore, jobId);
  const allLogs: LogResult[] = [];

  while (pending.length > 0) {
    // Compute tags for all pending secrets and fetch logs in batched RPC calls
    const logsPerSecret = await fetchLogsForSecrets(pending, aztecNode, anchorBlockNumber, anchorBlockHash);

    const nextRound = await Promise.all(
      pending.map(async (pendingSecret, i) => {
        const logsFoundWithSecret = logsPerSecret[i];
        if (logsFoundWithSecret.length === 0) {
          // No logs found, no need to update indexes or advance window.
          return undefined;
        }

        allLogs.push(...logsFoundWithSecret.map(({ log }) => log));

        // Persist new indexes. If the finalized index moved forward, the window advances
        // and we need another round for this secret.
        const processForKind =
          pendingSecret.secret.kind === AppTaggingSecretKind.CONSTRAINED
            ? processConstrainedResults
            : processUnconstrainedResults;

        return await processForKind(
          pendingSecret,
          logsFoundWithSecret,
          taggingStore,
          currentTimestamp,
          finalizedBlockNumber,
          jobId,
        );
      }),
    );

    pending = nextRound.filter(isDefined);
  }

  return allLogs;
}

/** Reads stored indexes for each secret and computes the initial index range to query. */
function getIndexRangesForSecrets(
  secrets: AppTaggingSecret[],
  taggingStore: RecipientTaggingStore,
  jobId: string,
): Promise<PendingSecret[]> {
  return Promise.all(
    secrets.map(async secret => {
      const currentHighestFinalizedIndex = await taggingStore.getHighestFinalizedIndex(secret, jobId);

      const highestIndexBeforeStart =
        secret.kind === AppTaggingSecretKind.CONSTRAINED
          ? currentHighestFinalizedIndex
          : await taggingStore.getHighestAgedIndex(secret, jobId);
      const start = highestIndexBeforeStart === undefined ? 0 : highestIndexBeforeStart + 1;

      const boundEnd = (currentHighestFinalizedIndex ?? 0) + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN + 1;

      // Constrained streams are gapless, so probe a small initial window and stop at the first missing tag instead of
      // always fetching the full window. Unconstrained secrets can have gaps, so they still scan the whole window.
      const end =
        secret.kind === AppTaggingSecretKind.CONSTRAINED
          ? Math.min(boundEnd, start + INITIAL_CONSTRAINED_PROBE_LEN)
          : boundEnd;

      return { secret, start, end, boundEnd };
    }),
  );
}

/**
 * Computes siloed tags for all pending secrets' index ranges, fetches logs in one batched RPC call,
 * and returns the results grouped back per secret.
 */
async function fetchLogsForSecrets(
  pending: PendingSecret[],
  aztecNode: AztecNode,
  anchorBlockNumber: BlockNumber,
  anchorBlockHash: BlockHash,
): Promise<LogWithIndex[][]> {
  // Determine the index range for each secret
  const indexesPerSecret = pending.map(({ start, end }) => Array.from({ length: end - start }, (_, i) => start + i));

  // Compute siloed tags for all indexes
  const tagsPerSecret = await Promise.all(
    pending.map(({ secret }, i) =>
      Promise.all(indexesPerSecret[i].map(index => SiloedTag.compute({ extendedSecret: secret, index }))),
    ),
  );

  const allTags = tagsPerSecret.flat();

  // getAllPrivateLogsByTags handles MAX_RPC_LEN chunking internally. Recipient sync builds `PendingTaggedLog` from
  // each log's note hashes and first nullifier, so we opt into effects. The `toBlock` cap (anchor block + 1,
  // exclusive) tells the node to skip any logs in blocks past the anchor — the same guard previously enforced
  // by an in-memory filter on the response.
  const allResults = await getAllPrivateLogsByTags(aztecNode, allTags, anchorBlockHash, {
    includeEffects: true,
    toBlock: BlockNumber(anchorBlockNumber + 1),
  });

  // Split flat results back per secret using the known lengths
  const logsPerSecret: LogWithIndex[][] = [];
  let offset = 0;
  for (const indexes of indexesPerSecret) {
    const logsForSecret: LogWithIndex[] = [];
    for (let i = 0; i < indexes.length; i++) {
      for (const log of allResults[offset + i]) {
        logsForSecret.push({ log, taggingIndex: indexes[i] });
      }
    }
    logsPerSecret.push(logsForSecret);
    offset += indexes.length;
  }

  return logsPerSecret;
}

/**
 * Processes fetched logs for a constrained secret. Constrained delivery guarantees contiguous index sequences,
 * so we scan from the start of the queried range and stop at the first missing index. Only `highestFinalizedIndex`
 * is tracked (no aged index).
 */
async function processConstrainedResults(
  pending: PendingSecret,
  logsWithIndexes: LogWithIndex[],
  taggingStore: RecipientTaggingStore,
  currentTimestamp: bigint,
  finalizedBlockNumber: BlockNumber,
  jobId: string,
): Promise<PendingSecret | undefined> {
  // Find where the contiguous run of indexes ends. Constrained delivery guarantees there are no logs after the
  // first gap, so all logs in the batch are within this prefix.
  const indexesWithLogs = new Set(logsWithIndexes.map(l => l.taggingIndex));
  let firstMissingIndex = pending.start;
  while (firstMissingIndex < pending.end && indexesWithLogs.has(firstMissingIndex)) {
    firstMissingIndex++;
  }

  // Persist the highest finalized index found. The nullifier for a constrained-delivery log is emitted in the same
  // transaction, guaranteeing the log cannot disappear once included, so we persist even when a gap stops the scan.
  // This lets the next sync round skip already-finalized indexes.
  const { highestFinalizedIndex } = findHighestIndexes(logsWithIndexes, currentTimestamp, finalizedBlockNumber);
  if (highestFinalizedIndex !== undefined) {
    await taggingStore.updateHighestFinalizedIndex(pending.secret, highestFinalizedIndex, jobId);
  }

  // Advancing the probe is decoupled from persisting the cursor: keep scanning as long as the probe was entirely hits
  // (no gap) and there is room before the protocol bound, even if none of those hits is finalized yet. Gating this on
  // finalization would drop logs in unfinalized blocks, which sit at the top of the contiguous run. The bound
  // re-anchors to any finalized index found this round. Once the small initial probe is fully consumed, this jumps to
  // the full window, so later rounds behave exactly as before.
  const probeFullyConsumed = firstMissingIndex >= pending.end;
  const boundEnd =
    highestFinalizedIndex !== undefined
      ? Math.max(pending.boundEnd, highestFinalizedIndex + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN + 1)
      : pending.boundEnd;

  if (probeFullyConsumed && pending.end < boundEnd) {
    return {
      secret: pending.secret,
      start: pending.end,
      end: boundEnd,
      boundEnd,
    };
  }

  return undefined;
}

/**
 * Processes a single unconstrained secret's fetched logs: updates stored indexes and returns a new PendingSecret
 * if the window needs to advance, or undefined if this secret is done.
 */
async function processUnconstrainedResults(
  pending: PendingSecret,
  logsWithIndexes: LogWithIndex[],
  taggingStore: RecipientTaggingStore,
  currentTimestamp: bigint,
  finalizedBlockNumber: BlockNumber,
  jobId: string,
): Promise<PendingSecret | undefined> {
  const { highestAgedIndex, highestFinalizedIndex } = findHighestIndexes(
    logsWithIndexes,
    currentTimestamp,
    finalizedBlockNumber,
  );

  // Store updates in data provider and update local variables
  if (highestAgedIndex !== undefined) {
    await taggingStore.updateHighestAgedIndex(pending.secret, highestAgedIndex, jobId);
  }

  if (highestFinalizedIndex === undefined) {
    // We have not found a new highest finalized index, so there is no need to move the window forward.
    return undefined;
  }

  if (highestAgedIndex !== undefined && highestAgedIndex > highestFinalizedIndex) {
    // This is just a sanity check as this should never happen.
    throw new Error(
      `Highest aged index (${highestAgedIndex}) must not exceed highest finalized index (${highestFinalizedIndex})`,
    );
  }

  await taggingStore.updateHighestFinalizedIndex(pending.secret, highestFinalizedIndex, jobId);

  // For the next iteration we want to look only at indexes for which we have not yet fetched logs while
  // ensuring that we do not look further than WINDOW_LEN ahead of the highest finalized index.
  const end = highestFinalizedIndex + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN + 1;
  return {
    secret: pending.secret,
    start: pending.end,
    end,
    boundEnd: end,
  };
}

type PendingSecret = {
  secret: AppTaggingSecret;
  start: number;
  end: number;
  // Highest index this secret may probe this sync (highest finalized index + WINDOW_LEN + 1, the protocol bound on how
  // far ahead of finalized a log can sit). Distinct from `end`, which for constrained secrets starts as a small probe.
  boundEnd: number;
};

type LogWithIndex = {
  log: LogResult;
  taggingIndex: number;
};
