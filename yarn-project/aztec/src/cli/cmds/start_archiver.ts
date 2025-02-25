import {
  Archiver,
  type ArchiverConfig,
  KVArchiverDataStore,
  archiverConfigMappings,
  getArchiverConfigFromEnv,
} from '@aztec/archiver';
import { createLogger } from '@aztec/aztec.js';
import { createBlobSinkClient } from '@aztec/blob-sink/client';
import { ArchiverApiSchema } from '@aztec/circuits.js/interfaces/server';
import { type NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import { getConfigEnvVars as getTelemetryClientConfig, initTelemetryClient } from '@aztec/telemetry-client';

import { extractRelevantOptions } from '../util.js';
import { validateL1Config } from '../validation.js';

export type { ArchiverConfig, DataStoreConfig };

/** Starts a standalone archiver. */
export async function startArchiver(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
): Promise<{ config: ArchiverConfig & DataStoreConfig }> {
  const archiverConfig = extractRelevantOptions<ArchiverConfig & DataStoreConfig>(
    options,
    {
      ...archiverConfigMappings,
      ...dataConfigMappings,
    },
    'archiver',
  );

  await validateL1Config({ ...getArchiverConfigFromEnv(), ...archiverConfig });

  const storeLog = createLogger('archiver:lmdb');
  const store = await createStore('archiver', archiverConfig, storeLog);
  const archiverStore = new KVArchiverDataStore(store, archiverConfig.maxLogs);

  const telemetry = initTelemetryClient(getTelemetryClientConfig());
  // TODO(https://github.com/AztecProtocol/aztec-packages/issues/10056): place CL url in config here
  const blobSinkClient = createBlobSinkClient();
  const archiver = await Archiver.createAndSync(archiverConfig, archiverStore, { telemetry, blobSinkClient }, true);
  services.archiver = [archiver, ArchiverApiSchema];
  signalHandlers.push(archiver.stop);

  return { config: archiverConfig };
}
