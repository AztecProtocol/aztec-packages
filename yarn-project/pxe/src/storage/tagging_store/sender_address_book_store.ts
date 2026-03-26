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
  #cachedSenders: AztecAddress[] | undefined;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#addressBook = this.#store.openMap('address_book');
  }

  addSender(address: AztecAddress): Promise<boolean> {
    return this.#store.transactionAsync(async () => {
      if (await this.#addressBook.hasAsync(address.toString())) {
        return false;
      }

      await this.#addressBook.set(address.toString(), true);
      this.#cachedSenders = undefined;

      return true;
    });
  }

  getSenders(): Promise<AztecAddress[]> {
    if (this.#cachedSenders) {
      return Promise.resolve(this.#cachedSenders);
    }
    return this.#store.transactionAsync(async () => {
      this.#cachedSenders = (await toArray(this.#addressBook.keysAsync())).map(AztecAddress.fromString);
      return this.#cachedSenders;
    });
  }

  removeSender(address: AztecAddress): Promise<boolean> {
    return this.#store.transactionAsync(async () => {
      if (!(await this.#addressBook.hasAsync(address.toString()))) {
        return false;
      }

      await this.#addressBook.delete(address.toString());
      this.#cachedSenders = undefined;

      return true;
    });
  }
}
