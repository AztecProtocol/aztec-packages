import { beforeEach, describe, expect, it } from '@jest/globals';

import type { AztecArray, AztecCounter, AztecKVStore, AztecMultiMap, AztecSingleton } from '../interfaces/index.js';

export function addStoreTests(get: () => AztecKVStore) {
  describe('AztecStore', () => {
    let store: AztecKVStore;
    let array: AztecArray<number>;
    let multimap: AztecMultiMap<string, number>;
    let counter: AztecCounter;
    let singleton: AztecSingleton<number>;

    beforeEach(async () => {
      store = get();

      array = store.openArray('test-array');
      multimap = store.openMultiMap('test-multimap');
      counter = store.openCounter('test-counter');
      singleton = store.openSingleton('test-singleton');

      await array.push(1, 2, 3);
      await multimap.set('key-1', 1);
      await multimap.set('key-2', 2);
      await counter.set('counter-1', 3);
      await singleton.set(4);
    });

    it('check initial state', () => {
      expect(array.at(2)).toBe(3);
      expect(multimap.get('key-2')).toBe(2);
      expect([...multimap.getValues('key-2')]).toEqual([2]);
      expect(counter.get('counter-1')).toBe(3);
      expect(singleton.get()).toBe(4);
    });

    it('state should update with successful tx', async () => {
      await store.transaction(() => {
        void array.setAt(2, 10);
        void multimap.set('key-2', 20);
        void counter.set('counter-1', 30);
        void singleton.set(40);
      });

      expect(array.at(2)).toBe(10);
      expect(multimap.get('key-2')).toBe(2);
      expect([...multimap.getValues('key-2')]).toEqual([2, 20]);
      expect(counter.get('counter-1')).toBe(30);
      expect(singleton.get()).toBe(40);
    });

    it.skip('state should rollback with unsuccessful tx', async () => {
      try {
        await store.transaction(() => {
          void array.setAt(2, 10);
          void multimap.set('key-2', 20);
          void counter.set('counter-1', 30);
          void singleton.set(40);
          throw new Error();
        });
      } catch (err) {
        // swallow
      }

      expect(array.at(2)).toBe(3);
      expect(multimap.get('key-2')).toBe(2);
      expect([...multimap.getValues('key-2')]).toEqual([2]);
      expect(counter.get('counter-1')).toBe(3);
      expect(singleton.get()).toBe(4);
    });
  });
}
