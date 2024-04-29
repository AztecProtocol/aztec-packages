import { AztecLmdbStore } from '@aztec/kv-store/lmdb';

import { Key } from 'interface-datastore';

// Adjust import based on actual package
import { AztecDatastore } from './data_store.js';

describe('AztecDatastore with AztecLmdbStore', () => {
  let datastore: AztecDatastore;
  let aztecStore: AztecLmdbStore;

  beforeAll(() => {
    aztecStore = AztecLmdbStore.open();
  });

  beforeEach(async () => {
    datastore = new AztecDatastore(aztecStore);
    await aztecStore.clear();
  });

  it('should store and retrieve an item', async () => {
    const key = new Key('testKey');
    const value = new Uint8Array([1, 2, 3]);

    await datastore.put(key, value);
    const retrieved = await datastore.get(key);

    expect(retrieved).toEqual(value);
  });

  it('should delete an item', async () => {
    const key = new Key('testKey');
    await datastore.put(key, new Uint8Array([1, 2, 3]));
    await datastore.delete(key);

    await expect(datastore.get(key)).rejects.toThrow('Key not found');
  });

  it('batch operations commit correctly', async () => {
    const batch = datastore.batch();
    const key1 = new Key('key1');
    const key2 = new Key('key2');
    const value1 = new Uint8Array([1, 2, 3]);
    const value2 = new Uint8Array([4, 5, 6]);

    batch.put(key1, value1);
    batch.put(key2, value2);
    batch.delete(key1);
    await batch.commit();

    const retrieved1 = datastore.get(key1);
    const retrieved2 = await datastore.get(key2);

    await expect(retrieved1).rejects.toThrow('Key not found'); // key1 should be deleted
    expect(retrieved2.toString()).toEqual(value2.toString()); // key2 should exist
  });

  it('query data by prefix', async () => {
    await datastore.put(new Key('prefix123'), new Uint8Array([1, 2, 3]));
    await datastore.put(new Key('prefix456'), new Uint8Array([4, 5, 6]));
    await datastore.put(new Key('noprefix'), new Uint8Array([7, 8, 9]));

    const query = {
      prefix: 'prefix',
      limit: 2,
    };

    const results = [];
    for await (const item of datastore.query(query)) {
      results.push(item);
    }

    expect(results.length).toBe(2);
    expect(results.every(item => item.key.toString().startsWith(`/${query.prefix}`))).toBeTruthy();
  });

  it('handle limits and offsets in queries', async () => {
    await datastore.put(new Key('item1'), new Uint8Array([1]));
    await datastore.put(new Key('item2'), new Uint8Array([2]));
    await datastore.put(new Key('item3'), new Uint8Array([3]));
    await datastore.put(new Key('item4'), new Uint8Array([4]));

    const query = {
      limit: 2,
      offset: 1,
    };

    const results = [];
    for await (const item of datastore.query(query)) {
      results.push(item);
    }

    expect(results.length).toBe(2);
    expect(results[0].key.toString()).toBe('/item2');
    expect(results[1].key.toString()).toBe('/item3');
  });

  it('memory map prunes correctly when limit is exceeded', async () => {
    // Insert more items than the memory limit to force pruning
    for (let i = 0; i < 10; i++) {
      await datastore.put(new Key(`key${i}`), new Uint8Array([i]));
    }

    // Check that data remains accessible even if it's no longer in the memory map
    for (let i = 0; i < 10; i++) {
      const result = await datastore.get(new Key(`key${i}`));
      expect(result).toEqual(new Uint8Array([i]));
    }
  });

  it('data consistency with transitions between memory and database', async () => {
    for (let i = 0; i < 20; i++) {
      await datastore.put(new Key(`key${i}`), new Uint8Array([i]));
    }

    // Check data consistency
    for (let i = 0; i < 20; i++) {
      const value = await datastore.get(new Key(`key${i}`));
      expect(value).toEqual(new Uint8Array([i]));
    }
  });
});
