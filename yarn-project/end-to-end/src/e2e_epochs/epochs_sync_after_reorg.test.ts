import type { AztecNodeService } from '@aztec/aztec-node';
import type { Logger } from '@aztec/aztec.js/log';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { executeTimeout } from '@aztec/foundation/timer';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

// Suite: regression test ensuring a new node can sync world-state after an unpruned reorg
// (issue #12206). EpochsTestContext with single node, no prover, prod-seq, interval mining.
// Timing: all defaults (ethSlot=8s/12s CI, aztecSlot=16s/24s, epoch=6, proofSubmissionEpochs=1).
// The test stops the sequencer mid-run, advances into epoch 2 via waitUntilEpochStarts, then
// creates a second node and verifies it syncs cleanly despite the reorg window.
describe('e2e_epochs/epochs_sync_after_reorg', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let L2_SLOT_DURATION_IN_S: number;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup({ startProverNode: false }); // no prover!
    ({ context, logger } = test);
    ({ L2_SLOT_DURATION_IN_S } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Regression for https://github.com/AztecProtocol/aztec-packages/issues/12206.
  // Waits for 5 checkpoints, stops the main sequencer node, waits for epoch 2 to start (creating
  // a reorg window), then creates a fresh non-validator node with a 10s timeout and verifies its
  // block number is 0 (it did not get stuck on a reorg'd block).
  it('new node can sync world-state after unpruned reorg', async () => {
    // Wait until there are a few checkpoints in there
    // With pipelining, each checkpoint takes ~2 L2 slots (the sequencer must wait for
    // the L1 tx of the previous checkpoint to land before it can build the next one).
    await test.waitUntilCheckpointNumber(CheckpointNumber(5), L2_SLOT_DURATION_IN_S * 12 + 30);

    // Stop the node generating blocks
    logger.warn(`Stopping the main node`);
    await (context.aztecNode as AztecNodeService).stop();

    // Wait for an extra epoch, so a reorg would invalidate these blocks
    await test.waitUntilEpochStarts(2);

    // Add a new node and watch it sync
    // We add a timeout since the archiver never finishes syncing and this promise does not resolve is the bug is not fixed
    logger.warn(`Syncing new node`);
    const node = await executeTimeout(() => test.createNonValidatorNode(), 10_000, `new node sync`);
    expect(await node.getBlockNumber()).toEqual(0);
    logger.info(`Test succeeded`);
  });
});
