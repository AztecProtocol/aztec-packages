import { timesAsync } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import type { ServerCircuitProver } from '@aztec/stdlib/interfaces/server';

import { jest } from '@jest/globals';

import { TestContext } from '../mocks/test_context.js';
import { buildBlobDataFromTxs } from './block-building-helpers.js';
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

    const run = async (message: string) => {
      // We need at least 3 blocks, 3 txs, and 1 message to ensure all circuits are used
      // We generate them and add them as part of the pending chain
      const blocks = await timesAsync(3, i =>
        context.makePendingBlock(3, {
          numL1ToL2Messages: 1,
          blockNumber: i + 1,
          makeProcessedTxOpts: j => ({ privateOnly: j === 1 }),
        }),
      );

      const { blobFieldsLengths, finalBlobChallenges } = await buildBlobDataFromTxs(blocks.map(b => b.txs));

      const numCheckpoints = blocks.length;
      orchestrator.startNewEpoch(1, numCheckpoints, finalBlobChallenges);

      for (let i = 0; i < blocks.length; i++) {
        const { block, txs, l1ToL2Messages } = blocks[i];
        // these operations could fail if the target circuit fails before adding all blocks or txs
        try {
          await orchestrator.startNewCheckpoint(
            i, // checkpointIndex
            context.getCheckpointConstants(i),
            l1ToL2Messages,
            1, // numBlocks
            blobFieldsLengths[i],
            context.getPreviousBlockHeader(block.number),
          );
          await orchestrator.startNewBlock(block.number, block.header.globalVariables.timestamp, txs.length);
          let allTxsAdded = true;
          try {
            await orchestrator.addTxs(txs);
          } catch {
            allTxsAdded = false;
            break;
          }

          if (!allTxsAdded) {
            await expect(orchestrator.setBlockCompleted(block.number)).rejects.toThrow(
              `Block proving failed: ${message}`,
            );
          } else {
            await orchestrator.setBlockCompleted(block.number);
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
      ],
      [
        'Public Base Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getPublicTxBaseRollupProof').mockRejectedValue(msg),
      ],
      ['Tx Merge Rollup Failed', (msg: string) => jest.spyOn(prover, 'getTxMergeRollupProof').mockRejectedValue(msg)],
      [
        'Block Root First Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getBlockRootFirstRollupProof').mockRejectedValue(msg),
      ],
      [
        'Checkpoint Root Single Block Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getCheckpointRootSingleBlockRollupProof').mockRejectedValue(msg),
      ],
      [
        'Checkpoint Merge Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getCheckpointMergeRollupProof').mockRejectedValue(msg),
      ],
      ['Root Rollup Failed', (msg: string) => jest.spyOn(prover, 'getRootRollupProof').mockRejectedValue(msg)],
      ['Base Parity Failed', (msg: string) => jest.spyOn(prover, 'getBaseParityProof').mockRejectedValue(msg)],
      ['Root Parity Failed', (msg: string) => jest.spyOn(prover, 'getRootParityProof').mockRejectedValue(msg)],
    ] as const)(
      'handles a %s error',
      async (message: string, makeFailedProof: (msg: string) => void) => {
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

        await run(message);

        await expect(() => orchestrator.finalizeEpoch()).rejects.toThrow();
      },
      LONG_TIMEOUT,
    );
  });
});
