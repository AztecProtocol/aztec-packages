import { timesAsync } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';

import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('prover-client:test:orchestrator-multi-blocks');

describe('prover/orchestrator/multi-block', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await TestContext.new(logger);
    context.orchestrator.isVerifyBuiltBlockAgainstSyncedStateEnabled = true;
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('multiple blocks', () => {
    it.each([1, 4, 5])('builds an epoch with %s blocks in sequence', async (numBlocks: number) => {
      logger.info(`Seeding world state with ${numBlocks} blocks`);
      const txCount = 2;
      const blocks = await timesAsync(numBlocks, i => context.makePendingBlock(txCount, 0, i + 1));

      logger.info(`Starting new epoch with ${numBlocks}`);
      context.orchestrator.startNewEpoch(1, 1, numBlocks);
      for (const { block, txs } of blocks) {
        await context.orchestrator.startNewBlock(block.header.globalVariables, []);
        await context.orchestrator.addTxs(txs);
        await context.orchestrator.setBlockCompleted(block.number);
      }

      logger.info('Finalising epoch');
      const epoch = await context.orchestrator.finaliseEpoch();
      expect(epoch.publicInputs.endBlockNumber.toNumber()).toEqual(numBlocks);
      expect(epoch.proof).toBeDefined();
    });

    it.each([1, 4, 5])('builds an epoch with %s blocks in parallel', async (numBlocks: number) => {
      logger.info(`Seeding world state with ${numBlocks} blocks`);
      const txCount = 2;
      const blocks = await timesAsync(numBlocks, i => context.makePendingBlock(txCount, 0, i + 1));

      logger.info(`Starting new epoch with ${numBlocks}`);
      context.orchestrator.startNewEpoch(1, 1, numBlocks);
      await Promise.all(
        blocks.map(async ({ block, txs }) => {
          await context.orchestrator.startNewBlock(block.header.globalVariables, []);
          await context.orchestrator.addTxs(txs);
          await context.orchestrator.setBlockCompleted(block.number);
        }),
      );

      logger.info('Finalising epoch');
      const epoch = await context.orchestrator.finaliseEpoch();
      expect(epoch.publicInputs.endBlockNumber.toNumber()).toEqual(numBlocks);
      expect(epoch.proof).toBeDefined();
    });

    it('builds two consecutive epochs', async () => {
      const numEpochs = 2;
      const numBlocks = 4;
      const txCount = 2;
      logger.info(`Seeding world state with ${numBlocks * numEpochs} blocks`);
      const blocks = await timesAsync(numBlocks * numEpochs, i => context.makePendingBlock(txCount, 0, i + 1));

      for (let epochIndex = 0; epochIndex < numEpochs; epochIndex++) {
        logger.info(`Starting epoch ${epochIndex + 1} with ${numBlocks} blocks`);
        context.orchestrator.startNewEpoch(epochIndex + 1, epochIndex * numBlocks + 1, numBlocks);
        await Promise.all(
          blocks.slice(epochIndex * numBlocks, (epochIndex + 1) * numBlocks).map(async ({ block, txs }) => {
            await context.orchestrator.startNewBlock(block.header.globalVariables, []);
            await context.orchestrator.addTxs(txs);
            await context.orchestrator.setBlockCompleted(block.number);
          }),
        );

        logger.info('Finalising epoch');
        const epoch = await context.orchestrator.finaliseEpoch();
        expect(epoch.publicInputs.endBlockNumber.toNumber()).toEqual(numBlocks + epochIndex * numBlocks);
        expect(epoch.proof).toBeDefined();
      }
    });
  });
});
