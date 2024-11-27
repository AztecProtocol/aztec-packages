import { type ConfigMappingsType, getConfigFromMappings } from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';

export type BlobSinkConfig = {
  port?: number;
  // otelMetricsCollectorUrl?: string;
} & DataStoreConfig;

export const blobSinkConfigMappings: ConfigMappingsType<BlobSinkConfig> = {
  port: {
    env: 'BLOB_SINK_PORT',
    description: 'The port to run the blob sink server on',
  },
  ...dataConfigMappings,

  // TODO: bring otel endpoints back
  // otelMetricsCollectorUrl: {
  //   env: 'OTEL_METRICS_COLLECTOR_URL',
  //   description: 'The URL of the OTLP metrics collector',
  // },
};


/**
 * Returns the blob sink configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The blob sink configuration.
 */
export function getBlobSinkConfigFromEnv(): BlobSinkConfig {
  return getConfigFromMappings<BlobSinkConfig>(blobSinkConfigMappings);
}
