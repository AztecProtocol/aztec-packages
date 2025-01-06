import { Archiver, type ArchiverConfig, KVArchiverDataStore, archiverConfigMappings } from '@aztec/archiver';
import { createLogger } from '@aztec/aztec.js';
import { ArchiverApiSchema } from '@aztec/circuit-types';
import { type NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb';
import {
  createAndStartTelemetryClient,
  getConfigEnvVars as getTelemetryClientConfig,
} from '@aztec/telemetry-client/start';

import { extractRelevantOptions } from '../util.js';

/** Starts a standalone archiver. */
export async function startArchiver(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
) {
  const archiverConfig = extractRelevantOptions<ArchiverConfig & DataStoreConfig>(
    options,
    {
      ...archiverConfigMappings,
      ...dataConfigMappings,
    },
    'archiver',
  );

  const storeLog = createLogger('archiver:lmdb');
  const store = await createStore('archiver', archiverConfig, storeLog);
  const archiverStore = new KVArchiverDataStore(store, archiverConfig.maxLogs);

  const telemetry = await createAndStartTelemetryClient(getTelemetryClientConfig());
  const archiver = await Archiver.createAndSync(archiverConfig, archiverStore, telemetry, true);
  services.archiver = [archiver, ArchiverApiSchema];
  signalHandlers.push(archiver.stop);
  return services;
}
