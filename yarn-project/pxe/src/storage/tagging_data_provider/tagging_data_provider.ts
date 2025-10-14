import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DirectionalAppTaggingSecret, IndexedTaggingSecret } from '@aztec/stdlib/logs';

export class TaggingDataProvider {
  #store: AztecAsyncKVStore;
  #addressBook: AztecAsyncMap<string, true>;

  // Stores the next index to be used for each directional app tagging secret. Taking into account whether we are
  // requesting the index as a sender or as a recipient because the sender and recipient can be in the same PXE.
  #nextIndexesAsSenders: AztecAsyncMap<string, number>;
  #nextIndexesAsRecipients: AztecAsyncMap<string, number>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#addressBook = this.#store.openMap('address_book');

    this.#nextIndexesAsSenders = this.#store.openMap('next_indexes_as_senders');
    this.#nextIndexesAsRecipients = this.#store.openMap('next_indexes_as_recipients');
  }

  /**
   * Sets the next indexes to be used to compute tags when sending a log.
   * @param indexedSecrets - The indexed secrets to set the next indexes for.
   * @throws If there are duplicate secrets in the input array
   */
  setNextIndexesAsSender(indexedSecrets: IndexedTaggingSecret[]) {
    this.#assertUniqueSecrets(indexedSecrets, 'sender');

    return Promise.all(
      indexedSecrets.map(({ secret, index }) => this.#nextIndexesAsSenders.set(secret.toString(), index)),
    );
  }

  /**
   * Sets the next indexes to be used to compute tags when looking for logs.
   * @param indexedSecrets - The indexed secrets to set the next indexes for.
   * @throws If there are duplicate secrets in the input array
   */
  setNextIndexesAsRecipient(indexedSecrets: IndexedTaggingSecret[]) {
    this.#assertUniqueSecrets(indexedSecrets, 'recipient');

    return Promise.all(
      indexedSecrets.map(({ secret, index }) => this.#nextIndexesAsRecipients.set(secret.toString(), index)),
    );
  }

  // It should never happen that we would receive a duplicate secrets on the input of the setters as everywhere
  // we always just apply the largest index. Hence this check is a good way to catch bugs.
  #assertUniqueSecrets(indexedSecrets: IndexedTaggingSecret[], role: 'sender' | 'recipient'): void {
    const secretStrings = indexedSecrets.map(({ secret }) => secret.toString());
    const uniqueSecrets = new Set(secretStrings);
    if (uniqueSecrets.size !== secretStrings.length) {
      throw new Error(`Duplicate secrets found when setting next indexes as ${role}`);
    }
  }

  /**
   * Returns the next index to be used to compute a tag when sending a log.
   * @param secret - The directional app tagging secret.
   * @returns The next index to be used to compute a tag for the given directional app tagging secret.
   */
  async getNextIndexAsSender(secret: DirectionalAppTaggingSecret): Promise<number> {
    return (await this.#nextIndexesAsSenders.getAsync(secret.toString())) ?? 0;
  }

  /**
   * Returns the next indexes to be used to compute tags when looking for logs.
   * @param secrets - The directional app tagging secrets to obtain the indexes for.
   * @returns The next indexes to be used to compute tags for the given directional app tagging secrets.
   */
  getNextIndexesAsRecipient(secrets: DirectionalAppTaggingSecret[]): Promise<number[]> {
    return Promise.all(
      secrets.map(async secret => (await this.#nextIndexesAsRecipients.getAsync(secret.toString())) ?? 0),
    );
  }

  resetNoteSyncData(): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const keysForSenders = await toArray(this.#nextIndexesAsSenders.keysAsync());
      await Promise.all(keysForSenders.map(secret => this.#nextIndexesAsSenders.delete(secret)));
      const keysForRecipients = await toArray(this.#nextIndexesAsRecipients.keysAsync());
      await Promise.all(keysForRecipients.map(secret => this.#nextIndexesAsRecipients.delete(secret)));
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
