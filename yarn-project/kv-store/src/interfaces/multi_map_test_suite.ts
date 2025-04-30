import { toArray } from '@aztec/foundation/iterable';

import { expect } from 'chai';

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

    it('should be able to set and get values', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('baz', 'qux');

      expect(await get('foo')).to.equal('bar');
      expect(await get('baz')).to.equal('qux');
      expect(await get('quux')).to.equal(undefined);
    });

    it('should be able to set values if they do not exist', async () => {
      expect(await multiMap.setIfNotExists('foo', 'bar')).to.equal(true);
      expect(await multiMap.setIfNotExists('foo', 'baz')).to.equal(false);

      expect(await get('foo')).to.equal('bar');
    });

    it('should be able to delete values', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('baz', 'qux');

      await multiMap.delete('foo');

      expect(await get('foo')).to.equal(undefined);
      expect(await get('baz')).to.equal('qux');
    });

    it('should be able to iterate over entries when there are no keys', async () => {
      expect(await entries()).to.deep.equal([]);
    });

    it('should be able to iterate over entries', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('baz', 'qux');

      expect(await entries()).to.deep.equal([
        ['baz', 'qux'],
        ['foo', 'bar'],
      ]);
    });

    it('should be able to iterate over values', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('baz', 'quux');

      expect(await values()).to.deep.equal(['quux', 'bar']);
    });

    it('should be able to iterate over keys', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('baz', 'qux');

      expect(await keys()).to.deep.equal(['baz', 'foo']);
    });

    it('should be able to get multiple values for a single key', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('foo', 'baz');

      expect(await getValues('foo')).to.deep.equal(['bar', 'baz']);
    });

    it('should ignore multiple identical values', async () => {
      await multiMap.set('foo', 'bar');
      await multiMap.set('foo', 'bar');

      expect(await getValues('foo')).to.deep.equal(['bar']);
    });

    it('should be able to delete individual values for a single key', async () => {
      await multiMap.set('foo', '1');
      await multiMap.set('foo', '2');
      await multiMap.set('foo', '3');

      // Out-of-order delete
      await multiMap.deleteValue('foo', '2');

      expect(await getValues('foo')).to.deep.equal(['1', '3']);

      // Insertion after delete
      await multiMap.set('foo', 'bar');

      expect(await getValues('foo')).to.deep.equal(['1', '3', 'bar']);

      // Delete the last key
      await multiMap.deleteValue('foo', 'bar');

      expect(await getValues('foo')).to.deep.equal(['1', '3']);

      // Reinsert the initially deleted key
      await multiMap.set('foo', '2');

      // LMDB and IndexedDB behave differently here, the former ordering by value and the
      // latter by insertion. This is fine because there is no expectation for values in a map (or multimap) to
      // be ordered.
      const values = (await getValues('foo')).sort((a, b) => a.localeCompare(b));
      expect(values).to.deep.equal(['1', '2', '3']);
    });

    it('supports range queries', async () => {
      await multiMap.set('a', 'a');
      await multiMap.set('b', 'b');
      await multiMap.set('c', 'c');
      await multiMap.set('d', 'd');

      expect(await keys({ start: 'b', end: 'c' })).to.deep.equal(['b']);
      expect(await keys({ start: 'b' })).to.deep.equal(['b', 'c', 'd']);
      expect(await keys({ end: 'c' })).to.deep.equal(['a', 'b']);
      expect(await keys({ start: 'b', end: 'c', reverse: true })).to.deep.equal(['c']);
      expect(await keys({ start: 'b', limit: 1 })).to.deep.equal(['b']);
      expect(await keys({ start: 'b', reverse: true })).to.deep.equal(['d', 'c']);
      expect(await keys({ end: 'b', reverse: true })).to.deep.equal(['b', 'a']);
    });
  });
}
