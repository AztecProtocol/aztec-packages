import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import { ChainMonitor } from '@aztec/ethereum/test';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { sleep } from '@aztec/foundation/sleep';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { SingleNodeTestContext, WORLD_STATE_CHECKPOINT_HISTORY } from '../single_node_test_context.js';

jest.setTimeout(1000 * 60 * 15);

// Single-node fake-prover proving scenarios, merged from the former `multiple`, `empty_blocks_proof`,
// and `long_proving_time` suites. All three run one node + a fake prover on the default prod-seq
// setup and assert that proofs land on L1; they differ only in a knob (default timing, empty-block
// minTxsPerBlock, or a multi-epoch prover delay), so each scenario keeps its own `setup()` /
// `beforeEach`. `.parallel` so CI splits them back into independent per-`it` jobs.

// Verifies that multiple consecutive epochs are proven successfully and that world-state checkpoints
// are pruned after finalization. SingleNodeTestContext defaults: single node, prod-seq, interval
// mining, ethSlot=8s (12s CI), aztecSlot=16s (24s CI), epoch=6, proofSubmissionEpochs=1, fake prover.
// TARGET_PROVEN_EPOCHS env var controls iteration count. Assumes one block per checkpoint.
describe('multi-node/single-node/proving/multiple', () => {
  let rollup: RollupContract;
  let logger: Logger;

  let test: SingleNodeTestContext;

  beforeEach(async () => {
    test = await SingleNodeTestContext.setup({});
    ({ rollup, logger } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Loops through targetProvenEpochs epochs: waits for each epoch to end, asserts it is proven,
  // then verifies the epoch-end block is accessible as a historic block and that earlier blocks
  // beyond the checkpoint history window have been purged from world state.
  it('successfully proves multiple epochs', async () => {
    const targetProvenEpochs = process.env.TARGET_PROVEN_EPOCHS ? parseInt(process.env.TARGET_PROVEN_EPOCHS) : 3;
    let epochNumber = 0;
    logger.info(`Testing for ${targetProvenEpochs} epochs to be proven`);

    while (epochNumber < targetProvenEpochs) {
      logger.info(`Waiting for the end of epoch ${epochNumber}`);
      await test.waitUntilEpochStarts(epochNumber + 1);
      const epochEndCheckpointNumber = (await test.monitor.run()).checkpointNumber;
      logger.info(`Epoch ${epochNumber} ended with pending checkpoint number ${epochEndCheckpointNumber}`);

      await test.waitUntilProvenCheckpointNumber(epochEndCheckpointNumber, 240);
      expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(epochEndCheckpointNumber);
      logger.info(`Reached proven checkpoint number ${epochEndCheckpointNumber}, epoch ${epochNumber} is now proven`);
      epochNumber++;

      // Verify the state syncs. Assumes one block per checkpoint.
      const epochEndBlockNumber = BlockNumber.fromCheckpointNumber(epochEndCheckpointNumber);
      await test.waitForNodeToSync(epochEndBlockNumber, 'proven');
      await test.verifyHistoricBlock(epochEndBlockNumber, true);

      // Check that finalized blocks are purged from world state.
      // Anvil is started with --slots-in-an-epoch 1, so 'finalized' = latest - 2. By the time
      // we reach this point the proof has been on L1 for many blocks, so the finalized L1 block
      // is past the proof submission block, making finalized checkpoint == proven checkpoint.
      // This test is setup as 1 block per checkpoint.
      const provenBlockNumber = epochEndBlockNumber;
      const finalizedBlockNumber = provenBlockNumber;
      const expectedOldestHistoricBlock = Math.max(finalizedBlockNumber - WORLD_STATE_CHECKPOINT_HISTORY + 1, 1);
      const expectedBlockRemoved = expectedOldestHistoricBlock - 1;
      await test.waitForNodeToSync(BlockNumber(expectedOldestHistoricBlock), 'historic');
      await test.verifyHistoricBlock(BlockNumber(expectedOldestHistoricBlock), true);
      if (expectedBlockRemoved > 0) {
        await test.verifyHistoricBlock(BlockNumber(expectedBlockRemoved), false);
      }
    }
    logger.info('Test Succeeded');
  });
});

// Starts a prover node (fake proofs) on the default setup, raises minTxsPerBlock=1 so blocks are
// empty, then verifies the prover still submits a proof for those empty-block checkpoints within the
// proof submission window.
describe('multi-node/single-node/proving/empty_blocks', () => {
  let context: EndToEndContext;
  let rollup: RollupContract;
  let logger: Logger;
  let monitor: ChainMonitor;

  let L1_BLOCK_TIME_IN_S: number;

  let test: SingleNodeTestContext;

  beforeEach(async () => {
    test = await SingleNodeTestContext.setup({});
    ({ context, rollup, logger, monitor, L1_BLOCK_TIME_IN_S } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Raises minTxsPerBlock to 1 so the sequencer cannot build blocks, advances to epoch 1,
  // then waits for the prover to submit a proof for the empty checkpoint. Asserts that the
  // monitor's checkpointNumber matches the proven target, confirming the proof landed on L1.
  it('submits proof even if there are no txs to build a block', async () => {
    context.sequencer?.updateConfig({ minTxsPerBlock: 1 });
    await test.waitUntilEpochStarts(1);

    // REFACTOR: raw sleep to flush pending L1 txs; replace with a helper that waits for the
    // sequencer to finish all in-flight L1 publishes (e.g. waitForSequencerIdle).
    // Sleep to make sure any pending checkpoints are published
    await sleep(L1_BLOCK_TIME_IN_S * 1000);
    const checkpointNumberAtEndOfEpoch0 = await rollup.getCheckpointNumber();
    logger.info(`Starting epoch 1 after checkpoint ${checkpointNumberAtEndOfEpoch0}`);

    await test.waitUntilProvenCheckpointNumber(checkpointNumberAtEndOfEpoch0, 240);
    expect(monitor.checkpointNumber).toEqual(checkpointNumberAtEndOfEpoch0);
    logger.info(`Test succeeded`);
  });
});

const MAX_JOB_COUNT = 20;

// Single-node + prover-node scenario verifying that a prover node whose proving time spans multiple
// epochs (proverTestDelayMs ≈ 3 epochs) still eventually submits valid proofs while proving several
// epochs concurrently (proverNodeMaxPendingJobs=20, proverBrokerMaxEpochsToKeepResultsFor=10) without
// the broker rejecting in-flight jobs as stale. (v5: previously capped at one job at a time with
// proverNodeMaxPendingJobs=1; now exercises concurrent multi-epoch proving.)
describe('multi-node/single-node/proving/long_proving_time', () => {
  let logger: Logger;
  let monitor: ChainMonitor;

  let L1_BLOCK_TIME_IN_S: number;

  let test: SingleNodeTestContext;

  beforeEach(async () => {
    // Given empty blocks and 2-block epochs, the circuits needed for proving an epoch are:
    //  1) base parity, 2) root parity, 3) empty block, and 4) epoch root.
    // So we delay proving of each circuit such that each epoch takes 3 epochs to prove.
    const aztecEpochDuration = 2;
    const { aztecSlotDuration } = SingleNodeTestContext.getSlotDurations({ aztecEpochDuration });
    const epochDurationInSeconds = aztecSlotDuration * aztecEpochDuration;
    const proverTestDelayMs = (epochDurationInSeconds * 1000 * 3) / 4;
    // Each epoch takes ~3 epochs to prove, so the broker needs to keep results for
    // at least that many epochs to avoid rejecting jobs as stale.
    test = await SingleNodeTestContext.setup({
      aztecEpochDuration,
      aztecProofSubmissionEpochs: 1000, // Effectively don't re-org
      proverTestDelayMs,
      proverNodeMaxPendingJobs: MAX_JOB_COUNT, // Prove multiple epochs concurrently
      proverBrokerMaxEpochsToKeepResultsFor: 10,
    });
    ({ logger, monitor, L1_BLOCK_TIME_IN_S } = test);
    logger.warn(`Initialized with prover delay set to ${proverTestDelayMs}ms (epoch is ${epochDurationInSeconds}s)`);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Polls the prover node's job queue until provenCheckpointNumber reaches targetProvenEpochs.
  // Asserts that checkpointNumber advanced at least 3× the proven epoch count, confirming proving
  // lagged behind block production. Asserts maxJobCount stays within MAX_JOB_COUNT (20), confirming
  // the node may run multiple proving jobs in parallel up to the configured cap.
  it('generates proof over multiple epochs', async () => {
    const targetProvenEpochs = process.env.TARGET_PROVEN_EPOCHS ? parseInt(process.env.TARGET_PROVEN_EPOCHS) : 1;
    const targetProvenBlockNumber = targetProvenEpochs * test.epochDuration;
    logger.info(`Waiting for ${targetProvenEpochs} epochs to be proven at ${targetProvenBlockNumber} L2 blocks`);

    // Wait until we hit the target proven block number, and keep an eye on how many proving jobs are run in parallel.
    let maxJobCount = 0;
    // REFACTOR: hand-rolled sleep loop polling provenCheckpointNumber; replace with
    // test.waitUntilProvenCheckpointNumber(targetProvenBlockNumber, timeout) and check job count
    // separately via a one-time snapshot rather than updating inside the loop.
    while (monitor.provenCheckpointNumber === undefined || monitor.provenCheckpointNumber < targetProvenBlockNumber) {
      const jobs = await test.proverNodes[0].getProverNode()!.getJobs();
      if (jobs.length > maxJobCount) {
        maxJobCount = jobs.length;
        logger.info(`Updated max job count to ${maxJobCount}`, jobs);
      }
      await sleep((L1_BLOCK_TIME_IN_S * 1000) / 2);
    }

    // At least 3 epochs should have passed after the proven one (though we add a -1 just in case)
    expect(monitor.checkpointNumber).toBeGreaterThanOrEqual(targetProvenEpochs * test.epochDuration * 3 - 1);

    expect(maxJobCount).toBeLessThanOrEqual(MAX_JOB_COUNT);
    logger.info(`Test succeeded, max prover jobs ${maxJobCount}`);
  });
});
