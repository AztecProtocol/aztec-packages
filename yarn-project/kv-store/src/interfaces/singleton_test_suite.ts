import { expect } from 'chai';

import { AztecAsyncSingleton, AztecSingleton } from './singleton.js';
import { AztecAsyncKVStore, type AztecKVStore } from './store.js';
import { isAsyncStore } from './utils.js';

export function describeAztecSingleton(testName: string, getStore: () => Promise<AztecKVStore | AztecAsyncKVStore>) {
  describe(testName, () => {
    let store: AztecKVStore | AztecAsyncKVStore;
    let singleton: AztecSingleton<string> | AztecAsyncSingleton<string>;

    beforeEach(async () => {
      store = await getStore();
      singleton = store.openSingleton<string>('test');
    });

    async function get() {
      return isAsyncStore(store)
        ? await (singleton as AztecAsyncSingleton<string>).getAsync()
        : (singleton as AztecSingleton<string>).get();
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
