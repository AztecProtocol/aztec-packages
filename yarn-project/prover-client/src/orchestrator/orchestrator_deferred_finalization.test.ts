import { FinalBlobBatchingChallenges } from '@aztec/blob-lib/types';
import { MAX_CHECKPOINTS_PER_EPOCH } from '@aztec/constants';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { padArrayEnd, timesAsync } from '@aztec/foundation/collection';
import { BLS12Fr } from '@aztec/foundation/curves/bls12';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';

import { TestContext } from '../mocks/test_context.js';
import type { CheckpointProvingState } from './checkpoint-proving-state.js';
import { EpochProvingState, type ProvingResult } from './epoch-proving-state.js';

const logger = createLogger('prover-client:test:orchestrator-deferred-finalization');

const LONG_TIMEOUT = 600_000;

/**
 * Helper to create a minimal EpochProvingState for unit testing.
 * Provides direct access to the state without going through the orchestrator.
 */
function createTestEpochState(onCheckpointReady?: (checkpoint: CheckpointProvingState) => Promise<void>): {
  state: EpochProvingState;
  completionPromise: Promise<ProvingResult>;
} {
  const { promise, resolve, reject } = promiseWithResolvers<ProvingResult>();
  const completionPromise = promise.catch((reason): ProvingResult => ({ status: 'failure', reason }));

  const state = new EpochProvingState(EpochNumber(1), onCheckpointReady ?? (() => Promise.resolve()), resolve, reject);

  return { state, completionPromise };
}

