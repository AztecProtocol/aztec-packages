import { expect } from 'chai';

import { AztecAsyncSingleton, AztecSingleton } from './singleton.js';
import { AztecAsyncKVStore, AztecKVStore } from './store.js';
import { isAsyncStore } from './utils.js';

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
      return isAsyncStore(store) ? await singleton.get() : singleton.get();
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
    };

    it('forks a persistent store', async () => {
      const store = await getPersistentStore();
      await itForks(store);
    });

    it('forks a persistent store with no path', async () => {
      const store = await getPersistentNoPathStore();
      await itForks(store);
    });

    it('forks an ephemeral store', async () => {
      const store = await getEphemeralStore();
      await itForks(store);
    });
  });
}
