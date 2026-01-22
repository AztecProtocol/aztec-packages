import type { Logger, LoggerFactory } from '@aztec/foundation/log';

import type { DataStoreConfig } from '../config.js';
import { initStoreForRollup } from '../utils.js';
import { AztecIndexedDBStore } from './store.js';

export { AztecIndexedDBStore } from './store.js';

export async function createStore(name: string, config: DataStoreConfig, loggerFactory: LoggerFactory) {
  const log = loggerFactory.createLogger('kv-store:indexeddb');
  let { dataDirectory } = config;
  if (typeof dataDirectory !== 'undefined') {
    dataDirectory = `${dataDirectory}/${name}`;
  }

  log.info(
    dataDirectory
      ? `Creating ${name} data store at directory ${dataDirectory} with map size ${config.dataStoreMapSizeKb} KB`
      : `Creating ${name} ephemeral data store with map size ${config.dataStoreMapSizeKb} KB`,
  );
  const store = await AztecIndexedDBStore.open(log, dataDirectory ?? '', false);
  if (config.l1Contracts?.rollupAddress) {
    return initStoreForRollup(store, config.l1Contracts.rollupAddress, log);
  }
  return store;
}

/**
 * Opens a temporary store for testing purposes.
 * @param log - A logger to use
 * @param ephemeral - true if the store should only exist in memory and not automatically be flushed to disk. Optional
 * @returns A new store
 */
export function openTmpStore(log: Logger, ephemeral: boolean = false): Promise<AztecIndexedDBStore> {
  return AztecIndexedDBStore.open(log, undefined, ephemeral);
}
