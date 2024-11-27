import { toArray } from '@aztec/foundation/iterable';

import { AztecArray } from './array.js';
import { type AztecKVStore } from './store.js';

export function describeAztecArray(testName: string, getStore: () => Promise<AztecKVStore>) {
  describe(testName, () => {
    let store: AztecKVStore;
    let arr: AztecArray<number>;

    beforeEach(async () => {
      store = await getStore();
      arr = store.openArray<number>('test');
    });

    it('should be able to push and pop values', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      expect(arr.length).toEqual(3);
      expect(await arr.pop()).toEqual(3);
      expect(await arr.pop()).toEqual(2);
      expect(await arr.pop()).toEqual(1);
      expect(await arr.pop()).toEqual(undefined);
    });

    it('should be able to get values by index', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      expect(arr.at(0)).toEqual(1);
      expect(arr.at(1)).toEqual(2);
      expect(arr.at(2)).toEqual(3);
      expect(arr.at(3)).toEqual(undefined);
      expect(arr.at(-1)).toEqual(3);
      expect(arr.at(-2)).toEqual(2);
      expect(arr.at(-3)).toEqual(1);
      expect(arr.at(-4)).toEqual(undefined);
    });

    it('should be able to set values by index', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      expect(await arr.setAt(0, 4)).toEqual(true);
      expect(await arr.setAt(1, 5)).toEqual(true);
      expect(await arr.setAt(2, 6)).toEqual(true);

      expect(await arr.setAt(3, 7)).toEqual(false);

      expect(arr.at(0)).toEqual(4);
      expect(arr.at(1)).toEqual(5);
      expect(arr.at(2)).toEqual(6);
      expect(arr.at(3)).toEqual(undefined);

      expect(await arr.setAt(-1, 8)).toEqual(true);
      expect(await arr.setAt(-2, 9)).toEqual(true);
      expect(await arr.setAt(-3, 10)).toEqual(true);

      expect(await arr.setAt(-4, 11)).toEqual(false);

      expect(arr.at(-1)).toEqual(8);
      expect(arr.at(-2)).toEqual(9);
      expect(arr.at(-3)).toEqual(10);
      expect(arr.at(-4)).toEqual(undefined);
    });

    it('should be able to iterate over values', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      expect(await toArray(arr.values())).toEqual([1, 2, 3]);
      expect(await toArray(arr.entries())).toEqual([
        [0, 1],
        [1, 2],
        [2, 3],
      ]);
    });

    it('should be able to restore state', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      const arr2 = store.openArray('test');
      expect(arr2.length).toEqual(3);
      expect(await toArray(arr2.values())).toEqual(await toArray(arr.values()));
    });
  });
}
