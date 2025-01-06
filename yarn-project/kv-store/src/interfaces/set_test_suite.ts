import { toArray } from '@aztec/foundation/iterable';

import { expect } from 'chai';

import { type Range } from './common.js';
import { type AztecAsyncSet, type AztecSet } from './set.js';
import { type AztecAsyncKVStore, type AztecKVStore } from './store.js';
import { isSyncStore } from './utils.js';

export function describeAztecSet(
  testName: string,
  getStore: () => AztecKVStore | Promise<AztecAsyncKVStore>,
  forceAsync: boolean = false,
) {
  describe(testName, () => {
    let store: AztecKVStore | AztecAsyncKVStore;
    let set: AztecSet<string> | AztecAsyncSet<string>;

    beforeEach(async () => {
      store = await getStore();
      set = store.openSet<string>('test');
    });

    afterEach(async () => {
      await store.delete();
    });

    async function has(key: string) {
      return isSyncStore(store) && !forceAsync
        ? (set as AztecSet<string>).has(key)
        : await (set as AztecAsyncSet<string>).hasAsync(key);
    }

    async function entries(range?: Range<any>) {
      return isSyncStore(store) && !forceAsync
        ? await toArray((set as AztecSet<string>).entries(range))
        : await toArray((set as AztecAsyncSet<string>).entriesAsync(range));
    }

    it('should be able to set and get values', async () => {
      await set.add('foo');
      await set.add('baz');

      expect(await has('foo')).to.equal(true);
      expect(await has('baz')).to.equal(true);
      expect(await has('bar')).to.equal(false);
    });

    it('should be able to delete values', async () => {
      await set.add('foo');
      await set.add('baz');

      await set.delete('foo');

      expect(await has('foo')).to.equal(false);
      expect(await has('baz')).to.equal(true);
    });

    it('should be able to iterate over entries', async () => {
      await set.add('baz');
      await set.add('foo');

      expect(await entries()).to.deep.equal(['baz', 'foo']);
    });

    it('supports range queries', async () => {
      await set.add('a');
      await set.add('b');
      await set.add('c');
      await set.add('d');

      expect(await entries({ start: 'b', end: 'c' })).to.deep.equal(['b']);
      expect(await entries({ start: 'b' })).to.deep.equal(['b', 'c', 'd']);
      expect(await entries({ end: 'c' })).to.deep.equal(['a', 'b']);
      expect(await entries({ start: 'b', end: 'c', reverse: true })).to.deep.equal(['c']);
      expect(await entries({ start: 'b', limit: 1 })).to.deep.equal(['b']);
      expect(await entries({ start: 'b', reverse: true })).to.deep.equal(['d', 'c']);
      expect(await entries({ end: 'b', reverse: true })).to.deep.equal(['b', 'a']);
    });
  });
}
