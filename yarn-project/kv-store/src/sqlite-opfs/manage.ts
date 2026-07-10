/** Prefix for the per-store OPFS SAH pool directories owned by this package. */
export const OPFS_POOL_DIR_PREFIX = '.aztec-kv-';

/**
 * OPFS directory holding a store's SAH pool. One directory per store: the SAH-pool VFS allows only one
 * concurrent instance per directory and its capacity does not grow automatically, so sharing a pool across
 * stores would make concurrently opened stores contend for locks and orphaned stores exhaust pool slots.
 */
export function storePoolDirectory(effectiveName: string): string {
  return `${OPFS_POOL_DIR_PREFIX}${effectiveName}`;
}

/**
 * Lists the names of every persistent sqlite-opfs store in this origin, by enumerating the per-store pool
 * directories. Includes stores other than the current one, so wallets can surface and clean up data for
 * networks no longer in use.
 */
export async function listStores(): Promise<string[]> {
  const root = await navigator.storage.getDirectory();
  const names: string[] = [];
  for await (const [entryName, handle] of root.entries()) {
    if (handle.kind === 'directory' && entryName.startsWith(OPFS_POOL_DIR_PREFIX)) {
      names.push(entryName.slice(OPFS_POOL_DIR_PREFIX.length));
    }
  }
  return names;
}

/**
 * Permanently deletes a store by effective name (as returned by {@link listStores}). The store must be closed:
 * an open store's SAH pool holds locks on the directory and the removal will reject.
 */
export async function deleteStore(effectiveName: string): Promise<void> {
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(storePoolDirectory(effectiveName), { recursive: true });
}
