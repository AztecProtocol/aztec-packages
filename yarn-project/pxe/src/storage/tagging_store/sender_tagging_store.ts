import { allToCompletion } from '@aztec/foundation/promise';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AppTaggingSecret, SiloedTag, type TaggingIndexRange } from '@aztec/stdlib/logs';
import { TxEffect, TxHash } from '@aztec/stdlib/tx';

import { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN, unfinalizedTaggingIndexesWindowEnd } from '../../tagging/constants.js';
import { BaseStagingStore, type ReadonlyDb } from '../base_staging_store.js';
import type { ChangeSetId } from '../staged_write_coordinator.js';

/** A tx still awaiting finalization, and the highest tagging index it used for one secret. */
export type PendingTx = { txHash: string; highestIndex: number };

/** Internal representation of a pending index range entry. */
type PendingIndexesEntry = PendingTx & { lowestIndex: number };

/**
 * Data provider of tagging data used when syncing the sender tagging indexes. The recipient counterpart of this class
 * is called RecipientTaggingStore. We have the data stores separate for sender and recipient because
 * the algorithms are completely disjoint and there is not data reuse between the two.
 */
export class SenderTaggingStore extends BaseStagingStore<SenderTaggingChangeSet, SenderTaggingDb> {
  constructor(store: AztecAsyncKVStore) {
    super({
      storeName: 'sender_tagging',
      store,
      buildChangeSet: () => ({ pendingIndexes: new Map(), lastFinalizedIndexes: new Map() }),
      buildDb: db => ({
        pendingIndexes: db.openMap('pending_indexes'),
        lastFinalizedIndexes: db.openMap('last_finalized_indexes'),
      }),
    });
  }

