import { type Logger, createLogger } from '@aztec/foundation/log';

import { type DataStoreConfig } from '../config.js';
import { initStoreForRollup } from '../utils.js';
import { AztecIndexedDBStore } from './store.js';

export { AztecIndexedDBStore } from './store.js';

export async function createStore(name: string, config: DataStoreConfig, log: Logger = createLogger('kv-store')) {
  let { dataDirectory } = config;
  if (typeof dataDirectory !== 'undefined') {
    dataDirectory = `${dataDirectory}/${name}`;
  }

  log.info(
    dataDirectory
      ? `Creating ${name} data store at directory ${dataDirectory} with map size ${config.dataStoreMapSizeKB} KB`
      : `Creating ${name} ephemeral data store with map size ${config.dataStoreMapSizeKB} KB`,
  );
  const store = await AztecIndexedDBStore.open(createLogger('kv-store:indexeddb'), dataDirectory ?? '', false);
  if (config.l1Contracts?.rollupAddress) {
    return initStoreForRollup(store, config.l1Contracts.rollupAddress, log);
  }
  return store;
}

export function openTmpStore(ephemeral: boolean = false): Promise<AztecIndexedDBStore> {
  return AztecIndexedDBStore.open(createLogger('kv-store:indexeddb'), undefined, ephemeral);
}
