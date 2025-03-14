import { timesParallel } from '@aztec/foundation/collection';
import { Point } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { CompleteAddress } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';

import { AddressDataProvider } from './address_data_provider.js';

describe('addresses', () => {
  let addressDataProvider: AddressDataProvider;

  beforeEach(async () => {
    const store = await openTmpStore('address_data_provider_test');
    addressDataProvider = new AddressDataProvider(store);
  });

  it('stores and retrieves addresses', async () => {
    const address = await CompleteAddress.random();
    await expect(addressDataProvider.addCompleteAddress(address)).resolves.toBe(true);
    await expect(addressDataProvider.getCompleteAddress(address.address)).resolves.toEqual(address);
  });

  it('silently ignores an address it already knows about', async () => {
    const address = await CompleteAddress.random();
    await expect(addressDataProvider.addCompleteAddress(address)).resolves.toBe(true);
    await expect(addressDataProvider.addCompleteAddress(address)).resolves.toBe(false);
  });

  it.skip('refuses to overwrite an address with a different public key', async () => {
    const address = await CompleteAddress.random();
    const otherAddress = await CompleteAddress.create(
      address.address,
      new PublicKeys(await Point.random(), await Point.random(), await Point.random(), await Point.random()),
      address.partialAddress,
    );

    await addressDataProvider.addCompleteAddress(address);
    await expect(addressDataProvider.addCompleteAddress(otherAddress)).rejects.toThrow();
  });

  it('returns all addresses', async () => {
    const addresses = await timesParallel(10, () => CompleteAddress.random());
    for (const address of addresses) {
      await addressDataProvider.addCompleteAddress(address);
    }

    const result = await addressDataProvider.getCompleteAddresses();
    expect(result).toEqual(expect.arrayContaining(addresses));
  });

  it('returns a single address', async () => {
    const addresses = await timesParallel(10, () => CompleteAddress.random());
    for (const address of addresses) {
      await addressDataProvider.addCompleteAddress(address);
    }

    const result = await addressDataProvider.getCompleteAddress(addresses[3].address);
    expect(result).toEqual(addresses[3]);
  });

  it("returns an empty array if it doesn't have addresses", async () => {
    expect(await addressDataProvider.getCompleteAddresses()).toEqual([]);
  });

  it("returns undefined if it doesn't have an address", async () => {
    const completeAddress = await CompleteAddress.random();
    expect(await addressDataProvider.getCompleteAddress(completeAddress.address)).toBeUndefined();
  });
});
