import { toArray } from '@aztec/foundation/iterable';

import type { AztecArray, AztecAsyncArray } from './array.js';
import type { AztecAsyncKVStore, AztecKVStore } from './store.js';
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

    afterEach(async () => {
      await store.delete();
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

      expect(await length()).toBe(3);

      expect(await arr.pop()).toBe(3);
      expect(await arr.pop()).toBe(2);
      expect(await arr.pop()).toBe(1);
      expect(await arr.pop()).toBe(undefined);
    });

    it('should be able to get values by index', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      expect(await at(0)).toBe(1);
      expect(await at(1)).toBe(2);
      expect(await at(2)).toBe(3);
      expect(await at(3)).toBe(undefined);
      expect(await at(-1)).toBe(3);
      expect(await at(-2)).toBe(2);
      expect(await at(-3)).toBe(1);
      expect(await at(-4)).toBe(undefined);
    });

    it('should be able to set values by index', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      expect(await arr.setAt(0, 4)).toBe(true);
      expect(await arr.setAt(1, 5)).toBe(true);
      expect(await arr.setAt(2, 6)).toBe(true);

      expect(await arr.setAt(3, 7)).toBe(false);

      expect(await at(0)).toBe(4);
      expect(await at(1)).toBe(5);
      expect(await at(2)).toBe(6);
      expect(await at(3)).toBe(undefined);

      expect(await arr.setAt(-1, 8)).toBe(true);
      expect(await arr.setAt(-2, 9)).toBe(true);
      expect(await arr.setAt(-3, 10)).toBe(true);

      expect(await arr.setAt(-4, 11)).toBe(false);

      expect(await at(-1)).toBe(8);
      expect(await at(-2)).toBe(9);
      expect(await at(-3)).toBe(10);
      expect(await at(-4)).toBe(undefined);
    });

    it('should be able to iterate over values', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      expect(await values()).toEqual([1, 2, 3]);
      expect(await entries()).toEqual([
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
      expect(await length(arr2)).toBe(3);
      expect(await values(arr2)).toEqual(await values());
    });
  });
}
