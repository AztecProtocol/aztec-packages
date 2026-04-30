import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { createStoreSpy } from './store_spy.js';

describe('createStoreSpy', () => {
  it('returns every open* call with name and kind, sorted by (name, kind)', async () => {
    const inner = await openTmpStore('pxe-schema-spy-test', true);
    try {
      const { store, openedStores } = createStoreSpy(inner);

      store.openMap('foo');
      store.openMultiMap('bar');
      store.openArray('baz');
      store.openSingleton('qux');

      expect(openedStores()).toEqual([
        { name: 'bar', kind: 'multimap' },
        { name: 'baz', kind: 'array' },
        { name: 'foo', kind: 'map' },
        { name: 'qux', kind: 'singleton' },
      ]);
    } finally {
      await inner.close();
    }
  });

  it('delegates reads and writes to the underlying store', async () => {
    const inner = await openTmpStore('pxe-schema-spy-delegate-test', true);
    try {
      const { store } = createStoreSpy(inner);
      const map = store.openMap<string, string>('m');

      await map.set('k', 'v');
      expect(await map.getAsync('k')).toBe('v');
    } finally {
      await inner.close();
    }
  });

  it('records each open call exactly once even if the same store is opened twice', async () => {
    const inner = await openTmpStore('pxe-schema-spy-twice-test', true);
    try {
      const { store, openedStores } = createStoreSpy(inner);

      store.openMap('twice');
      store.openMap('twice');

      expect(openedStores()).toEqual([
        { name: 'twice', kind: 'map' },
        { name: 'twice', kind: 'map' },
      ]);
    } finally {
      await inner.close();
    }
  });
});
