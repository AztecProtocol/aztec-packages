import { BatchedBlob, Blob } from '@aztec/blob-lib';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { range } from '@aztec/foundation/array';
import { timesParallel } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { getBlockBlobFields } from '@aztec/stdlib/block';
import { fr } from '@aztec/stdlib/testing';

import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('prover-client:test:orchestrator-mixed-blocks');

describe('prover/orchestrator/mixed-blocks', () => {
  let context: TestContext;

  const runTest = async (numTxs: number) => {
    const txs = await timesParallel(numTxs, i => context.makeProcessedTx(i + 1));
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
