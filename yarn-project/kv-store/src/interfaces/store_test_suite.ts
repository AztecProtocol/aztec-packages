import { mkdtemp } from 'fs/promises';
import { get } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';

import { AztecKVStore } from './store.js';

export function describeAztecStore(
  testName: string,
  getPersistentStore: (path: string) => Promise<AztecKVStore>,
  getPersistentNoPathStore: () => Promise<AztecKVStore>,
  getEphemeralStore: () => Promise<AztecKVStore>,
) {
  describe(testName, () => {
    const itForks = async (store: AztecKVStore) => {
      const singleton = store.openSingleton('singleton');
      await singleton.set('foo');

      const forkedStore = await store.fork();
      const forkedSingleton = forkedStore.openSingleton('singleton');
      expect(forkedSingleton.get()).toEqual('foo');
      await forkedSingleton.set('bar');
      expect(singleton.get()).toEqual('foo');
      expect(forkedSingleton.get()).toEqual('bar');
      await forkedSingleton.delete();
      expect(singleton.get()).toEqual('foo');
    };

    it('forks a persistent store', async () => {
      const path = await mkdtemp(join(tmpdir(), 'aztec-store-test-'));
      const store = await getPersistentStore(path);
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
