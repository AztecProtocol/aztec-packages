import { BatchedBlob, Blob } from '@aztec/blob-lib';
import { timesAsync } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';

import { makeCheckpointConstants } from '../mocks/fixtures.js';
import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('prover-client:test:orchestrator-multi-blocks');

const LONG_TIMEOUT = 600_000;

describe('prover/orchestrator/multi-block', () => {
  let context: TestContext;

  const countHeaderHashes = (checkpointHeaderHashes: Fr[]) => checkpointHeaderHashes.findIndex(h => h.isEmpty());

  beforeEach(async () => {
    context = await TestContext.new(logger);
    context.orchestrator.isVerifyBuiltBlockAgainstSyncedStateEnabled = true;
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('multiple blocks', () => {
    it.each([4, 5])(
      'builds an epoch with %s blocks in sequence',
      async (numBlocks: number) => {
        logger.info(`Seeding world state with ${numBlocks} blocks`);
        // One block per checkpoint.
        const numCheckpoints = numBlocks;
        const txCount = 2;
        const blocks = await timesAsync(numBlocks, i => context.makePendingBlock(txCount, 0, i + 1));
        const blockBlobFields = blocks.map(block => block.block.body.toBlobFields());
        const blobs = (await Promise.all(blockBlobFields.map(blobFields => Blob.getBlobsPerBlock(blobFields)))).flat();
        const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);

        logger.info(`Starting new epoch with ${numBlocks}`);
        context.orchestrator.startNewEpoch(1, numCheckpoints, finalBlobChallenges);

        for (let i = 0; i < blocks.length; i++) {
          const { block, txs } = blocks[i];
          const slotNumber = block.header.globalVariables.slotNumber.toNumber();
          await context.orchestrator.startNewCheckpoint(
            makeCheckpointConstants(slotNumber),
            [],
            1 /* numBlocks */,
            blockBlobFields[i].length,
            context.getPreviousBlockHeader(block.number),
          );

          await context.orchestrator.startNewBlock(block.number, block.header.globalVariables.timestamp, txs.length);
          await context.orchestrator.addTxs(txs);
          await context.orchestrator.setBlockCompleted(block.number);
        }

        logger.info('Finalising epoch');
        const epoch = await context.orchestrator.finaliseEpoch();
        expect(countHeaderHashes(epoch.publicInputs.checkpointHeaderHashes)).toEqual(numCheckpoints);
        expect(epoch.proof).toBeDefined();
      },
      LONG_TIMEOUT,
    );

    it(
      'builds two consecutive epochs',
      async () => {
        const numEpochs = 2;
        const numBlocks = 3;
        const txCount = 2;
        logger.info(`Seeding world state with ${numBlocks * numEpochs} blocks`);
        const blocks = await timesAsync(numBlocks * numEpochs, i => context.makePendingBlock(txCount, 0, i + 1));

        for (let epochIndex = 0; epochIndex < numEpochs; epochIndex++) {
          const epochNumber = epochIndex + 1;
          // One block per checkpoint.
          const numCheckpoints = numBlocks;
          logger.info(`Starting epoch ${epochNumber} with ${numBlocks} checkpoints/blocks`);
          const blocksInEpoch = blocks.slice(epochIndex * numBlocks, (epochIndex + 1) * numBlocks);
          const blockBlobFields = blocksInEpoch.map(block => block.block.body.toBlobFields());
          const blobs = (
            await Promise.all(blockBlobFields.map(blobFields => Blob.getBlobsPerBlock(blobFields)))
          ).flat();
          const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);
          context.orchestrator.startNewEpoch(epochNumber, numCheckpoints, finalBlobChallenges);
          for (let i = 0; i < blocksInEpoch.length; i++) {
            const { block, txs } = blocksInEpoch[i];
            const slotNumber = block.header.globalVariables.slotNumber.toNumber();
            await context.orchestrator.startNewCheckpoint(
              makeCheckpointConstants(slotNumber),
              [],
              1 /* numBlocks */,
              blockBlobFields[i].length,
              context.getPreviousBlockHeader(block.number),
            );

            await context.orchestrator.startNewBlock(block.number, block.header.globalVariables.timestamp, txs.length);
            // txs must be added for each block sequentially.
            await context.orchestrator.addTxs(txs);
          }

          // setBlockCompleted may be called in parallel, but it must be called after all txs have been added.
          await Promise.all(
            blocksInEpoch.map(async ({ block }) => {
              await context.orchestrator.setBlockCompleted(block.number);
            }),
          );

          logger.info('Finalising epoch');
          const epoch = await context.orchestrator.finaliseEpoch();
          const numProposedBlocks = countHeaderHashes(epoch.publicInputs.checkpointHeaderHashes);
          expect(numProposedBlocks).toEqual(numCheckpoints);
          expect(epoch.publicInputs.checkpointHeaderHashes.slice(0, numProposedBlocks)).toEqual(
            blocksInEpoch.map(b => b.block.getCheckpointHeader().hash()),
          );
          expect(epoch.proof).toBeDefined();
        }
      },
      LONG_TIMEOUT,
    );
  });
});
