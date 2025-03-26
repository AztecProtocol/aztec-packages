import { type Logger, createLogger } from '@aztec/foundation/log';

import { GoogleCloudFileStore } from './gcs.js';
import type { FileStore } from './interface.js';
import { LocalFileStore } from './local.js';

const supportedExamples = [`gs://bucket-name/path/to/store`, `file:///absolute/local/path/to/store`];

export function createFileStore(config: string, logger?: Logger): FileStore;
export function createFileStore(config: undefined, logger?: Logger): undefined;
export function createFileStore(
  config: string | undefined,
  logger = createLogger('stdlib:file-store'),
): FileStore | undefined {
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
      return new GoogleCloudFileStore(bucket, path);
    } catch (err) {
      throw new Error(`Invalid google cloud store definition: '${config}'.`);
    }
  } else {
    throw new Error(`Unknown file store config: '${config}'. Supported values are ${supportedExamples.join(', ')}.`);
  }
}
