import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DirectionalAppTaggingSecret, PreTag } from '@aztec/stdlib/logs';

/**
 * Data provider of tagging data used when syncing the logs as a recipient. The sender counterpart of this class is
 * called SenderTaggingDataProvider. We have the providers separate for the sender and recipient because
 * the algorithms are completely disjoint and there is not data reuse between the 2.
 */
export class RecipientTaggingDataProvider {
  #store: AztecAsyncKVStore;
  #addressBook: AztecAsyncMap<string, true>;

  // Stores the last used index for each directional app tagging secret.
  #lastUsedIndexes: AztecAsyncMap<string, number>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#addressBook = this.#store.openMap('address_book');
    this.#lastUsedIndexes = this.#store.openMap('last_used_indexes');
  }

  /**
   * Sets the last used indexes when looking for logs.
   * @param preTags - The pre-tags containing the directional app tagging secrets and the indexes that are to be
   * updated in the db.
   * @throws If any two pre-tags contain the same directional app tagging secret
   */
  setLastUsedIndexes(preTags: PreTag[]) {
    // Non-unique secrets would indicate a bug in the caller function.
    const secretsSet = new Set(preTags.map(preTag => preTag.secret.toString()));
    if (secretsSet.size !== preTags.length) {
      throw new Error(`Duplicate secrets found when setting last used indexes`);
    }

    return Promise.all(preTags.map(({ secret, index }) => this.#lastUsedIndexes.set(secret.toString(), index)));
  }

  /**
   * Returns the last used indexes when looking for logs.
   * @param secrets - The directional app tagging secrets to obtain the indexes for.
   * @returns The last used indexes for the given directional app tagging secrets, or undefined if have never yet found
   * a log for a given secret.
   */
  getLastUsedIndexes(secrets: DirectionalAppTaggingSecret[]): Promise<(number | undefined)[]> {
    return Promise.all(secrets.map(secret => this.#lastUsedIndexes.getAsync(secret.toString())));
  }

  resetNoteSyncData(): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const keys = await toArray(this.#lastUsedIndexes.keysAsync());
      await Promise.all(keys.map(secret => this.#lastUsedIndexes.delete(secret)));
    });
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
