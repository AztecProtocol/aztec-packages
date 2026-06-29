import { type AztecNodeConfig, createAztecNodeService } from '@aztec/aztec-node';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { MerkleTreeId } from '@aztec/aztec.js/trees';
import { RollupContract } from '@aztec/ethereum/contracts';
import { ChainMonitor } from '@aztec/ethereum/test';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { tryRmDir } from '@aztec/foundation/fs';
import { logger } from '@aztec/foundation/log';
import { withLoggerBindings } from '@aztec/foundation/log/server';
import { retryUntil } from '@aztec/foundation/retry';

import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { PIPELINING_SETUP_OPTS } from './fixtures/fixtures.js';
import { type EndToEndContext, setup } from './fixtures/utils.js';

const L1_BLOCK_TIME_IN_S = process.env.L1_BLOCK_TIME ? parseInt(process.env.L1_BLOCK_TIME) : 8;
const L2_TARGET_BLOCK_NUM = 3;
const TARGET_CHECKPOINT_NUMBER = CheckpointNumber(3);

// Verifies the node snapshot upload/download sync path. Uses PIPELINING_SETUP_OPTS (prod sequencer,
// ethSlot=8s default or L1_BLOCK_TIME override, aztecSlot=2×ethSlot, epochDuration=64, no prover node).
// The suite runs sequentially: it1 waits for checkpoints, it2 creates a snapshot, it3/it4 sync new nodes
// from one or multiple snapshot URLs, including fallback from a corrupted snapshot.
describe('e2e_snapshot_sync', () => {
  let context: EndToEndContext;
  let monitor: ChainMonitor;
  let log: Logger;
  let snapshotDir: string;
  let snapshotLocation: string;

  let cleanupDirs: string[];

  beforeAll(async () => {
    context = await setup(0, {
      ...PIPELINING_SETUP_OPTS,
      ethereumSlotDuration: L1_BLOCK_TIME_IN_S,
      aztecSlotDuration: L1_BLOCK_TIME_IN_S * 2,
      aztecEpochDuration: 64,
      startProverNode: false,
      realProofs: false,
    });

    log = context.logger;
    snapshotDir = await mkdtemp(join(tmpdir(), 'snapshots-'));
    cleanupDirs = [snapshotDir];
    snapshotLocation = `file://${snapshotDir}`;
    monitor = new ChainMonitor(RollupContract.getFromConfig(context.config), context.dateProvider, log).start();
  });

  afterAll(async () => {
    await monitor.stop();
    await context.teardown();
    await Promise.all(cleanupDirs.map(dir => tryRmDir(dir, log)));
  });

  // Adapted from epochs-test
  const createNonValidatorNode = async (name: string, config: Partial<AztecNodeConfig> = {}) => {
    log.warn('Creating and syncing a node without a validator...');
    return await withLoggerBindings({ actor: `node-${name}` }, () =>
      createAztecNodeService(
        {
          ...context.config,
          disableValidator: true,
          dataDirectory: join(context.config.dataDirectory!, randomBytes(8).toString('hex')),
          ...config,
        },
        {},
        { genesis: context.genesis },
      ),
    );
  };

  const expectNodeSyncedToL2Block = async (node: AztecNode, blockNumber: number) => {
    const tips = await node.getChainTips();
    expect(tips.proposed.number).toBeGreaterThanOrEqual(blockNumber);
    const worldState = await node.getWorldStateSyncStatus();
    expect(worldState.latestBlockNumber).toBeGreaterThanOrEqual(blockNumber);
  };

  // Polls ChainMonitor until checkpointNumber exceeds TARGET_CHECKPOINT_NUMBER (3), establishing
  // enough chain history for the subsequent snapshot tests.
  it('waits until a few checkpoints have been mined', async () => {
    log.warn(`Waiting for checkpoints to be mined`);
    // REFACTOR: hand-rolled poll on ChainMonitor.checkpointNumber; EpochsTestContext.waitUntilCheckpointNumber
    // or a shared helper should replace this retryUntil.
    await retryUntil(() => monitor.checkpointNumber > TARGET_CHECKPOINT_NUMBER, 'checkpoints-mined', 90, 1);
    log.warn(`Checkpoint height is now ${monitor.checkpointNumber}.`);
  });

  // Triggers a snapshot upload via aztecNodeAdmin.startSnapshotUpload(), then polls until at least
  // one file appears in the snapshot directory.
  it('creates a snapshot', async () => {
    log.warn(`Creating snapshot`);
    await context.aztecNodeAdmin.startSnapshotUpload(snapshotLocation);
    // REFACTOR: hand-rolled poll waiting for snapshot files to appear; a helper like
    // waitForSnapshotUpload(adminNode, snapshotDir) should replace this.
    await retryUntil(() => readdir(snapshotDir).then(files => files.length > 0), 'snapshot-created', 90, 1);
    log.warn(`Snapshot created`);
  });

  // Starts a new non-validator node with syncMode='snapshot' pointing at the local snapshot URL; asserts
  // the node syncs to at least L2_TARGET_BLOCK_NUM and that both the original and new node see the same
  // block hash leaf in the archive tree.
  it('downloads snapshot when syncing new node', async () => {
    log.warn(`Syncing brand new node with snapshot sync`);
    const node = await createNonValidatorNode('1', { snapshotsUrls: [snapshotLocation], syncMode: 'snapshot' });

    log.warn(`New node synced`);
    await expectNodeSyncedToL2Block(node, L2_TARGET_BLOCK_NUM);

    const block = await node.getBlock(BlockNumber(L2_TARGET_BLOCK_NUM));
    expect(block).toBeDefined();
    const blockHash = block!.hash;

    log.warn(`Checking for L2 block ${L2_TARGET_BLOCK_NUM} with hash ${blockHash} on both nodes`);
    const getBlockHashLeafIndex = (node: AztecNode) =>
      node
        .findLeavesIndexes(BlockNumber(L2_TARGET_BLOCK_NUM), MerkleTreeId.ARCHIVE, [blockHash.toFr()])
        .then(([i]) => i);
    expect(await getBlockHashLeafIndex(context.aztecNode)).toBeDefined();
    expect(await getBlockHashLeafIndex(node)).toBeDefined();

    log.warn(`Stopping new node`);
    await node.stop();
  });

  // Creates three snapshot locations: highest L1 block but corrupted (snapshot1), lowest L1 block (snapshot2),
  // and the original valid middle-height snapshot (snapshot3). Syncs a new node with all three URLs and
  // asserts it falls back past the corrupt snapshot to the next-best valid one (snapshot3).
  it('downloads snapshot from multiple sources', async () => {
    log.warn(`Setting up multiple snapshot locations with different L1 block heights`);

    // Create two additional snapshot directories (third one is the existing snapshotDir)
    const snapshotDir1 = await mkdtemp(join(tmpdir(), 'snapshots-1-'));
    const snapshotDir2 = await mkdtemp(join(tmpdir(), 'snapshots-2-'));
    const snapshotLocation1 = `file://${snapshotDir1}`;
    const snapshotLocation2 = `file://${snapshotDir2}`;
    const snapshotLocation3 = snapshotLocation; // Use the existing snapshot

    cleanupDirs.push(snapshotDir1, snapshotDir2);

    // Copy the existing snapshot to snapshot 1 and 2
    log.warn(`Copying existing snapshot to two new locations`);
    const originalFiles = await readdir(snapshotDir, { recursive: true });
    log.warn(`Found ${originalFiles.length} files in snapshot directory`);

    // Find the index.json file
    const indexFile = originalFiles.find(f => typeof f === 'string' && f.includes('index.json'));
    expect(indexFile).toBeDefined();

    // Copy all files recursively
    for (const file of originalFiles) {
      const srcPath = join(snapshotDir, file as string);
      const destPath1 = join(snapshotDir1, file as string);
      const destPath2 = join(snapshotDir2, file as string);

      try {
        await cp(srcPath, destPath1, { recursive: true });
        await cp(srcPath, destPath2, { recursive: true });
      } catch {
        // Skip if it's a directory or already copied
      }
    }

    // Update index jsons
    for (const newDir of [snapshotDir1, snapshotDir2]) {
      const files = await readdir(newDir, { recursive: true });
      const indexFile = files.find(f => typeof f === 'string' && f.includes('index.json'));
      expect(indexFile).toBeDefined();
      const indexContents = await readFile(join(newDir, indexFile!), 'utf-8');
      const updatedContents = indexContents.replaceAll(snapshotDir, newDir);
      await writeFile(join(newDir, indexFile!), updatedContents);
      logger.info(`Updated index file in ${newDir}`, { updatedContents });
    }

    // Read the original index.json to get the base L1 block number
    const indexPath3 = join(snapshotDir, indexFile!);
    const indexContent = JSON.parse(await readFile(indexPath3, 'utf-8'));
    const baseL1Block = indexContent.snapshots[0].l1BlockNumber;
    log.warn(`Base L1 block number: ${baseL1Block}`);

    // Modify snapshot 1: increase L1 block height (highest) and corrupt it
    log.warn(`Modifying snapshot 1 to have highest L1 block height`);
    const indexPath1 = join(snapshotDir1, indexFile!);
    const index1 = JSON.parse(await readFile(indexPath1, 'utf-8'));
    index1.snapshots[0].l1BlockNumber = baseL1Block + 200; // Highest
    await writeFile(indexPath1, JSON.stringify(index1, null, 2));

    // Corrupt snapshot 1 by removing one of the database files
    log.warn(`Corrupting snapshot 1 by removing a database file`);
    const snapshot1Files = await readdir(snapshotDir1, { recursive: true });
    const dbFile = snapshot1Files.find(f => typeof f === 'string' && f.endsWith('.db'));
    expect(dbFile).toBeDefined();
    await rm(join(snapshotDir1, dbFile!));
    log.warn(`Removed ${dbFile} from snapshot 1`);

    // Modify snapshot 2: decrease L1 block height (lowest)
    log.warn(`Modifying snapshot 2 to have lowest L1 block height`);
    const indexPath2 = join(snapshotDir2, indexFile!);
    const index2 = JSON.parse(await readFile(indexPath2, 'utf-8'));
    index2.snapshots[0].l1BlockNumber = baseL1Block - 1; // Lowest
    await writeFile(indexPath2, JSON.stringify(index2, null, 2));

    // Snapshot 3 (original) has the middle L1 block height (baseL1Block)
    log.warn(`Snapshot 3 (original) has L1 block height ${baseL1Block} (middle)`);

    // Now sync a new node with all three URLs
    // Snapshot 1: highest L1 block (baseL1Block + 200) but corrupted (should fail)
    // Snapshot 2: lowest L1 block (baseL1Block - 1) but valid
    // Snapshot 3: middle L1 block (baseL1Block) and valid (should be selected after 1 fails)
    log.warn(`Syncing brand new node with three snapshot URLs`);
    const node = await createNonValidatorNode('multi-url', {
      snapshotsUrls: [snapshotLocation1, snapshotLocation2, snapshotLocation3],
      syncMode: 'snapshot',
    });

    log.warn(`New node synced with fallback logic`);
    await expectNodeSyncedToL2Block(node, L2_TARGET_BLOCK_NUM);

    const block = await node.getBlock(BlockNumber(L2_TARGET_BLOCK_NUM));
    expect(block).toBeDefined();
    const blockHash = block!.hash;

    log.warn(`Checking for L2 block ${L2_TARGET_BLOCK_NUM} with hash ${blockHash} on both nodes`);
    const getBlockHashLeafIndex = (node: AztecNode) =>
      node
        .findLeavesIndexes(BlockNumber(L2_TARGET_BLOCK_NUM), MerkleTreeId.ARCHIVE, [blockHash.toFr()])
        .then(([i]) => i);
    expect(await getBlockHashLeafIndex(context.aztecNode)).toBeDefined();
    expect(await getBlockHashLeafIndex(node)).toBeDefined();

    log.warn(`Stopping new node`);
    await node.stop();
  });
});
