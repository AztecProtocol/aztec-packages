import {
  Archiver,
  ArchiverConfig,
  KVArchiverDataStore,
  createArchiverRpcServer,
  getConfigEnvVars as getArchiverConfigEnvVars,
} from '@aztec/archiver';
import { createDebugLogger } from '@aztec/aztec.js';
import { ServerList } from '@aztec/foundation/json-rpc/server';
import { AztecLmdbStore } from '@aztec/kv-store/lmdb';
import { initStoreForRollup } from '@aztec/kv-store/utils';

import { mergeEnvVarsAndCliOptions, parseModuleOptions } from '../util.js';

export const startArchiver = async (options: any, signalHandlers: (() => Promise<void>)[]) => {
  const services: ServerList = [];
  // Start a standalone archiver.
  // get env vars first
  const archiverConfigEnvVars = getArchiverConfigEnvVars();
  // get config from options
  const archiverCliOptions = parseModuleOptions(options.archiver);
  // merge env vars and cli options
  const archiverConfig = mergeEnvVarsAndCliOptions<ArchiverConfig>(archiverConfigEnvVars, archiverCliOptions, true);

  const storeLog = createDebugLogger('aztec:archiver:lmdb');
  const store = await initStoreForRollup(
    AztecLmdbStore.open(archiverConfig.dataDirectory, storeLog),
    archiverConfig.l1Contracts.rollupAddress,
    storeLog,
  );
  const archiverStore = new KVArchiverDataStore(store, archiverConfig.maxLogs);

  const archiver = await Archiver.createAndSync(archiverConfig, archiverStore, true);
  const archiverServer = createArchiverRpcServer(archiver);
  services.push({ archiver: archiverServer });
  signalHandlers.push(archiver.stop);
  return services;
};
