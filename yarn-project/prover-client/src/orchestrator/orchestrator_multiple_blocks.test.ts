import { PROVING_STATUS } from '@aztec/circuit-types';
import { getMockVerificationKeys } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';

import { makeBloatedProcessedTx, makeEmptyProcessedTestTx, makeGlobals } from '../mocks/fixtures.js';
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
    it('builds multiple blocks in sequence', async () => {
      const numBlocks = 5;
      let header = await context.actualDb.buildInitialHeader();

      for (let i = 0; i < numBlocks; i++) {
        const tx = await makeBloatedProcessedTx(context.actualDb, i + 1);
        const emptyTx = await makeEmptyProcessedTestTx(context.actualDb);
        tx.data.constants.historicalHeader = header;
        emptyTx.data.constants.historicalHeader = header;

        const blockNum = i + 1000;

        const globals = makeGlobals(blockNum);

        // This will need to be a 2 tx block
        const blockTicket = await context.orchestrator.startNewBlock(
          2,
          globals,
          [],
          emptyTx,
          getMockVerificationKeys(),
        );

        await context.orchestrator.addNewTx(tx);

        //  we need to complete the block as we have not added a full set of txs
        await context.orchestrator.setBlockCompleted();

        const result = await blockTicket.provingPromise;
        expect(result.status).toBe(PROVING_STATUS.SUCCESS);
        const finalisedBlock = await context.orchestrator.finaliseBlock();

        expect(finalisedBlock.block.number).toEqual(blockNum);
        header = finalisedBlock.block.header;

        await context.actualDb.commit();
      }
    });
  });
});
