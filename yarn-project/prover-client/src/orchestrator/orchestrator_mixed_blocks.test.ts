import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { createLogger } from '@aztec/foundation/log';

import { TestContext } from '../mocks/test_context.js';
import { buildBlobDataFromTxs } from './block-building-helpers.js';

const logger = createLogger('prover-client:test:orchestrator-mixed-blocks');

describe('prover/orchestrator/mixed-blocks', () => {
  let context: TestContext;

  const runTest = async (numTxs: number) => {
    const { txs, l1ToL2Messages } = await context.makePendingBlock(numTxs, {
      numL1ToL2Messages: NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
    });

    const {
      blobFieldsLengths: [blobFieldsLength],
      finalBlobChallenges,
    } = await buildBlobDataFromTxs([txs]);

    context.orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
    await context.orchestrator.startNewCheckpoint(
      0, // checkpointIndex
      context.getCheckpointConstants(),
      l1ToL2Messages,
      1, // numBlocks
      blobFieldsLength,
      context.getPreviousBlockHeader(),
    );
    await context.orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, txs.length);

    await context.orchestrator.addTxs(txs);

    const header = await context.orchestrator.setBlockCompleted(context.blockNumber);
    await context.orchestrator.finalizeEpoch();
    expect(header.getBlockNumber()).toEqual(context.blockNumber);
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
