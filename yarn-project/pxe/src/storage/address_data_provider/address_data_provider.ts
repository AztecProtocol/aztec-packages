import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncArray, AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CompleteAddress } from '@aztec/stdlib/contract';

/**
 * Data provider for managing Aztec addresses and their associated complete address information.
 * This provider stores and retrieves complete addresses which include the Aztec address,
 * public key, and partial key information required for address derivation and verification.
 *
 * @remarks
 * The AddressDataProvider maintains an indexed storage of complete addresses, ensuring
 * that each Aztec address maps to exactly one complete address record. It uses an
 * async key-value store with array and map structures for efficient lookups.
 */
export class AddressDataProvider {
  /** The underlying async key-value store for data persistence */
  #store: AztecAsyncKVStore;
  /** Array storing serialized complete addresses */
  #completeAddresses: AztecAsyncArray<Buffer>;
  /** Index mapping address strings to their array positions for O(1) lookups */
  #completeAddressIndex: AztecAsyncMap<string, number>;

  /**
   * Creates a new AddressDataProvider instance.
   *
   * @param store - The async key-value store to use for data persistence
   */
  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#completeAddresses = this.#store.openArray('complete_addresses');
    this.#completeAddressIndex = this.#store.openMap('complete_address_index');
  }

  /**
   * Adds a complete address to the storage.
   *
   * @param completeAddress - The complete address containing Aztec address, public key, and partial key
   * @returns Promise that resolves to true if the address was added, false if it already exists
   * @throws Error if an address with the same Aztec address but different keys already exists
   *
   * @remarks
   * This method ensures uniqueness of Aztec addresses. If an address already exists with
   * the same Aztec address but different public or partial keys, it will throw an error
   * to prevent address conflicts.
   */
  addCompleteAddress(completeAddress: CompleteAddress): Promise<boolean> {
    return this.#store.transactionAsync(async () => {
      // TODO readd this
      // await this.#addScope(completeAddress.address);

      const addressString = completeAddress.address.toString();
      const buffer = completeAddress.toBuffer();
      const existing = await this.#completeAddressIndex.getAsync(addressString);
      if (existing === undefined) {
        const index = await this.#completeAddresses.lengthAsync();
        await this.#completeAddresses.push(buffer);
        await this.#completeAddressIndex.set(addressString, index);

        return true;
      } else {
        const existingBuffer = await this.#completeAddresses.atAsync(existing);

        if (existingBuffer && Buffer.from(existingBuffer).equals(buffer)) {
          return false;
        }

        throw new Error(
          `Complete address with aztec address ${addressString} but different public key or partial key already exists in memory database`,
        );
      }
    });
  }

  /**
   * Internal method to retrieve a complete address by its Aztec address.
   *
   * @param address - The Aztec address to look up
   * @returns The complete address if found, undefined otherwise
   */
  async #getCompleteAddress(address: AztecAddress): Promise<CompleteAddress | undefined> {
    const index = await this.#completeAddressIndex.getAsync(address.toString());
    if (index === undefined) {
      return undefined;
    }

    const value = await this.#completeAddresses.atAsync(index);
    return value ? await CompleteAddress.fromBuffer(value) : undefined;
  }

  /**
   * Retrieves a complete address by its Aztec address.
   *
   * @param account - The Aztec address to look up
   * @returns Promise that resolves to the complete address if found, undefined otherwise
   *
   * @remarks
   * This method performs an O(1) lookup using the address index. If the address
   * hasn't been registered with this provider, it returns undefined.
   */
  getCompleteAddress(account: AztecAddress): Promise<CompleteAddress | undefined> {
    return this.#getCompleteAddress(account);
  }

  /**
   * Retrieves all complete addresses stored in the provider.
   *
   * @returns Promise that resolves to an array of all complete addresses
   *
   * @remarks
   * This method loads all addresses from storage and deserializes them.
   * For large numbers of addresses, this can be memory-intensive.
   */
  async getCompleteAddresses(): Promise<CompleteAddress[]> {
    return await Promise.all(
      (await toArray(this.#completeAddresses.valuesAsync())).map(v => CompleteAddress.fromBuffer(v)),
    );
  }
}
