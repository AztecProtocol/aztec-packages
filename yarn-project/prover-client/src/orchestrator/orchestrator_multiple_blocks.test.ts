import { timesAsync } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';

import { TestContext } from '../mocks/test_context.js';

const logger = createDebugLogger('aztec:orchestrator-multi-blocks');

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
      const txCount = 1;
      const blocks = await timesAsync(numBlocks, i => context.makePendingBlock(txCount, 0, i + 1));

      logger.info(`Starting new epoch with ${numBlocks}`);
      context.orchestrator.startNewEpoch(1, numBlocks);
      for (const { block, txs } of blocks) {
        await context.orchestrator.startNewBlock(Math.max(txCount, 2), block.header.globalVariables, []);
        for (const tx of txs) {
          await context.orchestrator.addNewTx(tx);
        }
        await context.orchestrator.setBlockCompleted(block.number);
      }

      logger.info('Finalising epoch');
      const epoch = await context.orchestrator.finaliseEpoch();
      expect(epoch.publicInputs.endBlockNumber.toNumber()).toEqual(numBlocks);
      expect(epoch.proof).toBeDefined();
    });

    it.each([1, 4, 5])('builds an epoch with %s blocks in parallel', async (numBlocks: number) => {
      logger.info(`Seeding world state with ${numBlocks} blocks`);
      const txCount = 1;
      const blocks = await timesAsync(numBlocks, i => context.makePendingBlock(txCount, 0, i + 1));

      logger.info(`Starting new epoch with ${numBlocks}`);
      context.orchestrator.startNewEpoch(1, numBlocks);
      await Promise.all(
        blocks.map(async ({ block, txs }) => {
          await context.orchestrator.startNewBlock(Math.max(txCount, 2), block.header.globalVariables, []);
          await Promise.all(txs.map(tx => context.orchestrator.addNewTx(tx)));
          await context.orchestrator.setBlockCompleted(block.number);
        }),
      );

      logger.info('Finalising epoch');
      const epoch = await context.orchestrator.finaliseEpoch();
      expect(epoch.publicInputs.endBlockNumber.toNumber()).toEqual(numBlocks);
      expect(epoch.proof).toBeDefined();
    });
  });
});
