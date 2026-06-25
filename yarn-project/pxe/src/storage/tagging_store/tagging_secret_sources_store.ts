import { Point } from '@aztec/foundation/curves/grumpkin';
import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * Stores the sources from which directional app tagging secrets are derived during recipient log synchronization.
 *
 * Two kinds of source are held:
 * - Sender addresses: combined with a recipient to derive a shared tagging secret via ECDH. These are global (not
 *   scoped to a recipient) because the per-recipient binding comes from re-mixing the recipient's keys during
 *   derivation, so each account only ever derives secrets meant for it.
 * - Pre-shared tagging secrets: shared secret points registered directly, bypassing ECDH. These are scoped to a
 *   specific recipient, since the derivation of the directional app tagging secret does not require any secret
 *   recipient data: given the original secret anyone can derive a recipient's app-siloed directional tagging secret,
 *   and so these must not be reused to preserve privacy.
 */
export class TaggingSecretSourcesStore {
  #store: AztecAsyncKVStore;
  #senders: AztecAsyncMap<string, true>;
  #sharedSecretsByRecipient: AztecAsyncMultiMap<string, string>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#senders = this.#store.openMap('senders');
    this.#sharedSecretsByRecipient = this.#store.openMultiMap('recipient_shared_secrets');
  }

  addSender(address: AztecAddress): Promise<boolean> {
    return this.#store.transactionAsync(async () => {
      if (await this.#senders.hasAsync(address.toString())) {
        return false;
      }

      await this.#senders.set(address.toString(), true);

      return true;
    });
  }

  getSenders(): Promise<AztecAddress[]> {
    return this.#store.transactionAsync(async () => {
      return (await toArray(this.#senders.keysAsync())).map(AztecAddress.fromStringUnsafe);
    });
  }

  removeSender(address: AztecAddress): Promise<boolean> {
    return this.#store.transactionAsync(async () => {
      if (!(await this.#senders.hasAsync(address.toString()))) {
        return false;
      }

      await this.#senders.delete(address.toString());

      return true;
    });
  }

  /**
   * Registers a pre-shared tagging secret scoped to a recipient.
   * @returns true if the secret was newly added, false if it was already registered for that recipient.
   */
  addSharedSecret(recipient: AztecAddress, secret: Point): Promise<boolean> {
    return this.#store.transactionAsync(async () => {
      const secretStr = secret.toString();
      // MultiMap.set silently ignores an identical (key, value), so we scan to report whether this is a new secret.
      for await (const existing of this.#sharedSecretsByRecipient.getValuesAsync(recipient.toString())) {
        if (existing === secretStr) {
          return false;
        }
      }

      await this.#sharedSecretsByRecipient.set(recipient.toString(), secretStr);

      return true;
    });
  }

  /** Returns the pre-shared tagging secrets registered for a given recipient. */
  getSharedSecretsForRecipient(recipient: AztecAddress): Promise<Point[]> {
    return this.#store.transactionAsync(async () => {
      return (await toArray(this.#sharedSecretsByRecipient.getValuesAsync(recipient.toString()))).map(secret =>
        Point.fromString(secret),
      );
    });
  }

  /** Returns every registered pre-shared tagging secret, each paired with the recipient it is scoped to. */
  getAllSharedSecrets(): Promise<{ recipient: AztecAddress; secret: Point }[]> {
    return this.#store.transactionAsync(async () => {
      const entries = await toArray(this.#sharedSecretsByRecipient.entriesAsync());
      return entries.map(([recipient, secret]) => ({
        recipient: AztecAddress.fromStringUnsafe(recipient),
        secret: Point.fromString(secret),
      }));
    });
  }

  /**
   * Removes a pre-shared tagging secret scoped to a recipient.
   * @returns true if the secret was registered and removed, false if it was not registered for that recipient.
   */
  removeSharedSecret(recipient: AztecAddress, secret: Point): Promise<boolean> {
    return this.#store.transactionAsync(async () => {
      const secretStr = secret.toString();
      for await (const existing of this.#sharedSecretsByRecipient.getValuesAsync(recipient.toString())) {
        if (existing === secretStr) {
          await this.#sharedSecretsByRecipient.deleteValue(recipient.toString(), secretStr);
          return true;
        }
      }

      return false;
    });
  }
}
