import type { BlobSinkConfig } from '../client/config.js';
import { BlobscanArchiveClient } from './blobscan_archive_client.js';
import type { BlobArchiveClient } from './interface.js';

export function createBlobArchiveClient(config: BlobSinkConfig): BlobArchiveClient | undefined {
  if (config.archiveApiUrl) {
    return new BlobscanArchiveClient(config.archiveApiUrl);
  }

  return undefined;
}
