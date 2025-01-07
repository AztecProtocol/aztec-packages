import { type DataStoreConfig } from '@aztec/kv-store/config';

export interface BlobSinkConfig {
  port?: number;
  dataStoreConfig?: DataStoreConfig;
  otelMetricsCollectorUrl?: string;
}
