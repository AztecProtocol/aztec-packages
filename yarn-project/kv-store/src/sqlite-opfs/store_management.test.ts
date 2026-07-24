import { mockLogger } from '../interfaces/utils.js';
import { AztecSQLiteOPFSStore, SqlitePoolBusyError, SqliteWebLocksUnavailableError } from './index.js';
import { deleteStore, listStores, storePoolDirectory } from './manage.js';
import { OPFS_QUARANTINE_ROOT_DIRECTORY, type PoolQuarantineMetadata } from './pool_integrity.js';
import { acquirePoolLock } from './pool_lock.js';

const openByName = (name: string) => AztecSQLiteOPFSStore.open(mockLogger, name, false, storePoolDirectory(name));

async function duplicateFirstAssociatedOpaqueFile(name: string): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const pool = await root.getDirectoryHandle(storePoolDirectory(name));
  const opaque = await pool.getDirectoryHandle('.opaque');
  for await (const [opaqueName, handle] of opaque.entries()) {
    if (handle.kind !== 'file') {
      continue;
    }
    const source = await (handle as FileSystemFileHandle).getFile();
    // The first 512 header bytes hold the NUL-terminated logical path; a NUL at index 0 marks an unassociated slot.
    const pathHeader = new Uint8Array(await source.slice(0, 512).arrayBuffer());
    if (pathHeader.indexOf(0) <= 0) {
      continue;
    }
    const duplicate = await opaque.getFileHandle(`duplicate-${opaqueName}`, { create: true });
    const writable = await duplicate.createWritable();
    await writable.write(source);
    await writable.close();
    return;
  }
  throw new Error('No associated SAH file found to duplicate');
}

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

  it('allows only one concurrent opener for a fresh store', async () => {
    const name = 'mech_same_store';
    const results = await Promise.allSettled([openByName(name), openByName(name)]);
    const opened = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    const rejected = results.filter(result => result.status === 'rejected').map(result => result.reason);

    expect(opened).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toBeInstanceOf(SqlitePoolBusyError);

    await opened[0].close();
    const reopened = await openByName(name);
    await reopened.close();
    await deleteStore(name);
  });

  it('quarantines a pool with duplicate logical file mappings before reopening fresh', async () => {
    const name = 'mech_duplicate_mapping';
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(OPFS_QUARANTINE_ROOT_DIRECTORY, { recursive: true }).catch(() => {});
    const store = await openByName(name);
    await store.openSingleton<string>('payload').set('original');
    await store.close();
    await duplicateFirstAssociatedOpaqueFile(name);

    let reopened: AztecSQLiteOPFSStore | undefined;
    try {
      reopened = await openByName(name);
      expect(await reopened.openSingleton<string>('payload').getAsync()).toBeUndefined();

      const quarantineRoot = await root.getDirectoryHandle(OPFS_QUARANTINE_ROOT_DIRECTORY);
      const quarantineNames: string[] = [];
      for await (const [quarantineName, handle] of quarantineRoot.entries()) {
        if (handle.kind === 'directory') {
          quarantineNames.push(quarantineName);
        }
      }
      expect(quarantineNames).toHaveLength(1);

      const quarantine = await quarantineRoot.getDirectoryHandle(quarantineNames[0]);
      const metadataFile = await (await quarantine.getFileHandle('quarantine.json')).getFile();
      const metadata = JSON.parse(await metadataFile.text()) as PoolQuarantineMetadata;
      expect(metadata).toMatchObject({
        formatVersion: 1,
        originalPoolDirectory: storePoolDirectory(name),
        duplicateAssociations: [{ logicalPath: `/${name}` }],
      });

      const quarantinedOpaque = await quarantine.getDirectoryHandle('.opaque');
      for (const opaqueName of metadata.duplicateAssociations[0].opaqueFileNames) {
        // Database content starts at byte 4096 (the pool's sector size), so a file with real data must exceed it.
        expect((await (await quarantinedOpaque.getFileHandle(opaqueName)).getFile()).size).toBeGreaterThan(4096);
      }
    } finally {
      await reopened?.close();
      await deleteStore(name).catch(() => {});
      await root.removeEntry(OPFS_QUARANTINE_ROOT_DIRECTORY, { recursive: true }).catch(() => {});
    }
  });

  it('fails clearly when Web Locks are unavailable', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    try {
      await expect(acquirePoolLock('mech_no_web_locks')).rejects.toThrow(SqliteWebLocksUnavailableError);
    } finally {
      if (descriptor) {
        Object.defineProperty(navigator, 'locks', descriptor);
      } else {
        delete (navigator as unknown as { locks?: LockManager }).locks;
      }
    }
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
    await expect(deleteStore('mech_locked')).rejects.toThrow(SqlitePoolBusyError);
    await store.close();
    await deleteStore('mech_locked');
  });
});
