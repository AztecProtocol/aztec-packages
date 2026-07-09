import { EthAddress } from '@aztec/foundation/eth-address';

import { mockLogger } from '../interfaces/utils.js';
import { AztecSQLiteOPFSStore, StoreIdentityMismatchError, createStore, effectiveStoreName } from './index.js';
import { deleteStore, listStores, storePoolDirectory } from './manage.js';

const configFor = (rollupAddress: EthAddress, l1ChainId = 31337) => ({
  dataDirectory: 'test',
  dataStoreMapSizeKb: 1024,
  rollupAddress,
  l1ChainId,
});

describe('sqlite-opfs createStore', () => {
  it('rejects when a required identity component is missing', async () => {
    const addr = EthAddress.random();
    const { l1ChainId: _l1ChainId, ...configWithoutChainId } = configFor(addr);

    await expect(createStore('incomplete_test', configWithoutChainId, 1, mockLogger)).rejects.toThrow(
      /without a complete identity/,
    );
    await expect(createStore('incomplete_test', configFor(addr), undefined, mockLogger)).rejects.toThrow(
      /without a complete identity/,
    );

    const storeName = effectiveStoreName('incomplete_test', {
      l1ChainId: 31337,
      rollupAddress: addr,
      schemaVersion: 1,
    });
    expect(await listStores()).not.toContain(storeName);
  });

  it('keeps data intact when switching rollup addresses back and forth', async () => {
    const addrA = EthAddress.random();
    const addrB = EthAddress.random();

    const storeA = await createStore('roundtrip_test', configFor(addrA), 1, mockLogger);
    await storeA.openSingleton<string>('payload').set('data-for-A');
    await storeA.close();

    const storeB = await createStore('roundtrip_test', configFor(addrB), 1, mockLogger);
    expect(await storeB.openSingleton<string>('payload').getAsync()).toBeUndefined();
    await storeB.openSingleton<string>('payload').set('data-for-B');
    await storeB.close();

    const reopenedA = await createStore('roundtrip_test', configFor(addrA), 1, mockLogger);
    expect(await reopenedA.openSingleton<string>('payload').getAsync()).toEqual('data-for-A');
    await reopenedA.close();

    const reopenedB = await createStore('roundtrip_test', configFor(addrB), 1, mockLogger);
    expect(await reopenedB.openSingleton<string>('payload').getAsync()).toEqual('data-for-B');
    await reopenedB.close();
  });

  it('opens two different stores concurrently in the same tab', async () => {
    const addr = EthAddress.random();
    const pxeStore = await createStore('pxe_data', configFor(addr), 1, mockLogger);
    const walletStore = await createStore('wallet_data', configFor(addr), 1, mockLogger);

    await pxeStore.openSingleton<string>('k').set('pxe');
    await walletStore.openSingleton<string>('k').set('wallet');
    expect(await pxeStore.openSingleton<string>('k').getAsync()).toEqual('pxe');
    expect(await walletStore.openSingleton<string>('k').getAsync()).toEqual('wallet');

    await pxeStore.close();
    await walletStore.close();
  });

  it('separates stores by schema version', async () => {
    const addr = EthAddress.random();
    const v1 = await createStore('schema_test', configFor(addr), 1, mockLogger);
    await v1.openSingleton<string>('k').set('v1-data');
    await v1.close();

    const v2 = await createStore('schema_test', configFor(addr), 2, mockLogger);
    expect(await v2.openSingleton<string>('k').getAsync()).toBeUndefined();
    await v2.close();

    const v1Again = await createStore('schema_test', configFor(addr), 1, mockLogger);
    expect(await v1Again.openSingleton<string>('k').getAsync()).toEqual('v1-data');
    await v1Again.close();
  });

  it('refuses to open on a recorded-identity mismatch and leaves data untouched', async () => {
    const addr = EthAddress.random();
    const store = await createStore('mismatch_test', configFor(addr), 1, mockLogger);
    await store.openSingleton<string>('payload').set('precious');
    // Simulate a naming bug by corrupting the recorded identity.
    await store.openSingleton<string>('dbVersion').set('garbage');
    await store.close();

    await expect(createStore('mismatch_test', configFor(addr), 1, mockLogger)).rejects.toThrow(
      StoreIdentityMismatchError,
    );

    // The refusal must not have modified the store: read it raw, bypassing the identity check.
    const storeName = effectiveStoreName('mismatch_test', { l1ChainId: 31337, rollupAddress: addr, schemaVersion: 1 });
    const raw = await AztecSQLiteOPFSStore.open(mockLogger, storeName, false, storePoolDirectory(storeName));
    expect(await raw.openSingleton<string>('payload').getAsync()).toEqual('precious');
    await raw.close();
  });

  it('lists created stores and deletes them', async () => {
    const addr = EthAddress.random();
    const store = await createStore('managed_test', configFor(addr), 1, mockLogger);
    await store.openSingleton<string>('k').set('v');
    await store.close();

    const storeName = effectiveStoreName('managed_test', { l1ChainId: 31337, rollupAddress: addr, schemaVersion: 1 });
    expect(await listStores()).toContain(storeName);

    await deleteStore(storeName);
    expect(await listStores()).not.toContain(storeName);

    // Recreating after deletion starts empty.
    const fresh = await createStore('managed_test', configFor(addr), 1, mockLogger);
    expect(await fresh.openSingleton<string>('k').getAsync()).toBeUndefined();
    await fresh.close();
  });

  it('refuses to delete a store that is currently open', async () => {
    const addr = EthAddress.random();
    const store = await createStore('locked_test', configFor(addr), 1, mockLogger);
    const storeName = effectiveStoreName('locked_test', { l1ChainId: 31337, rollupAddress: addr, schemaVersion: 1 });

    await expect(deleteStore(storeName)).rejects.toThrow();

    await store.close();
    await deleteStore(storeName);
  });
});
