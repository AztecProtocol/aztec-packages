import { type Logger, createLogger } from '@aztec/foundation/log';

import type { DataStoreConfig } from '../config.js';
import { initStoreForRollupAndSchemaVersion } from '../utils.js';
import { AztecIndexedDBStore } from './store.js';

export { AztecIndexedDBStore } from './store.js';

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
  return initStoreForRollupAndSchemaVersion(store, schemaVersion, config.l1Contracts?.rollupAddress, log);
}

export function openTmpStore(ephemeral: boolean = false): Promise<AztecIndexedDBStore> {
  return AztecIndexedDBStore.open(createLogger('kv-store:indexeddb'), undefined, ephemeral);
}
