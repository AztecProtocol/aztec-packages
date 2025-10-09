import {
  Archiver,
  type ArchiverConfig,
  archiverConfigMappings,
  createArchiverStore,
  getArchiverConfigFromEnv,
} from '@aztec/archiver';
import { createLogger } from '@aztec/aztec.js';
import { type BlobSinkConfig, blobSinkConfigMapping, createBlobSinkClient } from '@aztec/blob-sink/client';
import { getL1Config } from '@aztec/cli/config';
import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import { ArchiverApiSchema } from '@aztec/stdlib/interfaces/server';
import { getConfigEnvVars as getTelemetryClientConfig, initTelemetryClient } from '@aztec/telemetry-client';

import { extractRelevantOptions } from '../util.js';

export type { ArchiverConfig, DataStoreConfig };

/** Starts a standalone archiver. */
export async function startArchiver(
  options: any,
  signalHandlers: (() => Promise<void>)[],
  services: NamespacedApiHandlers,
): Promise<{ config: ArchiverConfig & DataStoreConfig }> {
  const envConfig = getArchiverConfigFromEnv();
  const cliOptions = extractRelevantOptions<ArchiverConfig & DataStoreConfig & BlobSinkConfig>(
    options,
    { ...archiverConfigMappings, ...dataConfigMappings, ...blobSinkConfigMapping },
    'archiver',
  );

  let archiverConfig = { ...envConfig, ...cliOptions };
  archiverConfig.dataStoreMapSizeKB = archiverConfig.archiverStoreMapSizeKb ?? archiverConfig.dataStoreMapSizeKB;

  if (!archiverConfig.l1Contracts.registryAddress || archiverConfig.l1Contracts.registryAddress.isZero()) {
    throw new Error('L1 registry address is required to start an Archiver');
  }

  const { addresses, config: l1Config } = await getL1Config(
    archiverConfig.l1Contracts.registryAddress,
    archiverConfig.l1RpcUrls,
    archiverConfig.l1ChainId,
  );

  archiverConfig.l1Contracts = addresses;
  archiverConfig = { ...archiverConfig, ...l1Config };

  // Create separate stores for main archiver data and contract data
  const { archiverStore, contractStore } = await createArchiverStore(archiverConfig);

  const telemetry = initTelemetryClient(getTelemetryClientConfig());
  const blobSinkClient = createBlobSinkClient(archiverConfig, { logger: createLogger('archiver:blob-sink:client') });
  const archiver = await Archiver.createAndSync(
    archiverConfig,
    archiverStore,
    contractStore,
    { telemetry, blobSinkClient },
    true,
  );
  services.archiver = [archiver, ArchiverApiSchema];

  // Add cleanup handlers for both stores
  signalHandlers.push(archiver.stop);
  signalHandlers.push(async () => {
    await Promise.all([archiverStore.close(), contractStore.close()]);
  });

  return { config: archiverConfig };
}
