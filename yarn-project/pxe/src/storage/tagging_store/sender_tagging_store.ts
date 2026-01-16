import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { DirectionalAppTaggingSecret, PreTag } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import type { StagedStore } from '../../job_coordinator/job_coordinator.js';
import { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../../tagging/constants.js';

/**
 * Data provider of tagging data used when syncing the sender tagging indexes. The recipient counterpart of this class
 * is called RecipientTaggingStore. We have the data stores separate for sender and recipient because
 * the algorithms are completely disjoint and there is not data reuse between the two.
 */
export class SenderTaggingStore implements StagedStore {
  readonly storeName = 'sender_tagging';

  #store: AztecAsyncKVStore;

  // Stores the pending indexes for each directional app tagging secret. Pending here means that the tx that contained
  // the private logs with tags corresponding to these indexes has not been finalized yet.
  //
  // We don't store just the highest index because if their transaction is dropped we'd then need the information about
  // the lower pending indexes. For each secret-tx pair however we only store the largest index used in that tx, since
  // the smaller ones are irrelevant due to tx atomicity.
  //
  // TODO(#17615): This assumes no logs are used in the non-revertible phase.
  //
  // directional app tagging secret => { pending index, txHash }[]
  #pendingIndexes: AztecAsyncMap<string, { index: number; txHash: string }[]>;

  // jobId => directional app tagging secret => { pending index, txHash }[]
  #pendingIndexesForJob: Map<string, Map<string, { index: number; txHash: string }[]>>;

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

  #getPendingIndexesForJob(jobId: string): Map<string, { index: number; txHash: string }[]> {
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

  async #readPendingIndexes(jobId: string, secret: string): Promise<{ index: number; txHash: string }[]> {
    const jobStagedPendingIndexes = this.#getPendingIndexesForJob(jobId);
    const pendingIndexes = jobStagedPendingIndexes.get(secret);
    // We return the staged version of this if it exists, if not, we read from the DB.
    // If the DB also has nothing, we return an empty array [].
    return pendingIndexes !== undefined ? pendingIndexes : ((await this.#pendingIndexes.getAsync(secret)) ?? []);
  }

  #writePendingIndexes(jobId: string, secret: string, pendingIndexes: { index: number; txHash: string }[]) {
    this.#getPendingIndexesForJob(jobId).set(secret, pendingIndexes);
  }

  /**
   * Returns a job view of all the secrets that have a corresponding list of pending indexes either in persistent
   * storage or the current job.
   */
  async #readSecretsWithPendingIndexes(jobId: string): Promise<string[]> {
    const storedSecrets = new Set(await toArray(this.#pendingIndexes.keysAsync()));
    const stagedSecrets = this.#getPendingIndexesForJob(jobId).keys();
    return [...storedSecrets.union(new Set(stagedSecrets))];
  }

  async #readLastFinalizedIndex(jobId: string, secret: string): Promise<number | undefined> {
    return (
      this.#getLastFinalizedIndexesForJob(jobId).get(secret) ?? (await this.#lastFinalizedIndexes.getAsync(secret))
    );
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
   * Stores pending indexes.
   * @remarks Ignores the index if the same preTag + txHash combination already exists in the db with the same index.
   * This is expected to happen because whenever we start sync we start from the last finalized index and we can have
   * pending indexes already stored from previous syncs.
   * @param preTags - The pre-tags containing the directional app tagging secrets and the indexes that are to be
   * stored in the db.
   * @param txHash - The tx in which the pretags were used in private logs.
   * @param jobId - job context for staged writes to this store. See `JobCoordinator` for more details.
   * @throws If any two pre-tags contain the same directional app tagging secret. This is enforced because we care
   * only about the highest index for a given secret that was used in the tx. Hence this check is a good way to catch
   * bugs.
   * @throws If the newly stored pending index is further than window length from the highest finalized index for the
   * same secret. This is enforced in order to give a guarantee to a recipient that he doesn't need to look further than
   * window length ahead of the highest finalized index.
   * @throws If a secret + txHash pair already exists in the db with a different index value. It should never happen
   * that we would attempt to store a different index for a given secret-txHash pair because we always store just the
   * highest index for a given secret-txHash pair. Hence this is a good way to catch bugs.
   * @throws If the newly stored pending index is lower than or equal to the last finalized index for the same secret.
   * This is enforced because this should never happen if the syncing is done correctly as we look for logs from higher
   * indexes than finalized ones.
   */
  async storePendingIndexes(preTags: PreTag[], txHash: TxHash, jobId: string) {
    // The secrets in pre-tags should be unique because we always store just the highest index per given secret-txHash
    // pair. Below we check that this is the case.
    const secretsSet = new Set(preTags.map(preTag => preTag.secret.toString()));
    if (secretsSet.size !== preTags.length) {
      throw new Error(`Duplicate secrets found when storing pending indexes`);
    }

    for (const { secret, index } of preTags) {
      // First we check that for any secret the highest used index in tx is not further than window length from
      // the highest finalized index.
      const finalizedIndex = (await this.getLastFinalizedIndex(secret, jobId)) ?? 0;
      if (index > finalizedIndex + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN) {
        throw new Error(
          `Highest used index ${index} is further than window length from the highest finalized index ${finalizedIndex}.
          Tagging window length ${UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN} is configured too low. Contact the Aztec team
          to increase it!`,
        );
      }

      // Throw if the new pending index is lower than or equal to the last finalized index
      const secretStr = secret.toString();
      const lastFinalizedIndex = await this.#readLastFinalizedIndex(jobId, secretStr);
      if (lastFinalizedIndex !== undefined && index <= lastFinalizedIndex) {
        throw new Error(
          `Cannot store pending index ${index} for secret ${secretStr}: ` +
            `it is lower than or equal to the last finalized index ${lastFinalizedIndex}`,
        );
      }

      // Check if this secret + txHash combination already exists
      const txHashStr = txHash.toString();
      const existingForSecret = await this.#readPendingIndexes(jobId, secretStr);
      const existingForSecretAndTx = existingForSecret.find(entry => entry.txHash === txHashStr);

      if (existingForSecretAndTx) {
        // If it exists with a different index, throw an error
        if (existingForSecretAndTx.index !== index) {
          throw new Error(
            `Cannot store index ${index} for secret ${secretStr} and txHash ${txHashStr}: ` +
              `a different index ${existingForSecretAndTx.index} already exists for this secret-txHash pair`,
          );
        }
        // If it exists with the same index, ignore the update (no-op)
      } else {
        // If it doesn't exist, add it
        this.#writePendingIndexes(jobId, secretStr, [...existingForSecret, { index, txHash: txHashStr }]);
      }
    }
  }

  /**
   * Returns the transaction hashes of all pending transactions that contain indexes within a specified range
   * for a given directional app tagging secret.
   * @param secret - The directional app tagging secret to query pending indexes for.
   * @param startIndex - The lower bound of the index range (inclusive).
   * @param endIndex - The upper bound of the index range (exclusive).
   * @returns An array of unique transaction hashes for pending transactions that contain indexes in the range
   * [startIndex, endIndex). Returns an empty array if no pending indexes exist in the range.
   */
  async getTxHashesOfPendingIndexes(
    secret: DirectionalAppTaggingSecret,
    startIndex: number,
    endIndex: number,
    jobId: string,
  ): Promise<TxHash[]> {
    const existing = await this.#readPendingIndexes(jobId, secret.toString());
    const txHashes = existing
      .filter(entry => entry.index >= startIndex && entry.index < endIndex)
      .map(entry => entry.txHash);
    return Array.from(new Set(txHashes)).map(TxHash.fromString);
  }

  /**
   * Returns the last (highest) finalized index for a given secret.
   * @param secret - The secret to get the last finalized index for.
   * @returns The last (highest) finalized index for the given secret.
   */
  getLastFinalizedIndex(secret: DirectionalAppTaggingSecret, jobId: string): Promise<number | undefined> {
    return this.#readLastFinalizedIndex(jobId, secret.toString());
  }

  /**
   * Returns the last used index for a given directional app tagging secret, considering both finalized and pending
   * indexes.
   * @param secret - The directional app tagging secret to query the last used index for.
   * @returns The last used index.
   */
  async getLastUsedIndex(secret: DirectionalAppTaggingSecret, jobId: string): Promise<number | undefined> {
    const secretStr = secret.toString();
    const pendingTxScopedIndexes = await this.#readPendingIndexes(jobId, secretStr);
    const pendingIndexes = pendingTxScopedIndexes.map(entry => entry.index);

    if (pendingTxScopedIndexes.length === 0) {
      return this.#readLastFinalizedIndex(jobId, secretStr);
    }

    // As the last used index we return the highest one from the pending indexes. Note that this value will be always
    // higher than the last finalized index because we prune lower pending indexes when a tx is finalized.
    return Math.max(...pendingIndexes);
  }

  /**
   * Drops all pending indexes corresponding to the given transaction hashes.
   */
  async dropPendingIndexes(txHashes: TxHash[], jobId: string) {
    if (txHashes.length === 0) {
      return;
    }

    const txHashStrings = new Set<string>(txHashes.map(txHash => txHash.toString()));
    const allSecrets = await this.#readSecretsWithPendingIndexes(jobId);

    for (const secret of allSecrets) {
      const pendingData = await this.#readPendingIndexes(jobId, secret);
      if (pendingData) {
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
  }

  /**
   * Updates pending indexes corresponding to the given transaction hashes to be finalized and prunes any lower pending
   * indexes.
   */
  async finalizePendingIndexes(txHashes: TxHash[], jobId: string) {
    if (txHashes.length === 0) {
      return;
    }

    for (const txHash of txHashes) {
      const txHashStr = txHash.toString();

      const allSecrets = await this.#readSecretsWithPendingIndexes(jobId);

      for (const secret of allSecrets) {
        const pendingData = await this.#readPendingIndexes(jobId, secret);
        if (!pendingData) {
          continue;
        }

        const matchingIndexes = pendingData.filter(item => item.txHash === txHashStr).map(item => item.index);
        if (matchingIndexes.length === 0) {
          continue;
        }

        if (matchingIndexes.length > 1) {
          // We should always just store the highest pending index for a given tx hash and secret because the lower
          // values are irrelevant.
          throw new Error(`Multiple pending indexes found for tx hash ${txHashStr} and secret ${secret}`);
        }

        let lastFinalized = await this.#readLastFinalizedIndex(jobId, secret);
        const newFinalized = matchingIndexes[0];

        if (newFinalized < (lastFinalized ?? 0)) {
          // This should never happen because when last finalized index was finalized we should have pruned the lower
          // pending indexes.
          throw new Error(
            `New finalized index ${newFinalized} is smaller than the current last finalized index ${lastFinalized}`,
          );
        }

        this.#writeLastFinalizedIndex(jobId, secret, newFinalized);
        lastFinalized = newFinalized;

        // When we add pending indexes, we ensure they are higher than the last finalized index. However, because we
        // cannot control the order in which transactions are finalized, there may be pending indexes that are now
        // obsolete because they are lower than the most recently finalized index. For this reason, we prune these
        // outdated pending indexes.
        const remainingItemsOfHigherIndex = pendingData.filter(item => item.index > (lastFinalized ?? 0));
        if (remainingItemsOfHigherIndex.length === 0) {
          this.#writePendingIndexes(jobId, secret, []);
        } else {
          this.#writePendingIndexes(jobId, secret, remainingItemsOfHigherIndex);
        }
      }
    }
  }
}
