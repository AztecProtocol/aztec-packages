import { ARCHIVER_DB_VERSION, createArchiverStore } from '@aztec/archiver';
import { makePublishedCheckpoint } from '@aztec/archiver/test';
import { type Anvil, EthCheatCodes, startAnvil } from '@aztec/ethereum/test';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { fromEntries } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/stdlib/block';
import { createReadOnlyFileStore } from '@aztec/stdlib/file-store';
import { type SnapshotMetadata, getBasePath } from '@aztec/stdlib/snapshots';
import { NATIVE_WORLD_STATE_DBS, WORLD_STATE_DB_VERSION, createWorldState } from '@aztec/world-state';
import { mockCheckpoint } from '@aztec/world-state/test';

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { snapshotSync, trySnapshotSync } from './snapshot-sync.js';

describe('snapshot bootstrap history', () => {
  let directory: string;
  let config: Parameters<typeof trySnapshotSync>[0];
  let anvil: Anvil | undefined;
  let rpcUrl: string;
  const log = createLogger('node-lib:test:snapshot-history');

  const summary = (oldest: number, latest: number) => ({
    oldestHistoricalBlock: oldest,
    unfinalizedBlockNumber: latest,
    finalizedBlockNumber: latest,
    treesAreSynched: true,
  });

  beforeAll(async () => {
    ({ anvil, rpcUrl } = await startAnvil({ port: 0, chainId: 1 }));
    await new EthCheatCodes([rpcUrl], new DateProvider()).mine(10000);
  });

  afterAll(() => anvil?.stop());

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'snapshot-history-'));
    config = {
      dataDirectory: join(directory, 'node'),
      dataStoreMapSizeKb: 1024 * 1024,
      rollupAddress: EthAddress.random(),
      rollupVersion: 1,
      l1ChainId: 1,
      l1RpcUrls: [rpcUrl],
      aztecEpochDuration: 32,
      syncMode: 'snapshot',
      snapshotsUrls: [`file://${directory}/snapshots`],
      worldStateBlockCheckIntervalMS: 100,
      worldStateCheckpointHistory: 64,
      worldStatePruneBeforeCheckpoint: CheckpointNumber(3),
    };
  });

  afterEach(() => rm(directory, { recursive: true, force: true }));

  const writeSnapshot = async (block: number, oldest = 1): Promise<SnapshotMetadata> => {
    const sourceConfig = {
      ...config,
      dataDirectory: join(directory, `source-${block}-${oldest}`),
      worldStateDataDirectory: undefined,
    };
    const archive = await createArchiverStore(sourceConfig, GENESIS_BLOCK_HEADER_HASH);
    const worldState = await createWorldState(sourceConfig);
    try {
      const fork = await worldState.fork(BlockNumber.ZERO);
      const checkpoints = [];
      try {
        for (let start = 1; start <= block; start += 3) {
          const { checkpoint, messages } = await mockCheckpoint(CheckpointNumber(Math.ceil(start / 3)), fork, {
            startBlockNumber: BlockNumber(start),
            numBlocks: Math.min(3, block - start + 1),
            numTxsPerBlock: 1,
            maxEffects: 1,
          });
          checkpoints.push({ checkpoint, messages });
        }
      } finally {
        await fork.close();
      }
      for (const { checkpoint, messages } of checkpoints) {
        await archive.blocks.addCheckpoints([makePublishedCheckpoint(checkpoint, 1000 + checkpoint.blocks[0].number)]);
        for (const [index, entry] of checkpoint.blocks.entries()) {
          await worldState.handleL2BlockAndMessages(entry, index === 0 ? messages : []);
        }
      }
      await worldState.setFinalized(BlockNumber(block));
      if (oldest > 1) {
        await worldState.removeHistoricalBlocks(BlockNumber(oldest));
      }
      return {
        l1BlockNumber: 1000 + block,
        l2BlockNumber: block,
        l2BlockHash: (await archive.blocks.getBlockData({ number: BlockNumber(block) }))!.blockHash.toString(),
        timestamp: block,
        schemaVersions: { archiver: ARCHIVER_DB_VERSION, worldState: WORLD_STATE_DB_VERSION },
        dataUrls: {
          archiver: `file://${join(sourceConfig.dataDirectory, 'archiver', 'data.mdb')}`,
          ...fromEntries(
            NATIVE_WORLD_STATE_DBS.map(
              ([key, tree]) =>
                [key, `file://${join(sourceConfig.dataDirectory, 'world_state', tree, 'data.mdb')}`] as const,
            ),
          ),
        },
      };
    } finally {
      await archive.db.close();
      await worldState.close();
    }
  };

  const writeIndex = async (snapshots: SnapshotMetadata[]) => {
    const metadata = { l1ChainId: 1, rollupVersion: 1, rollupAddress: config.rollupAddress };
    const path = join(directory, 'snapshots', getBasePath(metadata));
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'index.json'), JSON.stringify({ ...metadata, snapshots }));
  };

  const installSnapshot = async (snapshot: SnapshotMetadata) => {
    const fileStore = await createReadOnlyFileStore(`file://${directory}`);
    await snapshotSync(snapshot, log, {
      dataDirectory: config.dataDirectory!,
      rollupAddress: config.rollupAddress,
      fileStore,
    });
  };

  const readInstalledState = async () => {
    const worldState = await createWorldState(config);
    try {
      return await worldState.getStatusSummary();
    } finally {
      await worldState.close();
    }
  };

  it('resolves legacy snapshot block numbers to the newest snapshot in the pinned checkpoint', async () => {
    await writeIndex([await writeSnapshot(5), await writeSnapshot(12), await writeSnapshot(8)]);
    await expect(trySnapshotSync(config, log)).resolves.toBe(true);
    expect(await readInstalledState()).toEqual(summary(1, 8));
  });

  it('restores world state into its configured data directory', async () => {
    config.worldStateDataDirectory = join(directory, 'state-volume');
    await writeIndex([await writeSnapshot(8)]);
    await expect(trySnapshotSync(config, log)).resolves.toBe(true);
    expect(await readInstalledState()).toEqual(summary(1, 8));
  });

  it('falls back through missing files and incompatible retained history in the same index', async () => {
    const missing = await writeSnapshot(9);
    await rm(new URL(missing.dataUrls['public-data-tree']));
    await writeIndex([missing, await writeSnapshot(8, 8), await writeSnapshot(5)]);
    await expect(trySnapshotSync(config, log)).resolves.toBe(true);
    expect(await readInstalledState()).toEqual(summary(1, 5));
  });

  it('leaves genesis replay to the synchronizer when no snapshot is old enough', async () => {
    await writeIndex([await writeSnapshot(12)]);
    await expect(trySnapshotSync(config, log)).resolves.toBe(false);
  });

  it.each([0, 3])('rejects missing history with checkpoint %i pinned even in force-snapshot mode', async checkpoint => {
    config.worldStatePruneBeforeCheckpoint = CheckpointNumber(checkpoint);
    await installSnapshot(await writeSnapshot(12, 11));
    await writeIndex([await writeSnapshot(5)]);
    await expect(trySnapshotSync({ ...config, syncMode: 'force-snapshot' }, log)).rejects.toThrow(
      checkpoint === 0 ? 'all checkpoint history is required' : 'history is required from the start of checkpoint 3',
    );
    expect(await readInstalledState()).toEqual(summary(11, 12));
  });

  it('preserves compatible existing history without replacing it with an older snapshot', async () => {
    await installSnapshot(await writeSnapshot(12, 5));
    await writeIndex([await writeSnapshot(8)]);
    await expect(trySnapshotSync({ ...config, syncMode: 'force-snapshot' }, log)).resolves.toBe(false);
    expect(await readInstalledState()).toEqual(summary(5, 12));
  });

  it.each([128, 0])('accepts a pruned snapshot without a pin when history is %i', async history => {
    config.worldStatePruneBeforeCheckpoint = undefined;
    config.worldStateCheckpointHistory = history;
    await writeIndex([await writeSnapshot(12, 11)]);
    await expect(trySnapshotSync(config, log)).resolves.toBe(true);
    expect(await readInstalledState()).toEqual(summary(11, 12));
  });

  it.each([128, 0])('repairs a missing archiver without a pin when history is %i', async history => {
    await installSnapshot(await writeSnapshot(12, 11));
    await rm(join(config.dataDirectory!, 'archiver'), { recursive: true });
    config.worldStatePruneBeforeCheckpoint = undefined;
    config.worldStateCheckpointHistory = history;
    await writeIndex([await writeSnapshot(9, 8)]);
    await expect(trySnapshotSync({ ...config, syncMode: 'full' }, log)).resolves.toBe(false);
    await expect(trySnapshotSync(config, log)).resolves.toBe(true);
    expect(await readInstalledState()).toEqual(summary(8, 9));
  });

  it('validates a staged snapshot before replacing installed databases', async () => {
    const path = join(config.dataDirectory!, 'archiver', 'data.mdb');
    await mkdir(join(config.dataDirectory!, 'archiver'), { recursive: true });
    await writeFile(path, 'existing database');
    const snapshot = await writeSnapshot(8);
    const fileStore = await createReadOnlyFileStore(`file://${directory}`);
    await expect(
      snapshotSync(snapshot, log, {
        dataDirectory: config.dataDirectory!,
        rollupAddress: config.rollupAddress,
        fileStore,
        validate: () => Promise.reject(new Error('missing required history')),
      }),
    ).rejects.toThrow('missing required history');
    expect(await readFile(path, 'utf8')).toBe('existing database');
  });
});
