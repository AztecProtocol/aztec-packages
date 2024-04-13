import { beforeEach, describe, expect, it } from '@jest/globals';

import { type Key } from '../interfaces/common.js';
import { type AztecSingleton } from '../interfaces/singleton.js';

export function addSingletonTests(get: () => AztecSingleton<Key>) {
  describe('AztecSingleton', () => {
    let singleton: AztecSingleton<Key>;
    beforeEach(() => {
      singleton = get();
    });

    it('returns undefined if the value is not set', () => {
      expect(singleton.get()).toEqual(undefined);
    });

    it('should be able to set and get values', async () => {
      expect(await singleton.set('foo')).toEqual(true);
      expect(singleton.get()).toEqual('foo');
    });

    it('overwrites the value if it is set again', async () => {
      expect(await singleton.set('foo')).toEqual(true);
      expect(await singleton.set('bar')).toEqual(true);
      expect(singleton.get()).toEqual('bar');
    });
  });
}
