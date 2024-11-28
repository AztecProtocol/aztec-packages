import '@aztec/circuit-types/jest';
import { toArray } from '@aztec/foundation/iterable';

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

      expect(map.get('foo')).toEqual('bar');
      expect(map.get('baz')).toEqual('qux');
      expect(map.get('quux')).toEqual(undefined);
    });

    it('should be able to set values if they do not exist', async () => {
      expect(await map.setIfNotExists('foo', 'bar')).toEqual(true);
      expect(await map.setIfNotExists('foo', 'baz')).toEqual(false);

      expect(map.get('foo')).toEqual('bar');
    });

    it('should be able to delete values', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      await map.delete('foo');

      expect(map.get('foo')).toEqual(undefined);
      expect(map.get('baz')).toEqual('qux');
    });

    it('should be able to iterate over entries when there are no keys', async () => {
      expect(await toArray(map.entries())).toEqual([]);
    });

    it('should be able to iterate over entries', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      expect(await toArray(map.entries())).toEqual([
        ['baz', 'qux'],
        ['foo', 'bar'],
      ]);
    });

    it('should be able to iterate over values', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'quux');

      expect(await toArray(map.values())).toEqual(['quux', 'bar']);
    });

    it('should be able to iterate over keys', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      expect(await toArray(map.keys())).toEqual(['baz', 'foo']);
    });

    it('should be able to get multiple values for a single key', async () => {
      await map.set('foo', 'bar');
      await map.set('foo', 'baz');

      expect(await toArray(map.getValues('foo'))).toEqual(['bar', 'baz']);
    });

    it('should be able to delete individual values for a single key', async () => {
      await map.set('foo', 'bar');
      await map.set('foo', 'baz');

      await map.deleteValue('foo', 'bar');

      expect(await toArray(map.getValues('foo'))).toEqual(['baz']);
    });

    it('supports tuple keys', async () => {
      // Use a new map because key structure has changed
      const tupleMap = store.openMap<[number, string], string>('test-tuple');

      await tupleMap.set([5, 'bar'], 'val');
      await tupleMap.set([0, 'foo'], 'val');

      expect(await toArray(tupleMap.keys())).toEqual([
        [0, 'foo'],
        [5, 'bar'],
      ]);

      expect(tupleMap.get([5, 'bar'])).toEqual('val');
    });

    it('supports range queries', async () => {
      await map.set('a', 'a');
      await map.set('b', 'b');
      await map.set('c', 'c');
      await map.set('d', 'd');

      expect(await toArray(map.keys({ start: 'b', end: 'c' }))).toEqual(['b']);
      expect(await toArray(map.keys({ start: 'b' }))).toEqual(['b', 'c', 'd']);
      expect(await toArray(map.keys({ end: 'c' }))).toEqual(['a', 'b']);
      expect(await toArray(map.keys({ start: 'b', end: 'c', reverse: true }))).toEqual(['c']);
      expect(await toArray(map.keys({ start: 'b', limit: 1 }))).toEqual(['b']);
      expect(await toArray(map.keys({ start: 'b', reverse: true }))).toEqual(['d', 'c']);
      expect(await toArray(map.keys({ end: 'b', reverse: true }))).toEqual(['b', 'a']);
    });
  });
}
