import {
  ARCHIVER_DB_VERSION,
  ARCHIVER_STORE_NAME,
  type ArchiverConfig,
  type ArchiverDataStore,
  createArchiverStore,
} from '@aztec/archiver';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { type EthereumClientConfig, getPublicClient } from '@aztec/ethereum';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { tryRmDir } from '@aztec/foundation/fs';
import type { Logger } from '@aztec/foundation/log';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import type { ChainConfig } from '@aztec/stdlib/config';
import { DatabaseVersionManager } from '@aztec/stdlib/database-version';
import { type ReadOnlyFileStore, createReadOnlyFileStore } from '@aztec/stdlib/file-store';
import {
  type SnapshotMetadata,
  type SnapshotsIndexMetadata,
  downloadSnapshot,
  getLatestSnapshotMetadata,
  makeSnapshotLocalPaths,
} from '@aztec/stdlib/snapshots';
import { NATIVE_WORLD_STATE_DBS, WORLD_STATE_DB_VERSION, WORLD_STATE_DIR } from '@aztec/world-state';

import { mkdir, mkdtemp, rename } from 'fs/promises';
import { join } from 'path';

import type { SharedNodeConfig } from '../config/index.js';

// Half day worth of L1 blocks
const MIN_L1_BLOCKS_TO_TRIGGER_REPLACE = 86400 / 2 / 12;

type SnapshotSyncConfig = Pick<SharedNodeConfig, 'syncMode' | 'snapshotsUrl'> &
  Pick<ChainConfig, 'l1ChainId' | 'rollupVersion'> &
  Pick<ArchiverConfig, 'archiverStoreMapSizeKb' | 'maxLogs'> &
  Required<DataStoreConfig> &
  EthereumClientConfig & {
    minL1BlocksToTriggerReplace?: number;
  };

