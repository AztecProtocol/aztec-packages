import type { Logger } from '@aztec/foundation/log';

import type { BlobClientConfig } from '../client/config.js';
import { BlobscanArchiveClient } from './blobscan_archive_client.js';
import type { BlobArchiveClient } from './interface.js';

export function createBlobArchiveClient(config: BlobClientConfig, logger: Logger): BlobArchiveClient | undefined {
  if (config.archiveApiUrl) {
    return new BlobscanArchiveClient(config.archiveApiUrl, logger);
  }

  return undefined;
}
