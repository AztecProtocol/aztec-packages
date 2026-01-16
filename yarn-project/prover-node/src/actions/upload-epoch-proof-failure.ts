import { ARCHIVER_DB_VERSION, type Archiver } from '@aztec/archiver';
import { tryRmDir } from '@aztec/foundation/fs';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { Logger } from '@aztec/foundation/log';
import { isoDate } from '@aztec/foundation/string';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { buildSnapshotMetadata, createBackups } from '@aztec/node-lib/actions';
import type { ChainConfig } from '@aztec/stdlib/config';
import { type FileStore, createFileStore } from '@aztec/stdlib/file-store';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { type UploadSnapshotMetadata, getBasePath, uploadSnapshotData } from '@aztec/stdlib/snapshots';
import { WORLD_STATE_DB_VERSION } from '@aztec/world-state';

import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import { type EpochProvingJobData, serializeEpochProvingJobData } from '../job/epoch-proving-job-data.js';

type UploadEpochProofConfig = Pick<ChainConfig, 'l1ChainId' | 'rollupVersion'> & Pick<DataStoreConfig, 'dataDirectory'>;

/** Whether uploaded data to the file store should be of public access. */
const PUBLIC_UPLOADS = true;

/**
 * Uploads a snapshot of world state and archiver (requires pausing them) along with the proving job data,
 * so we can download and re-run the job later under the same conditions.
 * @param location The location to upload the data to (used to create the `FileStore`).
 */
export async function uploadEpochProofFailure(
  location: string,
  jobId: string,
  jobData: EpochProvingJobData,
  archiver: Archiver,
  worldState: WorldStateSynchronizer,
  config: UploadEpochProofConfig,
  log: Logger,
) {
  const epochNumber = jobData.epochNumber;
  log.warn(`Uploading epoch proof failure for ${epochNumber} to ${location}`, { epochNumber, jobId, location });

  const backupDir = await mkdtemp(join(config.dataDirectory ?? tmpdir(), 'epoch-proof-data-'));
  const store = await createFileStore(location);
  if (!store) {
    throw new Error(`Failed to create file store for epoch proof failure upload for location ${location}.`);
  }

  try {
    const versions = { archiver: ARCHIVER_DB_VERSION, worldState: WORLD_STATE_DB_VERSION };
    const uploadMetadata = await buildSnapshotMetadata(archiver, config);
    const paths = await createBackups(backupDir, archiver, worldState, log);

    const basePath = `${getBasePath(uploadMetadata)}/${epochNumber}-${isoDate()}-${jobId}`;
    const pathFor = (key: string) => `${basePath}/${key}.db`;
    const [metadata, dataUrl, metadataUrl] = await Promise.all([
      uploadSnapshotData(paths, versions, uploadMetadata, store, { pathFor, private: !PUBLIC_UPLOADS }),
      uploadJobData(jobData, store, basePath),
      uploadSnapshotMetadata(uploadMetadata, store, basePath),
    ] as const);

    const baseUrl = dirname(metadataUrl);
    log.warn(`Uploaded epoch ${epochNumber} proof failure data to ${baseUrl}`, {
      epochNumber,
      location,
      basePath,
      metadataUrl,
      dataUrl,
      metadata,
      jobId,
    });
    return baseUrl;
  } finally {
    log.info(`Cleaning up backup dir ${backupDir}`);
    await tryRmDir(backupDir, log);
  }
}

async function uploadJobData(jobData: EpochProvingJobData, store: FileStore, basePath: string) {
  const data = serializeEpochProvingJobData(jobData);
  const path = `${basePath}/data.bin`;
  return await store.save(path, data, { compress: true, public: PUBLIC_UPLOADS });
}

async function uploadSnapshotMetadata(metadata: UploadSnapshotMetadata, store: FileStore, basePath: string) {
  const data = Buffer.from(jsonStringify(metadata), 'utf-8');
  const path = `${basePath}/metadata.json`;
  return await store.save(path, data, { compress: false, public: PUBLIC_UPLOADS });
}
