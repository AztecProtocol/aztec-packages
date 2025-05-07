import { ARCHIVER_DB_VERSION, type Archiver } from '@aztec/archiver';
import { tryRmDir } from '@aztec/foundation/fs';
import type { Logger } from '@aztec/foundation/log';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import type { ChainConfig } from '@aztec/stdlib/config';
import { createFileStore } from '@aztec/stdlib/file-store';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import { uploadSnapshotToIndex } from '@aztec/stdlib/snapshots';
import { WORLD_STATE_DB_VERSION } from '@aztec/world-state';

import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildSnapshotMetadata } from './build-snapshot-metadata.js';
import { createBackups } from './create-backups.js';

export type UploadSnapshotConfig = Pick<ChainConfig, 'l1ChainId' | 'rollupVersion'> &
  Pick<DataStoreConfig, 'dataDirectory'>;

/**
 * Pauses the archiver and world state sync, creates backups of the archiver and world state lmdb environments,
 * and uploads them to the specified location. Location must be a URL supported by our file store (eg `gs://bucketname/path`).
 */
export async function uploadSnapshot(
  location: string,
  archiver: Archiver,
  worldState: WorldStateSynchronizer,
  config: UploadSnapshotConfig,
  log: Logger,
) {
  const store = await createFileStore(location);
  if (!store) {
    throw new Error(`Failed to create file store for snapshot upload for location ${location}.`);
  }

  const backupDir = await mkdtemp(join(config.dataDirectory ?? tmpdir(), 'snapshot-'));

  try {
    const paths = await createBackups(backupDir, archiver, worldState, log);
    const versions = { archiver: ARCHIVER_DB_VERSION, worldState: WORLD_STATE_DB_VERSION };
    const metadata = await buildSnapshotMetadata(archiver, config);
    log.info(`Uploading snapshot to ${location}`, { snapshot: metadata });
    const snapshot = await uploadSnapshotToIndex(paths, versions, metadata, store);
    log.info(`Snapshot uploaded successfully`, { snapshot });
  } finally {
    log.info(`Cleaning up backup dir ${backupDir}`);
    await tryRmDir(backupDir, log);
  }
}
