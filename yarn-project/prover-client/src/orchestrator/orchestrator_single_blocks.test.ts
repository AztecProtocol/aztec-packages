import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { fr } from '@aztec/circuits.js/testing';
import { range } from '@aztec/foundation/array';
import { timesParallel } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';

import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('prover-client:test:orchestrator-single-blocks');

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
      context.orchestrator.startNewEpoch(1, 1, 1);
      await context.orchestrator.startNewBlock(context.globalVariables, [], context.getPreviousBlockHeader());

      const block = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finaliseEpoch();
      expect(block.number).toEqual(context.blockNumber);
    });

    it('builds a block with 1 transaction', async () => {
      const txs = [await context.makeProcessedTx(1)];
      await context.setEndTreeRoots(txs);

      // This will need to be a 2 tx block
      context.orchestrator.startNewEpoch(1, 1, 1);
      await context.orchestrator.startNewBlock(context.globalVariables, [], context.getPreviousBlockHeader());

      await context.orchestrator.addTxs(txs);

      const block = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finaliseEpoch();
      expect(block.number).toEqual(context.blockNumber);
    });

    it('builds a block concurrently with transaction simulation', async () => {
      const txs = await timesParallel(4, i => context.makeProcessedTx(i + 1));
      await context.setEndTreeRoots(txs);
      const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 1 + 0x400).map(fr);

      context.orchestrator.startNewEpoch(1, 1, 1);
      await context.orchestrator.startNewBlock(
        context.globalVariables,
        l1ToL2Messages,
        context.getPreviousBlockHeader(),
      );

      await context.orchestrator.addTxs(txs);

      const block = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finaliseEpoch();
      expect(block.number).toEqual(context.blockNumber);
    });
  });
});
