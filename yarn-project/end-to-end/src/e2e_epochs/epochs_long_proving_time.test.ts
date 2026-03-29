import type { Logger } from '@aztec/aztec.js/log';
import { ChainMonitor } from '@aztec/ethereum/test';
import { sleep } from '@aztec/foundation/sleep';

import { jest } from '@jest/globals';

import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_epochs/epochs_long_proving_time', () => {
  let logger: Logger;
  let monitor: ChainMonitor;

  let L1_BLOCK_TIME_IN_S: number;

  let test: EpochsTestContext;

  beforeEach(async () => {
    // Given empty blocks and 2-block epochs, the circuits needed for proving an epoch are:
    //  1) base parity, 2) root parity, 3) empty block, and 4) epoch root.
    // So we delay proving of each circuit such that each epoch takes 3 epochs to prove.
    const aztecEpochDuration = 2;
    const { aztecSlotDuration } = EpochsTestContext.getSlotDurations({ aztecEpochDuration });
    const epochDurationInSeconds = aztecSlotDuration * aztecEpochDuration;
    const proverTestDelayMs = (epochDurationInSeconds * 1000 * 3) / 4;
    test = await EpochsTestContext.setup({
      aztecEpochDuration,
      aztecProofSubmissionEpochs: 1000, // Effectively don't re-org
      proverTestDelayMs,
      proverNodeMaxPendingJobs: 1, // Max 1 sub-tree job at a time
    });
    ({ logger, monitor, L1_BLOCK_TIME_IN_S } = test);
    logger.warn(`Initialized with prover delay set to ${proverTestDelayMs}ms (epoch is ${epochDurationInSeconds}s)`);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('generates proof over multiple epochs', async () => {
    const targetProvenEpochs = process.env.TARGET_PROVEN_EPOCHS ? parseInt(process.env.TARGET_PROVEN_EPOCHS) : 1;
    const targetProvenBlockNumber = targetProvenEpochs * test.epochDuration;
    logger.info(`Waiting for ${targetProvenEpochs} epochs to be proven at ${targetProvenBlockNumber} L2 blocks`);

    // Wait until we hit the target proven block number, and keep an eye on how many sub-tree proving jobs
    // are run in parallel. In split proving mode, only sub-tree jobs count against maxPendingJobs.
    let maxSubTreeJobCount = 0;
    while (monitor.provenCheckpointNumber === undefined || monitor.provenCheckpointNumber < targetProvenBlockNumber) {
      const { subTree } = test.proverNodes[0].getProverNode()!.getSplitJobCounts();
      if (subTree > maxSubTreeJobCount) {
        maxSubTreeJobCount = subTree;
        logger.info(`Updated max sub-tree job count to ${maxSubTreeJobCount}`);
      }
      await sleep((L1_BLOCK_TIME_IN_S * 1000) / 2);
    }

    // At least 3 epochs should have passed after the proven one (though we add a -1 just in case)
    expect(monitor.checkpointNumber).toBeGreaterThanOrEqual(targetProvenEpochs * test.epochDuration * 3 - 1);

    // We expect maxSubTreeJobCount to equal 1, since proverNodeMaxPendingJobs is set to 1.
    // Top-tree and publish jobs don't count against this limit.
    expect(maxSubTreeJobCount).toEqual(1);
    logger.info(`Test succeeded`);
  });
});