export async function trySnapshotSync(config: SnapshotSyncConfig, log: Logger) {
  let archiverStore: ArchiverDataStore | undefined;
  let downloadDir: string | undefined;

  try {
    const { syncMode, snapshotsUrl, dataDirectory, l1ChainId, rollupVersion, l1Contracts } = config;
    if (syncMode === 'full') {
      log.debug('Snapshot sync is disabled. Running full sync.', { syncMode: syncMode });
      return false;
    }

    if (!snapshotsUrl) {
      log.verbose('Snapshot sync is disabled. No snapshots URL provided.');
      return false;
    }

    if (!dataDirectory) {
      log.verbose('Snapshot sync is disabled. No local data directory defined.');
      return false;
    }

    let fileStore: ReadOnlyFileStore;
    try {
      fileStore = await createReadOnlyFileStore(snapshotsUrl, log);
    } catch (err) {
      log.error(`Invalid config for downloading snapshots`, err);
      return false;
    }

    // Create an archiver store to check the current sync state
    archiverStore = await createArchiverStore(config);

    const minL1BlocksToTriggerReplace = config.minL1BlocksToTriggerReplace ?? MIN_L1_BLOCKS_TO_TRIGGER_REPLACE;
    const archiverL2BlockNumber = await archiverStore.getSynchedL2BlockNumber();
    if (
      syncMode === 'snapshot' &&
      archiverL2BlockNumber !== undefined &&
      archiverL2BlockNumber >= INITIAL_L2_BLOCK_NUM
    ) {
      log.verbose(
        `Skipping non-forced snapshot sync as archiver is already synced to L2 block ${archiverL2BlockNumber}.`,
      );
      return false;
    }

    const currentL1BlockNumber = await getPublicClient(config).getBlockNumber();
    const archiverL1BlockNumber = await archiverStore.getSynchPoint().then(s => s.blocksSynchedTo);
    if (archiverL1BlockNumber && currentL1BlockNumber - archiverL1BlockNumber < minL1BlocksToTriggerReplace) {
      log.verbose(
        `Skipping snapshot sync as archiver is less than ${
          currentL1BlockNumber - archiverL1BlockNumber
        } L1 blocks behind.`,
        { archiverL1BlockNumber, currentL1BlockNumber, minL1BlocksToTriggerReplace },
      );
      return false;
    }

    const indexMetadata: SnapshotsIndexMetadata = {
      l1ChainId,
      rollupVersion,
      rollupAddress: l1Contracts.rollupAddress,
    };
    let snapshot: SnapshotMetadata | undefined;
    try {
      snapshot = await getLatestSnapshotMetadata(indexMetadata, fileStore);
    } catch (err) {
      log.error(`Failed to get latest snapshot metadata. Skipping snapshot sync.`, err, {
        ...indexMetadata,
        snapshotsUrl,
      });
      return false;
    }

    if (!snapshot) {
      log.verbose(`No snapshot found. Skipping snapshot sync.`, { ...indexMetadata, snapshotsUrl });
      return false;
    }

    if (snapshot.schemaVersions.archiver !== ARCHIVER_DB_VERSION) {
      log.warn(
        `Skipping snapshot sync as last snapshot has schema version ${snapshot.schemaVersions.archiver} but expected ${ARCHIVER_DB_VERSION}.`,
        snapshot,
      );
      return false;
    }

    if (snapshot.schemaVersions.worldState !== WORLD_STATE_DB_VERSION) {
      log.warn(
        `Skipping snapshot sync as last snapshot has world state schema version ${snapshot.schemaVersions.worldState} but we expected ${WORLD_STATE_DB_VERSION}.`,
        snapshot,
      );
      return false;
    }

    if (archiverL1BlockNumber && snapshot.l1BlockNumber < archiverL1BlockNumber) {
      log.verbose(
        `Skipping snapshot sync since local archiver is at L1 block ${archiverL1BlockNumber} which is further than last snapshot at ${snapshot.l1BlockNumber}`,
        { snapshot, archiverL1BlockNumber },
      );
      return false;
    }

    if (archiverL1BlockNumber && snapshot.l1BlockNumber - Number(archiverL1BlockNumber) < minL1BlocksToTriggerReplace) {
      log.verbose(
        `Skipping snapshot sync as archiver is less than ${
          snapshot.l1BlockNumber - Number(archiverL1BlockNumber)
        } L1 blocks behind latest snapshot.`,
        { snapshot, archiverL1BlockNumber },
      );
      return false;
    }

    // Green light. Download the snapshot to a temp location.
    downloadDir = await mkdtemp(join(dataDirectory, 'download-'));
    const downloadPaths = makeSnapshotLocalPaths(downloadDir);
    log.info(
      `Downloading snapshot at L1 block ${snapshot.l1BlockNumber} L2 block ${snapshot.l2BlockNumber} from ${snapshotsUrl} to ${downloadDir} for snapshot sync`,
      { snapshot, downloadPaths },
    );
    await downloadSnapshot(snapshot, downloadPaths, fileStore);
    log.info(`Snapshot downloaded at ${downloadDir}`, { snapshotsUrl, snapshot, downloadPaths });

    // If download was successful, close the archiver store, clear lock and version, and move download there
    await archiverStore.close();
    archiverStore = undefined;
    const archiverPath = join(dataDirectory, ARCHIVER_STORE_NAME);
    await prepareTarget(archiverPath, ARCHIVER_DB_VERSION, l1Contracts.rollupAddress);
    await rename(downloadPaths.archiver, join(archiverPath, 'data.mdb'));
    log.info(`Archiver database set up from snapshot`, { path: archiverPath });

    // Same for the world state dbs, only that we do not close them, since we assume they are not yet in use
    const worldStateBasePath = join(dataDirectory, WORLD_STATE_DIR);
    await prepareTarget(worldStateBasePath, WORLD_STATE_DB_VERSION, l1Contracts.rollupAddress);
    for (const [name, dir] of NATIVE_WORLD_STATE_DBS) {
      const path = join(worldStateBasePath, dir);
      await mkdir(path, { recursive: true });
      await rename(downloadPaths[name], join(path, 'data.mdb'));
      log.info(`World state database ${name} set up from snapshot`, { path });
    }

    log.info(`Snapshot synced to L1 block ${snapshot.l1BlockNumber} L2 block ${snapshot.l2BlockNumber}`, { snapshot });
  } finally {
    if (archiverStore) {
      log.verbose(`Closing temporary archiver data store`);
      await archiverStore.close();
    }
    if (downloadDir) {
      await tryRmDir(downloadDir, log);
    }
  }

  return true;
}

/** Deletes target dir and writes the new version file. */
async function prepareTarget(target: string, schemaVersion: number, rollupAddress: EthAddress) {
  const noOpen = () => Promise.resolve(undefined);
  const versionManager = new DatabaseVersionManager<undefined>({
    schemaVersion,
    rollupAddress,
    dataDirectory: target,
    onOpen: noOpen,
  });
  await versionManager.resetDataDirectory();
  await versionManager.writeVersion();
}
