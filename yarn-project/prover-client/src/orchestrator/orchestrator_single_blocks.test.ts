import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { createLogger } from '@aztec/foundation/log';
import { createBlockEndMarker } from '@aztec/stdlib/block';

import { TestContext } from '../mocks/test_context.js';
import { buildBlobDataFromTxs, buildFinalBlobChallenges } from './block-building-helpers.js';

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
      const blobFields = [createBlockEndMarker(0)];
      const finalBlobChallenges = await buildFinalBlobChallenges([blobFields]);
      context.orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
      await context.orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        context.getCheckpointConstants(),
        [],
        1,
        blobFields.length,
        context.getPreviousBlockHeader(),
      );
      await context.orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, 0);

      const header = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finalizeEpoch();
      expect(header.getBlockNumber()).toEqual(context.blockNumber);
    });

    it('builds a block with 1 transaction', async () => {
      const { txs } = await context.makePendingBlock(1);

      const {
        blobFieldsLengths: [blobFieldsLength],
        finalBlobChallenges,
      } = await buildBlobDataFromTxs([txs]);

      // This will need to be a 2 tx block
      context.orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
      await context.orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        context.getCheckpointConstants(),
        [],
        1, // numBlocks
        blobFieldsLength,
        context.getPreviousBlockHeader(),
      );
      await context.orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, txs.length);

      await context.orchestrator.addTxs(txs);

      const header = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finalizeEpoch();
      expect(header.getBlockNumber()).toEqual(context.blockNumber);
    });

    it('builds a block concurrently with transaction simulation', async () => {
      const { txs, l1ToL2Messages } = await context.makePendingBlock(4, {
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
    });
  });
});
