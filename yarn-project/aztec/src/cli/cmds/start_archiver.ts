import { Archiver, type ArchiverConfig, KVArchiverDataStore, archiverConfigMappings } from '@aztec/archiver';
import { createLogger } from '@aztec/aztec.js';
import { createBlobSinkClient } from '@aztec/blob-sink/client';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import { ArchiverApiSchema } from '@aztec/stdlib/interfaces/server';
import { getConfigEnvVars as getTelemetryClientConfig, initTelemetryClient } from '@aztec/telemetry-client';

import { getL1Config } from '../get_l1_config.js';
import { extractRelevantOptions } from '../util.js';

export type { ArchiverConfig, DataStoreConfig };

/** Starts a standalone archiver. */
export async function startArchiver(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
): Promise<{ config: ArchiverConfig & DataStoreConfig }> {
  let archiverConfig = extractRelevantOptions<ArchiverConfig & DataStoreConfig>(
    options,
    {
      ...archiverConfigMappings,
      ...dataConfigMappings,
    },
    'archiver',
  );

  if (!archiverConfig.l1Contracts.registryAddress || archiverConfig.l1Contracts.registryAddress.isZero()) {
    throw new Error('L1 registry address is required to start an Archiver');
  }

  const { addresses, config } = await getL1Config(
    archiverConfig.l1Contracts.registryAddress,
    archiverConfig.l1RpcUrls,
    archiverConfig.l1ChainId,
  );

  archiverConfig.l1Contracts = addresses;
  archiverConfig = { ...archiverConfig, ...config };

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
