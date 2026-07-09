import { EthAddress } from '@aztec/foundation/eth-address';

import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { openStoreForIdentity } from './store.js';

describe('openStoreForIdentity', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'store-identity-test-'));
  });

  afterEach(async () => {
    await rm(dataDirectory, { recursive: true, force: true });
  });

  const configFor = (rollupAddress?: EthAddress, l1ChainId = 31337) => ({
    dataDirectory,
    dataStoreMapSizeKb: 10 * 1024,
    rollupAddress,
    l1ChainId,
  });

  it('keeps data intact when switching rollup addresses back and forth', async () => {
    const addrA = EthAddress.random();
    const addrB = EthAddress.random();

    const storeA = await openStoreForIdentity('test_store', 1, configFor(addrA));
    await storeA.openSingleton<string>('payload').set('data-for-A');
    await storeA.close();

    const storeB = await openStoreForIdentity('test_store', 1, configFor(addrB));
    expect(await storeB.openSingleton<string>('payload').getAsync()).toBeUndefined();
    await storeB.close();

    const reopenedA = await openStoreForIdentity('test_store', 1, configFor(addrA));
    expect(await reopenedA.openSingleton<string>('payload').getAsync()).toEqual('data-for-A');
    await reopenedA.close();
  });

  it('separates stores by schema version', async () => {
    const addr = EthAddress.random();

    const v1 = await openStoreForIdentity('test_store', 1, configFor(addr));
    await v1.openSingleton<string>('k').set('v1-data');
    await v1.close();

    const v2 = await openStoreForIdentity('test_store', 2, configFor(addr));
    expect(await v2.openSingleton<string>('k').getAsync()).toBeUndefined();
    await v2.close();

    const v1Again = await openStoreForIdentity('test_store', 1, configFor(addr));
    expect(await v1Again.openSingleton<string>('k').getAsync()).toEqual('v1-data');
    await v1Again.close();
  });

  it('opens and persists with a zero identity (no rollup, no chain id)', async () => {
    const config = { dataDirectory, dataStoreMapSizeKb: 10 * 1024 };

    const store = await openStoreForIdentity('test_store', 1, config);
    await store.openSingleton<string>('payload').set('zero-identity-data');
    await store.close();

    const reopened = await openStoreForIdentity('test_store', 1, config);
    expect(await reopened.openSingleton<string>('payload').getAsync()).toEqual('zero-identity-data');
    await reopened.close();
  });

  it('places stores under a sibling <name>-stores directory, not nested in <name>', async () => {
    const store = await openStoreForIdentity('test_store', 1, configFor(EthAddress.random()));
    await store.close();

    await expect(stat(join(dataDirectory, 'test_store-stores'))).resolves.toBeDefined();
    await expect(stat(join(dataDirectory, 'test_store'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('falls back to an ephemeral tmp store when no data directory is configured', async () => {
    const store = await openStoreForIdentity('test_store', 1, { dataStoreMapSizeKb: 10 * 1024 });
    await store.openSingleton<string>('payload').set('tmp-data');
    expect(await store.openSingleton<string>('payload').getAsync()).toEqual('tmp-data');
    await store.close();

    await expect(stat(join(dataDirectory, 'test_store-stores'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
