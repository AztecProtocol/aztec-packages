import { AZTEC_MAX_EPOCH_DURATION } from '@aztec/constants';
import { padArrayEnd, timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';

import { TestContext } from '../mocks/test_context.js';

const logger = createLogger('prover-client:test:orchestrator-multi-checkpoints');

const LONG_TIMEOUT = 600_000;

describe('prover/orchestrator/multi-checkpoints', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await TestContext.new(logger);
    context.orchestrator.isVerifyBuiltBlockAgainstSyncedStateEnabled = true;
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('multiple checkpoints ', () => {
    it.each([4, 5])(
      'builds an epoch with %s checkpoints in sequence',
      async (numCheckpoints: number) => {
        const numBlocksPerCheckpoint = 1;
        const numTxsPerBlock = 1;
        logger.info(`Seeding world state with ${numCheckpoints * numBlocksPerCheckpoint} blocks`);
        const checkpoints = await timesAsync(numCheckpoints, () =>
          context.makeCheckpoint(numBlocksPerCheckpoint, { numTxsPerBlock }),
        );

        logger.info(`Starting new epoch with ${numCheckpoints} checkpoints`);
        const finalBlobChallenges = await context.getFinalBlobChallenges();
        context.orchestrator.startNewEpoch(1, numCheckpoints, finalBlobChallenges);

        for (let i = 0; i < checkpoints.length; i++) {
          const {
            constants,
            blocks: [block],
            previousBlockHeader,
          } = checkpoints[i];
          await context.orchestrator.startNewCheckpoint(
            i, // checkpointIndex
            constants,
            [], // l1ToL2Messages
            numBlocksPerCheckpoint,
            previousBlockHeader,
          );

          const { blockNumber, timestamp } = block.header.globalVariables;
          await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
          await context.orchestrator.addTxs(block.txs);
          await context.orchestrator.setBlockCompleted(blockNumber, block.header);
        }

        logger.info('Finalizing epoch');
        const epoch = await context.orchestrator.finalizeEpoch();
        expect(epoch.proof).toBeDefined();

        const headerHashes = checkpoints.map(c => c.header.hash());
        expect(epoch.publicInputs.checkpointHeaderHashes).toEqual(
          padArrayEnd(headerHashes, Fr.ZERO, AZTEC_MAX_EPOCH_DURATION),
        );
      },
      LONG_TIMEOUT,
    );

    it(
      'builds two consecutive epochs',
      async () => {
        const numEpochs = 2;
        const numCheckpointsPerEpoch = 3;
        const numBlocksPerCheckpoint = 1;
        const numTxsPerBlock = 1;
        logger.info(`Seeding world state with ${numEpochs * numCheckpointsPerEpoch * numBlocksPerCheckpoint} blocks`);
        const epochs = await timesAsync(numEpochs, async () => {
          const checkpoints = await timesAsync(numCheckpointsPerEpoch, () =>
            context.makeCheckpoint(numBlocksPerCheckpoint, { numTxsPerBlock }),
          );
          const finalBlobChallenges = await context.getFinalBlobChallenges();
          context.startNewEpoch();
          return { checkpoints, finalBlobChallenges };
        });

        for (let epochIndex = 0; epochIndex < numEpochs; epochIndex++) {
          const epochNumber = epochIndex + 1;
          const { checkpoints, finalBlobChallenges } = epochs[epochIndex];
          logger.info(`Starting epoch ${epochNumber} with ${checkpoints.length} checkpoints`);
          context.orchestrator.startNewEpoch(epochNumber, checkpoints.length, finalBlobChallenges);

          for (let i = 0; i < checkpoints.length; i++) {
            const {
              constants,
              blocks: [block],
              previousBlockHeader,
            } = checkpoints[i];
            await context.orchestrator.startNewCheckpoint(
              i, // checkpointIndex
              constants,
              [],
              1 /* numBlocks */,
              previousBlockHeader,
            );

            const { blockNumber, timestamp } = block.header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
            // txs must be added for each block sequentially.
            await context.orchestrator.addTxs(block.txs);
          }

          // setBlockCompleted may be called in parallel, but it must be called after all txs have been added.
          await Promise.all(
            checkpoints.map(({ blocks: [block] }) =>
              context.orchestrator.setBlockCompleted(block.header.globalVariables.blockNumber, block.header),
            ),
          );

          logger.info('Finalizing epoch');
          const epoch = await context.orchestrator.finalizeEpoch();
          expect(epoch.proof).toBeDefined();

          const headerHashes = checkpoints.map(c => c.header.hash());
          expect(epoch.publicInputs.checkpointHeaderHashes).toEqual(
            padArrayEnd(headerHashes, Fr.ZERO, AZTEC_MAX_EPOCH_DURATION),
          );
        }
      },
      LONG_TIMEOUT,
    );
  });
});
