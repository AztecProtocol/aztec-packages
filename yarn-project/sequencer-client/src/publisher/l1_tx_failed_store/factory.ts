import { createFileStore } from '@aztec/file-store';
import { type Logger, createLogger } from '@aztec/foundation/log';

import type { L1TxFailedStore } from './failed_tx_store.js';
import { FileStoreL1TxFailedStore } from './file_store_failed_tx_store.js';

/**
 * Creates an L1TxFailedStore from a config string.
 * Supports any backend that FileStore supports (GCS, S3, R2, local filesystem).
 * @param config - Config string (e.g., 'gs://bucket/path', 's3://bucket/path', 'file:///path'). If undefined, returns undefined.
 * @param logger - Optional logger.
 * @returns The store instance, or undefined if config is not provided.
 */
export async function createL1TxFailedStore(
  config: string | undefined,
  logger: Logger = createLogger('sequencer:l1-tx-failed-store'),
): Promise<L1TxFailedStore | undefined> {
  if (!config) {
    return undefined;
  }

  const fileStore = await createFileStore(config, logger);
  if (!fileStore) {
    throw new Error(
      `Failed to create file store from config: '${config}'. ` +
        `Supported formats: 'gs://bucket/path', 's3://bucket/path', 'file:///path'.`,
    );
  }

  logger.info(`Created L1 tx failed store`, { config });
  return new FileStoreL1TxFailedStore(fileStore, logger);
}
