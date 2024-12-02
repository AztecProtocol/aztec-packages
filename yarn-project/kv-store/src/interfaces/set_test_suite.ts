import { toArray } from '@aztec/foundation/iterable';

import { expect } from 'chai';

import { Range } from './common.js';
import { AztecAsyncSet, AztecSet } from './set.js';
import { AztecAsyncKVStore, AztecKVStore } from './store.js';
import { isAsyncStore } from './utils.js';

export function describeAztecSet(testName: string, getStore: () => Promise<AztecKVStore | AztecAsyncKVStore>) {
  describe(testName, () => {
    let store: AztecKVStore | AztecAsyncKVStore;
    let set: AztecSet<string> | AztecAsyncSet<string>;

    beforeEach(async () => {
      store = await getStore();
      set = store.openSet<string>('test');
    });

    async function has(key: string) {
      return isAsyncStore(store)
        ? await (set as AztecAsyncSet<string>).hasAsync(key)
        : (set as AztecSet<string>).has(key);
    }

    async function entries(range?: Range<any>) {
      return isAsyncStore(store)
        ? await toArray((set as AztecAsyncSet<string>).entriesAsync(range))
        : await toArray((set as AztecSet<string>).entries(range));
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
