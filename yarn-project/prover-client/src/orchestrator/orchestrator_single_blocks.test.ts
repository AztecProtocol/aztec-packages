import { BatchedBlob, Blob } from '@aztec/blob-lib';
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
      context.orchestrator.startNewEpoch(1, 1, 1, await BatchedBlob.precomputeEmptyBatchedBlobChallenges());
      await context.orchestrator.startNewBlock(context.globalVariables, [], context.getPreviousBlockHeader());

      const block = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finalizeEpoch();
      expect(block.number).toEqual(context.blockNumber);
    });

    it('builds a block with 1 transaction', async () => {
      const { txs } = await context.makePendingBlock(1);

      const blobFields = txs.map(tx => tx.txEffect.toBlobFields()).flat();
      const blobs = await Blob.getBlobsPerBlock(blobFields);
      const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);

      // This will need to be a 2 tx block
      context.orchestrator.startNewEpoch(1, 1, 1, finalBlobChallenges);
      await context.orchestrator.startNewBlock(context.globalVariables, [], context.getPreviousBlockHeader());

      await context.orchestrator.addTxs(txs);

      const block = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finalizeEpoch();
      expect(block.number).toEqual(context.blockNumber);
    });

    it('builds a block concurrently with transaction simulation', async () => {
      const { txs, l1ToL2Messages } = await context.makePendingBlock(4, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);

      const blobFields = txs.map(tx => tx.txEffect.toBlobFields()).flat();
      const blobs = await Blob.getBlobsPerBlock(blobFields);
      const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);

      context.orchestrator.startNewEpoch(1, 1, 1, finalBlobChallenges);
      await context.orchestrator.startNewBlock(
        context.globalVariables,
        l1ToL2Messages,
        context.getPreviousBlockHeader(),
      );

      await context.orchestrator.addTxs(txs);

      const block = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finalizeEpoch();
      expect(block.number).toEqual(context.blockNumber);
    });
  });
});
