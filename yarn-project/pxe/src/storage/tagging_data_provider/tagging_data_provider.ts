import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { DirectionalAppTaggingSecret, PreTag } from '@aztec/stdlib/logs';

/**
 * Manages tagging secrets and sender addresses for encrypted log processing.
 *
 * @remarks
 * TaggingDataProvider supports the PXE's log tagging system, which enables efficient
 * scanning of encrypted logs without trial decryption of every log. The system uses
 * directional app tagging secrets that evolve with each use via an index.
 *
 * Key concepts:
 * - **Directional app tagging secrets**: Secrets shared between sender and recipient for a specific app
 * - **Indexes**: Each secret has separate sender and recipient indexes that increment with use
 * - **Address book**: Tracks known sender addresses for log scanning
 *
 * The dual indexing (sender vs recipient) is necessary because the same PXE may contain
 * both the sender and recipient accounts. When sending, we track the sender index; when
 * receiving, we track the recipient index. This prevents index conflicts and enables
 * efficient scanning from the last known position.
 *
 * The tagging system significantly improves log scanning performance by allowing the PXE
 * to quickly identify logs that might be relevant to its accounts without decrypting
 * every log on the network.
 */
export class TaggingDataProvider {
  /** The underlying key-value store for persistence */
  #store: AztecAsyncKVStore;
  /** Set of known sender addresses for log scanning */
  #addressBook: AztecAsyncMap<string, true>;

  /**
   * Tracks the last used index for each tagging secret when acting as a sender.
   * @remarks
   * Separate from recipient indexes because the same PXE can contain both sender
   * and recipient accounts, requiring independent index tracking.
   */
  #lastUsedIndexesAsSenders: AztecAsyncMap<string, number>;
  /**
   * Tracks the last used index for each tagging secret when acting as a recipient.
   * @remarks
   * Used during log scanning to resume from the last successfully decrypted position
   * rather than re-scanning from the beginning.
   */
  #lastUsedIndexesAsRecipients: AztecAsyncMap<string, number>;

  /**
   * Creates a new TaggingDataProvider.
   *
   * @param store - The key-value store for persistent storage
   */
  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#addressBook = this.#store.openMap('address_book');

