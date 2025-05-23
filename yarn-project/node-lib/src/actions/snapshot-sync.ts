import { ARCHIVER_DB_VERSION, ARCHIVER_STORE_NAME, type ArchiverConfig, createArchiverStore } from '@aztec/archiver';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { type EthereumClientConfig, getPublicClient } from '@aztec/ethereum';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { tryRmDir } from '@aztec/foundation/fs';
import type { Logger } from '@aztec/foundation/log';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { P2P_STORE_NAME } from '@aztec/p2p';
import type { ChainConfig } from '@aztec/stdlib/config';
import { DatabaseVersionManager } from '@aztec/stdlib/database-version';
import { type ReadOnlyFileStore, createReadOnlyFileStore } from '@aztec/stdlib/file-store';
import {
  type SnapshotMetadata,
  type SnapshotsIndexMetadata,
  downloadSnapshot,
  getLatestSnapshotMetadata,
  makeSnapshotPaths,
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

/**
 * Connects to a remote snapshot index and downloads the latest snapshot if the local archiver is behind.
 * Behaviour depends on syncing mode.
 */
export async function trySnapshotSync(config: SnapshotSyncConfig, log: Logger) {
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

  // Create an archiver store to check the current state
  log.verbose(`Creating temporary archiver data store`);
  const archiverStore = await createArchiverStore(config);
  let archiverL1BlockNumber: bigint | undefined;
  let archiverL2BlockNumber: number | undefined;
  try {
    [archiverL1BlockNumber, archiverL2BlockNumber] = await Promise.all([
      archiverStore.getSynchPoint().then(s => s.blocksSynchedTo),
      archiverStore.getSynchedL2BlockNumber(),
    ] as const);
  } finally {
    log.verbose(`Closing temporary archiver data store`, { archiverL1BlockNumber, archiverL2BlockNumber });
    await archiverStore.close();
  }

  const minL1BlocksToTriggerReplace = config.minL1BlocksToTriggerReplace ?? MIN_L1_BLOCKS_TO_TRIGGER_REPLACE;
  if (syncMode === 'snapshot' && archiverL2BlockNumber !== undefined && archiverL2BlockNumber >= INITIAL_L2_BLOCK_NUM) {
    log.verbose(
      `Skipping non-forced snapshot sync as archiver is already synced to L2 block ${archiverL2BlockNumber}.`,
    );
    return false;
  }

  const currentL1BlockNumber = await getPublicClient(config).getBlockNumber();
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

  const { l1BlockNumber, l2BlockNumber } = snapshot;
  log.info(`Syncing from snapshot at L1 block ${l1BlockNumber} L2 block ${l2BlockNumber}`, { snapshot, snapshotsUrl });
  await snapshotSync(snapshot, log, {
    dataDirectory: config.dataDirectory!,
    rollupAddress: config.l1Contracts.rollupAddress,
    snapshotsUrl,
  });
  log.info(`Snapshot synced to L1 block ${l1BlockNumber} L2 block ${l2BlockNumber}`, { snapshot });
  return true;
}

/**
 * Downloads the given snapshot replacing any local data stores.
 */
export async function snapshotSync(
  snapshot: Pick<SnapshotMetadata, 'dataUrls'>,
  log: Logger,
  config: { dataDirectory: string; rollupAddress: EthAddress; snapshotsUrl: string },
) {
  const { dataDirectory, rollupAddress } = config;
  if (!dataDirectory) {
    throw new Error(`No local data directory defined. Cannot sync snapshot.`);
  }

  const fileStore = await createReadOnlyFileStore(config.snapshotsUrl, log);

  let downloadDir: string | undefined;

  try {
    // Download the snapshot to a temp location.
    await mkdir(dataDirectory, { recursive: true });
    downloadDir = await mkdtemp(join(dataDirectory, 'download-'));
    const downloadPaths = makeSnapshotPaths(downloadDir);
    log.info(`Downloading snapshot to ${downloadDir}`, { snapshot, downloadPaths });
    await downloadSnapshot(snapshot, downloadPaths, fileStore);
    log.info(`Snapshot downloaded at ${downloadDir}`, { snapshot, downloadPaths });

    // If download was successful, clear lock and version, and move download there
    const archiverPath = join(dataDirectory, ARCHIVER_STORE_NAME);
    await prepareTarget(archiverPath, ARCHIVER_DB_VERSION, rollupAddress);
    await rename(downloadPaths.archiver, join(archiverPath, 'data.mdb'));
    log.info(`Archiver database set up from snapshot`, {
      path: archiverPath,
      dbVersion: ARCHIVER_DB_VERSION,
      rollupAddress,
    });

    // Same for the world state dbs, only that we do not close them, since we assume they are not yet in use
    const worldStateBasePath = join(dataDirectory, WORLD_STATE_DIR);
    await prepareTarget(worldStateBasePath, WORLD_STATE_DB_VERSION, rollupAddress);
    for (const [name, dir] of NATIVE_WORLD_STATE_DBS) {
      const path = join(worldStateBasePath, dir);
      await mkdir(path, { recursive: true });
      await rename(downloadPaths[name], join(path, 'data.mdb'));
      log.info(`World state database ${name} set up from snapshot`, {
        path,
        dbVersion: WORLD_STATE_DB_VERSION,
        rollupAddress,
      });
    }

    // And clear the p2p db altogether
    const p2pPath = join(dataDirectory, P2P_STORE_NAME);
    await tryRmDir(p2pPath, log);
    log.info(`P2P database cleared`, { path: p2pPath });
  } finally {
    if (downloadDir) {
      await tryRmDir(downloadDir, log);
    }
  }
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
