import { type Logger, createLogger } from '@aztec/foundation/log';

import { join } from 'path';

import { type DataStoreConfig } from '../config.js';
import { initStoreForRollup } from '../utils.js';
import { AztecLmdbStore } from './store.js';

export { AztecLmdbStore } from './store.js';

export function createStore(name: string, config: DataStoreConfig, log: Logger = createLogger('kv-store')) {
  let { dataDirectory } = config;
  if (typeof dataDirectory !== 'undefined') {
    dataDirectory = join(dataDirectory, name);
  }

  log.info(
    dataDirectory
      ? `Creating ${name} data store at directory ${dataDirectory} with map size ${config.dataStoreMapSizeKB} KB`
      : `Creating ${name} ephemeral data store with map size ${config.dataStoreMapSizeKB} KB`,
  );

  const store = AztecLmdbStore.open(dataDirectory, config.dataStoreMapSizeKB, false);
  if (config.l1Contracts?.rollupAddress) {
    return initStoreForRollup(store, config.l1Contracts.rollupAddress, log);
  }
  return store;
}
/**
 * Opens a temporary store for testing purposes.
 * @param ephemeral - true if the store should only exist in memory and not automatically be flushed to disk. Optional
 * @returns A new store
 */
export function openTmpStore(ephemeral: boolean = false): AztecLmdbStore {
  const mapSize = 1024 * 1024 * 10; // 10 GB map size
  return AztecLmdbStore.open(undefined, mapSize, ephemeral);
}
