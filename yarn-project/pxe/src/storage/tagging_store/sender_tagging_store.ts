import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AppTaggingSecret, SiloedTag, type TaggingIndexRange } from '@aztec/stdlib/logs';
import { TxEffect, TxHash } from '@aztec/stdlib/tx';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../../tagging/constants.js';

/** Internal representation of a pending index range entry. */
type PendingIndexesEntry = { lowestIndex: number; highestIndex: number; txHash: string };

/**
 * Data provider of tagging data used when syncing the sender tagging indexes. The recipient counterpart of this class
 * is called RecipientTaggingStore. We have the data stores separate for sender and recipient because
 * the algorithms are completely disjoint and there is not data reuse between the two.
 */
export class SenderTaggingStore implements StagedStore {
  readonly storeName = 'sender_tagging';

  #store: AztecAsyncKVStore;

  // Stores the pending index ranges for each directional app tagging secret. Pending here means that the tx that
  // contained the private logs with tags corresponding to these indexes has not been finalized yet.
  //
  // We store the full range (lowestIndex, highestIndex) for each secret-tx pair because transactions can partially
  // revert, in which case only some logs (from the non-revertible phase) survive onchain. By storing the range,
  // we can expand it and check each individual siloed tag against the TxEffect to determine which indexes made it
  // onchain.
  //
  // directional app tagging secret => { lowestIndex, highestIndex, txHash }[]
  #pendingIndexes: AztecAsyncMap<string, PendingIndexesEntry[]>;

  // jobId => directional app tagging secret => { lowestIndex, highestIndex, txHash }[]
  #pendingIndexesForJob: Map<string, Map<string, PendingIndexesEntry[]>>;

  // Stores the last (highest) finalized index for each directional app tagging secret. We care only about the last
  // index because unlike the pending indexes, it will never happen that a finalized index would be removed and hence
  // we don't need to store the history.
  //
  // directional app tagging secret => highest finalized index
  #lastFinalizedIndexes: AztecAsyncMap<string, number>;

  // jobId => directional app tagging secret => highest finalized index
  #lastFinalizedIndexesForJob: Map<string, Map<string, number>>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#pendingIndexes = this.#store.openMap('pending_indexes');
    this.#lastFinalizedIndexes = this.#store.openMap('last_finalized_indexes');

