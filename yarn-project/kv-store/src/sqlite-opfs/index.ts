import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DatabaseVersion } from '@aztec/stdlib/database-version/version';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';

import { StoreIdentityMismatchError, effectiveStoreName } from '../store_identity.js';
import { storePoolDirectory } from './manage.js';
import { AztecSQLiteOPFSStore } from './store.js';

export { AztecSQLiteOPFSStore } from './store.js';
export { SqliteEncryptionError } from './errors.js';
export type { SqliteEncryptionErrorCode } from './errors.js';
export { OPFS_POOL_DIR_PREFIX, deleteStore, listStores, storePoolDirectory } from './manage.js';
export { StoreIdentityMismatchError, effectiveStoreName, storeIdentitySlug } from '../store_identity.js';
export type { StoreIdentity } from '../store_identity.js';

/**
 * Opens the persistent store selected by `name` and the identity `(config.l1ChainId, config.rollupAddress,
 * schemaVersion)`. A store exists per identity: reopening with the same identity returns the same data, a
 * different identity selects a different (possibly fresh) store. Nothing is ever cleared.
 */
export async function createStore(
  name: string,
  config: DataStoreConfig & { l1ChainId?: number },
  schemaVersion: number | undefined = undefined,
  log: Logger = createLogger('kv-store'),
) {
  const storeName = effectiveStoreName(name, {
    l1ChainId: config.l1ChainId,
    rollupAddress: config.rollupAddress,
    schemaVersion,
  });
  log.info(`Creating ${storeName} SQLite-OPFS data store with map size ${config.dataStoreMapSizeKb} KB`);
  const store = await AztecSQLiteOPFSStore.open(
    createLogger('kv-store:sqlite-opfs'),
    storeName,
    false,
    storePoolDirectory(storeName),
  );
  try {
    await assertStoreIdentity(store, storeName, schemaVersion, config.rollupAddress);
  } catch (err) {
    // The store handle owns a worker and OPFS locks; release them before surfacing the refusal.
    await store.close().catch(() => {});
    throw err;
  }
  return store;
}

/**
 * Belt-and-braces invariant check: the identity is part of the physical store name, so the recorded version
 * can only disagree if there is a store-naming bug. Refuses to open on mismatch; never clears.
 */
async function assertStoreIdentity(
  store: AztecSQLiteOPFSStore,
  storeName: string,
  schemaVersion: number | undefined,
  rollupAddress: EthAddress | undefined,
): Promise<void> {
  const expected = new DatabaseVersion(schemaVersion ?? 0, rollupAddress ?? EthAddress.ZERO);
  const singleton = store.openSingleton<string>('dbVersion');
  const stored = await singleton.getAsync();
  if (stored === undefined) {
    await singleton.set(expected.toBuffer().toString('utf-8'));
    return;
  }
  let storedVersion: DatabaseVersion;
  try {
    storedVersion = DatabaseVersion.fromBuffer(Buffer.from(stored, 'utf-8'));
  } catch {
    throw new StoreIdentityMismatchError(storeName, expected.toString(), stored);
  }
  if (!storedVersion.equals(expected)) {
    throw new StoreIdentityMismatchError(storeName, expected.toString(), storedVersion.toString());
  }
}

export function openTmpStore(ephemeral: boolean = false): Promise<AztecSQLiteOPFSStore> {
  return AztecSQLiteOPFSStore.open(createLogger('kv-store:sqlite-opfs'), undefined, ephemeral);
}

/**
 * Convenience helper for tests and consumers that want an encrypted sqlite-opfs
 * store without dealing with the full `open()` parameter order. Key must be 32
 * bytes. Creates a fresh persistent store (sqlite3mc does not support encryption
 * on ephemeral `:memory:` databases) in an auto-generated OPFS directory.
 */
export function openEncryptedStore(encryptionKey: Uint8Array, name?: string, poolDirectory?: string) {
  return AztecSQLiteOPFSStore.open(createLogger('kv-store:sqlite-opfs'), name, false, poolDirectory, encryptionKey);
}
