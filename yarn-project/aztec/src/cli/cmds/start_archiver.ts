import { Archiver, type ArchiverConfig, KVArchiverDataStore, archiverConfigMappings } from '@aztec/archiver';
import { createLogger } from '@aztec/aztec.js';
import { createBlobSinkClient } from '@aztec/blob-sink/client';
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
  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/10056): place CL url in config here
  const blobSinkClient = createBlobSinkClient();
  const archiver = await Archiver.createAndSync(archiverConfig, archiverStore, { telemetry, blobSinkClient }, true);
  services.archiver = [archiver, ArchiverApiSchema];
  signalHandlers.push(archiver.stop);
  return services;
}
