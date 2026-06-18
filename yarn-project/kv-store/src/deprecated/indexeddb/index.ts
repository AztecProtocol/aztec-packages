import { type Logger, createLogger } from '@aztec/foundation/log';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';

import { initStoreForRollupAndSchemaVersion } from '../../utils.js';
import { AztecIndexedDBStore } from './store.js';

export { AztecIndexedDBStore } from './store.js';

/**
 * @deprecated The IndexedDB backend is being retired. Use `@aztec/kv-store/browser` (SQLite-OPFS) instead.
 */
export async function createStore(
  name: string,
  config: DataStoreConfig,
  schemaVersion: number | undefined = undefined,
  log: Logger = createLogger('kv-store'),
) {
  let { dataDirectory } = config;
  if (typeof dataDirectory !== 'undefined') {
    dataDirectory = `${dataDirectory}/${name}`;
  }

  log.info(
    dataDirectory
      ? `Creating ${name} data store at directory ${dataDirectory} with map size ${config.dataStoreMapSizeKb} KB`
      : `Creating ${name} ephemeral data store with map size ${config.dataStoreMapSizeKb} KB`,
  );
  const store = await AztecIndexedDBStore.open(createLogger('kv-store:indexeddb'), dataDirectory ?? '', false);
  return initStoreForRollupAndSchemaVersion(store, schemaVersion, config.rollupAddress, log);
}

/**
 * @deprecated The IndexedDB backend is being retired. Use `@aztec/kv-store/browser` (SQLite-OPFS) instead.
 */
export function openTmpStore(ephemeral: boolean = false): Promise<AztecIndexedDBStore> {
  return AztecIndexedDBStore.open(createLogger('kv-store:indexeddb'), undefined, ephemeral);
}
