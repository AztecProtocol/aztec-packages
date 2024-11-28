import { expect } from 'chai';
import { promises as fs } from 'fs';
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
      expect(await forkedSingleton.get()).to.equal('foo');
      await forkedSingleton.set('bar');
      expect(await singleton.get()).to.equal('foo');
      expect(await forkedSingleton.get()).to.equal('bar');
      await forkedSingleton.delete();
      expect(await singleton.get()).to.equal('foo');
    };

    it('forks a persistent store', async () => {
      const path = await fs.mkdtemp(join(tmpdir(), 'aztec-store-test-'));
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
