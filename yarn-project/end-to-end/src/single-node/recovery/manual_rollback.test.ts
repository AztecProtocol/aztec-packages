import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { RollupContract } from '@aztec/ethereum/contracts';
import { CheckpointNumber } from '@aztec/foundation/branded-types';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { waitForBlockNumber } from '../../fixtures/wait_helpers.js';
import { SingleNodeTestContext, jest, setupWithProver } from './setup.js';

// Exercises the aztecNodeAdmin.rollbackTo() API. Default SingleNodeTestContext with a very long epoch
// (aztecEpochDuration=100) so there are no L2 reorgs, no finalized blocks, and the full pending chain
// is prunable. Actively drives L1 via cheatcodes (reorgTo to remove blocks).
describe('single-node/recovery/manual_rollback', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let node: AztecNode;
  let rollup: RollupContract;

  let test: SingleNodeTestContext;

  beforeEach(async () => {
    test = await setupWithProver({ aztecEpochDuration: 100 }); // No L2 reorgs, no finalized blocks
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
    // The production sequencer publishes one empty checkpoint per L2 slot, gated by L1 wall-clock,
    // so left alone these 4 checkpoints cost ~4 slots of real time. Instead, after each checkpoint
    // lands, warp the L1 clock one slot forward so the sequencer builds and publishes the next
    // empty checkpoint immediately. Advancing exactly one slot at a time, only after the prior
    // checkpoint is confirmed on-chain, keeps the one-checkpoint-per-L1-block layout unchanged, so
    // the subsequent `reorg(2)` removes the same checkpoints it would have without warping.
    while (test.monitor.checkpointNumber < targetCheckpointNumber) {
      const next = CheckpointNumber.add(test.monitor.checkpointNumber, 1);
      await test.waitUntilCheckpointNumber(next, test.L2_SLOT_DURATION_IN_S * 4);
      if (test.monitor.checkpointNumber < targetCheckpointNumber) {
        await test.context.cheatCodes.rollup.advanceToNextSlot();
      }
    }
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
