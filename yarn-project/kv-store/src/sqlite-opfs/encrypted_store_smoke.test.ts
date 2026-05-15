/**
 * Smoke test: runs the same basic read/write dance against every kv-store interface
 * using an encrypted store, to verify the interfaces are oblivious to the cipher
 * layer. Each test uses its own persistent OPFS directory because sqlite3mc does
 * not support encryption on ephemeral (:memory:) stores.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { mockLogger } from '../interfaces/utils.js';
import { AztecSQLiteOPFSStore } from './store.js';

function randomKey(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(32));
}

describe('encrypted store smoke: interfaces', () => {
  let openedStore: AztecSQLiteOPFSStore | undefined;

  afterEach(async () => {
    if (openedStore) {
      await openedStore.delete();
      openedStore = undefined;
    }
  });

  async function openStore(label: string): Promise<AztecSQLiteOPFSStore> {
    const key = randomKey();
    const name = `smoke-${label}-${Date.now()}`;
    const dir = `/smoke-${label}-pool-${Date.now()}`;
    const s = await AztecSQLiteOPFSStore.open(mockLogger, name, false, dir, key);
    openedStore = s;
    return s;
  }

  it('AztecMap', async () => {
    const s = await openStore('map');
    const m = s.openMap<string, number>('m');
    await m.set('a', 1);
    await m.set('b', 2);
    expect(await m.getAsync('a')).toBe(1);
    expect(await m.getAsync('b')).toBe(2);
  });

  it('AztecSet', async () => {
    const s = await openStore('set');
    const set = s.openSet<string>('s');
    await set.add('a');
    await set.add('b');
    expect(await set.hasAsync('a')).toBe(true);
    expect(await set.hasAsync('z')).toBe(false);
  });

  it('AztecSingleton', async () => {
    const s = await openStore('singleton');
    const sing = s.openSingleton<{ n: number }>('sg');
    await sing.set({ n: 42 });
    expect(await sing.getAsync()).toEqual({ n: 42 });
  });

  it('AztecArray', async () => {
    const s = await openStore('array');
    const arr = s.openArray<string>('a');
    await arr.push('x', 'y');
    expect(await arr.lengthAsync()).toBe(2);
  });

  it('AztecMultiMap', async () => {
    const s = await openStore('multimap');
    const mm = s.openMultiMap<string, number>('mm');
    await mm.set('k', 1);
    await mm.set('k', 2);
    const vals: number[] = [];
    for await (const v of mm.getValuesAsync('k')) {
      vals.push(v);
    }
    expect(vals.sort()).toEqual([1, 2]);
  });
});
