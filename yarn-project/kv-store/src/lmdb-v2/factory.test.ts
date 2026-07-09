import { EthAddress } from '@aztec/foundation/eth-address';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { createStore } from './factory.js';

describe('lmdb-v2 createStore', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(join(tmpdir(), 'factory-test-'));
  });

  afterEach(async () => {
    await rm(dataDirectory, { recursive: true, force: true });
  });

  const configFor = (rollupAddress: EthAddress, l1ChainId = 31337): DataStoreConfig => ({
    dataDirectory,
    dataStoreMapSizeKb: 10 * 1024,
    rollupAddress,
    l1ChainId,
  });

  it('with partitionByIdentity, keeps data intact when switching rollup addresses back and forth', async () => {
    const addrA = EthAddress.random();
    const addrB = EthAddress.random();
    const options = { partitionByIdentity: true };

    const storeA = await createStore('test_store', 1, configFor(addrA), undefined, options);
    await storeA.openSingleton<string>('payload').set('data-for-A');
    await storeA.close();

    const storeB = await createStore('test_store', 1, configFor(addrB), undefined, options);
    expect(await storeB.openSingleton<string>('payload').getAsync()).toBeUndefined();
    await storeB.close();

    const reopenedA = await createStore('test_store', 1, configFor(addrA), undefined, options);
    expect(await reopenedA.openSingleton<string>('payload').getAsync()).toEqual('data-for-A');
    await reopenedA.close();
  });

  it('with partitionByIdentity, separates stores by schema version', async () => {
    const addr = EthAddress.random();
    const options = { partitionByIdentity: true };

    const v1 = await createStore('test_store', 1, configFor(addr), undefined, options);
    await v1.openSingleton<string>('k').set('v1-data');
    await v1.close();

    const v2 = await createStore('test_store', 2, configFor(addr), undefined, options);
    expect(await v2.openSingleton<string>('k').getAsync()).toBeUndefined();
    await v2.close();

    const v1Again = await createStore('test_store', 1, configFor(addr), undefined, options);
    expect(await v1Again.openSingleton<string>('k').getAsync()).toEqual('v1-data');
    await v1Again.close();
  });

  it('without the flag, keeps the historical reset-on-rollup-change behavior', async () => {
    const addrA = EthAddress.random();
    const addrB = EthAddress.random();

    const storeA = await createStore('test_store', 1, configFor(addrA));
    await storeA.openSingleton<string>('payload').set('data-for-A');
    await storeA.close();

    const storeB = await createStore('test_store', 1, configFor(addrB));
    expect(await storeB.openSingleton<string>('payload').getAsync()).toBeUndefined();
    await storeB.close();

    // Historical behavior is destructive: the data does not come back.
    const reopenedA = await createStore('test_store', 1, configFor(addrA));
    expect(await reopenedA.openSingleton<string>('payload').getAsync()).toBeUndefined();
    await reopenedA.close();
  });
});
