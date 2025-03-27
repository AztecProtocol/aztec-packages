import type { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { IndexedTaggingSecret } from '@aztec/stdlib/logs';

export class TaggingDataProvider {
  #store: AztecAsyncKVStore;
  #addressBook: AztecAsyncMap<string, true>;

  // Stores the last index used for each tagging secret, taking direction into account
  // This is necessary to avoid reusing the same index for the same secret, which happens if
  // sender and recipient are the same
  #taggingSecretIndexesForSenders: AztecAsyncMap<string, number>;
  #taggingSecretIndexesForRecipients: AztecAsyncMap<string, number>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#addressBook = this.#store.openMap('address_book');

    this.#taggingSecretIndexesForSenders = this.#store.openMap('tagging_secret_indexes_for_senders');
    this.#taggingSecretIndexesForRecipients = this.#store.openMap('tagging_secret_indexes_for_recipients');
  }

  setTaggingSecretsIndexesAsSender(indexedSecrets: IndexedTaggingSecret[], sender: AztecAddress) {
    return this.#setTaggingSecretsIndexes(indexedSecrets, this.#taggingSecretIndexesForSenders, sender);
  }

  setTaggingSecretsIndexesAsRecipient(indexedSecrets: IndexedTaggingSecret[], recipient: AztecAddress) {
    return this.#setTaggingSecretsIndexes(indexedSecrets, this.#taggingSecretIndexesForRecipients, recipient);
  }

  /**
   * Sets the indexes of the tagging secrets for the given app tagging secrets in the direction of the given address.
   * @dev We need to specify the direction because app tagging secrets are direction-less due to the way they are generated
   * but we need to guarantee that the index is stored under a uni-directional key because the tags are themselves
   * uni-directional.
   * @param indexedSecrets - The app tagging secrets and indexes to set.
   * @param storageMap - The storage map to set the indexes in.
   * @param inDirectionOf - The address that the secrets are in the direction of.
   */
  #setTaggingSecretsIndexes(
    indexedSecrets: IndexedTaggingSecret[],
    storageMap: AztecAsyncMap<string, number>,
    inDirectionOf: AztecAddress,
  ) {
    return Promise.all(
      indexedSecrets.map(indexedSecret =>
        storageMap.set(`${indexedSecret.appTaggingSecret.toString()}_${inDirectionOf.toString()}`, indexedSecret.index),
      ),
    );
  }

  getTaggingSecretsIndexesAsRecipient(appTaggingSecrets: Fr[], recipient: AztecAddress) {
    return this.#getTaggingSecretsIndexes(appTaggingSecrets, this.#taggingSecretIndexesForRecipients, recipient);
  }

  getTaggingSecretsIndexesAsSender(appTaggingSecrets: Fr[], sender: AztecAddress) {
    return this.#getTaggingSecretsIndexes(appTaggingSecrets, this.#taggingSecretIndexesForSenders, sender);
  }

  /**
   * Returns the indexes of the tagging secrets for the given app tagging secrets in the direction of the given address.
   * @dev We need to specify the direction because app tagging secrets are direction-less due to the way they are generated
   * but we need to guarantee that the index is stored under a uni-directional key because the tags are themselves
   * uni-directional.
   * @param appTaggingSecrets - The app tagging secrets to get the indexes for.
   * @param storageMap - The storage map to get the indexes from.
   * @param inDirectionOf - The address that the secrets are in the direction of.
   * @returns The indexes of the tagging secrets.
   */
  #getTaggingSecretsIndexes(
    appTaggingSecrets: Fr[],
    storageMap: AztecAsyncMap<string, number>,
    inDirectionOf: AztecAddress,
  ): Promise<number[]> {
    return Promise.all(
      appTaggingSecrets.map(
        async secret => (await storageMap.getAsync(`${secret.toString()}_${inDirectionOf.toString()}`)) ?? 0,
      ),
    );
  }

  resetNoteSyncData(): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const recipients = await toArray(this.#taggingSecretIndexesForRecipients.keysAsync());
      await Promise.all(recipients.map(recipient => this.#taggingSecretIndexesForRecipients.delete(recipient)));
      const senders = await toArray(this.#taggingSecretIndexesForSenders.keysAsync());
      await Promise.all(senders.map(sender => this.#taggingSecretIndexesForSenders.delete(sender)));
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
