import { makeBloatedProcessedTx } from '@aztec/circuit-types/test';
import { createDebugLogger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';

import { makeGlobals } from '../mocks/fixtures.js';
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
        const tx = makeBloatedProcessedTx({
          header,
          vkTreeRoot: getVKTreeRoot(),
          protocolContractTreeRoot,
          seed: i + 1,
        });

        const blockNum = i + 1000;
        const globals = makeGlobals(blockNum);

        await context.orchestrator.startNewBlock(globals, []);

        await context.orchestrator.addTxs([tx]);

        // Completing the block will set off padding tx logic, as we only have 1 tx
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
