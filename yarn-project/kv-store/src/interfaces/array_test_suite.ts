import { toArray } from '@aztec/foundation/iterable';

import { expect } from 'chai';

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

      expect(await arr.length()).to.equal(3);
      expect(await arr.pop()).to.equal(3);
      expect(await arr.pop()).to.equal(2);
      expect(await arr.pop()).to.equal(1);
      expect(await arr.pop()).to.equal(undefined);
    });

    it('should be able to get values by index', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      expect(await arr.at(0)).to.equal(1);
      expect(await arr.at(1)).to.equal(2);
      expect(await arr.at(2)).to.equal(3);
      expect(await arr.at(3)).to.equal(undefined);
      expect(await arr.at(-1)).to.equal(3);
      expect(await arr.at(-2)).to.equal(2);
      expect(await arr.at(-3)).to.equal(1);
      expect(await arr.at(-4)).to.equal(undefined);
    });

    it('should be able to set values by index', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      expect(await arr.setAt(0, 4)).to.equal(true);
      expect(await arr.setAt(1, 5)).to.equal(true);
      expect(await arr.setAt(2, 6)).to.equal(true);

      expect(await arr.setAt(3, 7)).to.equal(false);

      expect(await arr.at(0)).to.equal(4);
      expect(await arr.at(1)).to.equal(5);
      expect(await arr.at(2)).to.equal(6);
      expect(await arr.at(3)).to.equal(undefined);

      expect(await arr.setAt(-1, 8)).to.equal(true);
      expect(await arr.setAt(-2, 9)).to.equal(true);
      expect(await arr.setAt(-3, 10)).to.equal(true);

      expect(await arr.setAt(-4, 11)).to.equal(false);

      expect(await arr.at(-1)).to.equal(8);
      expect(await arr.at(-2)).to.equal(9);
      expect(await arr.at(-3)).to.equal(10);
      expect(await arr.at(-4)).to.equal(undefined);
    });

    it('should be able to iterate over values', async () => {
      await arr.push(1);
      await arr.push(2);
      await arr.push(3);

      expect(await toArray(arr.values())).to.deep.equal([1, 2, 3]);
      expect(await toArray(arr.entries())).to.deep.equal([
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
      expect(await arr2.length()).to.equal(3);
      expect(await toArray(arr2.values())).to.deep.equal(await toArray(arr.values()));
    });
  });
}
