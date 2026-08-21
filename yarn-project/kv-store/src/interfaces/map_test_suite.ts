import { toArray } from '@aztec/foundation/iterable';

import type { Key, Range } from './common.js';
import type { AztecAsyncMap, AztecMap } from './map.js';
import type { AztecAsyncKVStore, AztecKVStore } from './store.js';
import { isSyncStore } from './utils.js';

export function describeAztecMap(
  testName: string,
  getStore: () => AztecKVStore | Promise<AztecAsyncKVStore>,
  forceAsync: boolean = false,
) {
  describe(testName, () => {
    let store: AztecKVStore | AztecAsyncKVStore;
    let map: AztecMap<Key, string> | AztecAsyncMap<Key, string>;

    beforeEach(async () => {
      store = await getStore();
      map = store.openMap<string, string>('test');
    });

    afterEach(async () => {
      await store.delete();
    });

    async function get(key: Key, sut: AztecAsyncMap<any, any> | AztecMap<any, any> = map) {
      return isSyncStore(store) && !forceAsync
        ? (sut as AztecMap<any, any>).get(key)
        : await (sut as AztecAsyncMap<any, any>).getAsync(key);
    }

    async function getMany(keys: Key[], sut: AztecAsyncMap<any, any> | AztecMap<any, any> = map) {
      return await (sut as AztecAsyncMap<any, any>).getManyAsync(keys);
    }

    async function size(sut: AztecAsyncMap<any, any> | AztecMap<any, any> = map) {
      return isSyncStore(store) && !forceAsync
        ? (sut as AztecMap<any, any>).size()
        : await (sut as AztecAsyncMap<any, any>).sizeAsync();
    }

    async function entries() {
      return isSyncStore(store) && !forceAsync
        ? await toArray((map as AztecMap<any, any>).entries())
        : await toArray((map as AztecAsyncMap<any, any>).entriesAsync());
    }

    async function values() {
      return isSyncStore(store) && !forceAsync
        ? await toArray((map as AztecMap<any, any>).values())
        : await toArray((map as AztecAsyncMap<any, any>).valuesAsync());
    }

    async function keys(range?: Range<Key>, sut: AztecAsyncMap<any, any> | AztecMap<any, any> = map) {
      return isSyncStore(store) && !forceAsync
        ? await toArray((sut as AztecMap<any, any>).keys(range))
        : await toArray((sut as AztecAsyncMap<any, any>).keysAsync(range));
    }

    it('should be able to set and get values', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      expect(await get('foo')).toBe('bar');
      expect(await get('baz')).toBe('qux');
      expect(await get('quux')).toBe(undefined);
    });

    it('should be able to set many values', async () => {
      const pairs = Array.from({ length: 100 }, (_, i) => ({ key: `key${i}`, value: `value${i}` }));
      await map.setMany(pairs);

      for (const { key, value } of pairs) {
        expect(await get(key)).toBe(value);
      }
    });

    it('should be able to get many values at once', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      expect(await getMany(['foo', 'baz'])).toEqual(['bar', 'qux']);
    });

    it('returns undefined for missing keys when getting many', async () => {
      await map.set('foo', 'bar');

      expect(await getMany(['missing', 'foo', 'alsoMissing'])).toEqual([undefined, 'bar', undefined]);
    });

    it('preserves input order when getting many', async () => {
      const pairs = Array.from({ length: 20 }, (_, i) => ({ key: `key${i}`, value: `value${i}` }));
      await map.setMany(pairs);

      const requested = [...pairs].reverse().map(({ key }) => key);
      expect(await getMany(requested)).toEqual([...pairs].reverse().map(({ value }) => value));
    });

    it('returns an empty array when getting many with no keys', async () => {
      await map.set('foo', 'bar');

      expect(await getMany([])).toEqual([]);
    });

    it('should be able to overwrite values', async () => {
      await map.set('foo', 'bar');
      await map.set('foo', 'baz');

      expect(await get('foo')).toBe('baz');
    });

    it('should be able to set values if they do not exist', async () => {
      expect(await map.setIfNotExists('foo', 'bar')).toBe(true);
      expect(await map.setIfNotExists('foo', 'baz')).toBe(false);

      expect(await get('foo')).toBe('bar');
    });

    it('should be able to delete values', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      await map.delete('foo');

      expect(await get('foo')).toBe(undefined);
      expect(await get('baz')).toBe('qux');
    });

    it('should be able to return size of the map', async () => {
      await map.set('foo', 'bar');
      expect(await size()).toBe(1);
      await map.set('baz', 'qux');
      expect(await size()).toBe(2);

      await map.delete('foo');
      expect(await size()).toBe(1);
    });

    it('returns 0 for empty map size', async () => {
      expect(await size()).toBe(0);
    });

    it('calculates size correctly across multiple operations', async () => {
      expect(await size()).toBe(0);

      // Add items
      await map.set('a', 'value1');
      await map.set('b', 'value2');
      await map.set('c', 'value3');
      expect(await size()).toBe(3);

      // Update existing (size should not change)
      await map.set('b', 'updated');
      expect(await size()).toBe(3);

      // Delete some
      await map.delete('a');
      expect(await size()).toBe(2);

      // Delete all
      await map.delete('b');
      await map.delete('c');
      expect(await size()).toBe(0);
    });

    it('should be able to iterate over entries when there are no keys', async () => {
      expect(await entries()).toEqual([]);
    });

    it('should be able to iterate over entries', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      expect(await entries()).toEqual([
        ['baz', 'qux'],
        ['foo', 'bar'],
      ]);
    });

    it('should be able to iterate over values', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'quux');

      expect(await values()).toEqual(['quux', 'bar']);
    });

    it('should be able to iterate over keys', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      expect(await keys()).toEqual(['baz', 'foo']);
    });

    it('should be able to iterate over string keys that represent numbers', async () => {
      await map.set('0x22', 'bar');
      await map.set('0x31', 'qux');

      expect(await keys()).toEqual(['0x22', '0x31']);
    });

    for (const [name, data] of [
      ['chars', ['a', 'b', 'c', 'd']],
      ['numbers', [1, 2, 3, 4]],
      ['negative numbers', [-4, -3, -2, -1]],
      ['strings', ['aaa', 'bbb', 'ccc', 'ddd']],
      ['zero-based numbers', [0, 1, 2, 3]],
      ['large numbers', [100, 999, 1000, 1001]],
      ['mixed negative and positive', [-1000, -1, 1, 1000]],
    ]) {
      it(`supports range queries over ${name} keys`, async () => {
        const [a, b, c, d] = data;

        await map.set(a, 'a');
        await map.set(b, 'b');
        await map.set(c, 'c');
        await map.set(d, 'd');

        expect(await keys()).toEqual([a, b, c, d]);
        expect(await keys({ start: b, end: c })).toEqual([b]);
        expect(await keys({ start: b })).toEqual([b, c, d]);
        expect(await keys({ end: c })).toEqual([a, b]);
        expect(await keys({ start: b, end: c, reverse: true })).toEqual([c]);
        expect(await keys({ start: b, limit: 1 })).toEqual([b]);
        expect(await keys({ start: b, reverse: true })).toEqual([d, c]);
        expect(await keys({ end: b, reverse: true })).toEqual([b, a]);
      });
    }
  });
}
