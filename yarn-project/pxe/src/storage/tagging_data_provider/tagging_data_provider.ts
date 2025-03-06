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

  async setTaggingSecretsIndexesAsSender(indexedSecrets: IndexedTaggingSecret[]): Promise<void> {
    await this.#setTaggingSecretsIndexes(indexedSecrets, this.#taggingSecretIndexesForSenders);
  }

  async setTaggingSecretsIndexesAsRecipient(indexedSecrets: IndexedTaggingSecret[]): Promise<void> {
    await this.#setTaggingSecretsIndexes(indexedSecrets, this.#taggingSecretIndexesForRecipients);
  }

  async #setTaggingSecretsIndexes(indexedSecrets: IndexedTaggingSecret[], storageMap: AztecAsyncMap<string, number>) {
    await Promise.all(
      indexedSecrets.map(indexedSecret =>
        storageMap.set(indexedSecret.appTaggingSecret.toString(), indexedSecret.index),
      ),
    );
  }

  async getTaggingSecretsIndexesAsRecipient(appTaggingSecrets: Fr[]) {
    return await this.#getTaggingSecretsIndexes(appTaggingSecrets, this.#taggingSecretIndexesForRecipients);
  }

  async getTaggingSecretsIndexesAsSender(appTaggingSecrets: Fr[]) {
    return await this.#getTaggingSecretsIndexes(appTaggingSecrets, this.#taggingSecretIndexesForSenders);
  }

  #getTaggingSecretsIndexes(appTaggingSecrets: Fr[], storageMap: AztecAsyncMap<string, number>): Promise<number[]> {
    return Promise.all(appTaggingSecrets.map(async secret => (await storageMap.getAsync(`${secret.toString()}`)) ?? 0));
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
