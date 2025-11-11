import { createLogger } from '@aztec/foundation/log';

import { GoogleCloudFileStore } from './gcs.js';
import { HttpFileStore } from './http.js';
import type { FileStore, ReadOnlyFileStore } from './interface.js';
import { LocalFileStore } from './local.js';
import { S3FileStore } from './s3.js';

const supportedExamples = [
  `gs://bucket-name/path/to/store`,
  `s3://bucket-name/path/to/store`,
  `file:///absolute/local/path/to/store`,
  `https://host/path`,
];

/** Configuration for createFileStore */
export type FileStoreConfig = { url: string; httpTimeoutSeconds?: number };

export async function createFileStore(
  config: FileStoreConfig,
  logger = createLogger('stdlib:file-store'),
): Promise<FileStore> {
  const configUrl = config.url;

  if (configUrl.startsWith('file://')) {
    const url = new URL(configUrl);
    if (url.host) {
      throw new Error(`File store URL only supports local paths (got host ${url.host} from ${configUrl})`);
    }
    const path = url.pathname;
    logger.info(`Creating local file file store at ${path}`);
    return new LocalFileStore(path);
  } else if (configUrl.startsWith('gs://')) {
    try {
      const url = new URL(configUrl);
      const bucket = url.host;
      const path = url.pathname.replace(/^\/+/, '');
      logger.info(`Creating google cloud file store at ${bucket} ${path}`);
      const store = new GoogleCloudFileStore(bucket, path);
      await store.checkCredentials();
      return store;
    } catch {
      throw new Error(`Invalid google cloud store definition: '${configUrl}'.`);
    }
  } else if (configUrl.startsWith('s3://')) {
    try {
      const httpTimeoutSeconds = config.httpTimeoutSeconds;
      const url = new URL(configUrl);
      const bucket = url.host;
      const path = url.pathname.replace(/^\/+/, '');
      const endpoint = url.searchParams.get('endpoint');
      const publicBaseUrl = url.searchParams.get('publicBaseUrl') ?? undefined;
      logger.info(`Creating S3 file store at ${bucket} ${path}`);
      const store = new S3FileStore(bucket, path, {
        endpoint: endpoint ?? undefined,
        publicBaseUrl,
        httpTimeoutSeconds,
      });
      return store;
    } catch {
      throw new Error(`Invalid S3 store definition: '${configUrl}'.`);
    }
  } else {
    throw new Error(`Unknown file store config: '${configUrl}'. Supported values are ${supportedExamples.join(', ')}.`);
  }
}

export async function createReadOnlyFileStore(
  config: FileStoreConfig,
  logger = createLogger('stdlib:file-store'),
): Promise<ReadOnlyFileStore> {
  const configUrl = config.url;
  const httpTimeout = config.httpTimeoutSeconds;

  if (configUrl.startsWith('http://') || configUrl.startsWith('https://')) {
    logger.info(`Creating read-only HTTP file store at ${configUrl}`);
    return new HttpFileStore(configUrl, httpTimeout, logger);
  } else {
    return await createFileStore(config, logger);
  }
}
