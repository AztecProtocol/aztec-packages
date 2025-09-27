import type { Logger } from '@aztec/aztec.js';
import { RollupContract } from '@aztec/ethereum/contracts';

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
    const targetProvenBlockNumber = targetProvenEpochs * test.epochDuration;

    let provenBlockNumber = 0;
    let epochNumber = 0;
    logger.info(`Waiting for ${targetProvenEpochs} epochs to be proven at ${targetProvenBlockNumber} L2 blocks`);
    while (provenBlockNumber < targetProvenBlockNumber) {
      logger.info(`Waiting for the end of epoch ${epochNumber}`);
      await test.waitUntilEpochStarts(epochNumber + 1);
      const epochTargetBlockNumber = Number(await rollup.getBlockNumber());
      logger.info(`Epoch ${epochNumber} ended with PENDING block number ${epochTargetBlockNumber}`);
      await test.waitUntilL2BlockNumber(
        epochTargetBlockNumber,
        test.L2_SLOT_DURATION_IN_S * (epochTargetBlockNumber + 4),
      );
      provenBlockNumber = epochTargetBlockNumber;
      logger.info(
        `Reached PENDING L2 block ${epochTargetBlockNumber}, proving should now start, waiting for PROVEN block to reach ${provenBlockNumber}`,
      );
      await test.waitUntilProvenL2BlockNumber(provenBlockNumber, 240);
      expect(Number(await rollup.getProvenBlockNumber())).toBeGreaterThanOrEqual(provenBlockNumber);
      logger.info(`Reached PROVEN block number ${provenBlockNumber}, epoch ${epochNumber} is now proven`);
      epochNumber++;

      // Verify the state syncs
      await test.waitForNodeToSync(provenBlockNumber, 'proven');
      await test.verifyHistoricBlock(provenBlockNumber, true);

      // right now finalization means a block is two L2 epochs deep. If this rule changes then we need this test needs to be updated
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
