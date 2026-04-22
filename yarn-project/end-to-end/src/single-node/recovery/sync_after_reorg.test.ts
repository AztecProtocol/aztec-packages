import { type Archiver, RpcSyncArchiver, createRpcSyncArchiver } from '@aztec/archiver';
import type { AztecNodeService } from '@aztec/aztec-node';
import { getTimestampRangeForEpoch } from '@aztec/aztec.js/block';
import type { Logger } from '@aztec/aztec.js/log';
import { CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { executeTimeout } from '@aztec/foundation/timer';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { SingleNodeTestContext, jest, setupWithProver } from './setup.js';

// Regression test ensuring a new node can sync world-state after an unpruned reorg (issue #12206).
// SingleNodeTestContext with single node, no prover, prod-seq, interval mining. Timing: all defaults
// (ethSlot=8s/12s CI, aztecSlot=16s/24s, epoch=6, proofSubmissionEpochs=1). The test stops the
// sequencer mid-run, waits until the unproven checkpoints become prunable on L1, then creates a
// second node and verifies it syncs cleanly despite the reorg window.
describe('single-node/recovery/sync_after_reorg', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let L2_SLOT_DURATION_IN_S: number;

  let test: SingleNodeTestContext;
  let primaryArchiver: Archiver;
  let rpcSyncArchiver: RpcSyncArchiver;

  beforeEach(async () => {
    test = await setupWithProver({ startProverNode: false }); // no prover!
    ({ context, logger } = test);
    ({ L2_SLOT_DURATION_IN_S } = test);

    // Spin up an RpcSyncArchiver pointed at the primary node's archiver as soon as the nodes
    // are live, so we can assert that it follows along at every checkpoint-number assertion.
    primaryArchiver = (context.aztecNode as AztecNodeService).getBlockSource() as Archiver;
    rpcSyncArchiver = await createRpcSyncArchiverFromPrimary(primaryArchiver);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rpcSyncArchiver?.stop();
    await test.teardown();
  });

  // Regression for https://github.com/AztecProtocol/aztec-packages/issues/12206.
  // Waits for 5 checkpoints, stops the main sequencer node, waits until the rollup would prune the
  // unproven checkpoints on the next L1 block (opening a reorg window), then creates a fresh
  // non-validator node with a 10s timeout and verifies its block number is 0 (it did not get stuck
  // on a reorg'd block).
  it('new node can sync world-state after unpruned reorg', async () => {
    // Wait until there are a few checkpoints in there
    // With pipelining, each checkpoint takes ~2 L2 slots (the sequencer must wait for
    // the L1 tx of the previous checkpoint to land before it can build the next one).
    await test.waitUntilCheckpointNumber(CheckpointNumber(5), L2_SLOT_DURATION_IN_S * 12 + 30);
    await assertRpcSyncArchiverAtCheckpoint(CheckpointNumber(5));

    // Stop the node generating blocks
    logger.warn(`Stopping the main node`);
    await (context.aztecNode as AztecNodeService).stop();

    // Wait until the unproven checkpoints become prunable, so a fresh node will reorg them out on
    // sync. We poll the rollup's own prune predicate rather than hardcoding an epoch boundary: the
    // checkpoints become prunable `proofSubmissionEpochs + 1` epochs after the *first* checkpoint's
    // epoch, and on a freshly-deployed chain the cold-start clock warp can land that first
    // checkpoint in epoch 0 or epoch 1, shifting the deadline. We evaluate `canPruneAtTime` at the
    // current L1 block timestamp, which is stricter than the archiver's own check (it looks one L1
    // block further ahead): once it holds for a block, it holds for every later block the fresh
    // archiver could sync to, so the archiver's `handleEpochPrune` is guaranteed to fire.
    // The node is stopped so this wait is dead clock-time: warp the L1 clock toward epoch 2 to
    // skip most of the real-time wait, then let retryUntil confirm the prune condition.
    const [epoch2Start] = getTimestampRangeForEpoch(EpochNumber(2), test.constants);
    const warpTarget = epoch2Start - BigInt(2 * L2_SLOT_DURATION_IN_S);
    const currentTs = BigInt(await context.cheatCodes.eth.lastBlockTimestamp());
    if (currentTs < warpTarget) {
      logger.info(`Warping L1 from ${currentTs} to ${warpTarget} (2 slots before epoch 2)`);
      await context.cheatCodes.eth.warp(Number(warpTarget), { resetBlockInterval: true });
    }
    logger.warn(`Waiting until the rollup can prune the unproven checkpoints`);
    await retryUntil(
      async () => test.rollup.canPruneAtTime(BigInt(await context.cheatCodes.eth.lastBlockTimestamp())),
      `rollup can prune unproven checkpoints`,
      L2_SLOT_DURATION_IN_S * 12,
      0.5,
    );

    // Add a new node and watch it sync
    // We add a timeout since the archiver never finishes syncing and this promise does not resolve is the bug is not fixed
    logger.warn(`Syncing new node`);
    const node = await executeTimeout(() => test.createNonValidatorNode(), 10_000, `new node sync`);
    expect(await node.getBlockNumber()).toEqual(0);
    logger.info(`Test succeeded`);
  });

  /**
   * Triggers an immediate sync on the RpcSyncArchiver and asserts that its checkpointed tip is at
   * least the given checkpoint. We compare on the `checkpointed` tip (not `proposed`) because the
   * primary keeps producing blocks and the `proposed` tip can drift by one between the two calls.
   */
  async function assertRpcSyncArchiverAtCheckpoint(checkpoint: CheckpointNumber) {
    await rpcSyncArchiver.syncImmediate();
    const [primaryTips, followerTips] = await Promise.all([primaryArchiver.getL2Tips(), rpcSyncArchiver.getL2Tips()]);
    expect(followerTips.checkpointed.checkpoint.number).toBeGreaterThanOrEqual(checkpoint);
    expect(followerTips.checkpointed.block.number).toEqual(primaryTips.checkpointed.block.number);
    expect(followerTips.checkpointed.block.hash).toEqual(primaryTips.checkpointed.block.hash);
  }

  /**
   * Creates an RpcSyncArchiver pointed at the given primary archiver, reusing its L1 constants
   * and addresses (the RPC-sync archiver does not read L1 on its own).
   */
  async function createRpcSyncArchiverFromPrimary(primary: Archiver): Promise<RpcSyncArchiver> {
    const [l1Constants, genesisValues, rollupAddress, registryAddress] = await Promise.all([
      primary.getL1Constants(),
      primary.getGenesisValues(),
      primary.getRollupAddress(),
      primary.getRegistryAddress(),
    ]);
    const followerConfig = {
      ...test.context.config,
      dataDirectory: `${test.context.config.dataDirectory}/rpc-sync-follower`,
      l1Contracts: {
        ...test.context.config.l1Contracts,
        rollupAddress,
        registryAddress,
      },
    };
    return createRpcSyncArchiver(
      followerConfig,
      primary,
      { ...l1Constants, genesisArchiveRoot: genesisValues.genesisArchiveRoot },
      {},
      { blockUntilSync: false },
    );
  }
});
