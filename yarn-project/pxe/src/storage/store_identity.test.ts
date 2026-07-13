import { EthAddress } from '@aztec/foundation/eth-address';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import {
  StoreIdentityMismatchError,
  assertStoreIdentity,
  effectiveStoreName,
  storeIdentitySlug,
} from './store_identity.js';

describe('storeIdentitySlug', () => {
  it('composes chain id, rollup address and schema version', () => {
    const rollupAddress = EthAddress.fromString('0x1234567890abcdef1234567890abcdef12345678');
    expect(storeIdentitySlug({ l1ChainId: 31337, rollupAddress, schemaVersion: 12 })).toEqual(
      '31337-0x1234567890abcdef1234567890abcdef12345678-v12',
    );
  });

  it('normalizes the rollup address to lowercase hex', () => {
    const rollupAddress = EthAddress.fromString('0x1234567890ABCDEF1234567890ABCDEF12345678');
    expect(storeIdentitySlug({ l1ChainId: 0, rollupAddress, schemaVersion: 1 })).toEqual(
      '0-0x1234567890abcdef1234567890abcdef12345678-v1',
    );
  });
});

describe('effectiveStoreName', () => {
  it('joins the logical name and the slug with an underscore', () => {
    const rollupAddress = EthAddress.fromString('0x1234567890abcdef1234567890abcdef12345678');
    expect(effectiveStoreName('pxe_data', { l1ChainId: 1, rollupAddress, schemaVersion: 2 })).toEqual(
      'pxe_data_1-0x1234567890abcdef1234567890abcdef12345678-v2',
    );
  });
});

describe('assertStoreIdentity', () => {
  const identityFor = (rollupAddress: EthAddress) => ({ l1ChainId: 31337, rollupAddress, schemaVersion: 1 });

  it('writes the marker on first open and accepts a matching reopen', async () => {
    const store = await openTmpStore('identity-test');
    const identity = identityFor(EthAddress.random());
    await assertStoreIdentity(store, 'test_store', identity);
    await expect(assertStoreIdentity(store, 'test_store', identity)).resolves.toBeUndefined();
    await store.close();
  });

  it('refuses a mismatching identity and leaves data untouched', async () => {
    const store = await openTmpStore('identity-test');
    const identity = identityFor(EthAddress.random());
    await assertStoreIdentity(store, 'test_store', identity);
    await store.openSingleton<string>('payload').set('precious');

    const bumped = { ...identity, schemaVersion: identity.schemaVersion + 1 };
    await expect(assertStoreIdentity(store, 'test_store', bumped)).rejects.toThrow(StoreIdentityMismatchError);

    expect(await store.openSingleton<string>('payload').getAsync()).toEqual('precious');
    await store.close();
  });

  it('refuses a corrupted marker', async () => {
    const store = await openTmpStore('identity-test');
    await store.openSingleton<string>('dbVersion').set('garbage');
    await expect(assertStoreIdentity(store, 'test_store', identityFor(EthAddress.random()))).rejects.toThrow(
      StoreIdentityMismatchError,
    );
    await store.close();
  });
});
