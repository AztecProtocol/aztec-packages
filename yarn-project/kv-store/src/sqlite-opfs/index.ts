import { type Logger, createLogger } from '@aztec/foundation/log';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';

import { initStoreForRollupAndSchemaVersion } from '../utils.js';
import { AztecSQLiteOPFSStore } from './store.js';

export { AztecSQLiteOPFSStore } from './store.js';

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
  return initStoreForRollupAndSchemaVersion(store, schemaVersion, config.l1Contracts?.rollupAddress, log);
}

export function openTmpStore(ephemeral: boolean = false): Promise<AztecSQLiteOPFSStore> {
  return AztecSQLiteOPFSStore.open(createLogger('kv-store:sqlite-opfs'), undefined, ephemeral);
}
