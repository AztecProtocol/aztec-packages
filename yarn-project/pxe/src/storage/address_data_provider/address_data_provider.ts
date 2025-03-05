import { toArray } from '@aztec/foundation/iterable';
import type { AztecAsyncArray, AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CompleteAddress } from '@aztec/stdlib/contract';

export class AddressDataProvider {
  #store: AztecAsyncKVStore;
  #completeAddresses: AztecAsyncArray<Buffer>;
  #completeAddressIndex: AztecAsyncMap<string, number>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#completeAddresses = this.#store.openArray('complete_addresses');
    this.#completeAddressIndex = this.#store.openMap('complete_address_index');
  }

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

  async #getCompleteAddress(address: AztecAddress): Promise<CompleteAddress | undefined> {
    const index = await this.#completeAddressIndex.getAsync(address.toString());
    if (index === undefined) {
      return undefined;
    }

    const value = await this.#completeAddresses.atAsync(index);
    return value ? await CompleteAddress.fromBuffer(value) : undefined;
  }

  getCompleteAddress(account: AztecAddress): Promise<CompleteAddress | undefined> {
    return this.#getCompleteAddress(account);
  }

  async getCompleteAddresses(): Promise<CompleteAddress[]> {
    return await Promise.all(
      (await toArray(this.#completeAddresses.valuesAsync())).map(v => CompleteAddress.fromBuffer(v)),
    );
  }
}
