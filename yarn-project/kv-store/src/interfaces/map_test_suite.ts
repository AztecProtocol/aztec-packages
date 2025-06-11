import { toArray } from '@aztec/foundation/iterable';

import { expect } from 'chai';

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

      expect(await get('foo')).to.equal('bar');
      expect(await get('baz')).to.equal('qux');
      expect(await get('quux')).to.equal(undefined);
    });

    it('should be able to overwrite values', async () => {
      await map.set('foo', 'bar');
      await map.set('foo', 'baz');

      expect(await get('foo')).to.equal('baz');
    });

    it('should be able to set values if they do not exist', async () => {
      expect(await map.setIfNotExists('foo', 'bar')).to.equal(true);
      expect(await map.setIfNotExists('foo', 'baz')).to.equal(false);

      expect(await get('foo')).to.equal('bar');
    });

    it('should be able to delete values', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      await map.delete('foo');

      expect(await get('foo')).to.equal(undefined);
      expect(await get('baz')).to.equal('qux');
    });

    it('should be able to return size of the map', async () => {
      await map.set('foo', 'bar');
      expect(await size()).to.equal(1);
      await map.set('baz', 'qux');
      expect(await size()).to.equal(2);

      await map.delete('foo');
      expect(await size()).to.equal(1);
    });

    it('should be able to iterate over entries when there are no keys', async () => {
      expect(await entries()).to.deep.equal([]);
    });

    it('should be able to iterate over entries', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      expect(await entries()).to.deep.equal([
        ['baz', 'qux'],
        ['foo', 'bar'],
      ]);
    });

    it('should be able to iterate over values', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'quux');

      expect(await values()).to.deep.equal(['quux', 'bar']);
    });

    it('should be able to iterate over keys', async () => {
      await map.set('foo', 'bar');
      await map.set('baz', 'qux');

      expect(await keys()).to.deep.equal(['baz', 'foo']);
    });

    for (const [name, data] of [
      ['chars', ['a', 'b', 'c', 'd']],
      ['numbers', [1, 2, 3, 4]],
      ['negative numbers', [-4, -3, -2, -1]],
      ['strings', ['aaa', 'bbb', 'ccc', 'ddd']],
      ['zero-based numbers', [0, 1, 2, 3]],
    ]) {
      it(`supports range queries over ${name} keys`, async () => {
        const [a, b, c, d] = data;

        await map.set(a, 'a');
        await map.set(b, 'b');
        await map.set(c, 'c');
        await map.set(d, 'd');

        expect(await keys()).to.deep.equal([a, b, c, d]);
        expect(await keys({ start: b, end: c })).to.deep.equal([b]);
        expect(await keys({ start: b })).to.deep.equal([b, c, d]);
        expect(await keys({ end: c })).to.deep.equal([a, b]);
        expect(await keys({ start: b, end: c, reverse: true })).to.deep.equal([c]);
        expect(await keys({ start: b, limit: 1 })).to.deep.equal([b]);
        expect(await keys({ start: b, reverse: true })).to.deep.equal([d, c]);
        expect(await keys({ end: b, reverse: true })).to.deep.equal([b, a]);
      });
    }
  });
}
