import { type ArchiverConfig, archiverConfigMappings, createArchiver, getArchiverConfigFromEnv } from '@aztec/archiver';
import { createLogger } from '@aztec/aztec.js/log';
import { type BlobClientConfig, blobClientConfigMapping, createBlobClient } from '@aztec/blob-client/client';
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
  const cliOptions = extractRelevantOptions<ArchiverConfig & DataStoreConfig & BlobClientConfig>(
    options,
    { ...archiverConfigMappings, ...dataConfigMappings, ...blobClientConfigMapping },
    'archiver',
  );

  let archiverConfig = { ...envConfig, ...cliOptions };
  archiverConfig.dataStoreMapSizeKb = archiverConfig.archiverStoreMapSizeKb ?? archiverConfig.dataStoreMapSizeKb;

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

  const telemetry = await initTelemetryClient(getTelemetryClientConfig());
  const blobClient = createBlobClient(archiverConfig, { logger: createLogger('archiver:blob-client:client') });
  const archiver = await createArchiver(archiverConfig, { telemetry, blobClient }, { blockUntilSync: true });
  services.archiver = [archiver, ArchiverApiSchema];
  signalHandlers.push(archiver.stop);

  return { config: archiverConfig };
}
