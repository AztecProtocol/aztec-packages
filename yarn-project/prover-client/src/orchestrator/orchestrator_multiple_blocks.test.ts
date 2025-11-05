import { timesAsync } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';

import { TestContext } from '../mocks/test_context.js';
import { buildBlobDataFromTxs } from './block-building-helpers.js';

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
        const blocks = await timesAsync(numBlocks, i => context.makePendingBlock(txCount, { blockNumber: i + 1 }));
        const { blobFieldsLengths, finalBlobChallenges } = await buildBlobDataFromTxs(blocks.map(b => b.txs));

        logger.info(`Starting new epoch with ${numBlocks}`);
        context.orchestrator.startNewEpoch(1, numCheckpoints, finalBlobChallenges);

        for (let i = 0; i < blocks.length; i++) {
          const { block, txs } = blocks[i];
          await context.orchestrator.startNewCheckpoint(
            i, // checkpointIndex
            context.getCheckpointConstants(i),
            [],
            1 /* numBlocks */,
            blobFieldsLengths[i],
            context.getPreviousBlockHeader(block.number),
          );

          await context.orchestrator.startNewBlock(block.number, block.header.globalVariables.timestamp, txs.length);
          await context.orchestrator.addTxs(txs);
          await context.orchestrator.setBlockCompleted(block.number);
        }

        logger.info('Finalizing epoch');
        const epoch = await context.orchestrator.finalizeEpoch();
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
        const blocks = await timesAsync(numBlocks * numEpochs, i =>
          context.makePendingBlock(txCount, { blockNumber: i + 1 }),
        );

        for (let epochIndex = 0; epochIndex < numEpochs; epochIndex++) {
          const epochNumber = epochIndex + 1;
          // One block per checkpoint.
          const numCheckpoints = numBlocks;
          logger.info(`Starting epoch ${epochNumber} with ${numBlocks} checkpoints/blocks`);
          const blocksInEpoch = blocks.slice(epochIndex * numBlocks, (epochIndex + 1) * numBlocks);
          const { blobFieldsLengths, finalBlobChallenges } = await buildBlobDataFromTxs(blocksInEpoch.map(b => b.txs));
          context.orchestrator.startNewEpoch(epochNumber, numCheckpoints, finalBlobChallenges);
          for (let i = 0; i < blocksInEpoch.length; i++) {
            const { block, txs } = blocksInEpoch[i];
            await context.orchestrator.startNewCheckpoint(
              i, // checkpointIndex
              context.getCheckpointConstants(i),
              [],
              1 /* numBlocks */,
              blobFieldsLengths[i],
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

          logger.info('Finalizing epoch');
          const epoch = await context.orchestrator.finalizeEpoch();
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
