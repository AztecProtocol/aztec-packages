import { timesParallel } from '@aztec/foundation/collection';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { CompleteAddress } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';

import { AddressStore } from './address_store.js';

describe('addresses', () => {
  let addressStore: AddressStore;

  beforeEach(async () => {
    const store = await openTmpStore('address_store_test');
    addressStore = new AddressStore(store);
  });

  it('stores and retrieves addresses', async () => {
    const address = await CompleteAddress.random();
    await expect(addressStore.addCompleteAddress(address)).resolves.toBe(true);
    await expect(addressStore.getCompleteAddress(address.address)).resolves.toEqual(address);
  });

  it('silently ignores an address it already knows about', async () => {
    const address = await CompleteAddress.random();
    await expect(addressStore.addCompleteAddress(address)).resolves.toBe(true);
    await expect(addressStore.addCompleteAddress(address)).resolves.toBe(false);
  });

  it.skip('refuses to overwrite an address with a different public key', async () => {
    const address = await CompleteAddress.random();
    const otherAddress = await CompleteAddress.create(
      address.address,
      new PublicKeys(await Point.random(), await Point.random(), await Point.random(), await Point.random()),
      address.partialAddress,
    );

    await addressStore.addCompleteAddress(address);
    await expect(addressStore.addCompleteAddress(otherAddress)).rejects.toThrow();
  });

  it('returns all addresses', async () => {
    const addresses = await timesParallel(10, () => CompleteAddress.random());
    for (const address of addresses) {
      await addressStore.addCompleteAddress(address);
    }

    const result = await addressStore.getCompleteAddresses();
    expect(result).toEqual(expect.arrayContaining(addresses));
  });

  it('returns a single address', async () => {
    const addresses = await timesParallel(10, () => CompleteAddress.random());
    for (const address of addresses) {
      await addressStore.addCompleteAddress(address);
    }

    const result = await addressStore.getCompleteAddress(addresses[3].address);
    expect(result).toEqual(addresses[3]);
  });

  it("returns an empty array if it doesn't have addresses", async () => {
    expect(await addressStore.getCompleteAddresses()).toEqual([]);
  });

  it("returns undefined if it doesn't have an address", async () => {
    const completeAddress = await CompleteAddress.random();
    expect(await addressStore.getCompleteAddress(completeAddress.address)).toBeUndefined();
  });
});
