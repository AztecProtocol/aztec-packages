import { toArray } from '@aztec/foundation/iterable';

import { expect } from 'chai';

import { type AztecArray, type AztecAsyncArray } from './array.js';
import { type AztecAsyncKVStore, type AztecKVStore } from './store.js';
import { isSyncStore } from './utils.js';

export function describeAztecArray(
  testName: string,
  getStore: () => AztecKVStore | Promise<AztecAsyncKVStore>,
  forceAsync: boolean = false,
) {
  describe(testName, () => {
    let store: AztecKVStore | AztecAsyncKVStore;
    let arr: AztecArray<number> | AztecAsyncArray<number>;

    beforeEach(async () => {
      store = await getStore();
      arr = store.openArray<number>('test');
    });

    async function length(sut: AztecAsyncArray<number> | AztecArray<number> = arr) {
      return isSyncStore(store) && !forceAsync
        ? (sut as AztecArray<number>).length
        : await (sut as AztecAsyncArray<number>).lengthAsync();
    }

    async function at(index: number) {
      return isSyncStore(store) && !forceAsync
        ? (arr as AztecArray<number>).at(index)
        : await (arr as AztecAsyncArray<number>).atAsync(index);
    }

    async function entries() {
      return isSyncStore(store) && !forceAsync
        ? await toArray((arr as AztecArray<number>).entries())
        : await toArray((arr as AztecAsyncArray<number>).entriesAsync());
    }

    async function values(sut: AztecAsyncArray<number> | AztecArray<number> = arr) {
      return isSyncStore(store) && !forceAsync
        ? await toArray((sut as AztecArray<number>).values())
        : await toArray((sut as AztecAsyncArray<number>).valuesAsync());
    }

    it('should be able to push and pop values', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      expect(await length()).to.equal(3);

      expect(await arr.pop()).to.equal(3);
      expect(await arr.pop()).to.equal(2);
      expect(await arr.pop()).to.equal(1);
      expect(await arr.pop()).to.equal(undefined);
    });

    it('should be able to get values by index', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      expect(await at(0)).to.equal(1);
      expect(await at(1)).to.equal(2);
      expect(await at(2)).to.equal(3);
      expect(await at(3)).to.equal(undefined);
      expect(await at(-1)).to.equal(3);
      expect(await at(-2)).to.equal(2);
      expect(await at(-3)).to.equal(1);
      expect(await at(-4)).to.equal(undefined);
    });

    it('should be able to set values by index', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      expect(await arr.setAt(0, 4)).to.equal(true);
      expect(await arr.setAt(1, 5)).to.equal(true);
      expect(await arr.setAt(2, 6)).to.equal(true);

      expect(await arr.setAt(3, 7)).to.equal(false);

      expect(await at(0)).to.equal(4);
      expect(await at(1)).to.equal(5);
      expect(await at(2)).to.equal(6);
      expect(await at(3)).to.equal(undefined);

      expect(await arr.setAt(-1, 8)).to.equal(true);
      expect(await arr.setAt(-2, 9)).to.equal(true);
      expect(await arr.setAt(-3, 10)).to.equal(true);

      expect(await arr.setAt(-4, 11)).to.equal(false);

      expect(await at(-1)).to.equal(8);
      expect(await at(-2)).to.equal(9);
      expect(await at(-3)).to.equal(10);
      expect(await at(-4)).to.equal(undefined);
    });

    it('should be able to iterate over values', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      expect(await values()).to.deep.equal([1, 2, 3]);
      expect(await entries()).to.deep.equal([
        [0, 1],
        [1, 2],
        [2, 3],
      ]);
    });

    it('should be able to restore state', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      const arr2 = store.openArray<number>('test');
      expect(await length(arr2)).to.equal(3);
      expect(await values(arr2)).to.deep.equal(await values());
    });
  });
}
