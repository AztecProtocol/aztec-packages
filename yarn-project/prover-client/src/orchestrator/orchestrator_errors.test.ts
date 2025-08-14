import { BatchedBlob, Blob, FinalBlobBatchingChallenges } from '@aztec/blob-lib';
import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { createBlockEndMarker, getBlockBlobFields } from '@aztec/stdlib/block';

import { TestContext } from '../mocks/test_context.js';
import type { ProvingOrchestrator } from './orchestrator.js';

const logger = createLogger('prover-client:test:orchestrator-errors');

describe('prover/orchestrator/errors', () => {
  let context: TestContext;
  let orchestrator: ProvingOrchestrator;
  let emptyBlockBlobFields: Fr[];
  let emptyChallenges: FinalBlobBatchingChallenges;

  beforeEach(async () => {
    context = await TestContext.new(logger);
    orchestrator = context.orchestrator;
    emptyBlockBlobFields = [createBlockEndMarker(0)];
    const blobs = await Blob.getBlobsPerBlock(emptyBlockBlobFields);
    emptyChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  afterAll(async () => {});

  describe('errors', () => {
    it('throws if adding too many transactions', async () => {
      const txs = await timesParallel(4, i => context.makeProcessedTx(i + 1));
      await context.setTreeRoots(txs);
      const blobFields = getBlockBlobFields(txs.map(tx => tx.txEffect));
      const blobs = await Blob.getBlobsPerBlock(blobFields);
      const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);

      orchestrator.startNewEpoch(1, 1 /* numCheckpoints */, finalBlobChallenges);
      await orchestrator.startNewCheckpoint(
        context.checkpointConstants,
        [],
        1, // numBlocks
        blobFields.length,
        context.getPreviousBlockHeader(),
      );
      await orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, txs.length);
      await orchestrator.addTxs(txs);

      await expect(async () => await orchestrator.addTxs(txs)).rejects.toThrow(
        `Block ${context.blockNumber} has been initialized with transactions.`,
      );
    });

    it('throws if adding too many blocks', async () => {
      const txs = [await context.makeProcessedTx(1)];
      const blobFields = getBlockBlobFields(txs.map(tx => tx.txEffect));
      const blobs = await Blob.getBlobsPerBlock(blobFields);
      const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);

      orchestrator.startNewEpoch(1, 1, finalBlobChallenges);
      await orchestrator.startNewCheckpoint(
        context.checkpointConstants,
        [],
        1, // numBlocks
        blobFields.length,
        context.getPreviousBlockHeader(),
      );
      await orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, txs.length);
      await orchestrator.addTxs(txs);
      await orchestrator.setBlockCompleted(context.blockNumber);

      await expect(
        async () =>
          await orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, txs.length),
      ).rejects.toThrow('Checkpoint not accepting further blocks');
    });

    it('throws if adding a transaction before starting epoch', async () => {
      await expect(async () => await orchestrator.addTxs([await context.makeProcessedTx()])).rejects.toThrow(
        /Empty epoch proving state./,
      );
    });

    it('throws if adding a transaction before starting checkpoint', async () => {
      orchestrator.startNewEpoch(1, 1, emptyChallenges);
      await expect(async () => await orchestrator.addTxs([await context.makeProcessedTx()])).rejects.toThrow(
        /Proving state for block 1 not found/,
      );
    });

    it('throws if adding a transaction before starting block', async () => {
      orchestrator.startNewEpoch(1, 1, emptyChallenges);
      await orchestrator.startNewCheckpoint(
        context.checkpointConstants,
        [],
        1,
        emptyBlockBlobFields.length,
        context.getPreviousBlockHeader(),
      );
      await expect(async () => await orchestrator.addTxs([await context.makeProcessedTx()])).rejects.toThrow(
        /Proving state for block 1 not found/,
      );
    });

    it('throws if completing a block before start', async () => {
      orchestrator.startNewEpoch(1, 1, emptyChallenges);
      await expect(async () => await orchestrator.setBlockCompleted(context.blockNumber)).rejects.toThrow(
        /Block proving state for 1 not found/,
      );
    });

    it('throws if adding to a cancelled block', async () => {
      orchestrator.startNewEpoch(1, 1, emptyChallenges);
      await orchestrator.startNewCheckpoint(
        context.checkpointConstants,
        [],
        1,
        emptyBlockBlobFields.length,
        context.getPreviousBlockHeader(),
      );
      await orchestrator.startNewBlock(context.blockNumber, context.globalVariables.timestamp, 1);
      orchestrator.cancel();

      await expect(async () => await context.orchestrator.addTxs([await context.makeProcessedTx()])).rejects.toThrow(
        'Invalid proving state when adding a tx',
      );
    });

    it('rejects if too many l1 to l2 messages are provided', async () => {
      const l1ToL2Messages = new Array(100).fill(new Fr(0n));
      orchestrator.startNewEpoch(1, 1, emptyChallenges);
      await expect(
        async () =>
          await orchestrator.startNewCheckpoint(
            context.checkpointConstants,
            l1ToL2Messages,
            1,
            emptyBlockBlobFields.length,
            context.getPreviousBlockHeader(),
          ),
      ).rejects.toThrow('Too many L1 to L2 messages');
    });
  });
});
