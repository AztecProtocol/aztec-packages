import { expect } from 'chai';
import { beforeEach, describe, it } from 'mocha';

import { AztecSingleton } from './singleton.js';
import { type AztecKVStore } from './store.js';

export function describeAztecSingleton(testName: string, getStore: () => Promise<AztecKVStore>) {
  describe(testName, () => {
    let store: AztecKVStore;
    let singleton: AztecSingleton<string>;

    beforeEach(async () => {
      store = await getStore();
      singleton = store.openSingleton<string>('test');
    });

    it('returns undefined if the value is not set', async () => {
      expect(await singleton.get()).to.equal(undefined);
    });

    it('should be able to set and get values', async () => {
      expect(await singleton.set('foo')).to.equal(true);
      expect(await singleton.get()).to.equal('foo');
    });

    it('overwrites the value if it is set again', async () => {
      expect(await singleton.set('foo')).to.equal(true);
      expect(await singleton.set('bar')).to.equal(true);
      expect(await singleton.get()).to.equal('bar');
    });
  });
}