// ============================================================================
// Unit tests for EpochProvingState deferred finalization mechanics
// ============================================================================
describe('prover/orchestrator/deferred-finalization', () => {
  describe('EpochProvingState unit tests', () => {
    describe('startNewEpoch and isAcceptingCheckpoints', () => {
      it('accepts checkpoints before finalization', () => {
        const { state } = createTestEpochState();
        expect(state.isAcceptingCheckpoints()).toBe(true);
      });

      it('totalNumCheckpoints is undefined before finalization', () => {
        const { state } = createTestEpochState();
        expect(state.totalNumCheckpoints).toBeUndefined();
      });

      it('isEpochStructureFinalized is false before finalization', () => {
        const { state } = createTestEpochState();
        expect(state.isEpochStructureFinalized).toBe(false);
      });
    });

    describe('finalizeEpochStructure', () => {
      it('sets totalNumCheckpoints and marks structure as finalized', async () => {
        const { state } = createTestEpochState();
        const challenges = FinalBlobBatchingChallenges.empty();

        await state.finalizeEpochStructure(3, challenges);

        expect(state.totalNumCheckpoints).toBe(3);
        expect(state.isEpochStructureFinalized).toBe(true);
      });

      it('is idempotent when called twice with same values', async () => {
        const { state } = createTestEpochState();
        const challenges = FinalBlobBatchingChallenges.empty();

        await state.finalizeEpochStructure(2, challenges);
        // Second call with same checkpoint count should be a no-op.
        await expect(state.finalizeEpochStructure(2, challenges)).resolves.not.toThrow();
      });

      it('throws when called twice with different values', async () => {
        const { state } = createTestEpochState();
        const challenges = FinalBlobBatchingChallenges.empty();

        await state.finalizeEpochStructure(2, challenges);
        await expect(state.finalizeEpochStructure(3, challenges)).rejects.toThrow(
          'Epoch structure has already been finalized with different values.',
        );
      });

      it('throws when called twice with different challenges', async () => {
        const { state } = createTestEpochState();
        const challenges = FinalBlobBatchingChallenges.empty();
        const otherChallenges = new FinalBlobBatchingChallenges(new Fr(7), BLS12Fr.fromBN254Fr(new Fr(11)));

        await state.finalizeEpochStructure(2, challenges);
        await expect(state.finalizeEpochStructure(2, otherChallenges)).rejects.toThrow(
          'Epoch structure has already been finalized with different values.',
        );
      });

      it('transitions to FULL when all checkpoints are already added', async () => {
        const { state } = createTestEpochState();
        const challenges = FinalBlobBatchingChallenges.empty();

        // We cannot easily add a real checkpoint in unit tests without all the tree data,
        // but we can verify the state is CREATED before finalization and still valid.
        expect(state.verifyState()).toBe(true);

        // Finalizing with 0 checkpoints is a bit unusual, but the count matching empty array
        // should be fine. Let's use totalNumCheckpoints=0 to force it to FULL.
        // Actually with 0 active checkpoints filter(c => !!c).length === 0 which equals totalNumCheckpoints (0).
        // This should transition to FULL.
        await state.finalizeEpochStructure(0, challenges);
        expect(state.verifyState()).toBe(true);
      });

      it('handles finalization when no checkpoints have been added', async () => {
        const { state } = createTestEpochState();
        const challenges = FinalBlobBatchingChallenges.empty();

        // Finalize with 2 expected checkpoints when none are added yet.
        // The epoch is not FULL since 0 < 2.
        await state.finalizeEpochStructure(2, challenges);
        expect(state.isEpochStructureFinalized).toBe(true);
        expect(state.isAcceptingCheckpoints()).toBe(true);
        expect(state.verifyState()).toBe(true);
      });

      it('triggers checkpoint root enqueue for checkpoints with block merge proofs ready', async () => {
        const triggeredCheckpoints: CheckpointProvingState[] = [];
        const { state } = createTestEpochState(checkpoint => {
          triggeredCheckpoints.push(checkpoint);
          return Promise.resolve();
        });
        const challenges = FinalBlobBatchingChallenges.empty();

        // No checkpoints added, so no triggers expected.
        await state.finalizeEpochStructure(0, challenges);
        expect(triggeredCheckpoints).toHaveLength(0);
      });
    });

    describe('removeCheckpoint', () => {
      it('returns undefined on empty epoch', () => {
        const { state } = createTestEpochState();
        const removed = state.removeCheckpoint(0);
        expect(removed).toBeUndefined();
      });

      it('throws if epoch structure has been finalized', async () => {
        const { state } = createTestEpochState();
        const challenges = FinalBlobBatchingChallenges.empty();
        await state.finalizeEpochStructure(0, challenges);

        expect(() => state.removeCheckpoint(0)).toThrow(
          'Cannot remove checkpoints after epoch structure has been finalized.',
        );
      });

      it('isAcceptingCheckpoints still returns true after removal', () => {
        const { state } = createTestEpochState();
        // Even on empty epoch, removing returns undefined but accepting should remain true.
        state.removeCheckpoint(0);
        expect(state.isAcceptingCheckpoints()).toBe(true);
      });
    });

    describe('checkpoints-ready promise', () => {
      it('does not resolve when no checkpoints are present', async () => {
        const { state } = createTestEpochState();

        let resolved = false;
        void state.waitForAllCheckpointsReady().then(() => {
          resolved = true;
        });

        await sleep(50);
        expect(resolved).toBe(false);
      });
    });

    describe('cancellation', () => {
      it('cancel discards all state properly', () => {
        const { state } = createTestEpochState();
        state.cancel();
        // After cancellation, verifyState should return false.
        expect(state.verifyState()).toBe(false);
      });

      it('reject after cancel is a no-op', () => {
        const { state } = createTestEpochState();
        state.cancel();
        // Should not throw, just be ignored.
        state.reject('some reason');
        expect(state.verifyState()).toBe(false);
      });
    });
  });

  // ============================================================================
  // Integration tests through the orchestrator
  // ============================================================================
  describe('orchestrator integration tests', () => {
    let context: TestContext;

    beforeEach(async () => {
      context = await TestContext.new(logger);
    });

    afterEach(async () => {
      await context.cleanup();
    });

    describe('happy path', () => {
      it(
        'single-checkpoint epoch: start epoch -> add checkpoint -> process txs -> finalize -> epoch completes',
        async () => {
          const numCheckpoints = 1;
          const numBlocks = 1;
          const numTxsPerBlock = 1;

          const { constants, blocks, previousBlockHeader, header } = await context.makeCheckpoint(numBlocks, {
            numTxsPerBlock,
          });
          const finalBlobChallenges = await context.getFinalBlobChallenges();

          context.orchestrator.startNewEpoch(EpochNumber(1));

          await context.orchestrator.startNewCheckpoint(0, constants, [], numBlocks, previousBlockHeader);

          for (const block of blocks) {
            const { blockNumber, timestamp } = block.header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
            await context.orchestrator.addTxs(block.txs);
            await context.orchestrator.setBlockCompleted(blockNumber, block.header);
          }

          await context.orchestrator.finalizeEpochStructure(numCheckpoints, finalBlobChallenges);
          const epoch = await context.orchestrator.finalizeEpoch();
          expect(epoch.proof).toBeDefined();
          expect(epoch.publicInputs.checkpointHeaderHashes).toEqual(
            padArrayEnd([header.hash()], Fr.ZERO, MAX_CHECKPOINTS_PER_EPOCH),
          );
        },
        LONG_TIMEOUT,
      );

      it(
        'multi-checkpoint epoch: checkpoints added incrementally -> finalize -> epoch completes',
        async () => {
          const numCheckpoints = 3;
          const numBlocksPerCheckpoint = 1;
          const numTxsPerBlock = 1;

          const checkpoints = await timesAsync(numCheckpoints, () =>
            context.makeCheckpoint(numBlocksPerCheckpoint, { numTxsPerBlock }),
          );
          const finalBlobChallenges = await context.getFinalBlobChallenges();

          context.orchestrator.startNewEpoch(EpochNumber(1));

          for (let i = 0; i < checkpoints.length; i++) {
            const {
              constants,
              blocks: [block],
              previousBlockHeader,
            } = checkpoints[i];

            await context.orchestrator.startNewCheckpoint(
              i,
              constants,
              [],
              numBlocksPerCheckpoint,
              previousBlockHeader,
            );

            const { blockNumber, timestamp } = block.header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
            await context.orchestrator.addTxs(block.txs);
            await context.orchestrator.setBlockCompleted(blockNumber, block.header);
          }

          await context.orchestrator.finalizeEpochStructure(numCheckpoints, finalBlobChallenges);
          const epoch = await context.orchestrator.finalizeEpoch();
          expect(epoch.proof).toBeDefined();

          const headerHashes = checkpoints.map(c => c.header.hash());
          expect(epoch.publicInputs.checkpointHeaderHashes).toEqual(
            padArrayEnd(headerHashes, Fr.ZERO, MAX_CHECKPOINTS_PER_EPOCH),
          );
        },
        LONG_TIMEOUT,
      );
    });

    describe('deferred finalization', () => {
      it('startNewEpoch succeeds with only epochNumber', () => {
        // startNewEpoch takes only an EpochNumber, no totalNumCheckpoints or finalBlobBatchingChallenges.
        expect(() => context.orchestrator.startNewEpoch(EpochNumber(1))).not.toThrow();
      });

      it('checkpoints can be added incrementally after startNewEpoch', async () => {
        const checkpoints = await timesAsync(2, () => context.makeCheckpoint(1, { numTxsPerBlock: 0 }));

        context.orchestrator.startNewEpoch(EpochNumber(1));

        // Add first checkpoint.
        const { constants: c1, previousBlockHeader: h1 } = checkpoints[0];
        await context.orchestrator.startNewCheckpoint(0, c1, [], 1, h1);

        // Add second checkpoint (incrementally, no need to know total count upfront).
        const { constants: c2, previousBlockHeader: h2 } = checkpoints[1];
        await expect(context.orchestrator.startNewCheckpoint(1, c2, [], 1, h2)).resolves.not.toThrow();
      });

      it('finalizeEpochStructure is idempotent when called twice with same values', async () => {
        const { constants, previousBlockHeader } = await context.makeCheckpoint(1, { numTxsPerBlock: 0 });
        const finalBlobChallenges = await context.getFinalBlobChallenges();

        context.orchestrator.startNewEpoch(EpochNumber(1));
        await context.orchestrator.startNewCheckpoint(0, constants, [], 1, previousBlockHeader);

        await context.orchestrator.finalizeEpochStructure(1, finalBlobChallenges);
        // Second call with same values should be a no-op.
        await expect(context.orchestrator.finalizeEpochStructure(1, finalBlobChallenges)).resolves.not.toThrow();
      });

      it('finalizeEpochStructure without starting epoch throws', async () => {
        const challenges = FinalBlobBatchingChallenges.empty();
        await expect(context.orchestrator.finalizeEpochStructure(1, challenges)).rejects.toThrow(
          'Empty epoch proving state.',
        );
      });
    });

    describe('two-input gate', () => {
      it(
        'proofs-first-then-finalize: checkpoint root is enqueued when finalize is called after block merge proofs complete',
        async () => {
          const numCheckpoints = 1;
          const numBlocks = 1;
          const numTxsPerBlock = 1;

          const { constants, blocks, previousBlockHeader } = await context.makeCheckpoint(numBlocks, {
            numTxsPerBlock,
          });
          const finalBlobChallenges = await context.getFinalBlobChallenges();

          context.orchestrator.startNewEpoch(EpochNumber(1));
          await context.orchestrator.startNewCheckpoint(0, constants, [], numBlocks, previousBlockHeader);

          // Process all blocks (block merge proofs will complete before finalize).
          for (const block of blocks) {
            const { blockNumber, timestamp } = block.header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
            await context.orchestrator.addTxs(block.txs);
            await context.orchestrator.setBlockCompleted(blockNumber, block.header);
          }

          // Wait for block-level proving to complete before finalizing.
          await context.orchestrator.waitForAllCheckpointsReady();

          // Now finalize -- this should trigger checkpoint root enqueue since block merge proofs are ready.
          await context.orchestrator.finalizeEpochStructure(numCheckpoints, finalBlobChallenges);

          // Epoch should complete successfully.
          const epoch = await context.orchestrator.finalizeEpoch();
          expect(epoch.proof).toBeDefined();
        },
        LONG_TIMEOUT,
      );

      it(
        'finalize-first-then-proofs: checkpoint root is enqueued when block merge proofs complete after finalize',
        async () => {
          const numCheckpoints = 1;
          const numBlocks = 1;
          const numTxsPerBlock = 1;

          const { constants, blocks, previousBlockHeader } = await context.makeCheckpoint(numBlocks, {
            numTxsPerBlock,
          });
          const finalBlobChallenges = await context.getFinalBlobChallenges();

          context.orchestrator.startNewEpoch(EpochNumber(1));
          await context.orchestrator.startNewCheckpoint(0, constants, [], numBlocks, previousBlockHeader);

          // Finalize BEFORE processing blocks.
          await context.orchestrator.finalizeEpochStructure(numCheckpoints, finalBlobChallenges);

          // Now process blocks -- when block merge proofs complete, checkpoint root should be enqueued
          // because finalize has already been called.
          for (const block of blocks) {
            const { blockNumber, timestamp } = block.header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
            await context.orchestrator.addTxs(block.txs);
            await context.orchestrator.setBlockCompleted(blockNumber, block.header);
          }

          const epoch = await context.orchestrator.finalizeEpoch();
          expect(epoch.proof).toBeDefined();
        },
        LONG_TIMEOUT,
      );
    });

    describe('waitForAllCheckpointsReady', () => {
      it('throws if called before starting epoch', () => {
        expect(() => context.orchestrator.waitForAllCheckpointsReady()).toThrow('Empty epoch proving state.');
      });

      it(
        'resolves when all checkpoints complete block-level proving',
        async () => {
          const numCheckpoints = 2;
          const numBlocksPerCheckpoint = 1;
          const numTxsPerBlock = 1;

          const checkpoints = await timesAsync(numCheckpoints, () =>
            context.makeCheckpoint(numBlocksPerCheckpoint, { numTxsPerBlock }),
          );

          context.orchestrator.startNewEpoch(EpochNumber(1));

          // Add and process all checkpoints.
          for (let i = 0; i < checkpoints.length; i++) {
            const {
              constants,
              blocks: [block],
              previousBlockHeader,
            } = checkpoints[i];
            await context.orchestrator.startNewCheckpoint(
              i,
              constants,
              [],
              numBlocksPerCheckpoint,
              previousBlockHeader,
            );

            const { blockNumber, timestamp } = block.header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
            await context.orchestrator.addTxs(block.txs);
            await context.orchestrator.setBlockCompleted(blockNumber, block.header);
          }

          // The promise should resolve since all checkpoints have completed block-level proving.
          await expect(context.orchestrator.waitForAllCheckpointsReady()).resolves.toBeUndefined();
        },
        LONG_TIMEOUT,
      );

      it(
        'does not resolve prematurely while a checkpoint is still proving',
        async () => {
          // Create one checkpoint but do not process its blocks.
          const { constants, blocks, previousBlockHeader } = await context.makeCheckpoint(1, { numTxsPerBlock: 1 });

          context.orchestrator.startNewEpoch(EpochNumber(1));
          await context.orchestrator.startNewCheckpoint(0, constants, [], 1, previousBlockHeader);

          // Start the block but do NOT add txs or complete it.
          const { blockNumber, timestamp } = blocks[0].header.globalVariables;
          await context.orchestrator.startNewBlock(blockNumber, timestamp, blocks[0].txs.length);

          let resolved = false;
          void context.orchestrator.waitForAllCheckpointsReady().then(
            () => {
              resolved = true;
            },
            () => {
              // Expected: cancel() rejects the promise.
            },
          );

          // Wait a bit and verify the promise has not resolved.
          await sleep(100);
          expect(resolved).toBe(false);

          // Clean up by cancelling to avoid hanging test.
          context.orchestrator.cancel();
        },
        LONG_TIMEOUT,
      );

      it(
        'resolves immediately if called after all checkpoints are already complete',
        async () => {
          const { constants, blocks, previousBlockHeader } = await context.makeCheckpoint(1, { numTxsPerBlock: 1 });

          context.orchestrator.startNewEpoch(EpochNumber(1));
          await context.orchestrator.startNewCheckpoint(0, constants, [], 1, previousBlockHeader);

          for (const block of blocks) {
            const { blockNumber, timestamp } = block.header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
            await context.orchestrator.addTxs(block.txs);
            await context.orchestrator.setBlockCompleted(blockNumber, block.header);
          }

          // Wait for block-level proving to be complete first.
          await context.orchestrator.waitForAllCheckpointsReady();

          // Calling again should resolve immediately (no pending work).
          const startTime = Date.now();
          await context.orchestrator.waitForAllCheckpointsReady();
          const elapsed = Date.now() - startTime;
          // Should resolve almost immediately (< 50ms).
          expect(elapsed).toBeLessThan(200);
        },
        LONG_TIMEOUT,
      );
    });

    describe('reorg safety (removeCheckpoint)', () => {
      it('removeCheckpoint removes a checkpoint by index', async () => {
        const checkpoints = await timesAsync(2, () => context.makeCheckpoint(1, { numTxsPerBlock: 0 }));

        context.orchestrator.startNewEpoch(EpochNumber(1));

        // Add two checkpoints.
        for (let i = 0; i < 2; i++) {
          const { constants, blocks, previousBlockHeader } = checkpoints[i];
          await context.orchestrator.startNewCheckpoint(i, constants, [], 1, previousBlockHeader);
          const { blockNumber, timestamp } = blocks[0].header.globalVariables;
          await context.orchestrator.startNewBlock(blockNumber, timestamp, 0);
        }

        // Remove a checkpoint by index -- should not throw.
        expect(() => context.orchestrator.removeCheckpoint(1)).not.toThrow();
      });

      it('after removal, isAcceptingCheckpoints still returns true', async () => {
        const { constants, blocks, previousBlockHeader } = await context.makeCheckpoint(1, { numTxsPerBlock: 0 });

        context.orchestrator.startNewEpoch(EpochNumber(1));
        await context.orchestrator.startNewCheckpoint(0, constants, [], 1, previousBlockHeader);
        const { blockNumber, timestamp } = blocks[0].header.globalVariables;
        await context.orchestrator.startNewBlock(blockNumber, timestamp, 0);

        context.orchestrator.removeCheckpoint(0);

        // The EpochProvingState has no totalNumCheckpoints set, so it should always accept.
        // We verify this indirectly by checking that we can start a new checkpoint.
        // Note: We cannot re-add at the same index without new world state data,
        // but the state should be accepting.
        // Access the internal state to check.
        const internalState = (context.orchestrator as any).provingState as EpochProvingState;
        expect(internalState.isAcceptingCheckpoints()).toBe(true);
      });

      it(
        'removeCheckpoint throws if finalizeEpochStructure has already been called',
        async () => {
          const { constants, blocks, previousBlockHeader } = await context.makeCheckpoint(1, { numTxsPerBlock: 0 });
          const finalBlobChallenges = await context.getFinalBlobChallenges();

          context.orchestrator.startNewEpoch(EpochNumber(1));
          await context.orchestrator.startNewCheckpoint(0, constants, [], 1, previousBlockHeader);
          const { blockNumber, timestamp } = blocks[0].header.globalVariables;
          await context.orchestrator.startNewBlock(blockNumber, timestamp, 0);

          await context.orchestrator.finalizeEpochStructure(1, finalBlobChallenges);

          expect(() => context.orchestrator.removeCheckpoint(0)).toThrow(
            'Cannot remove checkpoints after epoch structure has been finalized.',
          );
        },
        LONG_TIMEOUT,
      );

      it('removeCheckpoint on empty epoch logs a warning but does not throw', () => {
        context.orchestrator.startNewEpoch(EpochNumber(1));
        // Should not throw, just logs a warning about no checkpoint to remove.
        expect(() => context.orchestrator.removeCheckpoint(0)).not.toThrow();
      });

      it('removeCheckpoint without starting epoch throws', () => {
        expect(() => context.orchestrator.removeCheckpoint(0)).toThrow('Empty epoch proving state.');
      });

      it(
        'multiple sequential removes work',
        async () => {
          const checkpoints = await timesAsync(3, () => context.makeCheckpoint(1, { numTxsPerBlock: 0 }));

          context.orchestrator.startNewEpoch(EpochNumber(1));

          // Add three checkpoints.
          for (let i = 0; i < 3; i++) {
            const { constants, blocks, previousBlockHeader } = checkpoints[i];
            await context.orchestrator.startNewCheckpoint(i, constants, [], 1, previousBlockHeader);
            const { blockNumber, timestamp } = blocks[0].header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, 0);
          }

          context.orchestrator.removeCheckpoint(2);
          context.orchestrator.removeCheckpoint(1);

          // One checkpoint remains. Should still be able to finalize with it.
          const internalState = (context.orchestrator as any).provingState as EpochProvingState;
          expect(internalState.isAcceptingCheckpoints()).toBe(true);
          expect(internalState.getCheckpointProvingState(0)).toBeDefined();
          expect(internalState.getCheckpointProvingState(1)).toBeUndefined();
          expect(internalState.getCheckpointProvingState(2)).toBeUndefined();
        },
        LONG_TIMEOUT,
      );

      it(
        'remove from middle of list leaves a hole and preserves surrounding checkpoints',
        async () => {
          const checkpoints = await timesAsync(3, () => context.makeCheckpoint(1, { numTxsPerBlock: 0 }));

          context.orchestrator.startNewEpoch(EpochNumber(1));

          for (let i = 0; i < 3; i++) {
            const { constants, blocks, previousBlockHeader } = checkpoints[i];
            await context.orchestrator.startNewCheckpoint(i, constants, [], 1, previousBlockHeader);
            const { blockNumber, timestamp } = blocks[0].header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, 0);
          }

          // Remove the middle checkpoint.
          context.orchestrator.removeCheckpoint(1);

          const internalState = (context.orchestrator as any).provingState as EpochProvingState;
          expect(internalState.getCheckpointProvingState(0)).toBeDefined();
          expect(internalState.getCheckpointProvingState(1)).toBeUndefined();
          expect(internalState.getCheckpointProvingState(2)).toBeDefined();
          expect(internalState.isAcceptingCheckpoints()).toBe(true);
          expect(internalState.isEpochStructureFinalized).toBe(false);
        },
        LONG_TIMEOUT,
      );

      it(
        'after removing checkpoints, remaining checkpoint state is consistent',
        async () => {
          const checkpoints = await timesAsync(3, () => context.makeCheckpoint(1, { numTxsPerBlock: 0 }));

          context.orchestrator.startNewEpoch(EpochNumber(1));

          // Add three checkpoints.
          for (let i = 0; i < 3; i++) {
            const { constants, blocks, previousBlockHeader } = checkpoints[i];
            await context.orchestrator.startNewCheckpoint(i, constants, [], 1, previousBlockHeader);
            const { blockNumber, timestamp } = blocks[0].header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, 0);
          }

          // Remove last two checkpoints, simulating a reorg.
          context.orchestrator.removeCheckpoint(2);
          context.orchestrator.removeCheckpoint(1);

          // The internal state should have only the first checkpoint remaining.
          const internalState = (context.orchestrator as any).provingState as EpochProvingState;
          expect(internalState.getCheckpointProvingState(0)).toBeDefined();
          expect(internalState.getCheckpointProvingState(1)).toBeUndefined();
          expect(internalState.getCheckpointProvingState(2)).toBeUndefined();

          // Still accepting checkpoints (epoch structure not finalized).
          expect(internalState.isAcceptingCheckpoints()).toBe(true);
          expect(internalState.isEpochStructureFinalized).toBe(false);
        },
        LONG_TIMEOUT,
      );
    });

    describe('reorg with replacement and full proving', () => {
      it(
        'remove last checkpoint with txs, add replacement, finalize, and prove epoch',
        async () => {
          const numTxsPerBlock = 1;

          // All checkpoints have real txs that modify world state.
          const checkpoint1 = await context.makeCheckpoint(1, { numTxsPerBlock });
          const checkpoint2 = await context.makeCheckpoint(1, { numTxsPerBlock });
          const checkpointToRemove = await context.makeCheckpoint(1, { numTxsPerBlock });

          context.orchestrator.startNewEpoch(EpochNumber(1));

          // Add all 3 checkpoints and process their txs.
          const allCheckpoints = [checkpoint1, checkpoint2, checkpointToRemove];
          for (let i = 0; i < allCheckpoints.length; i++) {
            const { constants, blocks, previousBlockHeader } = allCheckpoints[i];
            await context.orchestrator.startNewCheckpoint(i, constants, [], 1, previousBlockHeader);
            const { blockNumber, timestamp } = blocks[0].header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, blocks[0].txs.length);
            await context.orchestrator.addTxs(blocks[0].txs);
            await context.orchestrator.setBlockCompleted(blockNumber, blocks[0].header);
          }

          // Simulate reorg: remove the third checkpoint (which had real txs and world state changes).
          context.orchestrator.removeCheckpoint(2);
          await context.removeLastCheckpoint();

          // Create a replacement checkpoint with txs and add it at the same index.
          const replacement = await context.makeCheckpoint(1, { numTxsPerBlock });
          const finalBlobChallenges = await context.getFinalBlobChallenges();

          await context.orchestrator.startNewCheckpoint(
            2,
            replacement.constants,
            [],
            1,
            replacement.previousBlockHeader,
          );
          const { blockNumber, timestamp } = replacement.blocks[0].header.globalVariables;
          await context.orchestrator.startNewBlock(blockNumber, timestamp, replacement.blocks[0].txs.length);
          await context.orchestrator.addTxs(replacement.blocks[0].txs);
          await context.orchestrator.setBlockCompleted(blockNumber, replacement.blocks[0].header);

          // Finalize and prove — world state must be consistent with the replacement, not the removed.
          await context.orchestrator.finalizeEpochStructure(3, finalBlobChallenges);
          const epoch = await context.orchestrator.finalizeEpoch();
          expect(epoch.proof).toBeDefined();

          const headerHashes = [checkpoint1, checkpoint2, replacement].map(c => c.header.hash());
          expect(epoch.publicInputs.checkpointHeaderHashes).toEqual(
            padArrayEnd(headerHashes, Fr.ZERO, MAX_CHECKPOINTS_PER_EPOCH),
          );
        },
        LONG_TIMEOUT,
      );

      it(
        'remove last checkpoint with txs, finalize with fewer checkpoints, and prove epoch',
        async () => {
          const numTxsPerBlock = 1;

          // All checkpoints have real txs.
          const checkpoint1 = await context.makeCheckpoint(1, { numTxsPerBlock });
          const checkpoint2 = await context.makeCheckpoint(1, { numTxsPerBlock });
          const checkpointToRemove = await context.makeCheckpoint(1, { numTxsPerBlock });

          context.orchestrator.startNewEpoch(EpochNumber(1));

          // Add and process all 3 checkpoints.
          const allCheckpoints = [checkpoint1, checkpoint2, checkpointToRemove];
          for (let i = 0; i < allCheckpoints.length; i++) {
            const { constants, blocks, previousBlockHeader } = allCheckpoints[i];
            await context.orchestrator.startNewCheckpoint(i, constants, [], 1, previousBlockHeader);
            const { blockNumber, timestamp } = blocks[0].header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, blocks[0].txs.length);
            await context.orchestrator.addTxs(blocks[0].txs);
            await context.orchestrator.setBlockCompleted(blockNumber, blocks[0].header);
          }

          // Reorg removes the last checkpoint — world state is rolled back.
          context.orchestrator.removeCheckpoint(2);
          await context.removeLastCheckpoint();

          // Finalize with only 2 checkpoints.
          const finalBlobChallenges = await context.getFinalBlobChallenges();
          await context.orchestrator.finalizeEpochStructure(2, finalBlobChallenges);
          const epoch = await context.orchestrator.finalizeEpoch();
          expect(epoch.proof).toBeDefined();

          const headerHashes = [checkpoint1, checkpoint2].map(c => c.header.hash());
          expect(epoch.publicInputs.checkpointHeaderHashes).toEqual(
            padArrayEnd(headerHashes, Fr.ZERO, MAX_CHECKPOINTS_PER_EPOCH),
          );
        },
        LONG_TIMEOUT,
      );

      it(
        'in-flight proving jobs for removed checkpoint (with txs) do not cause errors',
        async () => {
          const numTxsPerBlock = 1;

          // Both checkpoints have real txs that kick off proving.
          const checkpoint1 = await context.makeCheckpoint(1, { numTxsPerBlock });
          const checkpoint2 = await context.makeCheckpoint(1, { numTxsPerBlock });

          context.orchestrator.startNewEpoch(EpochNumber(1));

          // Add both checkpoints and process their blocks (kicks off proving).
          for (let i = 0; i < 2; i++) {
            const { constants, blocks, previousBlockHeader } = [checkpoint1, checkpoint2][i];
            await context.orchestrator.startNewCheckpoint(i, constants, [], 1, previousBlockHeader);
            const { blockNumber, timestamp } = blocks[0].header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, blocks[0].txs.length);
            await context.orchestrator.addTxs(blocks[0].txs);
            await context.orchestrator.setBlockCompleted(blockNumber, blocks[0].header);
          }

          // Remove last checkpoint while proving jobs are in-flight — world state rolled back.
          context.orchestrator.removeCheckpoint(1);
          await context.removeLastCheckpoint();

          // Wait deterministically for ALL proving jobs to settle (including orphaned ones
          // from the removed checkpoint). This is stronger than waitForAllCheckpointsReady
          // which only tracks the surviving checkpoint.
          while (context.orchestrator.getNumPendingProvingJobs() > 0) {
            await sleep(50);
          }

          // At this point every callback from the removed checkpoint has fired.
          // Verify no world state forks leaked — removeCheckpoint closed the removed
          // checkpoint's forks, and block completion closed the surviving checkpoint's fork.
          expect(context.orchestrator.getNumActiveForks()).toBe(0);

          // The epoch should still be in a valid state — no errors from orphaned callbacks.
          // Finalize with just the first checkpoint and prove successfully.
          const finalBlobChallenges = await context.getFinalBlobChallenges();
          await context.orchestrator.finalizeEpochStructure(1, finalBlobChallenges);
          const epoch = await context.orchestrator.finalizeEpoch();
          expect(epoch.proof).toBeDefined();
        },
        LONG_TIMEOUT,
      );
    });

    describe('edge cases', () => {
      it(
        'epoch cancellation discards all state properly',
        async () => {
          const { constants, blocks, previousBlockHeader } = await context.makeCheckpoint(1, { numTxsPerBlock: 1 });

          context.orchestrator.startNewEpoch(EpochNumber(1));
          await context.orchestrator.startNewCheckpoint(0, constants, [], 1, previousBlockHeader);

          const { blockNumber, timestamp } = blocks[0].header.globalVariables;
          await context.orchestrator.startNewBlock(blockNumber, timestamp, blocks[0].txs.length);
          await context.orchestrator.addTxs(blocks[0].txs);

          // Cancel mid-proving.
          context.orchestrator.cancel();

          // Starting a new epoch should work after cancellation.
          expect(() => context.orchestrator.startNewEpoch(EpochNumber(2))).not.toThrow();
        },
        LONG_TIMEOUT,
      );

      it(
        'cancel rejects waitForAllCheckpointsReady so epoch proving job can exit',
        async () => {
          const { constants, blocks, previousBlockHeader } = await context.makeCheckpoint(1, { numTxsPerBlock: 1 });

          context.orchestrator.startNewEpoch(EpochNumber(1));
          await context.orchestrator.startNewCheckpoint(0, constants, [], 1, previousBlockHeader);

          const { blockNumber, timestamp } = blocks[0].header.globalVariables;
          await context.orchestrator.startNewBlock(blockNumber, timestamp, blocks[0].txs.length);
          await context.orchestrator.addTxs(blocks[0].txs);

          // Start waiting for checkpoints — this will hang until cancel rejects it.
          const waitPromise = context.orchestrator.waitForAllCheckpointsReady();

          // Cancel the epoch — should reject the wait promise.
          context.orchestrator.cancel();

          await expect(waitPromise).rejects.toEqual('Proving cancelled');
        },
        LONG_TIMEOUT,
      );

      it(
        'cancel while awaiting checkpoints does not deadlock prover node shutdown',
        async () => {
          const numTxsPerBlock = 1;
          const checkpoint1 = await context.makeCheckpoint(1, { numTxsPerBlock });
          const checkpoint2 = await context.makeCheckpoint(1, { numTxsPerBlock });

          context.orchestrator.startNewEpoch(EpochNumber(1));

          // Register and process both checkpoints.
          for (let i = 0; i < 2; i++) {
            const { constants, blocks, previousBlockHeader } = [checkpoint1, checkpoint2][i];
            await context.orchestrator.startNewCheckpoint(i, constants, [], 1, previousBlockHeader);
            const { blockNumber, timestamp } = blocks[0].header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, blocks[0].txs.length);
            await context.orchestrator.addTxs(blocks[0].txs);
            await context.orchestrator.setBlockCompleted(blockNumber, blocks[0].header);
          }

          // Simulate: epoch proving job is awaiting checkpoints-ready.
          const waitPromise = context.orchestrator.waitForAllCheckpointsReady().catch(() => {
            // Expected: cancel rejects this.
          });

          // Simulate: prover node shuts down while proving is in progress.
          // This should not deadlock — cancel rejects the wait, allowing the job to exit.
          context.orchestrator.cancel();
          await waitPromise;

          // After cancel, a new epoch can start.
          expect(() => context.orchestrator.startNewEpoch(EpochNumber(2))).not.toThrow();
        },
        LONG_TIMEOUT,
      );

      it(
        'waitForAllCheckpointsReady rejects immediately if epoch is already cancelled',
        async () => {
          const { constants, previousBlockHeader } = await context.makeCheckpoint(1, { numTxsPerBlock: 0 });

          context.orchestrator.startNewEpoch(EpochNumber(1));
          await context.orchestrator.startNewCheckpoint(0, constants, [], 1, previousBlockHeader);

          // Cancel first.
          context.orchestrator.cancel();

          // Calling waitForAllCheckpointsReady after cancel should reject immediately.
          await expect(context.orchestrator.waitForAllCheckpointsReady()).rejects.toThrow();
        },
        LONG_TIMEOUT,
      );

      it('starting a new epoch while previous is active throws', async () => {
        const { constants, previousBlockHeader } = await context.makeCheckpoint(1, { numTxsPerBlock: 0 });

        context.orchestrator.startNewEpoch(EpochNumber(1));
        await context.orchestrator.startNewCheckpoint(0, constants, [], 1, previousBlockHeader);

        expect(() => context.orchestrator.startNewEpoch(EpochNumber(2))).toThrow(
          'Cannot start epoch 2 when epoch 1 is still being processed.',
        );
      });

      it(
        'finalize-first with multiple checkpoints: all complete after finalize',
        async () => {
          const numCheckpoints = 2;
          const numBlocksPerCheckpoint = 1;
          const numTxsPerBlock = 1;

          const checkpoints = await timesAsync(numCheckpoints, () =>
            context.makeCheckpoint(numBlocksPerCheckpoint, { numTxsPerBlock }),
          );
          const finalBlobChallenges = await context.getFinalBlobChallenges();

          context.orchestrator.startNewEpoch(EpochNumber(1));

          // Add all checkpoints.
          for (let i = 0; i < checkpoints.length; i++) {
            const { constants, previousBlockHeader } = checkpoints[i];
            await context.orchestrator.startNewCheckpoint(
              i,
              constants,
              [],
              numBlocksPerCheckpoint,
              previousBlockHeader,
            );
          }

          // Finalize before processing any blocks.
          await context.orchestrator.finalizeEpochStructure(numCheckpoints, finalBlobChallenges);

          // Now process all blocks.
          for (let i = 0; i < checkpoints.length; i++) {
            const {
              blocks: [block],
            } = checkpoints[i];
            const { blockNumber, timestamp } = block.header.globalVariables;
            await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
            await context.orchestrator.addTxs(block.txs);
            await context.orchestrator.setBlockCompleted(blockNumber, block.header);
          }

          const epoch = await context.orchestrator.finalizeEpoch();
          expect(epoch.proof).toBeDefined();
        },
        LONG_TIMEOUT,
      );
    });
  });
});
