import { type Logger, createDebugLogger } from '@aztec/foundation/log';

import { DataStoreConfig } from '../config.js';
import { initStoreForRollup } from '../utils.js';
import { AztecIndexedDBStore } from './store.js';

export { AztecIndexedDBStore } from './store.js';

export async function createStore(
  name: string,
  config: DataStoreConfig,
  log: Logger = createDebugLogger('aztec:kv-store'),
) {
  let { dataDirectory } = config;
  if (typeof dataDirectory !== 'undefined') {
    dataDirectory = `${dataDirectory}/${name}`;
  }

  log.info(
    dataDirectory
      ? `Creating ${name} data store at directory ${dataDirectory} with map size ${config.dataStoreMapSizeKB} KB`
      : `Creating ${name} ephemeral data store with map size ${config.dataStoreMapSizeKB} KB`,
  );
  return initStoreForRollup(
    await AztecIndexedDBStore.open(createDebugLogger('aztec:kv-store:indexeddb'), dataDirectory ?? '', false),
    config.l1Contracts.rollupAddress,
    log,
  );
}

export async function openTmpStore(ephemeral: boolean = false): Promise<AztecIndexedDBStore> {
  return AztecIndexedDBStore.open(createDebugLogger('aztec:kv-store:indexeddb'), undefined, ephemeral);
}
