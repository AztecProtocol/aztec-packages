import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import { ChainMonitor } from '@aztec/ethereum/test';
import { sleep } from '@aztec/foundation/sleep';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { SingleNodeTestContext, jest, setupWithProver } from './setup.js';

// Starts a prover node (fake proofs) on the default setup, raises minTxsPerBlock=1 so blocks are
// empty, then verifies the prover still submits a proof for those empty-block checkpoints within the
// proof submission window.
describe('single-node/proving/empty_blocks', () => {
  let context: EndToEndContext;
  let rollup: RollupContract;
  let logger: Logger;
  let monitor: ChainMonitor;

  let L1_BLOCK_TIME_IN_S: number;

  let test: SingleNodeTestContext;

  beforeEach(async () => {
    // Shrink the slot cadence from the 12s/24s CI default to the 4s/12s floor (the same proven
    // floor `multi_proof` uses for empty-checkpoint epoch-0 proving on this single-node topology):
    // the body waits in real wall-clock for the production sequencer to march through epoch 0 (one
    // empty checkpoint per L2 slot) before the prover proves it, and that timeline scales with the
    // slot duration. 12s is the floor for the 3s-block timing model.
    test = await setupWithProver({ ethereumSlotDuration: 4, aztecSlotDurationInL1Slots: 3 });
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
    // Wait in real wall-clock for the sequencer to march through epoch 0 building its empty checkpoint.
    // The slot-cadence cut in setup already halves this; a clock warp to the boundary is NOT used —
    // it skips the sequencer's build window and leaves epoch 0 with no checkpoint to prove (the guard
    // below would then fire).
    await test.waitUntilEpochStarts(1);

    // Sleep to make sure any pending checkpoints are published. We deliberately keep the fixed
    // sleep rather than waiting for the sequencer to reach IDLE: the sequencer is typically already
    // idle here, so an IDLE wait would return immediately and not give the in-flight L1 publish time
    // to land. The window we need is the publish settling, not the sequencer becoming idle.
    await sleep(L1_BLOCK_TIME_IN_S * 1000);
    const checkpointNumberAtEndOfEpoch0 = await rollup.getCheckpointNumber();
    logger.info(`Starting epoch 1 after checkpoint ${checkpointNumberAtEndOfEpoch0}`);

    // Guard against a vacuous pass: an empty checkpoint must have actually been built in epoch 0 for
    // there to be something to prove. Without this, if the warp ever left no build window the proven
    // wait would resolve immediately at checkpoint 0 and the test would pass without testing anything.
    expect(checkpointNumberAtEndOfEpoch0).toBeGreaterThan(0);

    await test.waitUntilProvenCheckpointNumber(checkpointNumberAtEndOfEpoch0, 240);
    expect(monitor.checkpointNumber).toEqual(checkpointNumberAtEndOfEpoch0);
    logger.info(`Test succeeded`);
  });
});
