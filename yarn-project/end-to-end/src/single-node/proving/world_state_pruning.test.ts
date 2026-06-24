import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber } from '@aztec/foundation/branded-types';

import { SingleNodeTestContext, WORLD_STATE_CHECKPOINT_HISTORY, jest } from './setup.js';

// Verifies that multiple consecutive epochs are proven successfully and that world-state checkpoints
// are pruned after finalization. SingleNodeTestContext defaults: single node, prod-seq, interval
// mining, ethSlot=8s (12s CI), aztecSlot=16s (24s CI), epoch=6, proofSubmissionEpochs=1, fake prover.
// TARGET_PROVEN_EPOCHS env var controls iteration count. Assumes one block per checkpoint.
describe('single-node/proving/world_state_pruning', () => {
  let rollup: RollupContract;
  let logger: Logger;

  let test: SingleNodeTestContext;

  beforeEach(async () => {
    test = await SingleNodeTestContext.setup({});
    ({ rollup, logger } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Loops through targetProvenEpochs epochs: waits for each epoch to end, asserts it is proven,
  // then verifies the epoch-end block is accessible as a historic block and that earlier blocks
  // beyond the checkpoint history window have been purged from world state.
  it('successfully proves multiple epochs', async () => {
    const targetProvenEpochs = process.env.TARGET_PROVEN_EPOCHS ? parseInt(process.env.TARGET_PROVEN_EPOCHS) : 3;
    let epochNumber = 0;
    logger.info(`Testing for ${targetProvenEpochs} epochs to be proven`);

    while (epochNumber < targetProvenEpochs) {
      logger.info(`Waiting for the end of epoch ${epochNumber}`);
      await test.waitUntilEpochStarts(epochNumber + 1);
      const epochEndCheckpointNumber = (await test.monitor.run()).checkpointNumber;
      logger.info(`Epoch ${epochNumber} ended with pending checkpoint number ${epochEndCheckpointNumber}`);

      await test.waitUntilProvenCheckpointNumber(epochEndCheckpointNumber, 240);
      expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(epochEndCheckpointNumber);
      logger.info(`Reached proven checkpoint number ${epochEndCheckpointNumber}, epoch ${epochNumber} is now proven`);
      epochNumber++;

      // Verify the state syncs. Assumes one block per checkpoint.
      const epochEndBlockNumber = BlockNumber.fromCheckpointNumber(epochEndCheckpointNumber);
      await test.waitForNodeToSync(epochEndBlockNumber, 'proven');
      await test.verifyHistoricBlock(epochEndBlockNumber, true);

      // Check that finalized blocks are purged from world state.
      // Anvil is started with --slots-in-an-epoch 1, so 'finalized' = latest - 2. By the time
      // we reach this point the proof has been on L1 for many blocks, so the finalized L1 block
      // is past the proof submission block, making finalized checkpoint == proven checkpoint.
      // This test is setup as 1 block per checkpoint.
      const provenBlockNumber = epochEndBlockNumber;
      const finalizedBlockNumber = provenBlockNumber;
      const expectedOldestHistoricBlock = Math.max(finalizedBlockNumber - WORLD_STATE_CHECKPOINT_HISTORY + 1, 1);
      const expectedBlockRemoved = expectedOldestHistoricBlock - 1;
      await test.waitForNodeToSync(BlockNumber(expectedOldestHistoricBlock), 'historic');
      await test.verifyHistoricBlock(BlockNumber(expectedOldestHistoricBlock), true);
      if (expectedBlockRemoved > 0) {
        await test.verifyHistoricBlock(BlockNumber(expectedBlockRemoved), false);
      }
    }
    logger.info('Test Succeeded');
  });
});
