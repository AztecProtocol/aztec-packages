import { type Logger, createLogger } from '@aztec/foundation/log';

import type { DataStoreConfig } from '../config.js';
import { initStoreForRollupAndSchemaVersion } from '../utils.js';
import { AztecSQLiteOPFSStore } from './store.js';

export { AztecSQLiteOPFSStore } from './store.js';
export { SqliteEncryptionError } from './errors.js';
export type { SqliteEncryptionErrorCode } from './errors.js';

export async function createStore(
  name: string,
  config: DataStoreConfig,
  schemaVersion: number | undefined = undefined,
  log: Logger = createLogger('kv-store'),
) {
  const { dataDirectory } = config;
  log.info(
    dataDirectory
      ? `Creating ${name} SQLite-OPFS data store with map size ${config.dataStoreMapSizeKb} KB`
      : `Creating ${name} ephemeral SQLite-OPFS data store with map size ${config.dataStoreMapSizeKb} KB`,
  );
  const store = await AztecSQLiteOPFSStore.open(createLogger('kv-store:sqlite-opfs'), name, false);
  return initStoreForRollupAndSchemaVersion(store, schemaVersion, config.rollupAddress, log);
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
