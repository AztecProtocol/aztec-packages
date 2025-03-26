import { ARCHIVER_DB_VERSION, ARCHIVER_STORE_NAME, type ArchiverDataStore } from '@aztec/archiver';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import type { L1ContractAddresses, ViemPublicClient } from '@aztec/ethereum';
import type { Logger } from '@aztec/foundation/log';
import { DATABASE_VERSION_FILE_NAME } from '@aztec/stdlib/database-version';
import { type FileStore, createFileStore } from '@aztec/stdlib/file-store';
import {
  type SnapshotMetadata,
  type SnapshotsIndexMetadata,
  downloadSnapshot,
  getLatestSnapshotMetadata,
  makeSnapshotLocalPaths,
} from '@aztec/stdlib/snapshots';
import { WORLD_STATE_DB_VERSION, WORLD_STATE_DIR } from '@aztec/world-state';

import { mkdtemp, rename, rm } from 'fs/promises';
import { join } from 'path';

import type { AztecNodeConfig } from '../aztec-node/config.js';

// Half day worth of L1 blocks
const MIN_L1_BLOCKS_TO_TRIGGER_REPLACE = 86400 / 2 / 12;

export async function tryFastSync(
  config: Pick<AztecNodeConfig, 'syncMode' | 'snapshotsUrl' | 'l1ChainId' | 'version' | 'dataDirectory'> & {
    l1Contracts: Pick<L1ContractAddresses, 'rollupAddress'>;
    minL1BlocksToTriggerReplace?: number;
  },
  publicClient: ViemPublicClient,
  archiverStore: ArchiverDataStore,
  log: Logger,
) {
  const { syncMode, snapshotsUrl, dataDirectory } = config;
  if (syncMode === 'full') {
    log.debug('Fast sync is disabled. Running full sync.', { syncMode: syncMode });
    return false;
  }

  if (!snapshotsUrl) {
    log.verbose('Fast sync is disabled. No snapshots URL provided.');
    return false;
  }

  if (!dataDirectory) {
    log.verbose('Fast sync is disabled. No local data directory defined.');
    return false;
  }

  let fileStore: FileStore;
  try {
    fileStore = createFileStore(snapshotsUrl);
  } catch (err) {
    log.error(`Invalid URL for downloading snapshots`, err);
    return false;
  }

  const minL1BlocksToTriggerReplace = config.minL1BlocksToTriggerReplace ?? MIN_L1_BLOCKS_TO_TRIGGER_REPLACE;
  const currentL1BlockNumber = await publicClient.getBlockNumber();
  const archiverL1BlockNumber = await archiverStore.getSynchPoint().then(s => s.blocksSynchedTo);
  const archiverL2BlockNumber = await archiverStore.getSynchedL2BlockNumber();

  if (syncMode === 'fast' && archiverL2BlockNumber !== undefined && archiverL2BlockNumber >= INITIAL_L2_BLOCK_NUM) {
    log.verbose(`Skipping fast sync as archiver is already synced to L2 block ${archiverL2BlockNumber}.`);
    return false;
  }

  if (archiverL1BlockNumber && currentL1BlockNumber - archiverL1BlockNumber < minL1BlocksToTriggerReplace) {
    log.verbose(
      `Skipping fast sync as archiver is less than ${currentL1BlockNumber - archiverL1BlockNumber} L1 blocks behind.`,
      { archiverL1BlockNumber, currentL1BlockNumber, minL1BlocksToTriggerReplace },
    );
    return false;
  }

  const indexMetadata: SnapshotsIndexMetadata = {
    l1ChainId: config.l1ChainId,
    l2Version: config.version,
    rollupAddress: config.l1Contracts.rollupAddress,
  };

  let snapshot: SnapshotMetadata | undefined;
  try {
    snapshot = await getLatestSnapshotMetadata(indexMetadata, fileStore);
  } catch (err) {
    log.error(`Failed to get latest snapshot metadata. Skipping fast sync.`, err, { ...indexMetadata, snapshotsUrl });
    return false;
  }

  if (!snapshot) {
    log.verbose(`No snapshot found. Skipping fast sync.`, { ...indexMetadata, snapshotsUrl });
    return false;
  }

  if (snapshot.schemaVersions.archiver !== ARCHIVER_DB_VERSION) {
    log.warn(
      `Skipping fast sync as last snapshot has schema version ${snapshot.schemaVersions.archiver} but expected ${ARCHIVER_DB_VERSION}.`,
      snapshot,
    );
    return false;
  }

  if (snapshot.schemaVersions.worldState !== WORLD_STATE_DB_VERSION) {
    log.warn(
      `Skipping fast sync as last snapshot has world state schema version ${snapshot.schemaVersions.worldState} but expected ${WORLD_STATE_DB_VERSION}.`,
      snapshot,
    );
    return false;
  }

  if (archiverL1BlockNumber && snapshot.l1BlockNumber - Number(archiverL1BlockNumber) < minL1BlocksToTriggerReplace) {
    log.verbose(
      `Skipping fast sync as archiver is less than ${
        snapshot.l1BlockNumber - Number(archiverL1BlockNumber)
      } L1 blocks behind latest snapshot.`,
      snapshot,
    );
    return false;
  }

  const downloadDir = await mkdtemp(join(dataDirectory, 'download-'));
  try {
    // Green light. Download the snapshot to a temp location.
    const downloadPaths = makeSnapshotLocalPaths(downloadDir);
    log.info(`Downloading snapshot from ${snapshotsUrl} to ${downloadDir}`, { snapshot, downloadPaths });
    await downloadSnapshot(snapshot, downloadPaths, fileStore);
    log.info(`Snapshot downloaded at ${downloadDir}`, { snapshotsUrl, snapshot, downloadPaths });

    // If download was successful, close the archiver store, clear lock and version, and move download there
    await archiverStore.close();
    const archiverPath = join(dataDirectory, ARCHIVER_STORE_NAME);
    await prepareDataDir(archiverPath);
    await rename(downloadPaths.archiver, join(archiverPath, 'data.mdb'));
    log.info(`Archiver database set up from snapshot`, { path: archiverPath });

    // Same for the world state dbs, only that we do not close them, since we assume they are not yet in use
    const worldStateBasePath = join(dataDirectory, WORLD_STATE_DIR);
    const worldStateDbs = [
      ['l1-to-l2-message-tree', 'L1ToL2MessageTree'],
      ['archive-tree', 'ArchiveTree'],
      ['public-data-tree', 'PublicDataTree'],
      ['note-hash-tree', 'NoteHashTree'],
      ['nullifier-tree', 'NullifierTree'],
    ] as const;
    for (const [name, dir] of worldStateDbs) {
      const path = join(worldStateBasePath, dir);
      await prepareDataDir(path);
      await rename(downloadPaths[name], join(path, 'data.mdb'));
      log.info(`World state database ${name} set up from snapshot`, { path });
    }
  } finally {
    log.info(`Cleaning up download dir ${downloadDir}`);
    await rm(downloadDir, { recursive: true, maxRetries: 3 });
  }

  return true;
}

async function prepareDataDir(path: string) {
  await rm(join(path, 'lock.mdb'), { force: true });
  await rm(join(path, DATABASE_VERSION_FILE_NAME), { force: true });
}
