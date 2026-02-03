import { type ConfigMappingsType, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';

/**
 * Configuration for the TxFileStore service.
 */
export type TxFileStoreConfig = {
  /** URL for uploading txs to file storage (s3://, gs://, file://) */
  txFileStoreUrl?: string;
  /** URL for downloading txs from file storage */
  txFileStoreDownloadUrl?: string;
  /** Max concurrent uploads */
  txFileStoreUploadConcurrency: number;
  /** Max queue size to prevent unbounded memory growth */
  txFileStoreMaxQueueSize: number;
  /** Enable tx file store upload */
  txFileStoreEnabled: boolean;
};

export const txFileStoreConfigMappings: ConfigMappingsType<TxFileStoreConfig> = {
  txFileStoreUrl: {
    env: 'TX_FILE_STORE_URL',
    description: 'URL for uploading txs to file storage (s3://, gs://, file://)',
  },
  txFileStoreDownloadUrl: {
    env: 'TX_FILE_STORE_DOWNLOAD_URL',
    description: 'URL for downloading txs from file storage',
  },
  txFileStoreUploadConcurrency: {
    env: 'TX_FILE_STORE_UPLOAD_CONCURRENCY',
    description: 'Maximum number of concurrent tx uploads',
    ...numberConfigHelper(10),
  },
  txFileStoreMaxQueueSize: {
    env: 'TX_FILE_STORE_MAX_QUEUE_SIZE',
    description: 'Maximum queue size for pending uploads (oldest dropped when exceeded)',
    ...numberConfigHelper(1000),
  },
  txFileStoreEnabled: {
    env: 'TX_FILE_STORE_ENABLED',
    description: 'Enable uploading transactions to file storage',
    ...booleanConfigHelper(false),
  },
};
