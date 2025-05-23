import { type Logger, createLogger } from '@aztec/foundation/log';

import { MemoryBlobStore } from '../blobstore/memory_blob_store.js';
import { type BlobSinkConfig, hasRemoteBlobSinkSources } from './config.js';
import { HttpBlobSinkClient } from './http.js';
import type { BlobSinkClientInterface } from './interface.js';
import { LocalBlobSinkClient } from './local.js';

export function createBlobSinkClient(config?: BlobSinkConfig, deps?: { logger: Logger }): BlobSinkClientInterface {
  const log = deps?.logger ?? createLogger('blob-sink:client');
  if (!hasRemoteBlobSinkSources(config)) {
    log.info(`Creating local blob sink client.`);
    const blobStore = new MemoryBlobStore();
    return new LocalBlobSinkClient(blobStore);
  }

  log.info(`Creating HTTP blob sink client.`, {
    blobSinkUrl: config?.blobSinkUrl,
    l1ConsensusHostUrls: config?.l1ConsensusHostUrls,
    archiveApiUrl: config?.archiveApiUrl,
  });
  return new HttpBlobSinkClient(config, deps);
}