  async #readPendingIndexes(
    changeSet: SenderTaggingChangeSet,
    db: ReadonlyDb<SenderTaggingDb>,
    secret: string,
  ): Promise<PendingIndexesEntry[]> {
    // Always issue DB read to keep IndexedDB transaction alive (they auto-commit when a new micro-task starts and there
    // are no pending read requests). The staged value still takes precedence if it exists.
    const dbValue = await db.pendingIndexes.getAsync(secret);
    const staged = changeSet.pendingIndexes.get(secret);
    return staged !== undefined ? staged : (dbValue ?? []);
  }

  async #readLastFinalizedIndex(
    changeSet: SenderTaggingChangeSet,
    db: ReadonlyDb<SenderTaggingDb>,
    secret: string,
  ): Promise<number | undefined> {
    // Always issue DB read to keep IndexedDB transaction alive (they auto-commit when a new micro-task starts and there
    // are no pending read requests). The staged value still takes precedence if it exists.
    const dbValue = await db.lastFinalizedIndexes.getAsync(secret);
    const staged = changeSet.lastFinalizedIndexes.get(secret);
    return staged ?? dbValue;
  }

  protected async flushChangeSet(changeSet: SenderTaggingChangeSet, db: SenderTaggingDb): Promise<void> {
    for (const [secret, pendingIndexes] of changeSet.pendingIndexes) {
      if (pendingIndexes.length === 0) {
        await db.pendingIndexes.delete(secret);
      } else {
        await db.pendingIndexes.set(secret, pendingIndexes);
      }
    }

    for (const [secret, lastFinalizedIndex] of changeSet.lastFinalizedIndexes) {
      await db.lastFinalizedIndexes.set(secret, lastFinalizedIndex);
    }
  }

  /**
   * No-op: the last finalized index only ever advances from finalized blocks, and pending entries are keyed by tx
   * hash rather than anchored to a block, so a prune removes neither.
   */
  protected applyRollback(): Promise<void> {
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
   * @param changeSetId - change set to stage this store's writes under. See {@link StagedWriteCoordinator} for more
   * details.
   * @throws If the highestIndex is further than window length from the highest finalized index for the same secret.
   * @throws If the lowestIndex is lower than or equal to the last finalized index for the same secret.
   * @throws If a different range already exists for the same (secret, txHash) pair.
   */
  storePendingIndexes(ranges: TaggingIndexRange[], txHash: TxHash, changeSetId: ChangeSetId): Promise<void> {
    return this.#storePendingIndexes(ranges, txHash, changeSetId, false);
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
   * @param changeSetId - change set to stage this store's writes under. See {@link StagedWriteCoordinator} for more
   * details.
   * @throws If the highestIndex is further than window length from the highest finalized index for the same secret.
   * @throws If the lowestIndex is lower than or equal to the last finalized index for the same secret.
   */
  mergePendingIndexes(ranges: TaggingIndexRange[], txHash: TxHash, changeSetId: ChangeSetId): Promise<void> {
    return this.#storePendingIndexes(ranges, txHash, changeSetId, true);
  }

  #storePendingIndexes(
    ranges: TaggingIndexRange[],
    txHash: TxHash,
    changeSetId: ChangeSetId,
    mergeExisting: boolean,
  ): Promise<void> {
    if (ranges.length === 0) {
      return Promise.resolve();
    }

    const txHashStr = txHash.toString();

    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      // Prefetch all data, start reads during iteration to keep IndexedDB transaction alive
      const rangeReadPromises = ranges.map(range => ({
        range,
        secretStr: range.extendedSecret.toString(),
        pending: this.#readPendingIndexes(changeSet, db, range.extendedSecret.toString()),
        finalized: this.#readLastFinalizedIndex(changeSet, db, range.extendedSecret.toString()),
      }));

      // Await all reads together
      const rangeData = await allToCompletion(
        rangeReadPromises.map(async item => ({
          ...item,
          pendingData: await item.pending,
          finalizedIndex: await item.finalized,
        })),
      );

      // Process in memory and validate
      for (const { range, secretStr, pendingData, finalizedIndex } of rangeData) {
        const windowEnd = unfinalizedTaggingIndexesWindowEnd(finalizedIndex);
        if (range.highestIndex >= windowEnd) {
          throw windowExceededError(range.highestIndex, windowEnd, finalizedIndex);
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
          changeSet.pendingIndexes.set(secretStr, updatedPending);
        }
      }
    });
  }

  /**
   * Returns the pending txs whose highest index falls within [startIndex, endIndex) for a given directional app
   * tagging secret. The highest index is what decides whether a tx belongs to the window, so it alone is matched
   * against the bounds, and it is also the only index a caller needs: a tx whose highest index is onchain has every
   * lower one onchain too. A secret holds at most one entry per tx hash, so no tx hash appears twice in the result.
   * @param secret - The directional app tagging secret to query pending indexes for.
   * @param startIndex - The lower bound of the index range (inclusive).
   * @param endIndex - The upper bound of the index range (exclusive).
   */
  getPendingTxs(
    secret: AppTaggingSecret,
    startIndex: number,
    endIndex: number,
    changeSetId: ChangeSetId,
  ): Promise<PendingTx[]> {
    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      const existing = await this.#readPendingIndexes(changeSet, db, secret.toString());
      return existing
        .filter(entry => entry.highestIndex >= startIndex && entry.highestIndex < endIndex)
        .map(entry => ({ txHash: entry.txHash, highestIndex: entry.highestIndex }));
    });
  }

  /**
   * Returns the last (highest) finalized index for a given secret.
   * @param secret - The secret to get the last finalized index for.
   * @returns The last (highest) finalized index for the given secret.
   */
  getLastFinalizedIndex(secret: AppTaggingSecret, changeSetId: ChangeSetId): Promise<number | undefined> {
    return this.withChangeSetAndDb(changeSetId, (changeSet, db) =>
      this.#readLastFinalizedIndex(changeSet, db, secret.toString()),
    );
  }

  /**
   * Returns the last used index for a given directional app tagging secret, considering both finalized and pending
   * indexes.
   * @param secret - The directional app tagging secret to query the last used index for.
   * @returns The last used index.
   */
  getLastUsedIndex(secret: AppTaggingSecret, changeSetId: ChangeSetId): Promise<number | undefined> {
    const secretStr = secret.toString();

    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      const pendingPromise = this.#readPendingIndexes(changeSet, db, secretStr);
      const finalizedPromise = this.#readLastFinalizedIndex(changeSet, db, secretStr);

      const [pendingEntries, lastFinalized] = await allToCompletion([pendingPromise, finalizedPromise]);

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
  dropPendingIndexes(txHashes: TxHash[], changeSetId: ChangeSetId): Promise<void> {
    if (txHashes.length === 0) {
      return Promise.resolve();
    }

    const txHashStrings = new Set<string>(txHashes.map(txHash => txHash.toString()));

    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      // Prefetch all data, start reads during iteration to keep IndexedDB transaction alive
      const secretReadPromises: Map<string, Promise<PendingIndexesEntry[]>> = new Map();

      for await (const secret of db.pendingIndexes.keysAsync()) {
        secretReadPromises.set(secret, this.#readPendingIndexes(changeSet, db, secret));
      }

      // Add staged-only secrets (sync, no DB)
      for (const secret of changeSet.pendingIndexes.keys()) {
        if (!secretReadPromises.has(secret)) {
          secretReadPromises.set(secret, Promise.resolve(changeSet.pendingIndexes.get(secret) ?? []));
        }
      }

      // Await all reads together
      const secrets = [...secretReadPromises.keys()];
      const pendingDataResults = await allToCompletion([...secretReadPromises.values()]);

      // Process in memory
      for (let i = 0; i < secrets.length; i++) {
        const secret = secrets[i];
        const pendingData = pendingDataResults[i];

        if (pendingData && pendingData.length > 0) {
          const filtered = pendingData.filter(item => !txHashStrings.has(item.txHash));
          if (filtered.length === 0) {
            changeSet.pendingIndexes.set(secret, []);
          } else if (filtered.length !== pendingData.length) {
            // Some items were filtered out, so update the pending data
            changeSet.pendingIndexes.set(secret, filtered);
          }
          // else: No items were filtered out (txHashes not found for this secret) --> no-op
        }
      }
    });
  }

  /** Prefetches all pending and finalized index data for every secret (from both DB and staged writes). */
  async #getSecretsWithPendingData(
    changeSet: SenderTaggingChangeSet,
    db: ReadonlyDb<SenderTaggingDb>,
  ): Promise<{ secret: string; pendingData: PendingIndexesEntry[]; lastFinalized: number | undefined }[]> {
    // Prefetch all data, start reads during iteration to keep IndexedDB transaction alive
    const secretDataPromises: Map<
      string,
      { pending: Promise<PendingIndexesEntry[]>; finalized: Promise<number | undefined> }
    > = new Map();

    for await (const secret of db.pendingIndexes.keysAsync()) {
      secretDataPromises.set(secret, {
        pending: this.#readPendingIndexes(changeSet, db, secret),
        finalized: this.#readLastFinalizedIndex(changeSet, db, secret),
      });
    }

    // Add staged-only secrets (sync, no DB)
    for (const secret of changeSet.pendingIndexes.keys()) {
      if (!secretDataPromises.has(secret)) {
        secretDataPromises.set(secret, {
          pending: Promise.resolve(changeSet.pendingIndexes.get(secret) ?? []),
          finalized: Promise.resolve(changeSet.lastFinalizedIndexes.get(secret)),
        });
      }
    }

    // Await all reads together
    const secrets = [...secretDataPromises.keys()];
    const dataResults = await allToCompletion(
      secrets.map(async secret => ({
        secret,
        pendingData: await secretDataPromises.get(secret)!.pending,
        lastFinalized: await secretDataPromises.get(secret)!.finalized,
      })),
    );

    return dataResults.filter(r => r.pendingData.length > 0);
  }

  /**
   * Updates pending indexes corresponding to the given transaction hashes to be finalized and prunes any lower pending
   * indexes. Applies to every secret the txs used, so the caller must hold tx-level evidence that the whole tx
   * finalized. Callers holding evidence about a single secret must use {@link finalizePendingIndexesOfSecret} instead.
   */
  finalizePendingIndexes(txHashes: TxHash[], changeSetId: ChangeSetId): Promise<void> {
    return this.#finalizePendingIndexes(txHashes, changeSetId);
  }

  /**
   * Same as {@link finalizePendingIndexes}, but restricted to the pending indexes of a single secret.
   *
   * Finalizing every secret off single-secret evidence would be unsound: a tx whose execution partially reverted can
   * have all of one secret's tags onchain and none of another's, and the second secret's indexes must not be recorded
   * as finalized when they never reached the chain.
   */
  finalizePendingIndexesOfSecret(
    secret: AppTaggingSecret,
    txHashes: TxHash[],
    changeSetId: ChangeSetId,
  ): Promise<void> {
    return this.#finalizePendingIndexes(txHashes, changeSetId, secret.toString());
  }

  #finalizePendingIndexes(txHashes: TxHash[], changeSetId: ChangeSetId, onlySecret?: string): Promise<void> {
    if (txHashes.length === 0) {
      return Promise.resolve();
    }

    const txHashStrings = new Set(txHashes.map(tx => tx.toString()));

    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      const secretsWithData = (await this.#getSecretsWithPendingData(changeSet, db)).filter(
        ({ secret }) => onlySecret === undefined || secret === onlySecret,
      );

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
          changeSet.lastFinalizedIndexes.set(secret, currentFinalized!);
        }
        if (currentPending !== pendingData) {
          changeSet.pendingIndexes.set(secret, currentPending);
        }
      }
    });
  }

  /**
   * Handles finalization of pending indexes for a transaction whose execution was partially reverted.
   * Recomputes the siloed tags for each pending index of the given tx and checks which ones appear in the
   * TxEffect's private logs (i.e., which ones made it onchain). Those that survived are finalized; those that
   * didn't are dropped.
   * @param txEffect - The tx effect of the partially reverted transaction.
   * @param changeSetId - change set to stage this store's writes under. See {@link StagedWriteCoordinator} for more
   * details.
   */
  finalizePendingIndexesOfAPartiallyRevertedTx(txEffect: TxEffect, changeSetId: ChangeSetId): Promise<void> {
    const txHashStr = txEffect.txHash.toString();

    // Build a set of all siloed tag values that made it onchain (first field of each private log).
    const onChainTags = new Set<string>(txEffect.privateLogs.map(log => log.fields[0].toString()));

    return this.withChangeSetAndDb(changeSetId, async (changeSet, db) => {
      const secretsWithData = await this.#getSecretsWithPendingData(changeSet, db);

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
            highestSurvivingIndex =
              highestSurvivingIndex !== undefined ? Math.max(highestSurvivingIndex, index) : index;
          }
        }

        // Remove all entries for this txHash from pending (both surviving and non-surviving).
        let currentPending = pendingData.filter(item => item.txHash !== txHashStr);

        if (highestSurvivingIndex !== undefined) {
          const newFinalized = Math.max(lastFinalized ?? 0, highestSurvivingIndex);
          changeSet.lastFinalizedIndexes.set(secret, newFinalized);

          // Prune pending indexes that are now <= the finalized index.
          currentPending = currentPending.filter(item => item.highestIndex > newFinalized);
        }

        changeSet.pendingIndexes.set(secret, currentPending);
      }
    });
  }
}

