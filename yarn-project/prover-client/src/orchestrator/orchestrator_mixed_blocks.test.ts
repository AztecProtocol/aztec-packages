import { BatchedBlob, Blob } from '@aztec/blob-lib';
import { NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { range } from '@aztec/foundation/array';
import { timesParallel } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { fr } from '@aztec/stdlib/testing';

import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('prover-client:test:orchestrator-mixed-blocks');

describe('prover/orchestrator/mixed-blocks', () => {
  let context: TestContext;

  const runTest = async (numTxs: number) => {
    const txs = await timesParallel(numTxs, i => context.makeProcessedTx(i + 1));
    await context.setTreeRoots(txs);

    const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 1 + 0x400).map(fr);

    const blobs = await Blob.getBlobsPerBlock(txs.map(tx => tx.txEffect.toBlobFields()).flat());
    const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);

    context.orchestrator.startNewEpoch(1, 1, 1, finalBlobChallenges);
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
