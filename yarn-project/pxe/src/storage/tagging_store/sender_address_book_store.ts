import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * Stores sender addresses. During recipient log synchronization, these senders are used, along with a given recipient,
 * to derive directional app tagging secrets that are then used to sync the logs.
 */
export class SenderAddressBookStore {
  #store: AztecAsyncKVStore;
  #addressBook: AztecAsyncMap<string, true>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    // opaqueKeys: keys are sender addresses the user decrypts logs from — this
    // is effectively the user's incoming-message contact list.
    this.#addressBook = this.#store.openMap('address_book', { opaqueKeys: true });
  }

  addSender(address: AztecAddress): Promise<boolean> {
    return this.#store.transactionAsync(async () => {
      if (await this.#addressBook.hasAsync(address.toString())) {
        return false;
      }

      await this.#addressBook.set(address.toString(), true);

      return true;
    });
  }

  getSenders(): Promise<AztecAddress[]> {
    return this.#store.transactionAsync(async () => {
      return (await toArray(this.#addressBook.keysAsync())).map(AztecAddress.fromString);
    });
  }

  removeSender(address: AztecAddress): Promise<boolean> {
    return this.#store.transactionAsync(async () => {
      if (!(await this.#addressBook.hasAsync(address.toString()))) {
        return false;
      }

      await this.#addressBook.delete(address.toString());

      return true;
    });
  }
}
