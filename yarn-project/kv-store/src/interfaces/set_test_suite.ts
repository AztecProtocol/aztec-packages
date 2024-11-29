import { toArray } from '@aztec/foundation/iterable';

import { expect } from 'chai';

import { AztecSet } from './set.js';
import { AztecKVStore } from './store.js';

export function describeAztecSet(testName: string, getStore: () => Promise<AztecKVStore>) {
  describe(testName, () => {
    let store: AztecKVStore;
    let set: AztecSet<string>;

    beforeEach(async () => {
      store = await getStore();
      set = store.openSet<string>('test');
    });

    it('should be able to set and get values', async () => {
      await set.add('foo');
      await set.add('baz');

      expect(await set.has('foo')).to.equal(true);
      expect(await set.has('baz')).to.equal(true);
      expect(await set.has('bar')).to.equal(false);
    });

    it('should be able to delete values', async () => {
      await set.add('foo');
      await set.add('baz');

      await set.delete('foo');

      expect(await set.has('foo')).to.equal(false);
      expect(await set.has('baz')).to.equal(true);
    });

    it('should be able to iterate over entries', async () => {
      await set.add('baz');
      await set.add('foo');

      expect(await toArray(set.entries())).to.deep.equal(['baz', 'foo']);
    });

    it('supports range queries', async () => {
      await set.add('a');
      await set.add('b');
      await set.add('c');
      await set.add('d');

      expect(await toArray(set.entries({ start: 'b', end: 'c' }))).to.deep.equal(['b']);
      expect(await toArray(set.entries({ start: 'b' }))).to.deep.equal(['b', 'c', 'd']);
      expect(await toArray(set.entries({ end: 'c' }))).to.deep.equal(['a', 'b']);
      expect(await toArray(set.entries({ start: 'b', end: 'c', reverse: true }))).to.deep.equal(['c']);
      expect(await toArray(set.entries({ start: 'b', limit: 1 }))).to.deep.equal(['b']);
      expect(await toArray(set.entries({ start: 'b', reverse: true }))).to.deep.equal(['d', 'c']);
      expect(await toArray(set.entries({ end: 'b', reverse: true }))).to.deep.equal(['b', 'a']);
    });
  });
}
