import { expect } from 'chai';

import { AztecKVStore } from './store.js';

export function describeAztecStore(
  testName: string,
  getPersistentStore: () => Promise<AztecKVStore>,
  getPersistentNoPathStore: () => Promise<AztecKVStore>,
  getEphemeralStore: () => Promise<AztecKVStore>,
) {
  describe(testName, () => {
    const itForks = async (store: AztecKVStore) => {
      const singleton = store.openSingleton('singleton');
      await singleton.set('foo');

      const forkedStore = await store.fork();
      const forkedSingleton = forkedStore.openSingleton('singleton');
      expect(await forkedSingleton.get()).to.equal('foo');
      await forkedSingleton.set('bar');
      expect(await singleton.get()).to.equal('foo');
      expect(await forkedSingleton.get()).to.equal('bar');
      await forkedSingleton.delete();
      expect(await singleton.get()).to.equal('foo');
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
