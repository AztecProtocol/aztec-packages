import type { Fr } from '@aztec/foundation/fields';
import { toArray } from '@aztec/foundation/iterable';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { IndexedTaggingSecret } from '@aztec/stdlib/logs';

/**
 * Represents a dangling index entry that associates an app tag with its sender, recipient, and index.
 * This will later be used to associate a given index with a tx hash.
 */
export interface DanglingIndexEntry {
  appTag: Fr;
  sender: AztecAddress;
  recipient: AztecAddress;
  index: number;
}

export class TaggingDataProvider {
  #store: AztecAsyncKVStore;
  #addressBook: AztecAsyncMap<string, true>;

  // Stores the last index used for each tagging secret, taking direction into account
  // This is necessary to avoid reusing the same index for the same secret, which happens if
  // sender and recipient are the same
  #taggingSecretIndexesForSenders: AztecAsyncMap<string, number>;
  #taggingSecretIndexesForRecipients: AztecAsyncMap<string, number>;

  // Stores dangling indices that map app tags to (sender, recipient, index) tuples
  // These will later be associated with tx hashes
  #danglingIndices: AztecAsyncMap<string, { sender: string; recipient: string; index: number }>;

  // Associates a tx hash to all indices captured during its construction
  #indicesByTxHash: AztecAsyncMap<string, { appTag: string; sender: string; recipient: string; index: number }[]>;

  constructor(
    store: AztecAsyncKVStore,
    private log = createLogger('tagging_data_provider'),
  ) {
    this.#store = store;

    this.#addressBook = this.#store.openMap('address_book');

    this.#taggingSecretIndexesForSenders = this.#store.openMap('tagging_secret_indexes_for_senders');
    this.#taggingSecretIndexesForRecipients = this.#store.openMap('tagging_secret_indexes_for_recipients');
    this.#danglingIndices = this.#store.openMap('dangling_indices');
    this.#indicesByTxHash = this.#store.openMap('indices_by_tx_hash');
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

  // TODO(benesjan): Update this.
  async getSize() {
    const addressesCount = (await toArray(this.#addressBook.keysAsync())).length;
    // All keys are addresses
    return 3 * addressesCount * AztecAddress.SIZE_IN_BYTES;
  }

  /**
   * Stores a dangling index entry that associates an app tag with its sender, recipient, and index.
   * This will later be used to associate a given index with a tx hash.
   * @param appTag - The computed app tag.
   * @param sender - The address sending the note.
   * @param recipient - The address receiving the note.
   * @param index - The index used to compute the tag.
   * @throws If the appTag already exists in danglingIndices.
   */
  async storeDanglingIndex(appTag: Fr, sender: AztecAddress, recipient: AztecAddress, index: number): Promise<void> {
    const appTagStr = appTag.toString();
    if (await this.#danglingIndices.hasAsync(appTagStr)) {
      throw new Error(`Dangling index already exists for app tag ${appTagStr}`);
    }
    await this.#danglingIndices.set(appTagStr, {
      sender: sender.toString(),
      recipient: recipient.toString(),
      index,
    });
  }

  /**
   * Associates all currently stored dangling indices with a given tx hash and clears them from the dangling store.
   * @param txHash - The transaction hash to associate the currently dangling indices with.
   */
  async associateDanglingIndicesWithTx(txHash: string): Promise<void> {
    await this.#store.transactionAsync(async () => {
      const appTagKeys = await toArray(this.#danglingIndices.keysAsync());
      const entries = await Promise.all(
        appTagKeys.map(async appTagKey => {
          const value = await this.#danglingIndices.getAsync(appTagKey);
          return value
            ? { appTag: appTagKey, sender: value.sender, recipient: value.recipient, index: value.index }
            : undefined;
        }),
      );

      const compact = entries.filter((e): e is { appTag: string; sender: string; recipient: string; index: number } =>
        Boolean(e),
      );

      await this.#indicesByTxHash.set(txHash, compact);

      // Clear dangling set
      await Promise.all(appTagKeys.map(key => this.#danglingIndices.delete(key)));
    });
  }

  /**
   * Deletes all dangling indices from the store.
   */
  async pruneDanglingIndices(): Promise<void> {
    const keys = await toArray(this.#danglingIndices.keysAsync());
    if (keys.length === 0) {
      return;
    }

    const indices = await Promise.all(keys.map(key => this.#danglingIndices.getAsync(key)));
    this.log.debug(`Pruning ${indices.length} dangling indices`, { indices });

    await Promise.all(keys.map(key => this.#danglingIndices.delete(key)));
  }
}
