import { mockLogger } from '../interfaces/utils.js';
import { AztecSQLiteOPFSStore } from './index.js';
import { deleteStore, listStores, storePoolDirectory } from './manage.js';

const openByName = (name: string) => AztecSQLiteOPFSStore.open(mockLogger, name, false, storePoolDirectory(name));

describe('sqlite-opfs store management', () => {
  it('round-trips data for a store reopened by name', async () => {
    const store = await openByName('mech_roundtrip');
    await store.openSingleton<string>('payload').set('data');
    await store.close();

    const reopened = await openByName('mech_roundtrip');
    expect(await reopened.openSingleton<string>('payload').getAsync()).toEqual('data');
    await reopened.close();
    await deleteStore('mech_roundtrip');
  });

  it('opens two different stores concurrently in the same tab', async () => {
    const a = await openByName('mech_concurrent_a');
    const b = await openByName('mech_concurrent_b');

    await a.openSingleton<string>('k').set('a');
    await b.openSingleton<string>('k').set('b');
    expect(await a.openSingleton<string>('k').getAsync()).toEqual('a');
    expect(await b.openSingleton<string>('k').getAsync()).toEqual('b');

    await a.close();
    await b.close();
    await deleteStore('mech_concurrent_a');
    await deleteStore('mech_concurrent_b');
  });

  it('lists created stores and deletes them', async () => {
    const store = await openByName('mech_managed');
    await store.openSingleton<string>('k').set('v');
    await store.close();

    expect(await listStores()).toContain('mech_managed');
    await deleteStore('mech_managed');
    expect(await listStores()).not.toContain('mech_managed');

    // Recreating after deletion starts empty.
    const fresh = await openByName('mech_managed');
    expect(await fresh.openSingleton<string>('k').getAsync()).toBeUndefined();
    await fresh.close();
    await deleteStore('mech_managed');
  });

  // Regression test: close() must not resolve until the worker has released the SAH pool's OPFS
  // handles, otherwise deleteStore races Chromium's async reclaim of the terminated worker and
  // intermittently throws NoModificationAllowedError. Looped to amplify the race window.
  it('deletes a store immediately after close, repeatedly', async () => {
    for (let i = 0; i < 20; i++) {
      const store = await openByName('mech_close_release');
      await store.openSingleton<string>('k').set(`v${i}`);
      await store.close();
      await deleteStore('mech_close_release');
    }
  });

  it('refuses to delete a store that is currently open', async () => {
    const store = await openByName('mech_locked');
    await expect(deleteStore('mech_locked')).rejects.toThrow();
    await store.close();
    await deleteStore('mech_locked');
  });
});
