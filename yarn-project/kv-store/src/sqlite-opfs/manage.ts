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
