import { expect } from 'chai';

import { type AztecAsyncSingleton, type AztecSingleton } from './singleton.js';
import { type AztecAsyncKVStore, type AztecKVStore } from './store.js';
import { isSyncStore } from './utils.js';

export function describeAztecStore(
  testName: string,
  getPersistentStore: () => Promise<AztecKVStore | AztecAsyncKVStore>,
  getPersistentNoPathStore: () => Promise<AztecKVStore | AztecAsyncKVStore>,
  getEphemeralStore: () => Promise<AztecKVStore | AztecAsyncKVStore>,
) {
  describe(testName, () => {
    async function get(
      store: AztecKVStore | AztecAsyncKVStore,
      singleton: AztecSingleton<string> | AztecAsyncSingleton<string>,
    ) {
      return isSyncStore(store)
        ? (singleton as AztecSingleton<string>).get()
        : await (singleton as AztecAsyncSingleton<string>).getAsync();
    }

    const itForks = async (store: AztecKVStore | AztecAsyncKVStore) => {
      const singleton = store.openSingleton<string>('singleton');
      await singleton.set('foo');

      const forkedStore = await store.fork();
      const forkedSingleton = forkedStore.openSingleton<string>('singleton');
      expect(await get(store, singleton)).to.equal('foo');
      await forkedSingleton.set('bar');
      expect(await get(store, singleton)).to.equal('foo');
      expect(await get(forkedStore, forkedSingleton)).to.equal('bar');
      await forkedSingleton.delete();
      expect(await get(store, singleton)).to.equal('foo');
      await forkedStore.delete();
    };

    it('forks a persistent store', async () => {
      const store = await getPersistentStore();
      await itForks(store);
      await store.delete();
    });

    it('forks a persistent store with no path', async () => {
      const store = await getPersistentNoPathStore();
      await itForks(store);
      await store.delete();
    });

    it('forks an ephemeral store', async () => {
      const store = await getEphemeralStore();
      await itForks(store);
      await store.delete();
    });
  });
}
