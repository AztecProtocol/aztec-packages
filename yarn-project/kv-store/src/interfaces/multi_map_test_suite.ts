import { toArray } from '@aztec/foundation/iterable';

import type { Key, Range } from './common.js';
import type { AztecAsyncMultiMap, AztecMultiMap } from './multi_map.js';
import type { AztecAsyncKVStore, AztecKVStore } from './store.js';
import { isSyncStore } from './utils.js';

export function describeAztecMultiMap(
  testName: string,
  getStore: () => AztecKVStore | Promise<AztecAsyncKVStore>,
  forceAsync: boolean = false,
) {
  describe(testName, () => {
    let store: AztecKVStore | AztecAsyncKVStore;
    let multiMap: AztecMultiMap<Key, string> | AztecAsyncMultiMap<Key, string>;

    beforeEach(async () => {
      store = await getStore();
      multiMap = store.openMultiMap<string, string>('test');
    });

    afterEach(async () => {
      await store.delete();
    });

    async function get(key: Key, sut: AztecAsyncMultiMap<any, any> | AztecMultiMap<any, any> = multiMap) {
      return isSyncStore(store) && !forceAsync
        ? (sut as AztecMultiMap<any, any>).get(key)
        : await (sut as AztecAsyncMultiMap<any, any>).getAsync(key);
    }

    async function size(sut: AztecAsyncMultiMap<any, any> | AztecMultiMap<any, any> = multiMap) {
      return isSyncStore(store) && !forceAsync
        ? (sut as AztecMultiMap<any, any>).size()
        : await (sut as AztecAsyncMultiMap<any, any>).sizeAsync();
    }

    async function entries() {
      return isSyncStore(store) && !forceAsync
        ? await toArray((multiMap as AztecMultiMap<any, any>).entries())
        : await toArray((multiMap as AztecAsyncMultiMap<any, any>).entriesAsync());
    }

    async function values() {
      return isSyncStore(store) && !forceAsync
        ? await toArray((multiMap as AztecMultiMap<any, any>).values())
        : await toArray((multiMap as AztecAsyncMultiMap<any, any>).valuesAsync());
    }

    async function keys(range?: Range<Key>, sut: AztecAsyncMultiMap<any, any> | AztecMultiMap<any, any> = multiMap) {
      return isSyncStore(store) && !forceAsync
        ? await toArray((sut as AztecMultiMap<any, any>).keys(range))
        : await toArray((sut as AztecAsyncMultiMap<any, any>).keysAsync(range));
    }

    async function getValues(key: Key) {
      return isSyncStore(store) && !forceAsync
        ? await toArray((multiMap as AztecMultiMap<any, any>).getValues(key))
        : await toArray((multiMap as AztecAsyncMultiMap<any, any>).getValuesAsync(key));
    }

    async function getValueCount(
      key: Key,
      sut: AztecAsyncMultiMap<any, any> | AztecMultiMap<any, any> = multiMap,
    ): Promise<number> {
      return await (sut as AztecAsyncMultiMap<any, any>).getValueCountAsync(key);
    }

    it('should be able to set and get values', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('baz', 'qux');

      expect(await get('foo')).toBe('bar');
      expect(await get('baz')).toBe('qux');
      expect(await get('quux')).toBe(undefined);
    });

    it('should be able to set values if they do not exist', async () => {
      expect(await multiMap.setIfNotExists('foo', 'bar')).toBe(true);
      expect(await multiMap.setIfNotExists('foo', 'baz')).toBe(false);

      expect(await get('foo')).toBe('bar');
    });

    it('should be able to delete values', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('baz', 'qux');

      await multiMap.delete('foo');

      expect(await get('foo')).toBe(undefined);
      expect(await get('baz')).toBe('qux');
    });

    it('should be able to get size of the map', async () => {
      await multiMap.set('foo', 'bar');
      expect(await size()).toBe(1);
      await multiMap.set('baz', 'qux');
      expect(await size()).toBe(2);

      await multiMap.delete('foo');
      expect(await size()).toBe(1);
    });

    it('returns 0 for empty multimap size', async () => {
      expect(await size()).toBe(0);
    });

    it('calculates size correctly with multiple values per key', async () => {
      expect(await size()).toBe(0);

      // Add multiple values for same key
      await multiMap.set('key1', 'value1');
      expect(await size()).toBe(1);
      await multiMap.set('key1', 'value2');
      expect(await size()).toBe(2);
      await multiMap.set('key1', 'value3');
      expect(await size()).toBe(3);

      // Add values for different key
      await multiMap.set('key2', 'value4');
      expect(await size()).toBe(4);

      // Delete one value from key1
      await multiMap.deleteValue('key1', 'value2');
      expect(await size()).toBe(3);

      // Delete entire key
      await multiMap.delete('key1');
      expect(await size()).toBe(1);

      // Delete last key
      await multiMap.delete('key2');
      expect(await size()).toBe(0);
    });

    it('should be able to iterate over entries when there are no keys', async () => {
      expect(await entries()).toEqual([]);
    });

    it('should be able to iterate over entries', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('baz', 'qux');

      expect(await entries()).toEqual([
        ['baz', 'qux'],
        ['foo', 'bar'],
      ]);
    });

    it('should be able to iterate over values', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('baz', 'quux');

      expect(await values()).toEqual(['quux', 'bar']);
    });

    it('should be able to iterate over keys', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('baz', 'qux');

      expect(await keys()).toEqual(['baz', 'foo']);
    });

    it('should be able to get multiple values for a single key', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('foo', 'baz');

      expect(await getValues('foo')).toEqual(['bar', 'baz']);
    });

    it('should ignore multiple identical values', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('foo', 'bar');

      expect(await getValues('foo')).toEqual(['bar']);
    });

    it('should be able to delete individual values for a single key', async () => {
      await multiMap.set('foo', '1');
      await multiMap.set('foo', '2');
      await multiMap.set('foo', '3');

      await multiMap.deleteValue('foo', '2');

      expect(await getValues('foo')).toEqual(['1', '3']);
    });

    it('should be able to get size of the map with duplicate keys', async () => {
      await multiMap.set('foo', '1');
      await multiMap.set('foo', '2');
      await multiMap.set('foo', '3');
      expect(await size()).toBe(3);

      await multiMap.set('bar', '1');
      await multiMap.set('bar', '2');
      await multiMap.set('bar', '3');
      expect(await size()).toBe(6);

      await multiMap.deleteValue('foo', '2');
      expect(await size()).toBe(5);
    });

    it('should be able to delete the last and first values for a key', async () => {
      await multiMap.set('foo', '1');
      await multiMap.set('foo', '2');
      await multiMap.set('foo', '3');

      await multiMap.deleteValue('foo', '1');

      expect(await getValues('foo')).toEqual(['2', '3']);

      await multiMap.deleteValue('foo', '3');

      expect(await getValues('foo')).toEqual(['2']);
    });

    it('should be able to fully clear a key', async () => {
      await multiMap.set('foo', '1');
      await multiMap.set('foo', '2');
      await multiMap.set('foo', '3');

      await multiMap.deleteValue('foo', '1');
      await multiMap.deleteValue('foo', '3');
      await multiMap.deleteValue('foo', '2');

      expect(await getValues('foo')).toEqual([]);
    });

    it('should be able to insert after deletion', async () => {
      await multiMap.set('foo', '1');
      await multiMap.set('foo', '2');
      await multiMap.set('foo', '3');

      await multiMap.deleteValue('foo', '2');
      await multiMap.set('foo', 'bar');

      expect(await getValues('foo')).toEqual(['1', '3', 'bar']);

      // Delete the just-added entry
      await multiMap.deleteValue('foo', 'bar');

      expect(await getValues('foo')).toEqual(['1', '3']);

      // Reinsert the initially deleted key
      await multiMap.set('foo', '2');

      // LMDB and IndexedDB behave differently here, the former ordering by value and the latter by insertion. This is
      // fine because there is no expectation for values in a multimap to be ordered.
      const values = (await getValues('foo')).sort((a, b) => a.localeCompare(b));
      expect(values).toEqual(['1', '2', '3']);

      // Fully clear the key
      await multiMap.deleteValue('foo', '1');
      await multiMap.deleteValue('foo', '3');
      await multiMap.deleteValue('foo', '2');

      // Insert some more
      await multiMap.set('foo', 'baz');
      await multiMap.set('foo', 'qux');
      expect(await getValues('foo')).toEqual(['baz', 'qux']);
    });

    it('supports range queries', async () => {
      await multiMap.set('a', 'a');
      await multiMap.set('b', 'b');
      await multiMap.set('c', 'c');
      await multiMap.set('d', 'd');

      expect(await keys({ start: 'b', end: 'c' })).toEqual(['b']);
      expect(await keys({ start: 'b' })).toEqual(['b', 'c', 'd']);
      expect(await keys({ end: 'c' })).toEqual(['a', 'b']);
      expect(await keys({ start: 'b', end: 'c', reverse: true })).toEqual(['c']);
      expect(await keys({ start: 'b', limit: 1 })).toEqual(['b']);
      expect(await keys({ start: 'b', reverse: true })).toEqual(['d', 'c']);
      expect(await keys({ end: 'b', reverse: true })).toEqual(['b', 'a']);
    });

    it('returns 0 for missing key', async () => {
      expect(await getValueCount('missing')).toBe(0);
    });

    it('counts a single value', async () => {
      await multiMap.set('foo', 'bar');
      expect(await getValueCount('foo')).toBe(1);
    });

    it('counts multiple distinct values for same key', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('foo', 'baz');
      await multiMap.set('foo', 'qux');
      expect(await getValueCount('foo')).toBe(3);
    });

    it('does not increase count for duplicate inserts', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('foo', 'bar');
      await multiMap.set('foo', 'baz');
      await multiMap.set('foo', 'baz');
      expect(await getValueCount('foo')).toBe(2);
      expect((await getValues('foo')).sort()).toEqual(['bar', 'baz'].sort());
    });

    it('decrements when deleting a single value', async () => {
      await multiMap.set('foo', '1');
      await multiMap.set('foo', '2');
      await multiMap.set('foo', '3');
      expect(await getValueCount('foo')).toBe(3);
      await multiMap.deleteValue('foo', '2');
      expect(await getValueCount('foo')).toBe(2);
      expect((await getValues('foo')).sort()).toEqual(['1', '3'].sort());
    });

    it('does not change count when deleting a non-existent value', async () => {
      await multiMap.set('foo', '1');
      await multiMap.set('foo', '3');
      expect(await getValueCount('foo')).toBe(2);
      await multiMap.deleteValue('foo', '2');
      expect(await getValueCount('foo')).toBe(2);
    });

    it('clears all values when deleting a key', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('foo', 'baz');
      expect(await getValueCount('foo')).toBe(2);
      await multiMap.delete('foo');
      expect(await getValueCount('foo')).toBe(0);
      expect(await getValues('foo')).toEqual([]);
    });

    it('count equals enumerated values length', async () => {
      await multiMap.set('foo', '1');
      await multiMap.set('foo', '2');
      const vals = await getValues('foo');
      expect(await getValueCount('foo')).toBe(vals.length);
    });

    it('sum of per-key counts equals total size', async () => {
      await multiMap.set('foo', '1');
      await multiMap.set('foo', '2');
      await multiMap.set('bar', '3');
      await multiMap.set('bar', '4');
      await multiMap.set('baz', '5');

      const allKeys = await keys();
      const uniqueKeys = Array.from(new Set(allKeys));
      const counts = await Promise.all(uniqueKeys.map(k => getValueCount(k)));
      const sum = counts.reduce((s, n) => s + n, 0);
      expect(sum).toBe(await size());
    });

    it('supports sparse slots: delete middle, reinsert new, count remains correct', async () => {
      await multiMap.set('foo', '1');
      await multiMap.set('foo', '2');
      await multiMap.set('foo', '3');
      expect(await getValueCount('foo')).toBe(3);
      await multiMap.deleteValue('foo', '2');
      expect(await getValueCount('foo')).toBe(2);
      await multiMap.set('foo', '4');
      expect(await getValueCount('foo')).toBe(3);
      expect((await getValues('foo')).sort()).toEqual(['1', '3', '4'].sort());
    });

    it('multiple keys are independent', async () => {
      await multiMap.set('foo', '1');
      await multiMap.set('foo', '2');
      await multiMap.set('bar', '3');
      expect(await getValueCount('foo')).toBe(2);
      expect(await getValueCount('bar')).toBe(1);
    });
  });
}
