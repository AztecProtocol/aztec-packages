import { expect } from 'chai';

import { type AztecAsyncSingleton, type AztecSingleton } from './singleton.js';
import { type AztecAsyncKVStore, type AztecKVStore } from './store.js';
import { isSyncStore } from './utils.js';

export function describeAztecSingleton(
  testName: string,
  getStore: () => AztecKVStore | Promise<AztecAsyncKVStore>,
  forceAsync: boolean = false,
) {
  describe(testName, () => {
    let store: AztecKVStore | AztecAsyncKVStore;
    let singleton: AztecSingleton<string> | AztecAsyncSingleton<string>;

    beforeEach(async () => {
      store = await getStore();
      singleton = store.openSingleton<string>('test');
    });

    async function get() {
      return isSyncStore(store) && !forceAsync
        ? (singleton as AztecSingleton<string>).get()
        : await (singleton as AztecAsyncSingleton<string>).getAsync();
    }

    it('returns undefined if the value is not set', async () => {
      expect(await get()).to.equal(undefined);
    });

    it('should be able to set and get values', async () => {
      expect(await singleton.set('foo')).to.equal(true);
      expect(await get()).to.equal('foo');
    });

    it('overwrites the value if it is set again', async () => {
      expect(await singleton.set('foo')).to.equal(true);
      expect(await singleton.set('bar')).to.equal(true);
      expect(await get()).to.equal('bar');
    });
  });
}
