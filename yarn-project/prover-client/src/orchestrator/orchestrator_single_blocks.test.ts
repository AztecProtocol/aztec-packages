import { BatchedBlob, Blob } from '@aztec/blob-lib';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { range } from '@aztec/foundation/array';
import { timesParallel } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { createBlockEndMarker, getBlockBlobFields } from '@aztec/stdlib/block';
import { fr } from '@aztec/stdlib/testing';

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
      const blobFields = [createBlockEndMarker(0)];
      const blobs = await Blob.getBlobsPerBlock(blobFields);
      const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);
      context.orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
      await context.orchestrator.startNewCheckpoint(
        context.checkpointConstants,
        [],
        1,
        blobFields.length,
        context.getPreviousBlockHeader(),
      );
      await context.orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, 0);

      const header = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finaliseEpoch();
      expect(header.getBlockNumber()).toEqual(context.blockNumber);
    });

    it('builds a block with 1 transaction', async () => {
      const txs = [await context.makeProcessedTx(1)];
      await context.setTreeRoots(txs);

      const blobFields = getBlockBlobFields(txs.flatMap(tx => tx.txEffect));
      const blobs = await Blob.getBlobsPerBlock(blobFields);
      const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);

      // This will need to be a 2 tx block
      context.orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
      await context.orchestrator.startNewCheckpoint(
        context.checkpointConstants,
        [],
        1,
        blobFields.length,
        context.getPreviousBlockHeader(),
      );
      await context.orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, txs.length);

      await context.orchestrator.addTxs(txs);

      const header = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finaliseEpoch();
      expect(header.getBlockNumber()).toEqual(context.blockNumber);
    });

    it('builds a block concurrently with transaction simulation', async () => {
      const txs = await timesParallel(4, i => context.makeProcessedTx(i + 1));
      await context.setTreeRoots(txs);
      const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 1 + 0x400).map(fr);

      const blobFields = getBlockBlobFields(txs.flatMap(tx => tx.txEffect));
      const blobs = await Blob.getBlobsPerBlock(blobFields);
      const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);

      context.orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
      await context.orchestrator.startNewCheckpoint(
        context.checkpointConstants,
        l1ToL2Messages,
        1,
        blobFields.length,
        context.getPreviousBlockHeader(),
      );
      await context.orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, txs.length);

      await context.orchestrator.addTxs(txs);

      const header = await context.orchestrator.setBlockCompleted(context.blockNumber);
      await context.orchestrator.finaliseEpoch();
      expect(header.getBlockNumber()).toEqual(context.blockNumber);
    });
  });
});
