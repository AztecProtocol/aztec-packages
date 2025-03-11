import type { BlobSinkConfig } from '../server/config.js';
import { BlobscanArchiveClient } from './blobscan_archive_client.js';
import type { BlobArchiveClient } from './interface.js';

export function createBlobArchiveClient(
  config: Pick<BlobSinkConfig, 'archiveApiUrl' | 'l1ChainId'> = {},
): BlobArchiveClient | undefined {
  if (config.archiveApiUrl) {
    return new BlobscanArchiveClient(config.archiveApiUrl);
  }

  if (config.l1ChainId === 1) {
    return new BlobscanArchiveClient('api.blobscan.com');
  } else if (config.l1ChainId === 11155111) {
    return new BlobscanArchiveClient('api.sepolia.blobscan.com');
  }

  return undefined;
}
