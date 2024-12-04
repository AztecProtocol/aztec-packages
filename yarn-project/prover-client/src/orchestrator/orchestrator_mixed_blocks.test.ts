import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { fr } from '@aztec/circuits.js/testing';
import { range } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';

import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('orchestrator-mixed-blocks');

describe('prover/orchestrator/mixed-blocks', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('blocks', () => {
    it('builds an unbalanced L2 block', async () => {
      const txs = times(3, i => context.makeProcessedTx(i + 1));

      const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 1 + 0x400).map(fr);

      context.orchestrator.startNewEpoch(1, 1, 1);
      await context.orchestrator.startNewBlock(3, context.globalVariables, l1ToL2Messages);
      for (const tx of txs) {
        await context.orchestrator.addNewTx(tx);
      }

      const block = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finaliseEpoch();
      expect(block.number).toEqual(context.blockNumber);
    });

    it.each([2, 4, 5, 8] as const)('builds an L2 block with %i bloated txs', async (totalCount: number) => {
      const txs = times(totalCount, i => context.makeProcessedTx(i + 1));

      const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 1 + 0x400).map(fr);

      context.orchestrator.startNewEpoch(1, 1, 1);
      await context.orchestrator.startNewBlock(txs.length, context.globalVariables, l1ToL2Messages);

      for (const tx of txs) {
        await context.orchestrator.addNewTx(tx);
      }

      const block = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finaliseEpoch();
      expect(block.number).toEqual(context.blockNumber);
    });
  });
});
