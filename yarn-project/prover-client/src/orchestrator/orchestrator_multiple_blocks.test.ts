import { createDebugLogger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';

import { makeBloatedProcessedTx, makeGlobals } from '../mocks/fixtures.js';
import { TestContext } from '../mocks/test_context.js';

const logger = createDebugLogger('aztec:orchestrator-multi-blocks');

describe('prover/orchestrator/multi-block', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('multiple blocks', () => {
    it.each([1, 4, 5])('builds an epoch with %s blocks in sequence', async (numBlocks: number) => {
      context.orchestrator.startNewEpoch(1, numBlocks);
      let header = context.actualDb.getInitialHeader();

      for (let i = 0; i < numBlocks; i++) {
        logger.info(`Creating block ${i + 1000}`);
        const tx = makeBloatedProcessedTx(context.actualDb, i + 1);
        tx.data.constants.historicalHeader = header;
        tx.data.constants.vkTreeRoot = getVKTreeRoot();

        const blockNum = i + 1000;
        const globals = makeGlobals(blockNum);

        // This will need to be a 2 tx block
        await context.orchestrator.startNewBlock(2, globals, []);

        await context.orchestrator.addNewTx(tx);

        //  we need to complete the block as we have not added a full set of txs
        const block = await context.orchestrator.setBlockCompleted();
        header = block!.header;
      }

      logger.info('Finalising epoch');
      const epoch = await context.orchestrator.finaliseEpoch();
      expect(epoch.publicInputs.endBlockNumber.toNumber()).toEqual(1000 + numBlocks - 1);
      expect(epoch.proof).toBeDefined();
    });
  });
});
