import { BatchedBlob, Blob } from '@aztec/blob-lib';
import { timesAsync } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';

import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('prover-client:test:orchestrator-multi-blocks');

const LONG_TIMEOUT = 600_000;

describe('prover/orchestrator/multi-block', () => {
  let context: TestContext;

  const countProposedBlocks = (proposedBlockHeaderHashes: Fr[]) =>
    proposedBlockHeaderHashes.findIndex(h => h.isEmpty());

  beforeEach(async () => {
    context = await TestContext.new(logger);
    context.orchestrator.isVerifyBuiltBlockAgainstSyncedStateEnabled = true;
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('multiple blocks', () => {
    // Skipping in the interest of speeding up CI
    it.skip.each([1, 4, 5])('builds an epoch with %s blocks in sequence', async (numBlocks: number) => {
      logger.info(`Seeding world state with ${numBlocks} blocks`);
      const txCount = 2;
      const blocks = await timesAsync(numBlocks, i => context.makePendingBlock(txCount, 0, i + 1));
      const blobs = (await Promise.all(blocks.map(block => Blob.getBlobs(block.block.body.toBlobFields())))).flat();
      const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);

      logger.info(`Starting new epoch with ${numBlocks}`);
      context.orchestrator.startNewEpoch(1, 1, numBlocks, finalBlobChallenges);
      for (const { block, txs } of blocks) {
        await context.orchestrator.startNewBlock(
          block.header.globalVariables,
          [],
          context.getPreviousBlockHeader(block.number),
        );
        await context.orchestrator.addTxs(txs);
        await context.orchestrator.setBlockCompleted(block.number);
      }

      logger.info('Finalising epoch');
      const epoch = await context.orchestrator.finaliseEpoch();
      expect(countProposedBlocks(epoch.publicInputs.proposedBlockHeaderHashes)).toEqual(numBlocks);
      expect(epoch.proof).toBeDefined();
    });

    it.each([1, 4])(
      'builds an epoch with %s blocks in parallel',
      async (numBlocks: number) => {
        logger.info(`Seeding world state with ${numBlocks} blocks`);
        const txCount = 2;
        const blocks = await timesAsync(numBlocks, i => context.makePendingBlock(txCount, 0, i + 1));
        const blobs = (await Promise.all(blocks.map(block => Blob.getBlobs(block.block.body.toBlobFields())))).flat();
        const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);

        logger.info(`Starting new epoch with ${numBlocks}`);
        context.orchestrator.startNewEpoch(1, 1, numBlocks, finalBlobChallenges);
        await Promise.all(
          blocks.map(async ({ block, txs }) => {
            await context.orchestrator.startNewBlock(
              block.header.globalVariables,
              [],
              context.getPreviousBlockHeader(block.number),
            );
            await context.orchestrator.addTxs(txs);
            await context.orchestrator.setBlockCompleted(block.number);
          }),
        );

        logger.info('Finalising epoch');
        const epoch = await context.orchestrator.finaliseEpoch();
        expect(countProposedBlocks(epoch.publicInputs.proposedBlockHeaderHashes)).toEqual(numBlocks);
        expect(epoch.proof).toBeDefined();
      },
      LONG_TIMEOUT,
    );

    it(
      'builds two consecutive epochs',
      async () => {
        const numEpochs = 2;
        const numBlocks = 4;
        const txCount = 2;
        logger.info(`Seeding world state with ${numBlocks * numEpochs} blocks`);
        const blocks = await timesAsync(numBlocks * numEpochs, i => context.makePendingBlock(txCount, 0, i + 1));

        for (let epochIndex = 0; epochIndex < numEpochs; epochIndex++) {
          logger.info(`Starting epoch ${epochIndex + 1} with ${numBlocks} blocks`);
          const blocksInEpoch = blocks.slice(epochIndex * numBlocks, (epochIndex + 1) * numBlocks);
          const blobs = (
            await Promise.all(blocksInEpoch.map(block => Blob.getBlobs(block.block.body.toBlobFields())))
          ).flat();
          const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);
          context.orchestrator.startNewEpoch(
            epochIndex + 1,
            epochIndex * numBlocks + 1,
            numBlocks,
            finalBlobChallenges,
          );
          await Promise.all(
            blocksInEpoch.map(async ({ block, txs }) => {
              await context.orchestrator.startNewBlock(
                block.header.globalVariables,
                [],
                context.getPreviousBlockHeader(block.number),
              );
              await context.orchestrator.addTxs(txs);
              await context.orchestrator.setBlockCompleted(block.number);
            }),
          );

          logger.info('Finalising epoch');
          const epoch = await context.orchestrator.finaliseEpoch();
          const numProposedBlocks = countProposedBlocks(epoch.publicInputs.proposedBlockHeaderHashes);
          expect(numProposedBlocks).toEqual(numBlocks);
          expect(epoch.publicInputs.proposedBlockHeaderHashes.slice(0, numProposedBlocks)).toEqual(
            blocksInEpoch.map(b => b.block.header.toPropose().hash()),
          );
          expect(epoch.proof).toBeDefined();
        }
      },
      LONG_TIMEOUT,
    );
  });
});
