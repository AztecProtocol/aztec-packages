import { Point } from '@aztec/foundation/curves/grumpkin';
import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncMultiMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * The kinds of shared secret an entry can hold.
 */
export type SharedSecretKind = 'arbitrary-secret' | 'handshake';

/** A shared secret registered for a recipient, with the kind that determines which tag streams it backs. */
export type SharedSecret = { kind: SharedSecretKind; secret: Point };

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
 *   and so these must not be reused to preserve privacy. Each carries the {@link SharedSecretKind} it was
 *   registered through, which determines the tag streams it is scanned under.
 */
export class TaggingSecretSourcesStore {
  #store: AztecAsyncKVStore;
  #senders: AztecAsyncMap<string, true>;
  #sharedSecretsByRecipient: AztecAsyncMultiMap<string, StoredSharedSecret>;

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
  addSharedSecret(recipient: AztecAddress, kind: SharedSecretKind, secret: Point): Promise<boolean> {
    return this.#store.transactionAsync(async () => {
      const secretStr = secret.toString();
      // MultiMap.set silently ignores an identical (key, value), so we scan to report whether this is a new secret.
      for await (const existing of this.#sharedSecretsByRecipient.getValuesAsync(recipient.toString())) {
        if (existing.secret === secretStr) {
          if (existing.kind !== kind) {
            throw new Error(
              `Secret already registered for recipient with kind '${existing.kind}', cannot re-register it as '${kind}'.`,
            );
          }
          return false;
        }
      }

      await this.#sharedSecretsByRecipient.set(recipient.toString(), { kind, secret: secretStr });

      return true;
    });
  }

  /** Returns the pre-shared tagging secrets registered for a given recipient. */
  getSharedSecretsForRecipient(recipient: AztecAddress): Promise<SharedSecret[]> {
    return this.#store.transactionAsync(async () => {
      return (await toArray(this.#sharedSecretsByRecipient.getValuesAsync(recipient.toString()))).map(
        deserializeSharedSecret,
      );
    });
  }

  /** Returns every registered pre-shared tagging secret, each paired with the recipient it is scoped to. */
  getAllSharedSecrets(): Promise<{ recipient: AztecAddress; kind: SharedSecretKind; secret: Point }[]> {
    return this.#store.transactionAsync(async () => {
      const entries = await toArray(this.#sharedSecretsByRecipient.entriesAsync());
      return entries.map(([recipient, entry]) => ({
        recipient: AztecAddress.fromStringUnsafe(recipient),
        ...deserializeSharedSecret(entry),
      }));
    });
  }

  /**
   * Removes a pre-shared tagging secret scoped to a recipient. Both the secret and its kind must match.
   * @returns true if the secret was registered and removed, false if it was not registered for that recipient.
   */
  removeSharedSecret(recipient: AztecAddress, kind: SharedSecretKind, secret: Point): Promise<boolean> {
    return this.#store.transactionAsync(async () => {
      const secretStr = secret.toString();
      for await (const existing of this.#sharedSecretsByRecipient.getValuesAsync(recipient.toString())) {
        if (existing.kind === kind && existing.secret === secretStr) {
          await this.#sharedSecretsByRecipient.deleteValue(recipient.toString(), existing);
          return true;
        }
      }

      return false;
    });
  }
}

/** The wire form a shared secret entry is persisted as. */
type StoredSharedSecret = { kind: SharedSecretKind; secret: string };

function deserializeSharedSecret(entry: StoredSharedSecret): SharedSecret {
  return { kind: entry.kind, secret: Point.fromString(entry.secret) };
}
