import {
  ARCHIVER_DB_VERSION,
  ARCHIVER_STORE_NAME,
  type ArchiverConfig,
  createArchiverStore,
  getArchiverSynchPoint,
} from '@aztec/archiver';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { type EthereumClientConfig, getPublicClient } from '@aztec/ethereum/client';
import type { L1ContractsConfig } from '@aztec/ethereum/config';
import { BlockNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { tryRmDir } from '@aztec/foundation/fs';
import type { Logger } from '@aztec/foundation/log';
import { P2P_STORE_NAME } from '@aztec/p2p';
import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/stdlib/block';
import type { ChainConfig } from '@aztec/stdlib/config';
import { DatabaseVersionManager } from '@aztec/stdlib/database-version/manager';
import { type ReadOnlyFileStore, createReadOnlyFileStore } from '@aztec/stdlib/file-store';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';
import {
  SnapshotDataKeys,
  type SnapshotMetadata,
  type SnapshotsIndexMetadata,
  downloadSnapshot,
  getSnapshotIndex,
  makeSnapshotPaths,
} from '@aztec/stdlib/snapshots';
import type { GenesisData } from '@aztec/stdlib/world-state';
import {
  NATIVE_WORLD_STATE_DBS,
  WORLD_STATE_DB_VERSION,
  WORLD_STATE_DIR,
  type WorldStateConfig,
  createWorldState,
  getWorldStateHistoryStartCheckpoint,
  validateWorldStateHistory,
} from '@aztec/world-state';

import { copyFile, mkdir, mkdtemp, rename, stat, unlink } from 'fs/promises';
import { join } from 'path';

import type { SharedNodeConfig } from '../config/index.js';

// Half day worth of L1 blocks
const MIN_L1_BLOCKS_TO_TRIGGER_REPLACE = 86400 / 2 / 12;

type SnapshotSyncConfig = Pick<SharedNodeConfig, 'syncMode'> &
  Pick<ChainConfig, 'l1ChainId' | 'rollupVersion'> &
  Pick<L1ContractsConfig, 'aztecEpochDuration'> &
  Pick<ArchiverConfig, 'archiverStoreMapSizeKb'> &
  WorldStateConfig &
  DataStoreConfig &
  Required<Pick<DataStoreConfig, 'rollupAddress'>> &
  EthereumClientConfig & {
    snapshotsUrls?: string[];
    minL1BlocksToTriggerReplace?: number;
  };

/**
 * Validates local history and restores the newest compatible snapshot when bootstrap is needed.
 * Fixed history boundaries are resolved against archived block and checkpoint metadata.
 */
export async function trySnapshotSync(config: SnapshotSyncConfig, log: Logger, genesis?: GenesisData) {
  const { syncMode, snapshotsUrls, dataDirectory, l1ChainId, rollupVersion, rollupAddress } = config;
  const historyStartCheckpoint = config.worldStatePruneBeforeCheckpoint;
  let maxSnapshotBlock = historyStartCheckpoint === 0 ? BlockNumber.ZERO : undefined;
  const worldStateDirectory = config.worldStateDataDirectory ?? dataDirectory;
  if (
    historyStartCheckpoint !== undefined &&
    worldStateDirectory &&
    (await hasWorldStateDatabase(worldStateDirectory))
  ) {
    await validateLocalWorldStateHistory(config, log, genesis);
    log.info('Using existing world-state database with compatible retained history', { historyStartCheckpoint });
    return false;
  }
  if (syncMode === 'full') {
    log.debug('Snapshot sync is disabled. Running full sync.', { syncMode: syncMode });
    return false;
  }

  if (!snapshotsUrls || snapshotsUrls.length === 0) {
    log.verbose('Snapshot sync is disabled. No snapshots URLs provided.');
    return false;
  }

  if (!dataDirectory) {
    log.verbose('Snapshot sync is disabled. No local data directory defined.');
    return false;
  }

  // Create an archiver store to check the current state (do this only once). This temporary store is only
  // read for its sync point and never serves tagged-log queries, so the genesis block hash it carries is
  // immaterial — pass the protocol constant.
  log.verbose(`Creating temporary archiver data store`);
  const archiverStore = await createArchiverStore(config, GENESIS_BLOCK_HEADER_HASH);
  let archiverL1BlockNumber: bigint | undefined;
  let archiverL2BlockNumber: number | undefined;
  try {
    [archiverL1BlockNumber, archiverL2BlockNumber] = await Promise.all([
      getArchiverSynchPoint(archiverStore).then(s => s.blocksSynchedTo),
      archiverStore.blocks.getLatestL2BlockNumber(),
    ] as const);
  } finally {
    log.verbose(`Closing temporary archiver data store`, { archiverL1BlockNumber, archiverL2BlockNumber });
    await archiverStore.db.close();
  }

  const minL1BlocksToTriggerReplace = config.minL1BlocksToTriggerReplace ?? MIN_L1_BLOCKS_TO_TRIGGER_REPLACE;
  if (
    historyStartCheckpoint === undefined &&
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
  if (
    historyStartCheckpoint === undefined &&
    archiverL1BlockNumber &&
    currentL1BlockNumber >= archiverL1BlockNumber &&
    currentL1BlockNumber - archiverL1BlockNumber < minL1BlocksToTriggerReplace
  ) {
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
    rollupAddress,
  };

  // Index entries may outlive their database files, so retain older candidates for download fallback.
  type SnapshotCandidate = { snapshot: SnapshotMetadata; url: string; fileStore: ReadOnlyFileStore };
  const snapshotCandidates: SnapshotCandidate[] = [];

  for (const snapshotsUrl of snapshotsUrls) {
    let fileStore: ReadOnlyFileStore;
    try {
      fileStore = await createReadOnlyFileStore(snapshotsUrl, log);
    } catch (err) {
      log.error(`Invalid config for downloading snapshots from ${snapshotsUrl}`, err);
      continue;
    }

    let snapshots: SnapshotMetadata[];
    try {
      snapshots = (await getSnapshotIndex(indexMetadata, fileStore))?.snapshots ?? [];
    } catch (err) {
      log.error(`Failed to read snapshot index from ${snapshotsUrl}. Skipping this URL.`, err, {
        ...indexMetadata,
        snapshotsUrl,
      });
      continue;
    }

    if (snapshots.length === 0) {
      log.verbose(`No snapshot found at ${snapshotsUrl}. Skipping this URL.`, { ...indexMetadata, snapshotsUrl });
      continue;
    }

    for (const snapshot of snapshots) {
      if (snapshot.schemaVersions.archiver !== ARCHIVER_DB_VERSION) {
        log.warn(
          `Skipping snapshot from ${snapshotsUrl} as it has schema version ${snapshot.schemaVersions.archiver} but expected ${ARCHIVER_DB_VERSION}.`,
          snapshot,
        );
        continue;
      }

      if (snapshot.schemaVersions.worldState !== WORLD_STATE_DB_VERSION) {
        log.warn(
          `Skipping snapshot from ${snapshotsUrl} as it has world state schema version ${snapshot.schemaVersions.worldState} but we expected ${WORLD_STATE_DB_VERSION}.`,
          snapshot,
        );
        continue;
      }

      if (
        historyStartCheckpoint === undefined &&
        archiverL1BlockNumber &&
        snapshot.l1BlockNumber < archiverL1BlockNumber
      ) {
        log.verbose(
          `Skipping snapshot from ${snapshotsUrl} since local archiver is at L1 block ${archiverL1BlockNumber} which is further than snapshot at ${snapshot.l1BlockNumber}`,
          { snapshot, archiverL1BlockNumber, snapshotsUrl },
        );
        continue;
      }

      if (
        historyStartCheckpoint === undefined &&
        archiverL1BlockNumber &&
        snapshot.l1BlockNumber - Number(archiverL1BlockNumber) < minL1BlocksToTriggerReplace
      ) {
        log.verbose(
          `Skipping snapshot from ${snapshotsUrl} as archiver is less than ${
            snapshot.l1BlockNumber - Number(archiverL1BlockNumber)
          } L1 blocks behind this snapshot.`,
          { snapshot, archiverL1BlockNumber, snapshotsUrl },
        );
        continue;
      }

      snapshotCandidates.push({ snapshot, url: snapshotsUrl, fileStore });
    }
  }

  if (snapshotCandidates.length === 0) {
    log.verbose(`No valid snapshots found from any URL, skipping snapshot sync`, { ...indexMetadata, snapshotsUrls });
    return false;
  }

  snapshotCandidates.sort((a, b) =>
    historyStartCheckpoint === undefined
      ? b.snapshot.l1BlockNumber - a.snapshot.l1BlockNumber
      : b.snapshot.l2BlockNumber - a.snapshot.l2BlockNumber || b.snapshot.l1BlockNumber - a.snapshot.l1BlockNumber,
  );

  // Try each candidate in order until one succeeds
  for (const { snapshot, url, fileStore } of snapshotCandidates) {
    if (maxSnapshotBlock !== undefined && snapshot.l2BlockNumber > maxSnapshotBlock) {
      continue;
    }
    const { l1BlockNumber, l2BlockNumber } = snapshot;
    log.info(`Attempting to sync from snapshot at L1 block ${l1BlockNumber} L2 block ${l2BlockNumber}`, {
      snapshot,
      snapshotsUrl: url,
    });

    try {
      const available = await Promise.all(Object.values(snapshot.dataUrls).map(path => fileStore.exists(path)));
      if (!available.every(Boolean)) {
        log.warn('Skipping snapshot with missing database files', { l1BlockNumber, l2BlockNumber, snapshotsUrl: url });
        continue;
      }
      await snapshotSync(snapshot, log, {
        dataDirectory: config.dataDirectory!,
        rollupAddress: config.rollupAddress,
        fileStore,
        worldStateDataDirectory: config.worldStateDataDirectory,
        validateArchiver:
          historyStartCheckpoint === undefined || historyStartCheckpoint === 0
            ? undefined
            : async stagingDirectory => {
                const stores = await createArchiverStore(
                  { ...config, dataDirectory: stagingDirectory },
                  GENESIS_BLOCK_HEADER_HASH,
                );
                try {
                  const latestBlockNumber = await stores.blocks.getLatestL2BlockNumber();
                  if (latestBlockNumber === undefined) {
                    throw new Error('Snapshot archiver has no blocks');
                  }
                  const latestBlock = await stores.blocks.getBlockData({ number: latestBlockNumber });
                  if (!latestBlock) {
                    throw new Error(`Snapshot archiver is missing block ${latestBlockNumber}`);
                  }
                  if (latestBlock.checkpointNumber > historyStartCheckpoint) {
                    const checkpoint = await stores.blocks.getCheckpointData(historyStartCheckpoint);
                    if (checkpoint) {
                      maxSnapshotBlock = BlockNumber(checkpoint.startBlock + checkpoint.blockCount - 1);
                    }
                    throw new Error(
                      `Snapshot is at checkpoint ${latestBlock.checkpointNumber}, after requested checkpoint ${historyStartCheckpoint}`,
                    );
                  }
                } finally {
                  await stores.db.close();
                }
              },
        validate:
          historyStartCheckpoint === undefined
            ? undefined
            : stagingDirectory =>
                validateLocalWorldStateHistory(
                  { ...config, dataDirectory: stagingDirectory, worldStateDataDirectory: stagingDirectory },
                  log,
                  genesis,
                ),
      });
      log.info(`Snapshot synced to L1 block ${l1BlockNumber} L2 block ${l2BlockNumber}`, {
        snapshot,
        snapshotsUrl: url,
      });
      return true;
    } catch (err) {
      log.error(`Failed to download snapshot from ${url}, trying next candidate`, err, {
        snapshot,
        snapshotsUrl: url,
      });
      continue;
    }
  }

  log.error(`Failed to download snapshot from all URLs`, { snapshotsUrls });
  return false;
}

/**
 * Downloads the given snapshot replacing any local data stores.
 */
export async function snapshotSync(
  snapshot: Pick<SnapshotMetadata, 'dataUrls'>,
  log: Logger,
  config: {
    dataDirectory: string;
    rollupAddress: EthAddress;
    fileStore: ReadOnlyFileStore;
    worldStateDataDirectory?: string;
    validateArchiver?: (stagingDirectory: string) => Promise<void>;
    validate?: (stagingDirectory: string) => Promise<void>;
  },
) {
  const { dataDirectory, rollupAddress, fileStore } = config;
  if (!dataDirectory) {
    throw new Error(`No local data directory defined. Cannot sync snapshot.`);
  }

  let downloadDir: string | undefined;

  try {
    // Download the snapshot to a temp location.
    await mkdir(dataDirectory, { recursive: true });
    downloadDir = await mkdtemp(join(dataDirectory, 'download-'));
    const downloadPaths = makeSnapshotPaths(downloadDir);
    await prepareTarget(join(downloadDir, ARCHIVER_STORE_NAME), ARCHIVER_DB_VERSION, rollupAddress);
    await prepareTarget(join(downloadDir, WORLD_STATE_DIR), WORLD_STATE_DB_VERSION, rollupAddress);
    downloadPaths.archiver = join(downloadDir, ARCHIVER_STORE_NAME, 'data.mdb');
    for (const [name, dir] of NATIVE_WORLD_STATE_DBS) {
      downloadPaths[name] = join(downloadDir, WORLD_STATE_DIR, dir, 'data.mdb');
    }
    log.info(`Downloading snapshot to ${downloadDir}`, { snapshot, downloadPaths });
    if (config.validateArchiver) {
      await downloadSnapshot(snapshot, downloadPaths, fileStore, ['archiver']);
      await config.validateArchiver(downloadDir);
      await downloadSnapshot(
        snapshot,
        downloadPaths,
        fileStore,
        SnapshotDataKeys.filter(key => key !== 'archiver'),
      );
    } else {
      await downloadSnapshot(snapshot, downloadPaths, fileStore);
    }
    await config.validate?.(downloadDir);
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
    const worldStateBasePath = join(config.worldStateDataDirectory ?? dataDirectory, WORLD_STATE_DIR);
    await prepareTarget(worldStateBasePath, WORLD_STATE_DB_VERSION, rollupAddress);
    for (const [name, dir] of NATIVE_WORLD_STATE_DBS) {
      const path = join(worldStateBasePath, dir);
      await mkdir(path, { recursive: true });
      await moveSnapshotFile(downloadPaths[name], join(path, 'data.mdb'));
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

async function moveSnapshotFile(source: string, destination: string) {
  try {
    await rename(source, destination);
  } catch (err) {
    if (!err || typeof err !== 'object' || !('code' in err) || err.code !== 'EXDEV') {
      throw err;
    }
    await copyFile(source, destination);
    await unlink(source);
  }
}

async function hasWorldStateDatabase(dataDirectory: string): Promise<boolean> {
  const sizes = await Promise.all(
    NATIVE_WORLD_STATE_DBS.map(async ([, directory]) => {
      try {
        return (await stat(join(dataDirectory, WORLD_STATE_DIR, directory, 'data.mdb'))).size;
      } catch (err) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
          return 0;
        }
        throw err;
      }
    }),
  );
  return sizes.some(size => size > 0);
}

async function validateLocalWorldStateHistory(config: SnapshotSyncConfig, log: Logger, genesis?: GenesisData) {
  const worldState = await createWorldState(config, genesis);
  try {
    const summary = await worldState.getStatusSummary();
    if (getWorldStateHistoryStartCheckpoint(config) !== 0 && summary.oldestHistoricalBlock > 1) {
      const archiverStore = await createArchiverStore(config, GENESIS_BLOCK_HEADER_HASH);
      try {
        await validateWorldStateHistory(config, summary, archiverStore.blocks);
      } finally {
        await archiverStore.db.close();
      }
    } else {
      await validateWorldStateHistory(config, summary);
    }
    log.info('Validated retained world-state history', {
      oldestHistoricBlock: summary.oldestHistoricalBlock,
      latestBlock: summary.unfinalizedBlockNumber,
      historyStartCheckpoint: getWorldStateHistoryStartCheckpoint(config),
      checkpointHistory: config.worldStateCheckpointHistory,
    });
  } finally {
    await worldState.close();
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
