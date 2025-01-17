import { type ConfigMappingsType, getConfigFromMappings } from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';

export interface BlobSinkConfig {
  port?: number;
  dataStoreConfig?: DataStoreConfig;
  otelMetricsCollectorUrl?: string;
}

export const blobSinkConfigMappings: ConfigMappingsType<BlobSinkConfig> = {
  port: {
    env: 'BLOB_SINK_PORT',
    description: 'The port to run the blob sink server on',
  },
  dataStoreConfig: {
    ...dataConfigMappings,
    description: 'The configuration for the data store',
  },
  otelMetricsCollectorUrl: {
    env: 'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT',
    description: 'The URL of the OTLP metrics collector',
  },
};

/**
 * Returns the blob sink configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The blob sink configuration.
 */
export function getBlobSinkConfigFromEnv(): BlobSinkConfig {
  return getConfigFromMappings<BlobSinkConfig>(blobSinkConfigMappings);
}
