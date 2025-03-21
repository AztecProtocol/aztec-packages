import { createLogger } from '@aztec/foundation/log';

import { GoogleCloudFileStore } from './gcs.js';

const supportedExamples = [`gs://bucket-name/path/to/store`];

export function createFileStore(config: string | undefined, logger = createLogger('stdlib:file-store')) {
  if (config === undefined) {
    return undefined;
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
