import { MAX_FIELD_VALUE } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';

import { countAccumulatedItems, sortByCounter } from './order_and_comparison.js';

class TestItem {
  constructor(
    public value: number,
    public counter = 0,
    public position = Fr.ZERO,
  ) {}

  static empty() {
    return new TestItem(0);
  }

  isEmpty() {
    return !this.value && !this.counter && Fr.isZero(this.position);
  }
}

describe('utils', () => {
  describe('countAccumulatedItems', () => {
    it('counts the number of non-empty items', () => {
      const arr = makeTuple(20, TestItem.empty);
      const num = 6;
      for (let i = 0; i < num; ++i) {
        arr[i] = new TestItem(i + 1);
      }
      expect(countAccumulatedItems(arr)).toBe(num);
    });

    it('throws if arr contains non-continuous non-empty items', () => {
      const arr = makeTuple(20, TestItem.empty);
      arr[1] = new TestItem(123);
      expect(() => countAccumulatedItems(arr)).toThrow('Non-empty items must be placed continuously from index 0.');
    });
  });

  describe('sortByCounter', () => {
    it('sorts descending items in ascending order', () => {
      // Original array is in descending order.
      const arr: TestItem[] = [];
      for (let i = 0; i < 6; ++i) {
        arr[i] = new TestItem(i, 100 - i);
      }

      const sorted = sortByCounter(arr);

      for (let i = 1; i < arr.length; ++i) {
        expect(sorted[i].counter).toBeGreaterThan(sorted[i - 1].counter);
      }
      expect(sorted).toEqual(arr.slice().reverse());
    });

    it('sorts ascending items in ascending order', () => {
      const arr: TestItem[] = [];
      for (let i = 0; i < 6; ++i) {
        arr[i] = new TestItem(i, i + 1);
      }

      const sorted = sortByCounter(arr);

      for (let i = 1; i < arr.length; ++i) {
        expect(sorted[i].counter).toBeGreaterThan(sorted[i - 1].counter);
      }
      expect(sorted).toEqual(arr);
    });

    it('sorts random items in ascending order', () => {
      const arr: TestItem[] = [
        new TestItem(2, 13),
        new TestItem(3, 328),
        new TestItem(4, 4),
        new TestItem(5, 59),
        new TestItem(6, 1),
      ];

      const sorted = sortByCounter(arr);

      expect(sorted).toEqual([
        new TestItem(6, 1),
        new TestItem(4, 4),
        new TestItem(2, 13),
        new TestItem(5, 59),
        new TestItem(3, 328),
      ]);
    });

    it('sorts random items and keep empty items to the right', () => {
      const arr: TestItem[] = [
        new TestItem(2, 13),
        new TestItem(3, 328),
        new TestItem(4, 4),
        new TestItem(5, 59),
        new TestItem(6, 1),
        TestItem.empty(),
        TestItem.empty(),
      ];

      const sorted = sortByCounter(arr);

      expect(sorted).toEqual([
        new TestItem(6, 1),
        new TestItem(4, 4),
        new TestItem(2, 13),
        new TestItem(5, 59),
        new TestItem(3, 328),
        TestItem.empty(),
        TestItem.empty(),
      ]);
    });

    it('sorts random items and pads empty items to the right', () => {
      const arr: TestItem[] = [
        TestItem.empty(),
        new TestItem(2, 13),
        new TestItem(3, 328),
        new TestItem(4, 4),
        new TestItem(5, 59),
        TestItem.empty(),
        new TestItem(6, 1),
      ];

      const sorted = sortByCounter(arr);

      expect(sorted).toEqual([
        new TestItem(6, 1),
        new TestItem(4, 4),
        new TestItem(2, 13),
        new TestItem(5, 59),
        new TestItem(3, 328),
        TestItem.empty(),
        TestItem.empty(),
      ]);
    });
  });

  describe('Constants', () => {
    it('fr.max and const.max should be in sync', () => {
      expect(new Fr(MAX_FIELD_VALUE)).toEqual(Fr.MAX_FIELD_VALUE);
      expect(new Fr(MAX_FIELD_VALUE)).toEqual(Fr.ONE.negate());
    });
  });
});
