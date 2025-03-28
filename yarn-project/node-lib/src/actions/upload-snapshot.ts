import { ARCHIVER_DB_VERSION, type Archiver } from '@aztec/archiver';
import { tryRmDir } from '@aztec/foundation/fs';
import type { Logger } from '@aztec/foundation/log';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import type { ChainConfig } from '@aztec/stdlib/config';
import { createFileStore } from '@aztec/stdlib/file-store';
import type { WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import type { SnapshotDataUrls, UploadSnapshotMetadata } from '@aztec/stdlib/snapshots';
import { uploadSnapshot as uploadSnapshotToStore } from '@aztec/stdlib/snapshots';
import { WORLD_STATE_DB_VERSION } from '@aztec/world-state';

import { existsSync } from 'fs';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

type UploadSnapshotConfig = Pick<ChainConfig, 'l1ChainId' | 'version'> & Pick<DataStoreConfig, 'dataDirectory'>;

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
    const snapshot = await uploadSnapshotToStore(paths, versions, metadata, store);
    log.info(`Snapshot uploaded successfully`, { snapshot });
  } finally {
    log.info(`Cleaning up backup dir ${backupDir}`);
    await tryRmDir(backupDir, log);
  }
}

async function buildSnapshotMetadata(
  archiver: Archiver,
  config: UploadSnapshotConfig,
): Promise<UploadSnapshotMetadata> {
  const [rollupAddress, l1BlockNumber, { latest }] = await Promise.all([
    archiver.getRollupAddress(),
    archiver.getL1BlockNumber(),
    archiver.getL2Tips(),
  ] as const);

  const { number: l2BlockNumber, hash: l2BlockHash } = latest;
  if (!l2BlockHash) {
    throw new Error(`Failed to get L2 block hash from archiver.`);
  }

  return {
    l1ChainId: config.l1ChainId,
    l2Version: config.version,
    rollupAddress,
    l2BlockNumber,
    l2BlockHash,
    l1BlockNumber: Number(l1BlockNumber),
  };
}

async function createBackups(backupDir: string, archiver: Archiver, worldState: WorldStateSynchronizer, log: Logger) {
  try {
    log.info(`Pausing archiver and world state sync to start snapshot upload`);
    await archiver.stop();
    await worldState.stopSync();

    log.info(`Creating backups of lmdb environments to ${backupDir}`);
    const [archiverPath, worldStatePaths] = await Promise.all([
      archiver.backupTo(join(backupDir, 'archiver')),
      worldState.backupTo(join(backupDir, 'world-state')),
    ]);
    const paths: SnapshotDataUrls = { ...worldStatePaths, archiver: archiverPath };

    const missing = Object.entries(paths).filter(([_key, path]) => !path || !existsSync(path));
    if (missing.length > 0) {
      throw new Error(`Missing backup files: ${missing.map(([key, path]) => `${path} (${key})`).join(', ')}`);
    }

    log.info(`Data stores backed up to ${backupDir}`, { paths });
    return paths;
  } catch (err) {
    throw new Error(`Error creating backups for snapshot upload: ${err}`);
  } finally {
    log.info(`Resuming archiver and world state sync`);
    worldState.resumeSync();
    archiver.resume();
  }
}
