import type { AztecNodeService } from '@aztec/aztec-node';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { RollupContract } from '@aztec/ethereum/contracts';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { executeTimeout } from '@aztec/foundation/timer';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { waitForBlockNumber } from '../../fixtures/wait_helpers.js';
import { SingleNodeTestContext } from '../single_node_test_context.js';

jest.setTimeout(1000 * 60 * 10);

// Co-located single-node reorg-recovery suites: `manual_rollback` exercises the rollbackTo admin API,
// `sync_after_reorg` is a regression for a new node syncing past an unpruned reorg window. They share
// the single-node, reorg-adjacent shape but use different epoch lengths, so each keeps its own setup.

// Exercises the aztecNodeAdmin.rollbackTo() API. Default SingleNodeTestContext with a very long epoch
// (aztecEpochDuration=100) so there are no L2 reorgs, no finalized blocks, and the full pending chain
// is prunable. Actively drives L1 via cheatcodes (reorgTo to remove blocks).
describe('multi-node/single-node/manual_rollback', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let node: AztecNode;
  let rollup: RollupContract;

  let test: SingleNodeTestContext;

  beforeEach(async () => {
    test = await SingleNodeTestContext.setup({ aztecEpochDuration: 100 }); // No L2 reorgs, no finalized blocks
    ({ context, logger, rollup } = test);
    ({ aztecNode: node } = context);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Waits for checkpoint 4, pauses node sync, reorgs L1 by 2 blocks, calls rollbackTo on the
  // node, and asserts blockNumber equals the rolled-back value. Resumes sync and verifies the
  // node re-syncs to the same block.
  it('manually rolls back to an unfinalized block', async () => {
    logger.info(`Starting manual rollback test to unfinalized block`);
    context.sequencer?.updateConfig({ minTxsPerBlock: 0 });
    const targetCheckpointNumber = CheckpointNumber(4);
    // With pipelining, each checkpoint takes ~2 L2 slots on a solo-sequencer setup.
    await test.waitUntilCheckpointNumber(targetCheckpointNumber, test.L2_SLOT_DURATION_IN_S * 12);
    await waitForBlockNumber(node, 4, { timeout: 10 });

    logger.info(`Synced to checkpoint 4. Pausing syncing and rolling back the chain.`);
    await context.aztecNodeAdmin.pauseSync();
    context.sequencer?.updateConfig({ minTxsPerBlock: 100 }); // Ensure no new blocks are produced
    await context.cheatCodes.eth.reorg(2);
    const checkpointAfterReorg = await rollup.getCheckpointNumber();
    expect(checkpointAfterReorg).toBeLessThan(targetCheckpointNumber);
    logger.info(`Rolled back to checkpoint ${checkpointAfterReorg}.`);

    logger.info(`Manually rolling back node to ${checkpointAfterReorg - 1}.`);
    const blockAfterReorg = Number(checkpointAfterReorg - 1);
    await context.aztecNodeAdmin.rollbackTo(blockAfterReorg);
    expect(await node.getBlockNumber()).toEqual(blockAfterReorg);

    logger.info(`Waiting for node to re-sync to ${blockAfterReorg}.`);
    await waitForBlockNumber(node, blockAfterReorg, { timeout: 10 });
  });
});

// Regression test ensuring a new node can sync world-state after an unpruned reorg (issue #12206).
// SingleNodeTestContext with single node, no prover, prod-seq, interval mining. Timing: all defaults
// (ethSlot=8s/12s CI, aztecSlot=16s/24s, epoch=6, proofSubmissionEpochs=1). The test stops the
// sequencer mid-run, advances into epoch 2 via waitUntilEpochStarts, then creates a second node and
// verifies it syncs cleanly despite the reorg window.
describe('multi-node/single-node/sync_after_reorg', () => {
  let context: EndToEndContext;
  let logger: Logger;

  let L2_SLOT_DURATION_IN_S: number;

  let test: SingleNodeTestContext;

  beforeEach(async () => {
    test = await SingleNodeTestContext.setup({ startProverNode: false }); // no prover!
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
