import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import type { TestProverNode } from '@aztec/prover-node/test';
import { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';

import { expect, jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 15);

/**
 * E2E tests for optimistic (checkpoint-driven) proving with reorg scenarios.
 */
describe('e2e_epochs/epochs_optimistic_proving', () => {
  let context: EndToEndContext;
  let rollup: RollupContract;
  let logger: Logger;
  let node: AztecNode;

  let L2_SLOT_DURATION_IN_S: number;

  let test: EpochsTestContext;

  const getCheckpointNumber = (n: AztecNode) => n.getL2Tips().then(tips => tips.checkpointed.checkpoint.number);

  /**
   * Looks up the epoch a given checkpoint sits in by reading its slot from the archiver.
   * Replaces the (incorrect) `Math.floor(checkpointNumber / epochDuration)` shortcut —
   * checkpoint numbers don't divide cleanly into epochs because slots can be empty and
   * a single checkpoint may span multiple blocks.
   */
  const epochOfCheckpoint = async (cpNumber: CheckpointNumber): Promise<number> => {
    const cp = await retryUntil(
      async () => (await node.getCheckpoints(cpNumber, 1))[0],
      `archiver indexes checkpoint ${cpNumber}`,
      30,
      0.1,
    );
    return Number(getEpochAtSlot(cp.header.slotNumber, test.constants));
  };

  /** Returns the last block number contained in the given checkpoint. */
  const lastBlockOfCheckpoint = async (cpNumber: CheckpointNumber): Promise<BlockNumber> => {
    const cp = await retryUntil(
      async () => (await node.getCheckpoints(cpNumber, 1))[0],
      `archiver indexes checkpoint ${cpNumber}`,
      30,
      0.1,
    );
    return BlockNumber(cp.startBlock + cp.blockCount - 1);
  };

  afterEach(async () => {
    await test.teardown();
  });

  describe('happy path', () => {
    beforeEach(async () => {
      test = await EpochsTestContext.setup({ enableProposerPipelining: true });
      ({ rollup, logger, context } = test);
      ({ L2_SLOT_DURATION_IN_S } = test);
      node = context.aztecNode;
    });

    it('proves an epoch via checkpoint-driven flow', async () => {
      logger.info('Waiting for epoch 0 to end');
      await test.waitUntilEpochStarts(1);
      const epochEndCheckpointNumber = (await test.monitor.run()).checkpointNumber;
      logger.info(`Epoch 0 ended with checkpoint number ${epochEndCheckpointNumber}`);

      await test.waitUntilProvenCheckpointNumber(epochEndCheckpointNumber, 240);
      expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(epochEndCheckpointNumber);

      await test.waitForNodeToSync(await lastBlockOfCheckpoint(epochEndCheckpointNumber), 'proven');
    });

    it('proves multiple epochs via checkpoint-driven flow', async () => {
      for (let epoch = 0; epoch < 2; epoch++) {
        logger.info(`Waiting for epoch ${epoch} to end`);
        await test.waitUntilEpochStarts(epoch + 1);
        const cp = (await test.monitor.run()).checkpointNumber;

        await test.waitUntilProvenCheckpointNumber(cp, 240);
        expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(cp);

        await test.waitForNodeToSync(await lastBlockOfCheckpoint(cp), 'proven');
      }
    });
  });

  describe('mid-epoch checkpoint reorg with replacement', () => {
    beforeEach(async () => {
      test = await EpochsTestContext.setup({
        enableProposerPipelining: false,
        maxSpeedUpAttempts: 0,
        cancelTxOnTimeout: false,
        aztecEpochDuration: 4,
        ethereumSlotDuration: 4,
        aztecSlotDuration: 36,
        blockDurationMs: 8000,
        minTxsPerBlock: 0,
        enforceTimeTable: true,
        aztecProofSubmissionEpochs: 1000,
        anvilSlotsInAnEpoch: 32,
      });
      ({ rollup, logger, context } = test);
      ({ L2_SLOT_DURATION_IN_S } = test);
      node = context.aztecNode;
    });

    it('replaces a reorged checkpoint and proves the epoch', async () => {
      // Wait for epoch 1 to start so we have enough slots for the replacement
      // to land in the same epoch after the reorg.
      await test.waitUntilEpochStarts(1);

      // Wait for the 2nd checkpoint within this epoch.
      const initialCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      const midCheckpoint = CheckpointNumber(initialCheckpoint + 2);
      await test.waitUntilCheckpointNumber(midCheckpoint, L2_SLOT_DURATION_IN_S * 6);
      const checkpointBeforeReorg = test.monitor.checkpointNumber;
      logger.info(`Reached checkpoint ${checkpointBeforeReorg}`);

      // Stop block production.
      await context.aztecNodeAdmin!.setConfig({ skipPublishingCheckpointsPercent: 100 });

      // Reorg L1 to remove the last checkpoint.
      logger.info(`Reorging L1 to remove checkpoint ${checkpointBeforeReorg}`);
      await context.cheatCodes.eth.reorgWithReplacement(1);

      const afterReorgCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      expect(afterReorgCheckpoint).toBeLessThan(checkpointBeforeReorg);
      logger.info(`After reorg: checkpoint ${afterReorgCheckpoint} (was ${checkpointBeforeReorg})`);

      // Verify node detects the reorg.
      await retryUntil(
        () => getCheckpointNumber(node).then(cp => cp <= afterReorgCheckpoint),
        'reorg detected',
        30,
        0.5,
      );

      // Resume block production — sequencer proposes a replacement in the next slot.
      logger.info('Resuming block production for replacement checkpoint');
      await context.aztecNodeAdmin!.setConfig({ skipPublishingCheckpointsPercent: 0 });

      const replacementCheckpoint = CheckpointNumber(afterReorgCheckpoint + 1);
      await test.waitUntilCheckpointNumber(replacementCheckpoint, L2_SLOT_DURATION_IN_S * 4);
      logger.info(`Replacement checkpoint ${replacementCheckpoint} published`);

      // Wait for the epoch to end and proof to land.
      const currentEpoch = await epochOfCheckpoint(replacementCheckpoint);
      await test.waitUntilEpochStarts(currentEpoch + 1);
      const epochEndCheckpoint = (await test.monitor.run(true)).checkpointNumber;

      expect(epochEndCheckpoint).toEqual(replacementCheckpoint);

      await test.waitUntilProvenCheckpointNumber(CheckpointNumber(epochEndCheckpoint), 240);
      logger.info(`Epoch proven after mid-epoch checkpoint replacement`);
    });
  });

  describe('mid-epoch checkpoint reorg without replacement', () => {
    beforeEach(async () => {
      test = await EpochsTestContext.setup({
        enableProposerPipelining: false,
        maxSpeedUpAttempts: 0,
        cancelTxOnTimeout: false,
        aztecEpochDuration: 4,
        ethereumSlotDuration: 4,
        aztecSlotDuration: 36,
        blockDurationMs: 8000,
        minTxsPerBlock: 0,
        enforceTimeTable: true,
        aztecProofSubmissionEpochs: 1000,
        anvilSlotsInAnEpoch: 32,
      });
      ({ rollup, logger, context } = test);
      ({ L2_SLOT_DURATION_IN_S } = test);
      node = context.aztecNode;
    });

    it('removes a checkpoint mid-epoch via reorg and proves with survivors', async () => {
      // Wait for 2 checkpoints mid-epoch.
      const initialCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      const midCheckpoint = CheckpointNumber(initialCheckpoint + 2);
      await test.waitUntilCheckpointNumber(midCheckpoint, L2_SLOT_DURATION_IN_S * 6);
      const checkpointBeforeReorg = test.monitor.checkpointNumber;
      logger.info(`Reached checkpoint ${checkpointBeforeReorg}`);

      // Stop block production so no replacement is proposed.
      await context.aztecNodeAdmin!.setConfig({ skipPublishingCheckpointsPercent: 100 });

      // Reorg L1 to remove the last checkpoint — before the epoch completes.
      logger.info(`Reorging L1 to remove checkpoint ${checkpointBeforeReorg}`);
      await context.cheatCodes.eth.reorgWithReplacement(1);

      const afterReorgCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      expect(afterReorgCheckpoint).toBeLessThan(checkpointBeforeReorg);
      logger.info(`After reorg: checkpoint ${afterReorgCheckpoint} (was ${checkpointBeforeReorg})`);

      // Verify node detects the reorg.
      await retryUntil(
        () => getCheckpointNumber(node).then(cp => cp <= afterReorgCheckpoint),
        'reorg detected',
        30,
        0.5,
      );

      // Wait for the epoch to end and proof to land with the surviving checkpoints.
      // Use the surviving checkpoint to look up which epoch we're in.
      const currentEpoch = await epochOfCheckpoint(afterReorgCheckpoint);
      await test.waitUntilEpochStarts(currentEpoch + 1);
      const epochEndCheckpoint = (await test.monitor.run(true)).checkpointNumber;

      expect(epochEndCheckpoint).toEqual(afterReorgCheckpoint);

      await test.waitUntilProvenCheckpointNumber(CheckpointNumber(epochEndCheckpoint), 240);
      expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(epochEndCheckpoint);
      logger.info(`Epoch proven with surviving checkpoints after mid-epoch reorg`);
    });
  });

  describe('last-slot checkpoint reorg without replacement', () => {
    beforeEach(async () => {
      test = await EpochsTestContext.setup({
        enableProposerPipelining: false,
        maxSpeedUpAttempts: 0,
        cancelTxOnTimeout: false,
        aztecEpochDuration: 4,
        ethereumSlotDuration: 4,
        aztecSlotDuration: 36,
        blockDurationMs: 8000,
        minTxsPerBlock: 0,
        enforceTimeTable: true,
        aztecProofSubmissionEpochs: 1000,
        anvilSlotsInAnEpoch: 32,
        // Apply a delay between "epoch complete on L1" and the prover-node hand-off so
        // the reorg below has time to be processed before finalization starts.
        proverNodeConfig: { proverNodeEpochProvingDelayMs: 10_000 },
      });
      ({ rollup, logger, context } = test);
      ({ L2_SLOT_DURATION_IN_S } = test);
      node = context.aztecNode;
    });

    it('removes the last-slot checkpoint of an epoch via reorg and proves with survivors', async () => {
      // Wait until we're inside epoch 1 — gives us a known slot range to target.
      await test.waitUntilEpochStarts(1);
      const epochEndSlot = test.epochDuration * 2 - 1; // last slot of epoch 1 (slots 4..7)

      // Wait until the wall clock crosses into the last slot of epoch 1.
      await retryUntil(
        () => Promise.resolve(Number(test.epochCache.getEpochAndSlotNow().slot) >= epochEndSlot),
        `enter slot ${epochEndSlot}`,
        L2_SLOT_DURATION_IN_S * test.epochDuration * 2,
        1,
      );
      logger.info(`Reached last slot ${epochEndSlot} of epoch 1`);

      // Wait for a checkpoint published in the last slot to actually appear.
      const lastSlotCheckpointNumber = await retryUntil(
        async () => {
          const cpNum = (await test.monitor.run(true)).checkpointNumber;
          if (cpNum === CheckpointNumber.ZERO) {
            return undefined;
          }
          const [cp] = await node.getCheckpoints(cpNum, 1);
          return cp && Number(cp.header.slotNumber) === epochEndSlot ? cpNum : undefined;
        },
        'last-slot checkpoint published',
        L2_SLOT_DURATION_IN_S,
        0.5,
      );
      logger.info(`Last-slot checkpoint ${lastSlotCheckpointNumber} published in slot ${epochEndSlot}`);

      // Suppress further publishing so no replacement is proposed.
      await context.aztecNodeAdmin!.setConfig({ skipPublishingCheckpointsPercent: 100 });

      // Reorg L1 to remove the last-slot checkpoint.
      logger.info(`Reorging L1 to remove last-slot checkpoint ${lastSlotCheckpointNumber}`);
      await context.cheatCodes.eth.reorgWithReplacement(1);

      const afterReorgCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      expect(afterReorgCheckpoint).toBeLessThan(lastSlotCheckpointNumber);
      logger.info(`After reorg: checkpoint ${afterReorgCheckpoint} (was ${lastSlotCheckpointNumber})`);

      // The surviving last checkpoint sits in an earlier slot than the epoch's last slot —
      // i.e. the epoch's last block is no longer in the epoch's last slot.
      const [survivor] = await node.getCheckpoints(afterReorgCheckpoint, 1);
      expect(Number(survivor.header.slotNumber)).toBeLessThan(epochEndSlot);

      // Verify node detects the reorg.
      await retryUntil(
        () => getCheckpointNumber(node).then(cp => cp <= afterReorgCheckpoint),
        'reorg detected',
        30,
        0.5,
      );

      // Wait for epoch 2 to start, then for proof to land with the surviving checkpoints.
      await test.waitUntilEpochStarts(2);
      const epochEndCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      expect(epochEndCheckpoint).toEqual(afterReorgCheckpoint);

      await test.waitUntilProvenCheckpointNumber(CheckpointNumber(epochEndCheckpoint), 240);
      expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(epochEndCheckpoint);
      logger.info(`Epoch 1 proven with last-slot checkpoint reorged out`);
    });
  });

  describe('checkpoint reorg during proving', () => {
    beforeEach(async () => {
      test = await EpochsTestContext.setup({
        enableProposerPipelining: false,
        maxSpeedUpAttempts: 0,
        cancelTxOnTimeout: false,
        aztecEpochDuration: 4,
        ethereumSlotDuration: 4,
        aztecSlotDuration: 36,
        blockDurationMs: 8000,
        minTxsPerBlock: 0,
        enforceTimeTable: true,
        aztecProofSubmissionEpochs: 1000,
        anvilSlotsInAnEpoch: 32,
      });
      ({ rollup, logger, context } = test);
      ({ L2_SLOT_DURATION_IN_S } = test);
      node = context.aztecNode;
    });

    it('handles a reorg arriving while proving is in progress', async () => {
      // Gate top-tree proving so it deterministically blocks until we release it.
      // This gives us a window where the job has been told `completeEpoch()` and is
      // mid-proof, and we can fire the reorg precisely during that window.
      const proverNode = test.proverNodes[0].getProverNode() as TestProverNode;
      const proverManager = proverNode.getProver();
      const origCreateTopTree = proverManager.createTopTreeOrchestrator.bind(proverManager);
      let releaseProvingGate: () => void = () => {};
      const provingGate = new Promise<void>(resolve => {
        releaseProvingGate = resolve;
      });
      proverManager.createTopTreeOrchestrator = () => {
        const topTree = origCreateTopTree();
        const origProve = topTree.prove.bind(topTree);
        topTree.prove = async (...args: Parameters<typeof origProve>) => {
          logger.warn('Top-tree proving gated — waiting for test to release');
          await provingGate;
          logger.warn('Proving gate released');
          return origProve(...args);
        };
        return topTree;
      };

      // Drive the chain forward until an epoch is ready to be proved.
      const initialCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      const targetCheckpoint = CheckpointNumber(initialCheckpoint + 2);
      await test.waitUntilCheckpointNumber(targetCheckpoint, L2_SLOT_DURATION_IN_S * 6);
      const currentEpoch = await epochOfCheckpoint(CheckpointNumber(test.monitor.checkpointNumber));
      await test.waitUntilEpochStarts(currentEpoch + 1);
      const epochEndCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      logger.info(`Epoch ${currentEpoch} ended at checkpoint ${epochEndCheckpoint}`);

      // Wait until the job hits the gate. Job state transitions to 'awaiting-prover'
      // immediately before awaiting `topTree.prove`, so this is our deterministic
      // signal that the job is now blocked inside proving.
      await retryUntil(
        async () => {
          const jobs = await proverNode.getJobs();
          return jobs.some(j => j.status === 'awaiting-prover');
        },
        'job blocks at proving gate',
        120,
        0.5,
      );
      logger.info('Job is blocked inside proving — firing reorg now');

      // Capture the in-flight job so we can poll its tracked-checkpoint count after
      // the reorg lands.
      const inFlightJob = proverNode.epochJobs.get(currentEpoch);
      if (!inFlightJob) {
        throw new Error(`No in-flight job for epoch ${currentEpoch}`);
      }
      const trackedBeforeReorg = inFlightJob.getCheckpointCount();

      // Stop block production so no replacement comes in.
      await context.aztecNodeAdmin!.setConfig({ skipPublishingCheckpointsPercent: 100 });

      // Reorg L1 deeply enough to actually remove the L1 block in which the last
      // checkpoint of the proving-in-progress epoch was published. L1 may have
      // mined several blocks between the checkpoint publish and now (votes,
      // attestations, slot ticks), so depth=1 is not always sufficient.
      const [cp] = await node.getCheckpoints(epochEndCheckpoint, 1, { includeL1PublishInfo: true });
      if (!cp.l1.published) {
        throw new Error(`Expected checkpoint ${epochEndCheckpoint} to have L1 publish info`);
      }
      const checkpointL1Block = Number(cp.l1.blockNumber);
      const currentL1Block = await context.cheatCodes.eth.blockNumber();
      const reorgDepth = currentL1Block - checkpointL1Block + 1;
      logger.info(
        `Reorging ${reorgDepth} L1 blocks (checkpoint ${epochEndCheckpoint} was published in L1 block ${checkpointL1Block}, current L1 block is ${currentL1Block})`,
      );
      await context.cheatCodes.eth.reorgWithReplacement(reorgDepth);
      const afterReorgCheckpoint = (await test.monitor.run(true)).checkpointNumber;
      expect(afterReorgCheckpoint).toBeLessThan(epochEndCheckpoint);
      logger.info(`Reorg fired: checkpoint ${afterReorgCheckpoint} (was ${epochEndCheckpoint})`);

      // Wait until the prover-node observes the prune and removes the reorged-out
      // checkpoint(s) from the in-flight job. This is the prerequisite for the
      // restart-with-survivors path: when we release the gate below, the cancelled
      // top tree throws `TopTreeCancelledError` and the finalize loop rebuilds with
      // the surviving checkpoints. Without this wait we'd race the L2BlockStream
      // poll and risk top tree #1 starting its real prove before cancellation lands.
      await retryUntil(
        () => Promise.resolve(inFlightJob.getCheckpointCount() < trackedBeforeReorg),
        'prover-node sees the prune and trims the in-flight job',
        30,
        0.2,
      );
      logger.info(
        `Prover-node trimmed in-flight job: ${trackedBeforeReorg} → ${inFlightJob.getCheckpointCount()} tracked checkpoints`,
      );

      // Release the gate. The cancelled top tree #1 short-circuits with
      // TopTreeCancelledError, the finalize loop restarts with the surviving sub-trees,
      // and a fresh top tree submits a valid proof for checkpoints 1..afterReorgCheckpoint.
      releaseProvingGate();

      // The in-flight epoch should now be proven on L1
      await test.waitUntilProvenCheckpointNumber(CheckpointNumber(afterReorgCheckpoint), 240);
      expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(afterReorgCheckpoint);
      logger.info(`In-flight epoch proven up to surviving checkpoint ${afterReorgCheckpoint}`);
    });
  });
});