    this.#pendingIndexesForJob = new Map();
    this.#lastFinalizedIndexesForJob = new Map();
  }

  #getPendingIndexesForJob(jobId: string): Map<string, PendingIndexesEntry[]> {
    let pendingIndexesForJob = this.#pendingIndexesForJob.get(jobId);
    if (!pendingIndexesForJob) {
      pendingIndexesForJob = new Map();
      this.#pendingIndexesForJob.set(jobId, pendingIndexesForJob);
    }
    return pendingIndexesForJob;
  }

  #getLastFinalizedIndexesForJob(jobId: string): Map<string, number> {
    let jobStagedLastFinalizedIndexes = this.#lastFinalizedIndexesForJob.get(jobId);
    if (!jobStagedLastFinalizedIndexes) {
      jobStagedLastFinalizedIndexes = new Map();
      this.#lastFinalizedIndexesForJob.set(jobId, jobStagedLastFinalizedIndexes);
    }
    return jobStagedLastFinalizedIndexes;
  }

  async #readPendingIndexes(jobId: string, secret: string): Promise<PendingIndexesEntry[]> {
    // Always issue DB read to keep IndexedDB transaction alive (they auto-commit when a new micro-task starts and there
    // are no pending read requests). The staged value still takes precedence if it exists.
    const dbValue = await this.#pendingIndexes.getAsync(secret);
    const staged = this.#getPendingIndexesForJob(jobId).get(secret);
    return staged !== undefined ? staged : (dbValue ?? []);
  }

  #writePendingIndexes(jobId: string, secret: string, pendingIndexes: PendingIndexesEntry[]) {
    this.#getPendingIndexesForJob(jobId).set(secret, pendingIndexes);
  }

  async #readLastFinalizedIndex(jobId: string, secret: string): Promise<number | undefined> {
    // Always issue DB read to keep IndexedDB transaction alive (they auto-commit when a new micro-task starts and there
    // are no pending read requests). The staged value still takes precedence if it exists.
    const dbValue = await this.#lastFinalizedIndexes.getAsync(secret);
    const staged = this.#getLastFinalizedIndexesForJob(jobId).get(secret);
    return staged ?? dbValue;
  }

  #writeLastFinalizedIndex(jobId: string, secret: string, lastFinalizedIndex: number) {
    this.#getLastFinalizedIndexesForJob(jobId).set(secret, lastFinalizedIndex);
  }

  /**
   * Writes all job-specific in-memory data to persistent storage.
   *
   * @remark This method must run in a DB transaction context. It's designed to be called from JobCoordinator#commitJob.
   */
  async commit(jobId: string): Promise<void> {
    const pendingIndexesForJob = this.#pendingIndexesForJob.get(jobId);
    if (pendingIndexesForJob) {
      for (const [secret, pendingIndexes] of pendingIndexesForJob.entries()) {
        if (pendingIndexes.length === 0) {
          await this.#pendingIndexes.delete(secret);
        } else {
          await this.#pendingIndexes.set(secret, pendingIndexes);
        }
      }
    }

    const lastFinalizedIndexesForJob = this.#lastFinalizedIndexesForJob.get(jobId);
    if (lastFinalizedIndexesForJob) {
      for (const [secret, lastFinalizedIndex] of lastFinalizedIndexesForJob.entries()) {
        await this.#lastFinalizedIndexes.set(secret, lastFinalizedIndex);
      }
    }

    return this.discardStaged(jobId);
  }

  discardStaged(jobId: string): Promise<void> {
    this.#pendingIndexesForJob.delete(jobId);
    this.#lastFinalizedIndexesForJob.delete(jobId);
    return Promise.resolve();
  }

  /**
   * Stores pending index ranges, rejecting any range that disagrees with an already-stored one.
   * @remarks If the same (secret, txHash) pair already exists in the db with an equal range, it's a no-op. This is
   * expected to happen because whenever we start sync we start from the last finalized index and we can have pending
   * ranges already stored from previous syncs. If the ranges differ, it throws an error as that indicates a bug in
   * callers that record indexes at prove time. Discovery from onchain logs must use `mergePendingIndexes` instead.
   * @param ranges - The tagging index ranges containing the directional app tagging secrets and the index ranges that are
   * to be stored in the db.
   * @param txHash - The tx in which the tagging indexes were used in private logs.
   * @param jobId - job context for staged writes to this store. See `JobCoordinator` for more details.
   * @throws If the highestIndex is further than window length from the highest finalized index for the same secret.
   * @throws If the lowestIndex is lower than or equal to the last finalized index for the same secret.
   * @throws If a different range already exists for the same (secret, txHash) pair.
   */
  storePendingIndexes(ranges: TaggingIndexRange[], txHash: TxHash, jobId: string): Promise<void> {
    return this.#storePendingIndexes(ranges, txHash, jobId, false);
  }

  /**
   * Stores pending index ranges, widening an existing entry for the same (secret, txHash) pair to the union of the
   * stored and incoming ranges instead of throwing on a mismatch. Discovery from onchain logs needs this: it may see
   * only the surviving (non-revertible phase) sub-range of a partially reverted tx recorded at prove time (the
   * finalized receipt step of the sync resolves that difference), or indexes beyond a partially discovered entry
   * when a tx from another PXE straddles a sync window boundary. Callers that record indexes at prove time must use
   * `storePendingIndexes` instead, so that a range disagreement surfaces as a bug rather than being absorbed.
   * @param ranges - The tagging index ranges containing the directional app tagging secrets and the index ranges that are
   * to be stored in the db.
   * @param txHash - The tx in which the tagging indexes were used in private logs.
   * @param jobId - job context for staged writes to this store. See `JobCoordinator` for more details.
   * @throws If the highestIndex is further than window length from the highest finalized index for the same secret.
   * @throws If the lowestIndex is lower than or equal to the last finalized index for the same secret.
   */
  mergePendingIndexes(ranges: TaggingIndexRange[], txHash: TxHash, jobId: string): Promise<void> {
    return this.#storePendingIndexes(ranges, txHash, jobId, true);
  }

  #storePendingIndexes(
    ranges: TaggingIndexRange[],
    txHash: TxHash,
    jobId: string,
    mergeExisting: boolean,
  ): Promise<void> {
    if (ranges.length === 0) {
      return Promise.resolve();
    }

    const txHashStr = txHash.toString();

    return this.#store.transactionAsync(async () => {
      // Prefetch all data, start reads during iteration to keep IndexedDB transaction alive
      const rangeReadPromises = ranges.map(range => ({
        range,
        secretStr: range.extendedSecret.toString(),
        pending: this.#readPendingIndexes(jobId, range.extendedSecret.toString()),
        finalized: this.#readLastFinalizedIndex(jobId, range.extendedSecret.toString()),
      }));

      // Await all reads together
      const rangeData = await Promise.all(
        rangeReadPromises.map(async item => ({
          ...item,
          pendingData: await item.pending,
          finalizedIndex: await item.finalized,
        })),
      );

      // Process in memory and validate
      for (const { range, secretStr, pendingData, finalizedIndex } of rangeData) {
        // Check that the highest index is not further than window length from the highest finalized index.
        // When no index is finalized yet, indexes 0..UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN - 1 are permitted:
        // exactly WINDOW_LEN pending indexes, the same allowance as after any real finalization.
        // The sender-sync first window probes exactly this bound, so widening it here
        // without widening the probe would let two stores sharing a secret pick colliding indexes.
        if (range.highestIndex > (finalizedIndex ?? -1) + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN) {
          throw new Error(
            `Highest used index ${range.highestIndex} is further than window length from the highest finalized index ${finalizedIndex ?? 'none'}.
            Tagging window length ${UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN} is configured too low. Contact the Aztec team
            to increase it!`,
          );
        }

        // Throw if the lowest index is lower than or equal to the last finalized index
        if (finalizedIndex !== undefined && range.lowestIndex <= finalizedIndex) {
          throw new Error(
            `Cannot store pending index range [${range.lowestIndex}, ${range.highestIndex}] for secret ${secretStr}: ` +
              `lowestIndex is lower than or equal to the last finalized index ${finalizedIndex}`,
          );
        }

        // Check if an entry with the same txHash already exists
        const existingEntry = pendingData.find(entry => entry.txHash === txHashStr);

        let updatedPending: PendingIndexesEntry[] | undefined;
        if (!existingEntry) {
          updatedPending = [
            ...pendingData,
            { lowestIndex: range.lowestIndex, highestIndex: range.highestIndex, txHash: txHashStr },
          ];
        } else if (mergeExisting) {
          // Widen the entry to the union of both ranges, never shrink it: replacing would drop prove-time
          // indexes the chain doesn't show (partially reverted tx), and skipping would drop onchain indexes
          // discovered in a later sync window (tx straddling the window boundary).
          const lowestIndex = Math.min(existingEntry.lowestIndex, range.lowestIndex);
          const highestIndex = Math.max(existingEntry.highestIndex, range.highestIndex);
          if (lowestIndex !== existingEntry.lowestIndex || highestIndex !== existingEntry.highestIndex) {
            updatedPending = pendingData.map(entry =>
              entry === existingEntry ? { lowestIndex, highestIndex, txHash: entry.txHash } : entry,
            );
          }
        } else if (
          existingEntry.lowestIndex !== range.lowestIndex ||
          existingEntry.highestIndex !== range.highestIndex
        ) {
          // Different ranges for the same (secret, txHash) indicate a bug in callers that record indexes at prove
          // time.
          throw new Error(
            `Conflicting range for secret ${secretStr} and txHash ${txHashStr}: ` +
              `existing [${existingEntry.lowestIndex}, ${existingEntry.highestIndex}] vs ` +
              `new [${range.lowestIndex}, ${range.highestIndex}]`,
          );
        }
        // Remaining cases (a merge whose union equals the stored range, or an identical range without
        // mergeExisting): duplicate evidence, nothing to write.

        if (updatedPending) {
          this.#writePendingIndexes(jobId, secretStr, updatedPending);
        }
      }
    });
  }

  /**
   * Returns the transaction hashes of all pending transactions that contain highest indexes within a specified range
   * for a given directional app tagging secret. We check based on the highest indexes only as that is the relevant
   * information for the caller of this function.
   * @param secret - The directional app tagging secret to query pending indexes for.
   * @param startIndex - The lower bound of the index range (inclusive).
   * @param endIndex - The upper bound of the index range (exclusive).
   * @returns An array of unique transaction hashes for pending transactions that contain indexes in the range
   * [startIndex, endIndex). Returns an empty array if no pending indexes exist in the range.
   */
  getTxHashesOfPendingIndexes(
    secret: AppTaggingSecret,
    startIndex: number,
    endIndex: number,
    jobId: string,
  ): Promise<TxHash[]> {
    return this.#store.transactionAsync(async () => {
      const existing = await this.#readPendingIndexes(jobId, secret.toString());
      const txHashes = existing
        .filter(entry => entry.highestIndex >= startIndex && entry.highestIndex < endIndex)
        .map(entry => entry.txHash);
      return Array.from(new Set(txHashes)).map(TxHash.fromString);
    });
  }

  /**
   * Returns the last (highest) finalized index for a given secret.
   * @param secret - The secret to get the last finalized index for.
   * @returns The last (highest) finalized index for the given secret.
   */
  getLastFinalizedIndex(secret: AppTaggingSecret, jobId: string): Promise<number | undefined> {
    return this.#store.transactionAsync(() => this.#readLastFinalizedIndex(jobId, secret.toString()));
  }

  /**
   * Returns the last used index for a given directional app tagging secret, considering both finalized and pending
   * indexes.
   * @param secret - The directional app tagging secret to query the last used index for.
   * @returns The last used index.
   */
  getLastUsedIndex(secret: AppTaggingSecret, jobId: string): Promise<number | undefined> {
    const secretStr = secret.toString();

    return this.#store.transactionAsync(async () => {
      const pendingPromise = this.#readPendingIndexes(jobId, secretStr);
      const finalizedPromise = this.#readLastFinalizedIndex(jobId, secretStr);

      const [pendingEntries, lastFinalized] = await Promise.all([pendingPromise, finalizedPromise]);

      if (pendingEntries.length === 0) {
        return lastFinalized;
      }

      // As the last used index we return the highest one from the pending index ranges. Note that this value will be
      // always higher than the last finalized index because we prune lower pending indexes when a tx is finalized.
      return Math.max(...pendingEntries.map(entry => entry.highestIndex));
    });
  }

  /**
   * Drops all pending indexes corresponding to the given transaction hashes.
   */
  dropPendingIndexes(txHashes: TxHash[], jobId: string): Promise<void> {
    if (txHashes.length === 0) {
      return Promise.resolve();
    }

    const txHashStrings = new Set<string>(txHashes.map(txHash => txHash.toString()));

    return this.#store.transactionAsync(async () => {
      // Prefetch all data, start reads during iteration to keep IndexedDB transaction alive
      const secretReadPromises: Map<string, Promise<PendingIndexesEntry[]>> = new Map();

      for await (const secret of this.#pendingIndexes.keysAsync()) {
        secretReadPromises.set(secret, this.#readPendingIndexes(jobId, secret));
      }

      // Add staged-only secrets (sync, no DB)
      for (const secret of this.#getPendingIndexesForJob(jobId).keys()) {
        if (!secretReadPromises.has(secret)) {
          secretReadPromises.set(secret, Promise.resolve(this.#getPendingIndexesForJob(jobId).get(secret) ?? []));
        }
      }

      // Await all reads together
      const secrets = [...secretReadPromises.keys()];
      const pendingDataResults = await Promise.all(secretReadPromises.values());

      // Process in memory
      for (let i = 0; i < secrets.length; i++) {
        const secret = secrets[i];
        const pendingData = pendingDataResults[i];

        if (pendingData && pendingData.length > 0) {
          const filtered = pendingData.filter(item => !txHashStrings.has(item.txHash));
          if (filtered.length === 0) {
            this.#writePendingIndexes(jobId, secret, []);
          } else if (filtered.length !== pendingData.length) {
            // Some items were filtered out, so update the pending data
            this.#writePendingIndexes(jobId, secret, filtered);
          }
          // else: No items were filtered out (txHashes not found for this secret) --> no-op
        }
      }
    });
  }

  /** Prefetches all pending and finalized index data for every secret (from both DB and staged writes). */
  #getSecretsWithPendingData(
    jobId: string,
  ): Promise<{ secret: string; pendingData: PendingIndexesEntry[]; lastFinalized: number | undefined }[]> {
    return this.#store.transactionAsync(async () => {
      // Prefetch all data, start reads during iteration to keep IndexedDB transaction alive
      const secretDataPromises: Map<
        string,
        { pending: Promise<PendingIndexesEntry[]>; finalized: Promise<number | undefined> }
      > = new Map();

      for await (const secret of this.#pendingIndexes.keysAsync()) {
        secretDataPromises.set(secret, {
          pending: this.#readPendingIndexes(jobId, secret),
          finalized: this.#readLastFinalizedIndex(jobId, secret),
        });
      }

      // Add staged-only secrets (sync, no DB)
      for (const secret of this.#getPendingIndexesForJob(jobId).keys()) {
        if (!secretDataPromises.has(secret)) {
          secretDataPromises.set(secret, {
            pending: Promise.resolve(this.#getPendingIndexesForJob(jobId).get(secret) ?? []),
            finalized: Promise.resolve(this.#getLastFinalizedIndexesForJob(jobId).get(secret)),
          });
        }
      }

      // Await all reads together
      const secrets = [...secretDataPromises.keys()];
      const dataResults = await Promise.all(
        secrets.map(async secret => ({
          secret,
          pendingData: await secretDataPromises.get(secret)!.pending,
          lastFinalized: await secretDataPromises.get(secret)!.finalized,
        })),
      );

      return dataResults.filter(r => r.pendingData.length > 0);
    });
  }

  /**
   * Updates pending indexes corresponding to the given transaction hashes to be finalized and prunes any lower pending
   * indexes.
   */
  async finalizePendingIndexes(txHashes: TxHash[], jobId: string): Promise<void> {
    if (txHashes.length === 0) {
      return;
    }

    const txHashStrings = new Set(txHashes.map(tx => tx.toString()));
    const secretsWithData = await this.#getSecretsWithPendingData(jobId);

    for (const { secret, pendingData, lastFinalized } of secretsWithData) {
      let currentPending = pendingData;
      let currentFinalized = lastFinalized;

      // Process all txHashes for this secret
      for (const txHashStr of txHashStrings) {
        const matchingEntries = currentPending.filter(item => item.txHash === txHashStr);
        if (matchingEntries.length === 0) {
          // This is expected as a higher index might have already been finalized which would lead to pruning of
          // pending entries.
          continue;
        }

        if (matchingEntries.length > 1) {
          // We should always just store the highest pending index for a given tx hash and secret because the lower
          // values are irrelevant.
          throw new Error(`Multiple pending entries found for tx hash ${txHashStr} and secret ${secret}`);
        }

        const newFinalized = matchingEntries[0].highestIndex;

        if (newFinalized < (currentFinalized ?? 0)) {
          // This should never happen because when last finalized index was finalized we should have pruned the lower
          // pending indexes.
          throw new Error(
            `New finalized index ${newFinalized} is smaller than the current last finalized index ${currentFinalized}`,
          );
        }

        currentFinalized = newFinalized;

        // When we add pending indexes, we ensure they are higher than the last finalized index. However, because we
        // cannot control the order in which transactions are finalized, there may be pending indexes that are now
        // obsolete because they are lower than the most recently finalized index. For this reason, we prune these
        // outdated pending indexes.
        currentPending = currentPending.filter(item => item.highestIndex > currentFinalized!);
      }

      // Write final state if changed
      if (currentFinalized !== lastFinalized) {
        this.#writeLastFinalizedIndex(jobId, secret, currentFinalized!);
      }
      if (currentPending !== pendingData) {
        this.#writePendingIndexes(jobId, secret, currentPending);
      }
    }
  }

  /**
   * Handles finalization of pending indexes for a transaction whose execution was partially reverted.
   * Recomputes the siloed tags for each pending index of the given tx and checks which ones appear in the
   * TxEffect's private logs (i.e., which ones made it onchain). Those that survived are finalized; those that
   * didn't are dropped.
   * @param txEffect - The tx effect of the partially reverted transaction.
   * @param jobId - job context for staged writes to this store. See `JobCoordinator` for more details.
   */
  async finalizePendingIndexesOfAPartiallyRevertedTx(txEffect: TxEffect, jobId: string): Promise<void> {
    const txHashStr = txEffect.txHash.toString();

    // Build a set of all siloed tag values that made it onchain (first field of each private log).
    const onChainTags = new Set<string>(txEffect.privateLogs.map(log => log.fields[0].toString()));

    const secretsWithData = await this.#getSecretsWithPendingData(jobId);

    for (const { secret, pendingData, lastFinalized } of secretsWithData) {
      const matchingEntries = pendingData.filter(item => item.txHash === txHashStr);
      if (matchingEntries.length === 0) {
        // This is expected as a higher index might have already been finalized which would lead to pruning of
        // pending entries.
        continue;
      }

      if (matchingEntries.length > 1) {
        // We should always just store the highest pending index for a given tx hash and secret because the lower
        // values are irrelevant.
        throw new Error(`Multiple pending entries found for tx hash ${txHashStr} and secret ${secret}`);
      }

      const pendingEntry = matchingEntries[0];

      // Expand each matching entry's range and recompute siloed tags for each index.
      const appTaggingSecret = AppTaggingSecret.fromString(secret);
      let highestSurvivingIndex: number | undefined;

      for (let index = pendingEntry.lowestIndex; index <= pendingEntry.highestIndex; index++) {
        const siloedTag = await SiloedTag.compute({ extendedSecret: appTaggingSecret, index });
        if (onChainTags.has(siloedTag.value.toString())) {
          highestSurvivingIndex = highestSurvivingIndex !== undefined ? Math.max(highestSurvivingIndex, index) : index;
        }
      }

      // Remove all entries for this txHash from pending (both surviving and non-surviving).
      let currentPending = pendingData.filter(item => item.txHash !== txHashStr);

      if (highestSurvivingIndex !== undefined) {
        const newFinalized = Math.max(lastFinalized ?? 0, highestSurvivingIndex);
        this.#writeLastFinalizedIndex(jobId, secret, newFinalized);

        // Prune pending indexes that are now <= the finalized index.
        currentPending = currentPending.filter(item => item.highestIndex > newFinalized);
      }

      this.#writePendingIndexes(jobId, secret, currentPending);
    }
  }
}
