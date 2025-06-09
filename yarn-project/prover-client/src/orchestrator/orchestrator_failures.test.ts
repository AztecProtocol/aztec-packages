import { BatchedBlob, Blob } from '@aztec/blob-lib';
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

    const run = async (message: string) => {
      // We need at least 3 blocks, 3 txs, and 1 message to ensure all circuits are used
      // We generate them and add them as part of the pending chain
      const blocks = await timesAsync(3, i => context.makePendingBlock(3, 1, i + 1, j => ({ privateOnly: j === 1 })));

      const blobs = (await Promise.all(blocks.map(block => Blob.getBlobs(block.block.body.toBlobFields())))).flat();
      const finalBlobChallenges = await BatchedBlob.precomputeBatchedBlobChallenges(blobs);

      orchestrator.startNewEpoch(1, 1, 3, finalBlobChallenges);

      for (const { block, txs, msgs } of blocks) {
        // these operations could fail if the target circuit fails before adding all blocks or txs
        try {
          await orchestrator.startNewBlock(
            block.header.globalVariables,
            msgs,
            context.getPreviousBlockHeader(block.number),
          );
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
        await expect(orchestrator.finaliseEpoch()).resolves.not.toThrow();
      },
      LONG_TIMEOUT,
    );

    it.each([
      [
        'Private Base Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getPrivateBaseRollupProof').mockRejectedValue(msg),
      ],
      [
        'Public Base Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getPublicBaseRollupProof').mockRejectedValue(msg),
      ],
      ['Merge Rollup Failed', (msg: string) => jest.spyOn(prover, 'getMergeRollupProof').mockRejectedValue(msg)],
      [
        'Block Root Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getBlockRootRollupProof').mockRejectedValue(msg),
      ],
      [
        'Block Merge Rollup Failed',
        (msg: string) => jest.spyOn(prover, 'getBlockMergeRollupProof').mockRejectedValue(msg),
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

        await expect(() => orchestrator.finaliseEpoch()).rejects.toThrow();
      },
      LONG_TIMEOUT,
    );
  });
});
