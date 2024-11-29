import { toArray } from '@aztec/foundation/iterable';

import { expect } from 'chai';

import { Key } from './common.js';
import { AztecMultiMap } from './map.js';
import { AztecKVStore } from './store.js';

export function describeAztecMap(testName: string, getStore: () => Promise<AztecKVStore>) {
  describe(testName, () => {
    let store: AztecKVStore;
    let map: AztecMultiMap<Key, string>;

    beforeEach(async () => {
      store = await getStore();
      map = store.openMultiMap<string | [number, string], string>('test');
    });

    it('should be able to set and get values', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      expect(await map.get('foo')).to.equal('bar');
      expect(await map.get('baz')).to.equal('qux');
      expect(await map.get('quux')).to.equal(undefined);
    });

    it('should be able to set values if they do not exist', async () => {
      expect(await map.setIfNotExists('foo', 'bar')).to.equal(true);
      expect(await map.setIfNotExists('foo', 'baz')).to.equal(false);

      expect(await map.get('foo')).to.equal('bar');
    });

    it('should be able to delete values', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      await map.delete('foo');

      expect(await map.get('foo')).to.equal(undefined);
      expect(await map.get('baz')).to.equal('qux');
    });

    it('should be able to iterate over entries when there are no keys', async () => {
      expect(await toArray(map.entries())).to.deep.equal([]);
    });

    it('should be able to iterate over entries', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      expect(await toArray(map.entries())).to.deep.equal([
        ['baz', 'qux'],
        ['foo', 'bar'],
      ]);
    });

    it('should be able to iterate over values', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'quux');

      expect(await toArray(map.values())).to.deep.equal(['quux', 'bar']);
    });

    it('should be able to iterate over keys', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      expect(await toArray(map.keys())).to.deep.equal(['baz', 'foo']);
    });

    it('should be able to get multiple values for a single key', async () => {
      await map.set('foo', 'bar');
      await map.set('foo', 'baz');

      expect(await toArray(await map.getValues('foo'))).to.deep.equal(['bar', 'baz']);
    });

    it('should be able to delete individual values for a single key', async () => {
      await map.set('foo', 'bar');
      await map.set('foo', 'baz');

      await map.deleteValue('foo', 'bar');

      expect(await toArray(await map.getValues('foo'))).to.deep.equal(['baz']);
    });

    it('supports tuple keys', async () => {
      // Use a new map because key structure has changed
      const tupleMap = store.openMap<[number, string], string>('test-tuple');

      await tupleMap.set([5, 'bar'], 'val');
      await tupleMap.set([0, 'foo'], 'val');

      expect(await toArray(tupleMap.keys())).to.deep.equal([
        [0, 'foo'],
        [5, 'bar'],
      ]);

      expect(await tupleMap.get([5, 'bar'])).to.equal('val');
    });

    it('supports range queries', async () => {
      await map.set('a', 'a');
      await map.set('b', 'b');
      await map.set('c', 'c');
      await map.set('d', 'd');

      expect(await toArray(map.keys({ start: 'b', end: 'c' }))).to.deep.equal(['b']);
      expect(await toArray(map.keys({ start: 'b' }))).to.deep.equal(['b', 'c', 'd']);
      expect(await toArray(map.keys({ end: 'c' }))).to.deep.equal(['a', 'b']);
      expect(await toArray(map.keys({ start: 'b', end: 'c', reverse: true }))).to.deep.equal(['c']);
      expect(await toArray(map.keys({ start: 'b', limit: 1 }))).to.deep.equal(['b']);
      expect(await toArray(map.keys({ start: 'b', reverse: true }))).to.deep.equal(['d', 'c']);
      expect(await toArray(map.keys({ end: 'b', reverse: true }))).to.deep.equal(['b', 'a']);
    });
  });
}
