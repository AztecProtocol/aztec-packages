import type { Logger } from '@aztec/aztec.js/log';
import { ChainMonitor } from '@aztec/ethereum/test';
import { sleep } from '@aztec/foundation/sleep';

import { SingleNodeTestContext, jest } from './setup.js';

const MAX_JOB_COUNT = 20;

// Single-node + prover-node scenario verifying that a prover node whose proving time spans multiple
// epochs (proverTestDelayMs ≈ 3 epochs) still eventually submits valid proofs while proving several
// epochs concurrently (proverNodeMaxPendingJobs=20, proverBrokerMaxEpochsToKeepResultsFor=10) without
// the broker rejecting in-flight jobs as stale. (v5: previously capped at one job at a time with
// proverNodeMaxPendingJobs=1; now exercises concurrent multi-epoch proving.)
describe('single-node/proving/long_proving_time', () => {
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
