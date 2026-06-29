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
