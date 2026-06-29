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
    // Run at the 4s/12s slot-cadence floor: the body waits in real wall-clock for the production sequencer
    // to march through an epoch (one empty checkpoint per L2 slot) before the prover proves it, and that
    // timeline scales with the slot duration. 12s is the floor for the 3s-block timing model.
    test = await setupWithProver({ ethereumSlotDuration: 4, aztecSlotDurationInL1Slots: 3 });
    ({ context, rollup, logger, monitor, L1_BLOCK_TIME_IN_S } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Raises minTxsPerBlock to 1 so the sequencer cannot build blocks, anchors on a fresh epoch and waits
  // for it to elapse, then waits for the prover to submit a proof for the empty checkpoint. Asserts that
  // the monitor's checkpointNumber matches the proven target, confirming the proof landed on L1.
  it('submits proof even if there are no txs to build a block', async () => {
    context.sequencer?.updateConfig({ minTxsPerBlock: 1 });
    // Anchor on a freshly-started epoch rather than epoch 0: under CI load the node's sequencer can come
    // up after the chain has already advanced past epoch 0's slots, leaving epoch 0 with no checkpoint to
    // prove. Wait for the next epoch to start (sequencer running) then for it to fully elapse, so its
    // empty checkpoints are closed on L1 and eligible for proving. A clock warp is NOT used: it would skip
    // the sequencer's build window and leave the epoch with no checkpoint to prove (the guard below fires).
    const epoch = await test.waitUntilNextEpochStarts();
    await test.waitUntilEpochStarts(epoch + 1);

    // Sleep to make sure any pending checkpoints are published. We deliberately keep the fixed
    // sleep rather than waiting for the sequencer to reach IDLE: the sequencer is typically already
    // idle here, so an IDLE wait would return immediately and not give the in-flight L1 publish time
    // to land. The window we need is the publish settling, not the sequencer becoming idle.
    await sleep(L1_BLOCK_TIME_IN_S * 1000);
    const checkpointNumber = await rollup.getCheckpointNumber();
    logger.info(`Anchored on epoch ${epoch}, ending at checkpoint ${checkpointNumber}`);

    // Guard against a vacuous pass: an empty checkpoint must have actually been built for there to be
    // something to prove. Without this, if no checkpoint was built the proven wait would resolve
    // immediately at checkpoint 0 and the test would pass without testing anything.
    expect(checkpointNumber).toBeGreaterThan(0);

    await test.waitUntilProvenCheckpointNumber(checkpointNumber, 240);
    expect(monitor.checkpointNumber).toEqual(checkpointNumber);
    logger.info(`Test succeeded`);
  });
});
