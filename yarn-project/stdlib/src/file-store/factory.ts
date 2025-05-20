import { type Logger, createLogger } from '@aztec/foundation/log';

import { GoogleCloudFileStore } from './gcs.js';
import { HttpFileStore } from './http.js';
import type { FileStore, ReadOnlyFileStore } from './interface.js';
import { LocalFileStore } from './local.js';

const supportedExamples = [
  `gs://bucket-name/path/to/store`,
  `file:///absolute/local/path/to/store`,
  `https://host/path`,
];

export async function createFileStore(config: string, logger?: Logger): Promise<FileStore>;
export async function createFileStore(config: undefined, logger?: Logger): Promise<undefined>;
export async function createFileStore(
  config: string | undefined,
  logger = createLogger('stdlib:file-store'),
): Promise<FileStore | undefined> {
  if (config === undefined) {
    return undefined;
  } else if (config.startsWith('file://')) {
    const url = new URL(config);
    if (url.host) {
      throw new Error(`File store URL only supports local paths (got host ${url.host} from ${config})`);
    }
    const path = url.pathname;
    logger.info(`Creating local file file store at ${path}`);
    return new LocalFileStore(path);
  } else if (config.startsWith('gs://')) {
    try {
      const url = new URL(config);
      const bucket = url.host;
      const path = url.pathname.replace(/^\/+/, '');
      logger.info(`Creating google cloud file store at ${bucket} ${path}`);
      const store = new GoogleCloudFileStore(bucket, path);
      await store.checkCredentials();
      return store;
    } catch {
      throw new Error(`Invalid google cloud store definition: '${config}'.`);
    }
  } else {
    throw new Error(`Unknown file store config: '${config}'. Supported values are ${supportedExamples.join(', ')}.`);
  }
}

export async function createReadOnlyFileStore(config: string, logger?: Logger): Promise<ReadOnlyFileStore>;
export async function createReadOnlyFileStore(config: undefined, logger?: Logger): Promise<undefined>;
export async function createReadOnlyFileStore(
  config: string | undefined,
  logger = createLogger('stdlib:file-store'),
): Promise<ReadOnlyFileStore | undefined> {
  if (config === undefined) {
    return undefined;
  } else if (config.startsWith('http://') || config.startsWith('https://')) {
    logger.info(`Creating read-only HTTP file store at ${config}`);
    return new HttpFileStore(config, logger);
  } else {
    return await createFileStore(config, logger);
  }
}
