import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import { CheckpointNumber } from '@aztec/foundation/branded-types';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext, WORLD_STATE_BLOCK_HISTORY } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 15);

describe('e2e_epochs/epochs_multiple', () => {
  let context: EndToEndContext;
  let rollup: RollupContract;
  let logger: Logger;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup();
    ({ context, rollup, logger } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('successfully proves multiple epochs', async () => {
    const targetProvenEpochs = process.env.TARGET_PROVEN_EPOCHS ? parseInt(process.env.TARGET_PROVEN_EPOCHS) : 3;
    const targetProvenCheckpointNumber = CheckpointNumber(targetProvenEpochs * test.epochDuration);

    let provenCheckpointNumber = CheckpointNumber(0);
    let epochNumber = 0;
    logger.info(`Waiting for ${targetProvenEpochs} epochs to be proven at ${targetProvenCheckpointNumber} checkpoints`);
    while (provenCheckpointNumber < targetProvenCheckpointNumber) {
      logger.info(`Waiting for the end of epoch ${epochNumber}`);
      await test.waitUntilEpochStarts(epochNumber + 1);
      const epochTargetCheckpointNumber = await rollup.getCheckpointNumber();
      logger.info(`Epoch ${epochNumber} ended with PENDING checkpoint number ${epochTargetCheckpointNumber}`);
      await test.waitUntilCheckpointNumber(
        epochTargetCheckpointNumber,
        test.L2_SLOT_DURATION_IN_S * (epochTargetCheckpointNumber + 4),
      );
      provenCheckpointNumber = epochTargetCheckpointNumber;
      logger.info(
        `Reached PENDING checkpoint ${epochTargetCheckpointNumber}, proving should now start, waiting for PROVEN checkpoint to reach ${provenCheckpointNumber}`,
      );
      await test.waitUntilProvenCheckpointNumber(provenCheckpointNumber, 240);
      expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(provenCheckpointNumber);
      logger.info(`Reached PROVEN checkpoint number ${provenCheckpointNumber}, epoch ${epochNumber} is now proven`);
      epochNumber++;

      // Verify the state syncs
      await test.waitForNodeToSync(provenCheckpointNumber, 'proven');
      await test.verifyHistoricBlock(provenCheckpointNumber, true);

      // right now finalization means a checkpoint is two L2 epochs deep. If this rule changes then we need this test needs to be updated
      const provenBlockNumber = Number(provenCheckpointNumber);
      const finalizedBlockNumber = Math.max(provenBlockNumber - context.config.aztecEpochDuration * 2, 0);
      const expectedOldestHistoricBlock = Math.max(finalizedBlockNumber - WORLD_STATE_BLOCK_HISTORY + 1, 1);
      const expectedBlockRemoved = expectedOldestHistoricBlock - 1;
      await test.waitForNodeToSync(expectedOldestHistoricBlock, 'historic');
      await test.verifyHistoricBlock(expectedOldestHistoricBlock, true);
      if (expectedBlockRemoved > 0) {
        await test.verifyHistoricBlock(expectedBlockRemoved, false);
      }
    }
    logger.info('Test Succeeded');
  });
});