    this.#lastUsedIndexesAsSenders = this.#store.openMap('last_used_indexes_as_senders');
    this.#lastUsedIndexesAsRecipients = this.#store.openMap('last_used_indexes_as_recipients');
  }

  /**
   * Updates the last used indexes after sending logs.
   *
   * @param preTags - Pre-tags containing tagging secrets and their new indexes
   * @throws If any two pre-tags contain the same directional app tagging secret
   * @remarks
   * When sending encrypted logs, the PXE generates pre-tags that include the tagging secret
   * and the index used. This method persists those indexes so future sends can use the next
   * available index.
   *
   * The uniqueness check ensures we don't accidentally update the same secret with different
   * indexes in a single operation, which would indicate a bug in the calling code.
   */
  setLastUsedIndexesAsSender(preTags: PreTag[]) {
    this.#assertUniqueSecrets(preTags, 'sender');

    return Promise.all(
      preTags.map(({ secret, index }) => this.#lastUsedIndexesAsSenders.set(secret.toString(), index)),
    );
  }

  /**
   * Updates the last used indexes after successfully decrypting logs as a recipient.
   *
   * @param preTags - Pre-tags containing tagging secrets and their new indexes
   * @throws If any two pre-tags contain the same directional app tagging secret
   * @remarks
   * When scanning for logs, the PXE tries to decrypt logs using various tagging secrets
   * at incrementing indexes. When a log is successfully decrypted, this method records
   * the index used, allowing future scans to resume from that position rather than
   * re-scanning from the beginning.
   *
   * This optimization significantly improves log scanning performance, especially for
   * accounts that have processed many logs.
   */
  setLastUsedIndexesAsRecipient(preTags: PreTag[]) {
    this.#assertUniqueSecrets(preTags, 'recipient');

    return Promise.all(
      preTags.map(({ secret, index }) => this.#lastUsedIndexesAsRecipients.set(secret.toString(), index)),
    );
  }

  /**
   * Validates that all pre-tags in a batch have unique secrets.
   *
   * @param preTags - Pre-tags to validate
   * @param role - Whether validating for sender or recipient context (used in error message)
   * @throws If duplicate secrets are found
   * @remarks
   * This validation catches bugs in the calling code. Since the system always applies the
   * largest index for a given secret, receiving duplicate secrets in a single batch would
   * indicate an error in how pre-tags are being generated or collected.
   */
  #assertUniqueSecrets(preTags: PreTag[], role: 'sender' | 'recipient'): void {
    const secretStrings = preTags.map(({ secret }) => secret.toString());
    const uniqueSecrets = new Set(secretStrings);
    if (uniqueSecrets.size !== secretStrings.length) {
      throw new Error(`Duplicate secrets found when setting last used indexes as ${role}`);
    }
  }

  /**
   * Retrieves the last used index for a tagging secret when sending logs.
   *
   * @param secret - The directional app tagging secret
   * @returns The last used index, or undefined if this secret has never been used for sending
   * @remarks
   * When preparing to send a log, the PXE uses this method to determine the next index to use
   * (typically lastIndex + 1). If undefined is returned, this is the first time sending with
   * this secret, so index 0 should be used.
   */
  async getLastUsedIndexesAsSender(secret: DirectionalAppTaggingSecret): Promise<number | undefined> {
    return await this.#lastUsedIndexesAsSenders.getAsync(secret.toString());
  }

  /**
   * Retrieves the last used indexes for multiple tagging secrets when scanning for logs.
   *
   * @param secrets - Array of directional app tagging secrets
   * @returns Array of last used indexes (one per secret), undefined for secrets never used
   * @remarks
   * When scanning for new logs, the PXE queries this method to determine where to resume
   * scanning for each secret. The returned indexes represent the last successfully decrypted
   * log position, so scanning should continue from (lastIndex + 1).
   *
   * This batch operation is more efficient than querying secrets individually.
   */
  getLastUsedIndexesAsRecipient(secrets: DirectionalAppTaggingSecret[]): Promise<(number | undefined)[]> {
    return Promise.all(secrets.map(secret => this.#lastUsedIndexesAsRecipients.getAsync(secret.toString())));
  }

  /**
   * Resets all tagging index data, forcing a full rescan on next sync.
   *
   * @remarks
   * This method clears all stored sender and recipient indexes, effectively resetting
   * the log scanning state. After calling this, the PXE will rescan all logs from the
   * beginning on the next synchronization.
   *
   * This is useful when recovering from data corruption or when implementing changes
   * to the log processing logic that require a full rescan.
   *
   * Note: The address book is NOT cleared - only the index tracking is reset.
   */
  resetNoteSyncData(): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const keysForSenders = await toArray(this.#lastUsedIndexesAsSenders.keysAsync());
      await Promise.all(keysForSenders.map(secret => this.#lastUsedIndexesAsSenders.delete(secret)));
      const keysForRecipients = await toArray(this.#lastUsedIndexesAsRecipients.keysAsync());
      await Promise.all(keysForRecipients.map(secret => this.#lastUsedIndexesAsRecipients.delete(secret)));
    });
  }

  /**
   * Adds a sender address to the address book for log scanning.
   *
   * @param address - The sender address to track
   * @returns true if the address was newly added, false if it already existed
   * @remarks
   * The address book is used during log scanning to identify logs that might be relevant
   * to the PXE's accounts. When scanning, the PXE checks if a log's sender is in the
   * address book before attempting decryption, providing an optimization.
   *
   * Addresses are typically added when:
   * - A new account is registered in the PXE
   * - A contract interaction is initiated that may send logs
   * - A known counterparty address is being tracked
   */
  async addSenderAddress(address: AztecAddress): Promise<boolean> {
    if (await this.#addressBook.hasAsync(address.toString())) {
      return false;
    }

    await this.#addressBook.set(address.toString(), true);

    return true;
  }

  /**
   * Retrieves all known sender addresses.
   *
   * @returns Array of all sender addresses in the address book
   * @remarks
   * This method returns all addresses that the PXE tracks for log scanning purposes.
   */
  async getSenderAddresses(): Promise<AztecAddress[]> {
    return (await toArray(this.#addressBook.keysAsync())).map(AztecAddress.fromString);
  }

  /**
   * Removes a sender address from the address book.
   *
   * @param address - The sender address to remove
   * @returns true if the address was removed, false if it didn't exist
   * @remarks
   * This method removes an address from log scanning tracking. After removal, logs from
   * this sender will no longer be considered during scanning (unless the sender matches
   * through other criteria).
   */
  async removeSenderAddress(address: AztecAddress): Promise<boolean> {
    if (!(await this.#addressBook.hasAsync(address.toString()))) {
      return false;
    }

    await this.#addressBook.delete(address.toString());

    return true;
  }

  /**
   * Calculates the approximate storage size used by the address book.
   *
   * @returns Estimated storage size in bytes
   * @remarks
   * This provides a rough estimate of storage usage based on the number of addresses
   * and the size of an AztecAddress. The actual storage size may vary due to overhead
   * from the underlying key-value store implementation.
   *
   * The calculation assumes 3 bytes per address (multiplied by the address size),
   * accounting for the address itself plus indexing overhead.
   */
  async getSize() {
    const addressesCount = (await toArray(this.#addressBook.keysAsync())).length;
    // All keys are addresses
    return 3 * addressesCount * AztecAddress.SIZE_IN_BYTES;
  }
}
