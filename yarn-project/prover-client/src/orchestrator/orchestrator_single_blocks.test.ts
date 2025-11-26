import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
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
      const {
        constants,
        blocks: [emptyBlock],
        previousBlockHeader,
      } = await context.makeCheckpoint(1, { numTxsPerBlock: 0 });

      const finalBlobChallenges = await context.getFinalBlobChallenges();
      context.orchestrator.startNewEpoch(1, 1, finalBlobChallenges);

      await context.orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        constants,
        [],
        1, // numBlocks
        previousBlockHeader,
      );

      const { blockNumber, timestamp } = emptyBlock.header.globalVariables;
      await context.orchestrator.startNewBlock(blockNumber, timestamp, 0 /* numTxs */);

      const header = await context.orchestrator.setBlockCompleted(blockNumber, emptyBlock.header);
      await context.orchestrator.finalizeEpoch();
      expect(header).toEqual(emptyBlock.header);
    });

    it('builds a block with 1 transaction', async () => {
      const {
        constants,
        blocks: [block],
        previousBlockHeader,
      } = await context.makeCheckpoint(1, { numTxsPerBlock: 1 });

      const finalBlobChallenges = await context.getFinalBlobChallenges();
      context.orchestrator.startNewEpoch(1, 1, finalBlobChallenges);

      await context.orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        constants,
        [],
        1, // numBlocks
        previousBlockHeader,
      );

      const { blockNumber, timestamp } = block.header.globalVariables;
      await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
      await context.orchestrator.addTxs(block.txs);

      const header = await context.orchestrator.setBlockCompleted(blockNumber, block.header);
      await context.orchestrator.finalizeEpoch();
      expect(header).toEqual(block.header);
    });

    it('builds a block concurrently with transaction simulation', async () => {
      const {
        constants,
        blocks: [block],
        l1ToL2Messages,
        previousBlockHeader,
      } = await context.makeCheckpoint(1, {
        numTxsPerBlock: 4,
        numL1ToL2Messages: NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
        makeProcessedTxOpts: (_, txIndex) => ({ privateOnly: txIndex % 2 === 0 }),
      });

      const finalBlobChallenges = await context.getFinalBlobChallenges();
      context.orchestrator.startNewEpoch(1, 1, finalBlobChallenges);

      await context.orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        constants,
        l1ToL2Messages,
        1, // numBlocks
        previousBlockHeader,
      );

      const { blockNumber, timestamp } = block.header.globalVariables;
      await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);

      await context.orchestrator.addTxs(block.txs);

      const header = await context.orchestrator.setBlockCompleted(blockNumber, block.header);
      await context.orchestrator.finalizeEpoch();
      expect(header).toEqual(block.header);
    });
  });
});
