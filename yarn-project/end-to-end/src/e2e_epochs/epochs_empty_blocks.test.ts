import { type Logger, sleep } from '@aztec/aztec.js';
import { ChainMonitor } from '@aztec/aztec.js/ethereum';
// eslint-disable-next-line no-restricted-imports
import { RollupContract } from '@aztec/ethereum/contracts';

import { jest } from '@jest/globals';

import { type EndToEndContext } from '../fixtures/utils.js';
import {
  EPOCH_DURATION_IN_L2_SLOTS,
  EpochsTestContext,
  L1_BLOCK_TIME_IN_S,
  WORLD_STATE_BLOCK_HISTORY,
} from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_epochs/epochs_empty_blocks', () => {
  let context: EndToEndContext;
  let rollup: RollupContract;
  let logger: Logger;
  let monitor: ChainMonitor;

  let test: EpochsTestContext;

  beforeEach(async () => {
    test = await EpochsTestContext.setup();
    ({ context, rollup, logger, monitor } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('submits proof even if there are no txs to build a block', async () => {
    await context.sequencer?.updateSequencerConfig({ minTxsPerBlock: 1 });
    await test.waitUntilEpochStarts(1);

    // Sleep to make sure any pending blocks are published
    await sleep(L1_BLOCK_TIME_IN_S * 1000);
    const blockNumberAtEndOfEpoch0 = Number(await rollup.getBlockNumber());
    logger.info(`Starting epoch 1 after L2 block ${blockNumberAtEndOfEpoch0}`);

    await test.waitUntilProvenL2BlockNumber(blockNumberAtEndOfEpoch0, 120);
    expect(monitor.l2BlockNumber).toEqual(blockNumberAtEndOfEpoch0);
    logger.info(`Test succeeded`);
  });

  it('successfully proves multiple epochs', async () => {
    const targetProvenEpochs = 8;
    const targetProvenBlockNumber = targetProvenEpochs * EPOCH_DURATION_IN_L2_SLOTS;

    let provenBlockNumber = 0;
    let epochNumber = 0;
    while (provenBlockNumber < targetProvenBlockNumber) {
      logger.info(`Waiting for the end of epoch ${epochNumber}`);
      await test.waitUntilEpochStarts(epochNumber + 1);
      const epochTargetBlockNumber = Number(await rollup.getBlockNumber());
      logger.info(`Epoch ${epochNumber} ended with PENDING block number ${epochTargetBlockNumber}`);
      await test.waitUntilL2BlockNumber(epochTargetBlockNumber);
      provenBlockNumber = epochTargetBlockNumber;
      logger.info(
        `Reached PENDING L2 block ${epochTargetBlockNumber}, proving should now start, waiting for PROVEN block to reach ${provenBlockNumber}`,
      );
      await test.waitUntilProvenL2BlockNumber(provenBlockNumber, 120);
      expect(Number(await rollup.getProvenBlockNumber())).toBe(provenBlockNumber);
      logger.info(`Reached PROVEN block number ${provenBlockNumber}, epoch ${epochNumber} is now proven`);
      epochNumber++;

      // Verify the state syncs
      await test.waitForNodeToSync(provenBlockNumber, 'finalised');
      await test.verifyHistoricBlock(provenBlockNumber, true);
      const expectedOldestHistoricBlock = provenBlockNumber - WORLD_STATE_BLOCK_HISTORY + 1;
      const expectedBlockRemoved = expectedOldestHistoricBlock - 1;
      await test.waitForNodeToSync(expectedOldestHistoricBlock, 'historic');
      await test.verifyHistoricBlock(Math.max(expectedOldestHistoricBlock, 1), true);
      if (expectedBlockRemoved > 0) {
        await test.verifyHistoricBlock(expectedBlockRemoved, false);
      }
    }
    logger.info('Test Succeeded');
  });
});
