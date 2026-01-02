import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { DirectionalAppTaggingSecret, PreTag } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import type { JobContext, StagingDataProvider } from '../../job_coordinator/index.js';
import { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN } from '../../tagging/sync/sync_sender_tagging_indexes.js';

// Key constants for staging
const PENDING_INDEXES_PREFIX = 'pending:';
const FINALIZED_INDEXES_PREFIX = 'finalized:';

/**
 * Data provider of tagging data used when syncing the sender tagging indexes. The recipient counterpart of this class
 * is called RecipientTaggingDataProvider. We have the providers separate for the sender and recipient because
 * the algorithms are completely disjoint and there is not data reuse between the two.
 *
 * Supports staged writes via JobContext for crash resilience.
 */
export class SenderTaggingDataProvider implements StagingDataProvider {
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
  #pendingIndexes: AztecAsyncMap<string, { index: number; txHash: string }[]>;

  // Stores the last (highest) finalized index for each directional app tagging secret. We care only about the last
  // index because unlike the pending indexes, it will never happen that a finalized index would be removed and hence
  // we don't need to store the history.
  #lastFinalizedIndexes: AztecAsyncMap<string, number>;

  // Staging map for both pending and finalized indexes
  #stagingMap: AztecAsyncMap<string, Buffer>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#pendingIndexes = this.#store.openMap('pending_indexes');
    this.#lastFinalizedIndexes = this.#store.openMap('last_finalized_indexes');
    this.#stagingMap = this.#store.openMap('sender_tagging_staging');
  }

  /**
   * Stores pending indexes.
   * @remarks Ignores the index if the same preTag + txHash combination already exists in the db with the same index.
   * This is expected to happen because whenever we start sync we start from the last finalized index and we can have
   * pending indexes already stored from previous syncs.
   * @param preTags - The pre-tags containing the directional app tagging secrets and the indexes that are to be
   * stored in the db.
   * @param txHash - The tx in which the pretags were used in private logs.
   * @param context - Optional job context for staged writes.
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
  async storePendingIndexes(preTags: PreTag[], txHash: TxHash, context?: JobContext) {
    // The secrets in pre-tags should be unique because we always store just the highest index per given secret-txHash
    // pair. Below we check that this is the case.
    const secretsSet = new Set(preTags.map(preTag => preTag.secret.toString()));
    if (secretsSet.size !== preTags.length) {
      throw new Error(`Duplicate secrets found when storing pending indexes`);
    }

    for (const { secret, index } of preTags) {
      // First we check that for any secret the highest used index in tx is not further than window length from
      // the highest finalized index.
      const finalizedIndex = (await this.getLastFinalizedIndex(secret, context)) ?? 0;
      if (index > finalizedIndex + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN) {
        throw new Error(
          `Highest used index ${index} is further than window length from the highest finalized index ${finalizedIndex}.
          Tagging window length ${UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN} is configured too low. Contact the Aztec team
          to increase it!`,
        );
      }

      // Throw if the new pending index is lower than or equal to the last finalized index
      const secretStr = secret.toString();
      const lastFinalizedIndex = await this.#getLastFinalizedIndexInternal(secretStr, context);
      if (lastFinalizedIndex !== undefined && index <= lastFinalizedIndex) {
        throw new Error(
          `Cannot store pending index ${index} for secret ${secretStr}: ` +
            `it is lower than or equal to the last finalized index ${lastFinalizedIndex}`,
        );
      }

      // Check if this secret + txHash combination already exists
      const txHashStr = txHash.toString();
      const existingForSecret = await this.#getPendingIndexesInternal(secretStr, context);
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
        const newValue = [...existingForSecret, { index, txHash: txHashStr }];
        await this.#setPendingIndexesInternal(secretStr, newValue, context);
      }
    }
  }

  /**
   * Returns the transaction hashes of all pending transactions that contain indexes within a specified range
   * for a given directional app tagging secret.
   * @param secret - The directional app tagging secret to query pending indexes for.
   * @param startIndex - The lower bound of the index range (inclusive).
   * @param endIndex - The upper bound of the index range (exclusive).
   * @param context - Optional job context to check staging first.
   * @returns An array of unique transaction hashes for pending transactions that contain indexes in the range
   * [startIndex, endIndex). Returns an empty array if no pending indexes exist in the range.
   */
  async getTxHashesOfPendingIndexes(
    secret: DirectionalAppTaggingSecret,
    startIndex: number,
    endIndex: number,
    context?: JobContext,
  ): Promise<TxHash[]> {
    const existing = await this.#getPendingIndexesInternal(secret.toString(), context);
    const txHashes = existing
      .filter(entry => entry.index >= startIndex && entry.index < endIndex)
      .map(entry => entry.txHash);
    return Array.from(new Set(txHashes)).map(TxHash.fromString);
  }

  /**
   * Returns the last (highest) finalized index for a given secret.
   * @param secret - The secret to get the last finalized index for.
   * @param context - Optional job context to check staging first.
   * @returns The last (highest) finalized index for the given secret.
   */
  getLastFinalizedIndex(secret: DirectionalAppTaggingSecret, context?: JobContext): Promise<number | undefined> {
    return this.#getLastFinalizedIndexInternal(secret.toString(), context);
  }

  /**
   * Returns the last used index for a given directional app tagging secret, considering both finalized and pending
   * indexes.
   * @param secret - The directional app tagging secret to query the last used index for.
   * @param context - Optional job context to check staging first.
   * @returns The last used index.
   */
  async getLastUsedIndex(secret: DirectionalAppTaggingSecret, context?: JobContext): Promise<number | undefined> {
    const secretStr = secret.toString();
    const pendingTxScopedIndexes = await this.#getPendingIndexesInternal(secretStr, context);
    const pendingIndexes = pendingTxScopedIndexes.map(entry => entry.index);

    if (pendingTxScopedIndexes.length === 0) {
      return this.#getLastFinalizedIndexInternal(secretStr, context);
    }

    // As the last used index we return the highest one from the pending indexes. Note that this value will be always
    // higher than the last finalized index because we prune lower pending indexes when a tx is finalized.
    return Math.max(...pendingIndexes);
  }

  /**
   * Drops all pending indexes corresponding to the given transaction hashes.
   * @param txHashes - The transaction hashes to drop pending indexes for.
   * @param context - Optional job context for staged writes.
   */
  async dropPendingIndexes(txHashes: TxHash[], context?: JobContext) {
    if (txHashes.length === 0) {
      return;
    }

    const txHashStrs = new Set<string>(txHashes.map(txHash => txHash.toString()));
    const allSecrets = await this.#getAllPendingSecrets(context);

    for (const secret of allSecrets) {
      const pendingData = await this.#getPendingIndexesInternal(secret, context);
      if (pendingData.length > 0) {
        const filtered = pendingData.filter(item => !txHashStrs.has(item.txHash));
        if (filtered.length === 0) {
          await this.#deletePendingIndexesInternal(secret, context);
        } else if (filtered.length !== pendingData.length) {
          // Some items were filtered out, so update the pending data
          await this.#setPendingIndexesInternal(secret, filtered, context);
        }
        // else: No items were filtered out (txHashes not found for this secret) --> no-op
      }
    }
  }

  /**
   * Updates pending indexes corresponding to the given transaction hashes to be finalized and prunes any lower pending
   * indexes.
   * @param txHashes - The transaction hashes to finalize pending indexes for.
   * @param context - Optional job context for staged writes.
   */
  async finalizePendingIndexes(txHashes: TxHash[], context?: JobContext) {
    if (txHashes.length === 0) {
      return;
    }

    for (const txHash of txHashes) {
      const txHashStr = txHash.toString();

      const allSecrets = await this.#getAllPendingSecrets(context);

      for (const secret of allSecrets) {
        const pendingData = await this.#getPendingIndexesInternal(secret, context);
        if (pendingData.length === 0) {
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

        let lastFinalized = await this.#getLastFinalizedIndexInternal(secret, context);
        const newFinalized = matchingIndexes[0];

        if (newFinalized < (lastFinalized ?? 0)) {
          // This should never happen because when last finalized index was finalized we should have pruned the lower
          // pending indexes.
          throw new Error(
            `New finalized index ${newFinalized} is smaller than the current last finalized index ${lastFinalized}`,
          );
        }

        await this.#setLastFinalizedIndexInternal(secret, newFinalized, context);
        lastFinalized = newFinalized;

        // When we add pending indexes, we ensure they are higher than the last finalized index. However, because we
        // cannot control the order in which transactions are finalized, there may be pending indexes that are now
        // obsolete because they are lower than the most recently finalized index. For this reason, we prune these
        // outdated pending indexes.
        const remainingItemsOfHigherIndex = pendingData.filter(item => item.index > (lastFinalized ?? 0));
        if (remainingItemsOfHigherIndex.length === 0) {
          await this.#deletePendingIndexesInternal(secret, context);
        } else {
          await this.#setPendingIndexesInternal(secret, remainingItemsOfHigherIndex, context);
        }
      }
    }
  }

  /**
   * Commits staged data to main storage.
   * Called by JobCoordinator when a job completes successfully.
   */
  commitStaging(context: JobContext): Promise<void> {
    return this.#store.transactionAsync(async () => {
      // Iterate through all staging keys and promote to main
      for await (const key of this.#stagingMap.keysAsync()) {
        if (!key.startsWith(context.stagingPrefix)) {
          continue;
        }

        const mainKey = key.substring(context.stagingPrefix.length);
        const value = await this.#stagingMap.getAsync(key);

        if (value) {
          if (mainKey.startsWith(PENDING_INDEXES_PREFIX)) {
            const secret = mainKey.substring(PENDING_INDEXES_PREFIX.length);
            const data = JSON.parse(value.toString()) as { index: number; txHash: string }[] | null;
            if (data === null) {
              await this.#pendingIndexes.delete(secret);
            } else {
              await this.#pendingIndexes.set(secret, data);
            }
          } else if (mainKey.startsWith(FINALIZED_INDEXES_PREFIX)) {
            const secret = mainKey.substring(FINALIZED_INDEXES_PREFIX.length);
            const data = JSON.parse(value.toString()) as number;
            await this.#lastFinalizedIndexes.set(secret, data);
          }
        }

        await this.#stagingMap.delete(key);
      }
    });
  }

  /**
   * Discards staged data without committing.
   * Called by JobCoordinator on abort or during recovery.
   */
  async discardStaging(stagingPrefix: string): Promise<void> {
    const keysToDelete: string[] = [];
    for await (const key of this.#stagingMap.keysAsync()) {
      if (key.startsWith(stagingPrefix)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      await this.#stagingMap.delete(key);
    }
  }

  // Internal helpers for staging-aware reads and writes

  async #getPendingIndexesInternal(secret: string, context?: JobContext): Promise<{ index: number; txHash: string }[]> {
    if (context) {
      const stagingKey = context.stagingKey(`${PENDING_INDEXES_PREFIX}${secret}`);
      const staged = await this.#stagingMap.getAsync(stagingKey);
      if (staged) {
        const data = JSON.parse(staged.toString());
        return data === null ? [] : data;
      }
    }
    return (await this.#pendingIndexes.getAsync(secret)) ?? [];
  }

  async #setPendingIndexesInternal(
    secret: string,
    value: { index: number; txHash: string }[],
    context?: JobContext,
  ): Promise<void> {
    if (context) {
      const stagingKey = context.stagingKey(`${PENDING_INDEXES_PREFIX}${secret}`);
      await this.#stagingMap.set(stagingKey, Buffer.from(JSON.stringify(value)));
      context.registerWrite(this.storeName);
    } else {
      await this.#pendingIndexes.set(secret, value);
    }
  }

  async #deletePendingIndexesInternal(secret: string, context?: JobContext): Promise<void> {
    if (context) {
      // Store null to indicate deletion in staging
      const stagingKey = context.stagingKey(`${PENDING_INDEXES_PREFIX}${secret}`);
      await this.#stagingMap.set(stagingKey, Buffer.from(JSON.stringify(null)));
      context.registerWrite(this.storeName);
    } else {
      await this.#pendingIndexes.delete(secret);
    }
  }

  async #getLastFinalizedIndexInternal(secret: string, context?: JobContext): Promise<number | undefined> {
    if (context) {
      const stagingKey = context.stagingKey(`${FINALIZED_INDEXES_PREFIX}${secret}`);
      const staged = await this.#stagingMap.getAsync(stagingKey);
      if (staged) {
        return JSON.parse(staged.toString()) as number;
      }
    }
    return this.#lastFinalizedIndexes.getAsync(secret);
  }

  async #setLastFinalizedIndexInternal(secret: string, value: number, context?: JobContext): Promise<void> {
    if (context) {
      const stagingKey = context.stagingKey(`${FINALIZED_INDEXES_PREFIX}${secret}`);
      await this.#stagingMap.set(stagingKey, Buffer.from(JSON.stringify(value)));
      context.registerWrite(this.storeName);
    } else {
      await this.#lastFinalizedIndexes.set(secret, value);
    }
  }

  async #getAllPendingSecrets(context?: JobContext): Promise<string[]> {
    const mainSecrets = await toArray(this.#pendingIndexes.keysAsync());

    if (!context) {
      return mainSecrets;
    }

    // Also include secrets that only exist in staging
    const stagingSecrets = new Set<string>();
    for await (const key of this.#stagingMap.keysAsync()) {
      if (key.startsWith(context.stagingPrefix + PENDING_INDEXES_PREFIX)) {
        const secret = key.substring((context.stagingPrefix + PENDING_INDEXES_PREFIX).length);
        stagingSecrets.add(secret);
      }
    }

    return Array.from(new Set([...mainSecrets, ...stagingSecrets]));
  }
}
