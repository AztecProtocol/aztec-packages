import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/circuits.js';
import { fr } from '@aztec/circuits.js/testing';
import { range } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';

import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('prover-client:test:orchestrator-mixed-blocks');

describe('prover/orchestrator/mixed-blocks', () => {
  let context: TestContext;

  const runTest = async (numTxs: number) => {
    const txs = times(numTxs, i => context.makeProcessedTx(i + 1));
    await context.setEndTreeRoots(txs);

    const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 1 + 0x400).map(fr);

    context.orchestrator.startNewEpoch(1, 1, 1);
    await context.orchestrator.startNewBlock(context.globalVariables, l1ToL2Messages, context.getPreviousBlockHeader());

    await context.orchestrator.addTxs(txs);

    const block = await context.orchestrator.setBlockCompleted(context.blockNumber);
    await context.orchestrator.finaliseEpoch();
    expect(block.number).toEqual(context.blockNumber);
  };

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('blocks', () => {
    it.each([0, 1, 3, 5])('builds an unbalanced L2 block with %i bloated txs', async (numTxs: number) => {
      await runTest(numTxs);
    });

    it.each([2, 4, 8])('builds a balanced L2 block with %i bloated txs', async (numTxs: number) => {
      await runTest(numTxs);
    });
  });
});
