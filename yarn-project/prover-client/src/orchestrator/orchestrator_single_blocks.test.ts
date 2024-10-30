import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { fr } from '@aztec/circuits.js/testing';
import { range } from '@aztec/foundation/array';
import { createDebugLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import { makeBloatedProcessedTx } from '../mocks/fixtures.js';
import { TestContext } from '../mocks/test_context.js';

const logger = createDebugLogger('aztec:orchestrator-single-blocks');

describe('prover/orchestrator/blocks', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('blocks', () => {
    it('builds an empty L2 block', async () => {
      context.orchestrator.startNewEpoch(1, 1);
      await context.orchestrator.startNewBlock(2, context.globalVariables, []);

      const block = await context.orchestrator.setBlockCompleted();
      await context.orchestrator.finaliseEpoch();
      expect(block.number).toEqual(context.blockNumber);
    });

    it('builds a block with 1 transaction', async () => {
      const txs = [makeBloatedProcessedTx(context.actualDb, 1)];

      // This will need to be a 2 tx block
      context.orchestrator.startNewEpoch(1, 1);
      await context.orchestrator.startNewBlock(2, context.globalVariables, []);

      for (const tx of txs) {
        await context.orchestrator.addNewTx(tx);
      }

      const block = await context.orchestrator.setBlockCompleted();
      await context.orchestrator.finaliseEpoch();
      expect(block.number).toEqual(context.blockNumber);
    });

    it('builds a block concurrently with transaction simulation', async () => {
      const txs = [
        makeBloatedProcessedTx(context.actualDb, 1),
        makeBloatedProcessedTx(context.actualDb, 2),
        makeBloatedProcessedTx(context.actualDb, 3),
        makeBloatedProcessedTx(context.actualDb, 4),
      ];

      const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 1 + 0x400).map(fr);

      context.orchestrator.startNewEpoch(1, 1);
      await context.orchestrator.startNewBlock(txs.length, context.globalVariables, l1ToL2Messages);

      for (const tx of txs) {
        await context.orchestrator.addNewTx(tx);
        await sleep(1000);
      }

      const block = await context.orchestrator.setBlockCompleted();
      await context.orchestrator.finaliseEpoch();
      expect(block.number).toEqual(context.blockNumber);
    });
  });
});
