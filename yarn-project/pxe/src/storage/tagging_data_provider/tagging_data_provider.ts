import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DirectionalAppTaggingSecret, IndexedTaggingSecret } from '@aztec/stdlib/logs';

export class TaggingDataProvider {
  #store: AztecAsyncKVStore;
  #addressBook: AztecAsyncMap<string, true>;

  // Stores the last used index for each directional app tagging secret. Taking into account whether we are
  // requesting the index as a sender or as a recipient because the sender and recipient can be in the same PXE.
  #lastUsedIndexesAsSenders: AztecAsyncMap<string, number>;
  #lastUsedIndexesAsRecipients: AztecAsyncMap<string, number>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#addressBook = this.#store.openMap('address_book');

    this.#lastUsedIndexesAsSenders = this.#store.openMap('last_used_indexes_as_senders');
    this.#lastUsedIndexesAsRecipients = this.#store.openMap('last_used_indexes_as_recipients');
  }

  /**
   * Sets the last used indexes when sending a log.
   * @param indexedSecrets - The indexed secrets to set the last used indexes for.
   * @throws If there are duplicate secrets in the input array
   */
  setLastUsedIndexesAsSender(indexedSecrets: IndexedTaggingSecret[]) {
    this.#assertUniqueSecrets(indexedSecrets, 'sender');

    return Promise.all(
      indexedSecrets.map(({ secret, index }) => this.#lastUsedIndexesAsSenders.set(secret.toString(), index)),
    );
  }

  /**
   * Sets the last used indexes when looking for logs.
   * @param indexedSecrets - The indexed secrets to set the last used indexes for.
   * @throws If there are duplicate secrets in the input array
   */
  setLastUsedIndexesAsRecipient(indexedSecrets: IndexedTaggingSecret[]) {
    this.#assertUniqueSecrets(indexedSecrets, 'recipient');

    return Promise.all(
      indexedSecrets.map(({ secret, index }) => this.#lastUsedIndexesAsRecipients.set(secret.toString(), index)),
    );
  }

  // It should never happen that we would receive a duplicate secrets on the input of the setters as everywhere
  // we always just apply the largest index. Hence this check is a good way to catch bugs.
  #assertUniqueSecrets(indexedSecrets: IndexedTaggingSecret[], role: 'sender' | 'recipient'): void {
    const secretStrings = indexedSecrets.map(({ secret }) => secret.toString());
    const uniqueSecrets = new Set(secretStrings);
    if (uniqueSecrets.size !== secretStrings.length) {
      throw new Error(`Duplicate secrets found when setting last used indexes as ${role}`);
    }
  }

  /**
   * Returns the last used index when sending a log with a given secret.
   * @param secret - The directional app tagging secret.
   * @returns The last used index for the given directional app tagging secret, or undefined if not found.
   */
  async getLastUsedIndexesAsSender(secret: DirectionalAppTaggingSecret): Promise<number | undefined> {
    return await this.#lastUsedIndexesAsSenders.getAsync(secret.toString());
  }

  /**
   * Returns the last used indexes when looking for logs as a recipient.
   * @param secrets - The directional app tagging secrets to obtain the indexes for.
   * @returns The last used indexes for the given directional app tagging secrets, or undefined if have never yet found
   * a log for a given secret.
   */
  getLastUsedIndexesAsRecipient(secrets: DirectionalAppTaggingSecret[]): Promise<(number | undefined)[]> {
    return Promise.all(secrets.map(secret => this.#lastUsedIndexesAsRecipients.getAsync(secret.toString())));
  }

  resetNoteSyncData(): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const keysForSenders = await toArray(this.#lastUsedIndexesAsSenders.keysAsync());
      await Promise.all(keysForSenders.map(secret => this.#lastUsedIndexesAsSenders.delete(secret)));
      const keysForRecipients = await toArray(this.#lastUsedIndexesAsRecipients.keysAsync());
      await Promise.all(keysForRecipients.map(secret => this.#lastUsedIndexesAsRecipients.delete(secret)));
    });
  }

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

  async getSize() {
    const addressesCount = (await toArray(this.#addressBook.keysAsync())).length;
    // All keys are addresses
    return 3 * addressesCount * AztecAddress.SIZE_IN_BYTES;
  }
}
