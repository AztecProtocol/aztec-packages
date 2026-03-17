import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber } from '@aztec/foundation/branded-types';

import { jest } from '@jest/globals';

import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 15);

// Assumes one block per checkpoint
describe('e2e_epochs/epochs_multiple', () => {
  let rollup: RollupContract;
  let logger: Logger;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup();
    ({ rollup, logger } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

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
    }
    logger.info('Test Succeeded');
  });
});
