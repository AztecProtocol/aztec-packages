import { BlockNumber } from '@aztec/foundation/branded-types';
import { isDefined } from '@aztec/foundation/types';
import type { BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { AppTaggingSecret, LogResult } from '@aztec/stdlib/logs';
import { SiloedTag } from '@aztec/stdlib/logs';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../constants.js';
import { getAllPrivateLogsByTags } from '../get_all_logs_by_tags.js';
import { findHighestIndexes } from './utils/find_highest_indexes.js';

/**
 * Fetches and syncs tagged private logs for multiple sender-recipient pairs, batching tag queries across all secrets
 * into shared RPC calls.
 *
 * # Explanation of how the algorithm works
 *
 * For each secret we sync logs that correspond to the tagging index range
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
 * ## Batching across secrets
 *
 * Instead of running one RPC call per secret, we merge tags from all pending secrets into a single flat array,
 * make one batched `getAllPrivateLogsByTags` call (which internally chunks at MAX_RPC_LEN), then split results
 * back per secret using tracked offsets. Only secrets whose window advanced are kept for the next iteration.
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
        return await updateIndexesAndAdvanceWindow(
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
      const [currentHighestAgedIndex, currentHighestFinalizedIndex] = await Promise.all([
        taggingStore.getHighestAgedIndex(secret, jobId),
        taggingStore.getHighestFinalizedIndex(secret, jobId),
      ]);

      const start = currentHighestAgedIndex === undefined ? 0 : currentHighestAgedIndex + 1;
      const end = (currentHighestFinalizedIndex ?? 0) + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN + 1;

      return { secret, start, end };
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
 * Processes a single secret's fetched logs: updates stored indexes and returns a new PendingSecret
 * if the window needs to advance, or undefined if this secret is done.
 */
async function updateIndexesAndAdvanceWindow(
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
  return {
    secret: pending.secret,
    start: pending.end,
    end: highestFinalizedIndex + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN + 1,
  };
}

type PendingSecret = {
  secret: AppTaggingSecret;
  start: number;
  end: number;
};

type LogWithIndex = {
  log: LogResult;
  taggingIndex: number;
};
