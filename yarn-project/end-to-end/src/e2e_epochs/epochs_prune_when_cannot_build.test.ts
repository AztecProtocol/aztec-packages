import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import { ChainMonitor } from '@aztec/ethereum/test';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

// Single-sequencer suite for the failed-sync prune fallback (A-1260). The proposer cannot build while
// its sync is paused, so the only way the pending chain can be wound back to proven is the
// `Sequencer.tryVoteAndPruneWhenCannotBuild` path. With no prover node, epoch 0 never proves, so once
// its proof-submission window closes the chain becomes prunable and the proposer's fallback must call
// `prune()` despite being unable to propose.
//
// Timing: ethSlot=8s, aztecSlot=2×8=16s, epoch=8, proofSubmissionEpochs=1.
describe('e2e_epochs/epochs_prune_when_cannot_build', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let rollup: RollupContract;
  let monitor: ChainMonitor;

  let L2_SLOT_DURATION_IN_S: number;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup({
      startProverNode: false, // Nothing ever proves epoch 0, so its pending chain stays unproven and becomes prunable.
      ethereumSlotDuration: 8,
      aztecEpochDuration: 8, // Long enough to land a few checkpoints in epoch 0.
      aztecSlotDurationInL1Slots: 2,
      aztecProofSubmissionEpochs: 1, // Pending chain becomes prunable one proof window after epoch 0.
      minTxsPerBlock: 0, // Solo proposer advances the pending chain on empty checkpoints.
    });
    ({ context, logger, rollup, monitor } = test);
    ({ L2_SLOT_DURATION_IN_S } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('prunes the pending chain via the fallback path when it cannot propose', async () => {
    // Build a few checkpoints in epoch 0 so there is a pending chain to prune. Nothing proves them.
    const targetCheckpointNumber = CheckpointNumber(3);
    await test.waitUntilCheckpointNumber(targetCheckpointNumber, L2_SLOT_DURATION_IN_S * 12);

    const pendingBeforePause = await rollup.getCheckpointNumber();
    const provenBeforePause = await rollup.getProvenCheckpointNumber();
    logger.info(`Built pending checkpoint ${pendingBeforePause}, proven is ${provenBeforePause}`);
    expect(provenBeforePause).toEqual(CheckpointNumber(0));
    expect(pendingBeforePause).toBeGreaterThanOrEqual(targetCheckpointNumber);

    // Pause sync but leave the sequencer running: the proposer's checkSync now fails every slot, so it
    // can never propose(). The normal propose-path auto-prune therefore cannot fire — the only way the
    // chain can prune is the new tryVoteAndPruneWhenCannotBuild fallback.
    logger.info(`Pausing node sync so the proposer can no longer build`);
    await context.aztecNodeAdmin.pauseSync();

    // Let epoch 0's proof submission window expire so canPruneAtTime becomes true. Advance one more slot
    // past the deadline so the proposer gets a fresh slot to run its fallback in.
    logger.info(`Waiting for the proof submission window of epoch 0 to expire`);
    await test.waitUntilLastSlotOfProofSubmissionWindow(0);
    const lastBlockTs = BigInt(await context.cheatCodes.eth.lastBlockTimestamp());
    await context.cheatCodes.eth.warp(Number(lastBlockTs) + L2_SLOT_DURATION_IN_S * 2, { resetBlockInterval: true });

    // The fallback path winds the pending tip back to proven. The monitor reads L1 directly (not the
    // paused node's archiver), so it observes the prune even while sync is paused.
    logger.info(`Waiting for the pending chain to be pruned back to proven`);
    await retryUntil(
      async () => (await rollup.getCheckpointNumber()) <= (await rollup.getProvenCheckpointNumber()),
      'pending chain pruned back to proven',
      L2_SLOT_DURATION_IN_S * 8,
      0.2,
    );

    const pendingAfterPrune = await rollup.getCheckpointNumber();
    const provenAfterPrune = await rollup.getProvenCheckpointNumber();
    logger.info(`Pruned: pending ${pendingAfterPrune}, proven ${provenAfterPrune}`);
    expect(provenAfterPrune).toEqual(CheckpointNumber(0));
    expect(pendingAfterPrune).toEqual(provenAfterPrune);
    expect(pendingAfterPrune).toBeLessThan(pendingBeforePause);

    // Sanity: the monitor (driven off L1 on its own poll loop) eventually agrees the pending tip dropped
    // to proven. Polled because the monitor refreshes asynchronously and may lag the direct rollup read.
    await retryUntil(
      () => Promise.resolve(monitor.checkpointNumber <= monitor.provenCheckpointNumber),
      'monitor observes pruned tip',
      L2_SLOT_DURATION_IN_S * 2,
      0.2,
    );
    expect(monitor.checkpointNumber).toEqual(monitor.provenCheckpointNumber);
  });
});