/** Builds the error thrown when a pending tag index is at or past the unfinalized tagging window end. */
export function windowExceededError(
  highestIndex: number,
  windowEnd: number,
  finalizedIndex: number | undefined,
): Error {
  const finalizedDescription =
    finalizedIndex === undefined ? 'no index finalized yet' : `highest finalized index ${finalizedIndex}`;
  return new Error(
    `Highest used index ${highestIndex} is at or past the window end ${windowEnd} (${finalizedDescription}). ` +
      `Tagging window length ${UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN} is configured too low. ` +
      `Contact the Aztec team to increase it!`,
  );
}

/**
 * A change set's staged data, created and discarded as a unit: the pending index ranges and the last finalized index,
 * both keyed by directional app tagging secret.
 */
type SenderTaggingChangeSet = {
  pendingIndexes: Map<string, PendingIndexesEntry[]>;
  lastFinalizedIndexes: Map<string, number>;
};

type SenderTaggingDb = {
  // Stores the pending index ranges for each directional app tagging secret. Pending here means that the tx that
  // contained the private logs with tags corresponding to these indexes has not been finalized yet.
  //
  // We store the full range (lowestIndex, highestIndex) for each secret-tx pair because transactions can partially
  // revert, in which case only some logs (from the non-revertible phase) survive onchain. By storing the range,
  // we can expand it and check each individual siloed tag against the TxEffect to determine which indexes made it
  // onchain.
  //
  // directional app tagging secret => { lowestIndex, highestIndex, txHash }[]
  pendingIndexes: AztecAsyncMap<string, PendingIndexesEntry[]>;

  // Stores the last (highest) finalized index for each directional app tagging secret. We care only about the last
  // index because unlike the pending indexes, it will never happen that a finalized index would be removed and hence
  // we don't need to store the history.
  //
  // directional app tagging secret => highest finalized index
  lastFinalizedIndexes: AztecAsyncMap<string, number>;
};
