import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { type AztecNode, type Logger, MerkleTreeId, retryUntil } from '@aztec/aztec.js';
import { RollupContract } from '@aztec/ethereum';
import { ChainMonitor } from '@aztec/ethereum/test';
import { randomBytes } from '@aztec/foundation/crypto';
import { tryRmDir } from '@aztec/foundation/fs';
import { logger, withLogNameSuffix } from '@aztec/foundation/log';
import { bufferToHex } from '@aztec/foundation/string';
import { ProverNode, type ProverNodeConfig } from '@aztec/prover-node';

import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { type EndToEndContext, createAndSyncProverNode, getPrivateKeyFromIndex, setup } from './fixtures/utils.js';

const L1_BLOCK_TIME_IN_S = process.env.L1_BLOCK_TIME ? parseInt(process.env.L1_BLOCK_TIME) : 8;
const L2_TARGET_BLOCK_NUM = 3;

describe('e2e_snapshot_sync', () => {
  let context: EndToEndContext;
  let monitor: ChainMonitor;
  let log: Logger;
  let snapshotDir: string;
  let snapshotLocation: string;

  let cleanupDirs: string[];

  beforeAll(async () => {
    context = await setup(0, {
      minTxsPerBlock: 0,
      ethereumSlotDuration: L1_BLOCK_TIME_IN_S,
      aztecSlotDuration: L1_BLOCK_TIME_IN_S * 2,
      aztecEpochDuration: 64,
      startProverNode: false,
      realProofs: false,
      skipProtocolContracts: true,
      salt: 1,
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
  const createNonValidatorNode = async (suffix: string, config: Partial<AztecNodeConfig> = {}) => {
    log.warn('Creating and syncing a node without a validator...');
    return await withLogNameSuffix(suffix, () =>
      AztecNodeService.createAndSync({
        ...context.config,
        disableValidator: true,
        dataDirectory: join(context.config.dataDirectory!, randomBytes(8).toString('hex')),
        ...config,
      }),
    );
  };

  const createTestProverNode = async (config: Partial<ProverNodeConfig> = {}) => {
    log.warn('Creating and syncing a prover node...');
    const dataDirectory = join(context.config.dataDirectory!, randomBytes(8).toString('hex'));
    return await createAndSyncProverNode(
      bufferToHex(getPrivateKeyFromIndex(5)!),
      context.config,
      { ...config, realProofs: false, dataDirectory },
      context.aztecNode,
    );
  };

  const expectNodeSyncedToL2Block = async (node: AztecNode | ProverNode, blockNumber: number) => {
    const tips = await node.getL2Tips();
    expect(tips.latest.number).toBeGreaterThanOrEqual(blockNumber);
    const worldState = await node.getWorldStateSyncStatus();
    expect(worldState.latestBlockNumber).toBeGreaterThanOrEqual(blockNumber);
  };

  it('waits until a few L2 blocks have been mined and purges blobs', async () => {
    log.warn(`Waiting for L2 blocks to be mined`);
    await retryUntil(() => monitor.l2BlockNumber > L2_TARGET_BLOCK_NUM, 'l2-blocks-mined', 90, 1);
    log.warn(`L2 block height is now ${monitor.l2BlockNumber}. Purging all blobs from sink so snapshot is required.`);
    await context.blobSink!.clear();
  });

  it('creates a snapshot', async () => {
    log.warn(`Creating snapshot`);
    await context.aztecNodeAdmin!.startSnapshotUpload(snapshotLocation);
    await retryUntil(() => readdir(snapshotDir).then(files => files.length > 0), 'snapshot-created', 90, 1);
    log.warn(`Snapshot created`);
  });

  it('downloads snapshot when syncing new node', async () => {
    log.warn(`Syncing brand new node with snapshot sync`);
    const node = await createNonValidatorNode('1', { snapshotsUrls: [snapshotLocation], syncMode: 'snapshot' });

    log.warn(`New node synced`);
    await expectNodeSyncedToL2Block(node, L2_TARGET_BLOCK_NUM);

    const block = await node.getBlock(L2_TARGET_BLOCK_NUM);
    expect(block).toBeDefined();
    const blockHash = await block!.hash();

    log.warn(`Checking for L2 block ${L2_TARGET_BLOCK_NUM} with hash ${blockHash} on both nodes`);
    const getBlockHashLeafIndex = (node: AztecNode) =>
      node.findLeavesIndexes(L2_TARGET_BLOCK_NUM, MerkleTreeId.ARCHIVE, [blockHash]).then(([i]) => i);
    expect(await getBlockHashLeafIndex(context.aztecNode)).toBeDefined();
    expect(await getBlockHashLeafIndex(node)).toBeDefined();

    log.warn(`Stopping new node`);
    await node.stop();
  });

  it('downloads snapshot when syncing new prover node', async () => {
    log.warn(`Syncing brand new prover node with snapshot sync`);
    const node = await createTestProverNode({ snapshotsUrls: [snapshotLocation], syncMode: 'snapshot' });

    log.warn(`New node prover synced`);
    await expectNodeSyncedToL2Block(node, L2_TARGET_BLOCK_NUM);

    log.warn(`Stopping new prover node`);
    await node.stop();
  });

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

    const block = await node.getBlock(L2_TARGET_BLOCK_NUM);
    expect(block).toBeDefined();
    const blockHash = await block!.hash();

    log.warn(`Checking for L2 block ${L2_TARGET_BLOCK_NUM} with hash ${blockHash} on both nodes`);
    const getBlockHashLeafIndex = (node: AztecNode) =>
      node.findLeavesIndexes(L2_TARGET_BLOCK_NUM, MerkleTreeId.ARCHIVE, [blockHash]).then(([i]) => i);
    expect(await getBlockHashLeafIndex(context.aztecNode)).toBeDefined();
    expect(await getBlockHashLeafIndex(node)).toBeDefined();

    log.warn(`Stopping new node`);
    await node.stop();
  });
});
