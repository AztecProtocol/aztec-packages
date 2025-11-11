import { type ConfigMappingsType, numberConfigHelper } from '@aztec/foundation/config';

/**
 * Configuration for HTTP file store.
 */
export interface HttpFileStoreConfig {
  /** Timeout in seconds for HTTP download operations */
  httpTimeoutSeconds: number;
}

export const httpFileStoreConfigMappings: ConfigMappingsType<HttpFileStoreConfig> = {
  httpTimeoutSeconds: {
    env: 'HTTP_TIMEOUT_SECONDS',
    description: 'Timeout in seconds for HTTP download operations',
    ...numberConfigHelper(60),
  },
};
