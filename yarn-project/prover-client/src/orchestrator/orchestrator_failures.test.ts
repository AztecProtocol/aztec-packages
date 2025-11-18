import { timesAsync } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import type { ServerCircuitProver } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';

import { TestContext } from '../mocks/test_context.js';
import type { ProvingOrchestrator } from './orchestrator.js';

const logger = createLogger('prover-client:test:orchestrator-failures');
const LONG_TIMEOUT = 600_000;

describe('prover/orchestrator/failures', () => {
  let context: TestContext;
  let orchestrator: ProvingOrchestrator;
  let prover: ServerCircuitProver;

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('error handling', () => {
    beforeEach(() => {
      ({ prover, orchestrator } = context);
    });

    const run = async (
      message: string,
      {
        numCheckpoints = 1,
        numBlocksPerCheckpoint = 1,
        numTxsPerBlock = 0,
        numL1ToL2Messages = 0,
        privateOnly = true,
      }: {
        numCheckpoints?: number;
        numBlocksPerCheckpoint?: number;
        numTxsPerBlock?: number;
        numL1ToL2Messages?: number;
        privateOnly?: boolean;
      } = {},
    ) => {
      const checkpoints = await timesAsync(numCheckpoints, () =>
        context.makeCheckpoint(numBlocksPerCheckpoint, {
          numTxsPerBlock,
          numL1ToL2Messages,
          makeProcessedTxOpts: () => ({ privateOnly }),
        }),
      );

      const finalBlobChallenges = await context.getFinalBlobChallenges();
      orchestrator.startNewEpoch(1, 1, finalBlobChallenges);

      for (let checkpointIndex = 0; checkpointIndex < checkpoints.length; checkpointIndex++) {
        const { constants, blocks, l1ToL2Messages, totalNumBlobFields, previousBlockHeader } =
          checkpoints[checkpointIndex];
        // these operations could fail if the target circuit fails before adding all blocks or txs
        try {
          await orchestrator.startNewCheckpoint(
            checkpointIndex,
            constants,
            l1ToL2Messages,
            blocks.length,
            totalNumBlobFields,
            previousBlockHeader,
          );

          for (const block of blocks) {
            const { blockNumber, timestamp } = block.header.globalVariables;
            await orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);

            let allTxsAdded = true;
            try {
              await orchestrator.addTxs(block.txs);
            } catch {
              allTxsAdded = false;
              break;
            }

            if (!allTxsAdded) {
              await expect(orchestrator.setBlockCompleted(blockNumber)).rejects.toThrow(
                `Block proving failed: ${message}`,
              );
            } else {
              await orchestrator.setBlockCompleted(blockNumber);
            }
          }
        } catch {
          break;
        }
      }
    };

    it(
      'succeeds without failed proof',
      async () => {
        await run('successful case');
        await expect(orchestrator.finalizeEpoch()).resolves.not.toThrow();
      },
      LONG_TIMEOUT,
    );

    it.each([
      [
        'Private Base Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getPrivateTxBaseRollupProof').mockRejectedValue(msg),
        { numTxsPerBlock: 1, privateOnly: true },
      ],
      [
        'Public Base Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getPublicTxBaseRollupProof').mockRejectedValue(msg),
        { numTxsPerBlock: 1, privateOnly: false },
      ],
      [
        'Tx Merge Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getTxMergeRollupProof').mockRejectedValue(msg),
        { numTxsPerBlock: 3 }, // Need at least 3 txs to use a tx merge rollup.
      ],
      [
        'Block Root First Empty Tx Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getBlockRootEmptyTxFirstRollupProof').mockRejectedValue(msg),
        { numTxsPerBlock: 0, numL1ToL2Messages: 1 },
      ],
      [
        'Block Root First Single Tx Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getBlockRootSingleTxFirstRollupProof').mockRejectedValue(msg),
        { numTxsPerBlock: 1 },
      ],
      [
        'Block Root First Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getBlockRootFirstRollupProof').mockRejectedValue(msg),
        { numTxsPerBlock: 2 }, // Need at least 2 txs to use a block root first rollup.
      ],
      [
        'Checkpoint Root Single Block Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getCheckpointRootSingleBlockRollupProof').mockRejectedValue(msg),
      ],
      [
        'Checkpoint Root Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getCheckpointRootRollupProof').mockRejectedValue(msg),
        { numBlocksPerCheckpoint: 2, numTxsPerBlock: 1 },
      ],
      [
        'Checkpoint Merge Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getCheckpointMergeRollupProof').mockRejectedValue(msg),
        { numCheckpoints: 3 }, // Need at least 3 checkpoints to use a checkpoint merge rollup.
      ],
      ['Root Rollup Failed', (msg: string) => jest.spyOn(prover, 'getRootRollupProof').mockRejectedValue(msg)],
      [
        'Base Parity Failed',
        (msg: string) => jest.spyOn(prover, 'getBaseParityProof').mockRejectedValue(msg),
        {
          numL1ToL2Messages: 1,
        },
      ],
      [
        'Root Parity Failed',
        (msg: string) => jest.spyOn(prover, 'getRootParityProof').mockRejectedValue(msg),
        {
          numL1ToL2Messages: 1,
        },
      ],
    ] as const)(
      'handles a %s error',
      async (
        message: string,
        makeFailedProof: (msg: string) => void,
        opts: Partial<Parameters<typeof run>[1]> = {},
      ) => {
        /**
         * NOTE: these tests start a new epoch with N blocks. Each block will have M txs in it.
         * Txs are proven in parallel and as soon as one fails (which is what this test is setting up to happen)
         * the orchestrator stops accepting txs in a block.
         * This means we have to be careful with our assertions as the order in which things happen is non-deterministic.
         * We need to expect
         * - addTx to fail (because a block's provingState became invalid)
         * - addTx to work fine (because we haven't hit the error in the test setup) but the epoch to fail
         */
        makeFailedProof(message);

        await run(message, opts);

        await expect(() => orchestrator.finalizeEpoch()).rejects.toThrow();
      },
      LONG_TIMEOUT,
    );
  });
});
