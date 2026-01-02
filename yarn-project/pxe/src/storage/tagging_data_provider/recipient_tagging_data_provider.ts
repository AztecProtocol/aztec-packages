import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DirectionalAppTaggingSecret, PreTag } from '@aztec/stdlib/logs';

import type { JobContext } from '../../job_coordinator/index.js';
import type { StagingDataProvider } from '../../job_coordinator/job_coordinator.js';

/**
 * Data provider of tagging data used when syncing the logs as a recipient. The sender counterpart of this class is
 * called SenderTaggingDataProvider. We have the providers separate for the sender and recipient because
 * the algorithms are completely disjoint and there is not data reuse between the 2.
 */
export class RecipientTaggingDataProvider implements StagingDataProvider {
  readonly storeName = 'recipient_tagging';

  #store: AztecAsyncKVStore;
  #addressBook: AztecAsyncMap<string, true>;

  // Stores the last used index for each directional app tagging secret.
  #lastUsedIndexes: AztecAsyncMap<string, number>;

  // Staging map for staging writes
  #stagingMap: AztecAsyncMap<string, Buffer>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#addressBook = this.#store.openMap('address_book');
    this.#lastUsedIndexes = this.#store.openMap('last_used_indexes');
    this.#stagingMap = this.#store.openMap('recipient_tagging_staging');
  }

  /**
   * Sets the last used indexes when looking for logs.
   * @param preTags - The pre-tags containing the directional app tagging secrets and the indexes that are to be
   * updated in the db.
   * @param context - Optional job context for staging writes
   * @throws If any two pre-tags contain the same directional app tagging secret
   */
  setLastUsedIndexes(preTags: PreTag[], context?: JobContext): Promise<void[]> {
    // Non-unique secrets would indicate a bug in the caller function.
    const secretsSet = new Set(preTags.map(preTag => preTag.secret.toString()));
    if (secretsSet.size !== preTags.length) {
      throw new Error(`Duplicate secrets found when setting last used indexes`);
    }

    if (context) {
      return Promise.all(
        preTags.map(({ secret, index }) => {
          const stagingKey = context.stagingKey(`index:${secret.toString()}`);
          const buffer = Buffer.alloc(4);
          buffer.writeUInt32BE(index);
          return this.#stagingMap.set(stagingKey, buffer);
        }),
      );
    }

    return Promise.all(preTags.map(({ secret, index }) => this.#lastUsedIndexes.set(secret.toString(), index)));
  }

  /**
   * Returns the last used indexes when looking for logs.
   * @param secrets - The directional app tagging secrets to obtain the indexes for.
   * @param context - Optional job context for reading staged data
   * @returns The last used indexes for the given directional app tagging secrets, or undefined if have never yet found
   * a log for a given secret.
   */
  getLastUsedIndexes(secrets: DirectionalAppTaggingSecret[], context?: JobContext): Promise<(number | undefined)[]> {
    return Promise.all(
      secrets.map(async secret => {
        if (context) {
          const stagingKey = context.stagingKey(`index:${secret.toString()}`);
          const staged = await this.#stagingMap.getAsync(stagingKey);
          if (staged !== undefined) {
            return staged.readUInt32BE();
          }
        }
        return this.#lastUsedIndexes.getAsync(secret.toString());
      }),
    );
  }

  /**
   * Resets all note sync data by clearing last used indexes.
   * @param context - Optional job context for staging the reset
   */
  resetNoteSyncData(context?: JobContext): Promise<void> {
    if (context) {
      // In staging mode, we mark all keys for deletion by storing a special marker
      return this.#store.transactionAsync(async () => {
        const keys = await toArray(this.#lastUsedIndexes.keysAsync());
        await Promise.all(
          keys.map(secret => {
            const stagingKey = context.stagingKey(`delete:index:${secret}`);
            return this.#stagingMap.set(stagingKey, Buffer.from('DELETE'));
          }),
        );
      });
    }

    return this.#store.transactionAsync(async () => {
      const keys = await toArray(this.#lastUsedIndexes.keysAsync());
      await Promise.all(keys.map(secret => this.#lastUsedIndexes.delete(secret)));
    });
  }

  // StagingDataProvider implementation

  /**
   * Commits staged data to main storage.
   * @param context - The job context containing the staging prefix
   */
  async commitStaging(context: JobContext): Promise<void> {
    await this.#store.transactionAsync(async () => {
      const stagingPrefix = context.stagingPrefix;
      const allKeys = await toArray(this.#stagingMap.keysAsync());
      const stagingKeys = allKeys.filter(key => key.startsWith(stagingPrefix));

      for (const stagingKey of stagingKeys) {
        const mainKey = context.mainKey(stagingKey);
        const value = await this.#stagingMap.getAsync(stagingKey);

        if (mainKey.startsWith('delete:index:')) {
          // This is a deletion marker - delete the main key
          const secretKey = mainKey.substring('delete:index:'.length);
          await this.#lastUsedIndexes.delete(secretKey);
        } else if (mainKey.startsWith('index:')) {
          // This is an index update
          const secretKey = mainKey.substring('index:'.length);
          if (value !== undefined) {
            const index = value.readUInt32BE();
            await this.#lastUsedIndexes.set(secretKey, index);
          }
        }

        await this.#stagingMap.delete(stagingKey);
      }
    });
  }

  /**
   * Discards staged data without committing.
   * @param stagingPrefix - The prefix used for staging keys
   */
  async discardStaging(stagingPrefix: string): Promise<void> {
    const allKeys = await toArray(this.#stagingMap.keysAsync());
    const stagingKeys = allKeys.filter(key => key.startsWith(stagingPrefix));

    await Promise.all(stagingKeys.map(key => this.#stagingMap.delete(key)));
  }

  // It might seem weird that the following 3 methods are in RecipientTaggingDataProvider and not
  // in SenderTaggingDataProvider but that is because this data is truly only used for the purposes of syncing logs
  // as a recipient. When sending logs or when syncing sender tagging indexes we only receive directional app tagging
  // secret from Aztec.nr via an oracle and we don't need to access sender addresses.

  async addSenderAddress(address: AztecAddress): Promise<boolean> {
    if (await this.#addressBook.hasAsync(address.toString())) {
      return false;
    }

    await this.#addressBook.set(address.toString(), true);

    return true;
  }

  async getSenderAddresses(): Promise<AztecAddress[]> {
    return (await toArray(this.#addressBook.keysAsync())).map(AztecAddress.fromString);
  }

  async removeSenderAddress(address: AztecAddress): Promise<boolean> {
    if (!(await this.#addressBook.hasAsync(address.toString()))) {
      return false;
    }

    await this.#addressBook.delete(address.toString());

    return true;
  }
}
