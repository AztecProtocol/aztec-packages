import { type AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { type AztecNode, type Logger, MerkleTreeId, retryUntil } from '@aztec/aztec.js';
import { RollupContract } from '@aztec/ethereum';
import { ChainMonitor } from '@aztec/ethereum/test';
import { randomBytes } from '@aztec/foundation/crypto';
import { tryRmDir } from '@aztec/foundation/fs';
import { withLogNameSuffix } from '@aztec/foundation/log';

import { mkdtemp, readdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { type EndToEndContext, setup } from './fixtures/utils.js';

const L1_BLOCK_TIME_IN_S = process.env.L1_BLOCK_TIME ? parseInt(process.env.L1_BLOCK_TIME) : 8;
const L2_TARGET_BLOCK_NUM = 3;

describe('e2e_snapshot_sync', () => {
  let context: EndToEndContext;
  let monitor: ChainMonitor;
  let log: Logger;
  let snapshotDir: string;
  let snapshotLocation: string;

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
    snapshotLocation = `file://${snapshotDir}`;
    monitor = new ChainMonitor(RollupContract.getFromConfig(context.config), log).start();
  });

  afterAll(async () => {
    monitor.stop();
    await context.teardown();
    await tryRmDir(snapshotDir, log);
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

  it('waits until a few L2 blocks have been mined', async () => {
    log.warn(`Waiting for L2 blocks to be mined`);
    await retryUntil(() => monitor.l2BlockNumber > L2_TARGET_BLOCK_NUM, 'l2-blocks-mined', 90, 1);
    log.warn(`L2 block height is now ${monitor.l2BlockNumber}`);
  });

  it('creates a snapshot', async () => {
    log.warn(`Creating snapshot`);
    await context.aztecNodeAdmin!.startSnapshotUpload(snapshotLocation);
    await retryUntil(() => readdir(snapshotDir).then(files => files.length > 0), 'snapshot-created', 90, 1);
    log.warn(`Snapshot created`);
  });

  it('downloads snapshot from new node', async () => {
    log.warn(`Syncing brand new node with snapshot sync`);
    const node = await createNonValidatorNode('1', {
      blobSinkUrl: undefined, // set no blob sink so it cannot sync on its own
      snapshotsUrl: snapshotLocation,
      syncMode: 'snapshot',
    });

    log.warn(`New node synced`);
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
