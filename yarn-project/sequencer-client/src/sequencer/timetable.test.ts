import { MIN_EXECUTION_TIME, SequencerTimetable } from './timetable.js';
import { SequencerState } from './utils.js';

describe('sequencer-timetable', () => {
  let timetable: SequencerTimetable;

  const ETHEREUM_SLOT_DURATION = 12;
  const AZTEC_SLOT_DURATION = 36;
  const L1_PUBLISHING_TIME = 12;
  const ENFORCE_TIMETABLE = true;

  beforeEach(() => {
    timetable = new SequencerTimetable({
      ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
      aztecSlotDuration: AZTEC_SLOT_DURATION,
      l1PublishingTime: L1_PUBLISHING_TIME,
      enforce: ENFORCE_TIMETABLE,
    });
  });

  describe('constructor', () => {
    it('fails to construct an instance with too short slot duration', () => {
      const aztecSlotDuration = ETHEREUM_SLOT_DURATION;
      expect(
        () =>
          new SequencerTimetable({
            ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
            aztecSlotDuration,
            l1PublishingTime: L1_PUBLISHING_TIME,
            enforce: ENFORCE_TIMETABLE,
          }),
      ).toThrow(/initialize deadline cannot be negative/i);
    });

    it('allows a slot duration with enough time for initialization and execution', () => {
      const aztecSlotDuration = ETHEREUM_SLOT_DURATION * 3; // 36s
      const timetable = new SequencerTimetable({
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecSlotDuration,
        l1PublishingTime: L1_PUBLISHING_TIME,
        enforce: ENFORCE_TIMETABLE,
      });
      expect(timetable.initializeDeadline).toEqual(
        aztecSlotDuration -
          L1_PUBLISHING_TIME - // time to publish to L1
          2 * timetable.p2pPropagationTime - // time to propagate the attestation
          timetable.checkpointAssembleTime - // time to assemble the block
          timetable.initializationOffset - // time to prepare the block
          2 * MIN_EXECUTION_TIME, // min guaranteed time to execute the block
      );
      expect(timetable.initializeDeadline).toEqual(14);
    });
  });

  describe('maxAllowedTime', () => {
    it('computes time from slot start', () => {
      expect(timetable.getMaxAllowedTime(SequencerState.INITIALIZING_CHECKPOINT)).toEqual(timetable.initializeDeadline);
    });

    it('computes time from slot end', () => {
      expect(timetable.getMaxAllowedTime(SequencerState.COLLECTING_ATTESTATIONS)).toEqual(
        AZTEC_SLOT_DURATION - L1_PUBLISHING_TIME - timetable.p2pPropagationTime * 2,
      );
    });

    it('returns an increasing time for each stage', () => {
      const stages = [
        SequencerState.INITIALIZING_CHECKPOINT,
        SequencerState.CREATING_BLOCK,
        SequencerState.COLLECTING_ATTESTATIONS,
        SequencerState.PUBLISHING_CHECKPOINT,
      ];
      for (let i = 0; i < stages.length - 1; i++) {
        const time1 = timetable.getMaxAllowedTime(stages[i]);
        const time2 = timetable.getMaxAllowedTime(stages[i + 1]);
        expect(time1).toBeLessThan(time2!);
      }
    });
  });

  describe('assertTimeLeft', () => {
    it('throws if time is up', () => {
      expect(() =>
        timetable.assertTimeLeft(SequencerState.INITIALIZING_CHECKPOINT, timetable.initializeDeadline + 1),
      ).toThrow(/Too far into slot/);
    });

    it('does not throw if enough time left', () => {
      expect(() => timetable.assertTimeLeft(SequencerState.INITIALIZING_CHECKPOINT, 1)).not.toThrow();
    });

    it('handles negative seconds into slot', () => {
      expect(() => timetable.assertTimeLeft(SequencerState.INITIALIZING_CHECKPOINT, -1)).not.toThrow();
      expect(() => timetable.assertTimeLeft(SequencerState.PUBLISHING_CHECKPOINT, -1)).not.toThrow();
    });

    it('skips check if enforcement is off', () => {
      timetable = new SequencerTimetable({
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        l1PublishingTime: L1_PUBLISHING_TIME,
        enforce: false,
      });
      expect(() => timetable.assertTimeLeft(SequencerState.INITIALIZING_CHECKPOINT, 1000)).not.toThrow();
    });

    it('respects different deadlines per state', () => {
      // Just past initialize deadline - should fail for INITIALIZING
      const pastInit = timetable.initializeDeadline + 0.1;
      expect(() => timetable.assertTimeLeft(SequencerState.INITIALIZING_CHECKPOINT, pastInit)).toThrow();

      // But CREATING_BLOCK should still be ok
      expect(() => timetable.assertTimeLeft(SequencerState.CREATING_BLOCK, pastInit)).not.toThrow();
    });
  });

  describe('canStartNextBlock', () => {
    const AZTEC_SLOT_DURATION = 72;

    describe('single block per slot', () => {
      beforeEach(() => {
        timetable = new SequencerTimetable({
          ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
          aztecSlotDuration: AZTEC_SLOT_DURATION,
          l1PublishingTime: L1_PUBLISHING_TIME,
          enforce: ENFORCE_TIMETABLE,
        });
      });

      it('should allow starting at the beginning of the slot', () => {
        const result = timetable.canStartNextBlock(0);
        expect(result.isLastBlock).toBe(true);
        expect(result.canStart).toBe(true);
        // In single block mode, deadline dynamically splits available time between execution and re-execution
        const maxAllowed = AZTEC_SLOT_DURATION - timetable.checkpointFinalizationTime;
        const available = maxAllowed - 0;
        const expectedDeadline = 0 + available / 2;
        expect(result.deadline).toBe(expectedDeadline);
      });

      it('should allow starting within the initialize deadline', () => {
        const secondsIntoSlot = timetable.initializeDeadline - 1;
        const result = timetable.canStartNextBlock(secondsIntoSlot);
        expect(result.isLastBlock).toBe(true);
        expect(result.canStart).toBe(true);
        const maxAllowed = AZTEC_SLOT_DURATION - timetable.checkpointFinalizationTime;
        const available = maxAllowed - secondsIntoSlot;
        const expectedDeadline = secondsIntoSlot + available / 2;
        expect(result.deadline).toBe(expectedDeadline);
      });

      it('should refuse to start without enough time to build', () => {
        const secondsIntoSlot =
          AZTEC_SLOT_DURATION - timetable.checkpointFinalizationTime - 2 * timetable.minExecutionTime + 1;
        const result = timetable.canStartNextBlock(secondsIntoSlot);
        expect(result.canStart).toBe(false);
      });
    });

    describe('multiple blocks per slot', () => {
      const BLOCK_DURATION_MS = 8000; // 8 seconds

      beforeEach(() => {
        timetable = new SequencerTimetable({
          ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
          aztecSlotDuration: AZTEC_SLOT_DURATION,
          l1PublishingTime: L1_PUBLISHING_TIME,
          blockDurationMs: BLOCK_DURATION_MS,
          enforce: ENFORCE_TIMETABLE,
        });
      });

      it('should allow starting first block early in the slot', () => {
        const result = timetable.canStartNextBlock(1);
        expect(result.canStart).toBe(true);
        expect(result.isLastBlock).toBe(false);
        // First sub-slot deadline: initializationOffset + 1 * blockDuration
        expect(result.deadline).toBe(timetable.initializationOffset + 8);
      });

      it('should skip to second sub-slot if first sub-slot has insufficient time', () => {
        // If we're at 8s and first sub-slot deadline is at 9s (initOffset=1s + blockDuration=8s),
        // we only have 1s left which is < MIN_EXECUTION_TIME (2s)
        // So we should skip to sub-slot 2 (deadline at 17s)
        const result = timetable.canStartNextBlock(8);
        expect(result.canStart).toBe(true);
        expect(result.deadline).toBe(timetable.initializationOffset + 2 * 8);
      });

      it('should detect last block correctly', () => {
        // With 72s slot, 8s blocks, 1s init offset:
        // Reserved at end: 8s (last sub-slot) + 2*2s (prop) + 1s (final) + 12s (L1) = 25s
        // Available: 72 - 1 - 25 = 46s
        // Max blocks: floor(46/8) = 5
        // So if we're at second 33 (after 4 blocks would finish at 1 + 4*8 = 33),
        // we should get the 5th sub-slot as the last block
        const result = timetable.canStartNextBlock(33);
        expect(result.canStart).toBe(true);
        expect(result.isLastBlock).toBe(true);
        expect(result.deadline).toBe(timetable.initializationOffset + 5 * 8);
      });

      it('should refuse to start if no time left', () => {
        // Very late in the slot - no sub-slots available
        const result = timetable.canStartNextBlock(AZTEC_SLOT_DURATION - 10);
        expect(result.canStart).toBe(false);
        expect(result.isLastBlock).toBe(false);
      });
    });

    describe('non-enforced mode', () => {
      beforeEach(() => {
        timetable = new SequencerTimetable({
          ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
          aztecSlotDuration: AZTEC_SLOT_DURATION,
          l1PublishingTime: L1_PUBLISHING_TIME,
          enforce: false, // Non-enforced mode
        });
      });

      it('should always return canStart=true regardless of time', () => {
        // Very late in the slot - would normally be rejected
        const result = timetable.canStartNextBlock(AZTEC_SLOT_DURATION + 1000);
        expect(result.canStart).toBe(true);
        expect(result.isLastBlock).toBe(true);
      });

      it('should not return a deadline in non-enforced mode', () => {
        const result = timetable.canStartNextBlock(0);
        expect(result.deadline).toBeUndefined();
      });

      it('should not throw on assertTimeLeft regardless of time', () => {
        expect(() => timetable.assertTimeLeft(SequencerState.INITIALIZING_CHECKPOINT, 10000)).not.toThrow();
        expect(() => timetable.assertTimeLeft(SequencerState.CREATING_BLOCK, 10000)).not.toThrow();
        expect(() => timetable.assertTimeLeft(SequencerState.COLLECTING_ATTESTATIONS, 10000)).not.toThrow();
      });

      it('should still compute maxAllowedTime correctly', () => {
        // Even in non-enforced mode, time calculations should be correct for monitoring/logging
        const maxAllowed = timetable.getMaxAllowedTime(SequencerState.INITIALIZING_CHECKPOINT);
        expect(maxAllowed).toEqual(timetable.initializeDeadline);
      });
    });

    describe('edge cases', () => {
      describe('sub-slot boundary timing', () => {
        const BLOCK_DURATION_MS = 8000;

        beforeEach(() => {
          timetable = new SequencerTimetable({
            ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
            aztecSlotDuration: AZTEC_SLOT_DURATION,
            l1PublishingTime: L1_PUBLISHING_TIME,
            blockDurationMs: BLOCK_DURATION_MS,
            enforce: ENFORCE_TIMETABLE,
          });
        });

        it('should handle exact sub-slot boundary timing', () => {
          // Exactly at the first sub-slot deadline
          const exactDeadline = timetable.initializationOffset + 8;
          const result = timetable.canStartNextBlock(exactDeadline);
          expect(result.canStart).toBe(true);
          // Should skip to next sub-slot since we're exactly at the deadline
          expect(result.deadline).toBe(timetable.initializationOffset + 2 * 8);
        });

        it('should handle timing just before sub-slot boundary', () => {
          const justBefore = timetable.initializationOffset + 8 - 0.1;
          const result = timetable.canStartNextBlock(justBefore);
          expect(result.canStart).toBe(true);
          // Deadline should be in a reasonable sub-slot
          expect(result.deadline).toBeGreaterThan(justBefore);
        });

        it('should handle timing just after sub-slot boundary', () => {
          const justAfter = timetable.initializationOffset + 8 + 0.1;
          const result = timetable.canStartNextBlock(justAfter);
          expect(result.canStart).toBe(true);
          // Should skip to next sub-slot
          expect(result.deadline).toBe(timetable.initializationOffset + 2 * 8);
        });
      });

      describe('maxNumberOfBlocks calculation', () => {
        it.each([
          { aztecSlot: 36, blockDuration: 8000 },
          { aztecSlot: 72, blockDuration: 8000 },
          { aztecSlot: 120, blockDuration: 10000 },
        ])(
          'should calculate max blocks with aztecSlot=$aztecSlot blockDuration=$blockDuration)',
          ({ aztecSlot, blockDuration }) => {
            const tt = new SequencerTimetable({
              ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
              aztecSlotDuration: aztecSlot,
              l1PublishingTime: L1_PUBLISHING_TIME,
              blockDurationMs: blockDuration,
              enforce: ENFORCE_TIMETABLE,
            });

            // The max number of blocks should be positive
            const result = tt.canStartNextBlock(0);
            expect(result.canStart).toBe(true);

            // Longer slots should allow more blocks
            if (aztecSlot === 120) {
              // Should allow multiple blocks in a long slot
              const result2 = tt.canStartNextBlock(20);
              expect(result2.canStart).toBe(true);
            }
          },
        );

        it('should default to single block mode when blockDurationMs is undefined', () => {
          const tt = new SequencerTimetable({
            ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
            aztecSlotDuration: AZTEC_SLOT_DURATION,
            l1PublishingTime: L1_PUBLISHING_TIME,
            blockDurationMs: undefined,
            enforce: ENFORCE_TIMETABLE,
          });

          const result = tt.canStartNextBlock(0);
          expect(result.isLastBlock).toBe(true); // Should always be last block in single block mode
        });
      });

      describe('extreme timing scenarios', () => {
        beforeEach(() => {
          timetable = new SequencerTimetable({
            ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
            aztecSlotDuration: AZTEC_SLOT_DURATION,
            l1PublishingTime: L1_PUBLISHING_TIME,
            enforce: ENFORCE_TIMETABLE,
          });
        });

        it('should handle very early start (negative time)', () => {
          const result = timetable.canStartNextBlock(-5);
          expect(result.canStart).toBe(true);
          expect(result.isLastBlock).toBe(true);
        });

        it('should handle start exactly at initialize deadline', () => {
          const result = timetable.canStartNextBlock(timetable.initializeDeadline);
          // Should still allow starting, but with less time
          expect(result.canStart).toBe(true);
          expect(result.deadline).toBeGreaterThan(timetable.initializeDeadline);
        });

        it('should refuse start past checkpoint finalization threshold', () => {
          const tooLate = AZTEC_SLOT_DURATION - timetable.checkpointFinalizationTime + 1;
          const result = timetable.canStartNextBlock(tooLate);
          expect(result.canStart).toBe(false);
        });
      });

      describe('timing invariants', () => {
        const P2P_PROPAGATION_TIME = 2;
        const BLOCK_DURATION = 8;
        const BLOCK_DURATION_MS = BLOCK_DURATION * 1000;

        beforeEach(() => {
          timetable = new SequencerTimetable({
            ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
            aztecSlotDuration: AZTEC_SLOT_DURATION,
            l1PublishingTime: L1_PUBLISHING_TIME,
            p2pPropagationTime: P2P_PROPAGATION_TIME,
            blockDurationMs: BLOCK_DURATION_MS,
            enforce: ENFORCE_TIMETABLE,
          });
        });

        it('should reserve last sub-slot for validator re-execution', () => {
          // Last block deadline: initOffset + maxBlocks * blockDuration
          const lastBlockDeadline = timetable.initializationOffset + timetable.maxNumberOfBlocks * BLOCK_DURATION;

          // After last block deadline, no more blocks can be built
          const resultAfterLast = timetable.canStartNextBlock(lastBlockDeadline);
          expect(resultAfterLast.canStart).toBe(false);
        });

        it('should ensure time from checkpoint broadcast to attestation deadline >= blockDuration + 2*propagation', () => {
          // Required time for validators: re-execution + round-trip propagation
          const requiredTimeForValidators = BLOCK_DURATION + 2 * P2P_PROPAGATION_TIME;
          const lastBlockDeadline = timetable.initializationOffset + timetable.maxNumberOfBlocks * BLOCK_DURATION;
          const checkpointBroadcast = lastBlockDeadline + timetable.checkpointAssembleTime;
          const attestationDeadline = AZTEC_SLOT_DURATION - L1_PUBLISHING_TIME;

          const availableTimeForValidators = attestationDeadline - checkpointBroadcast;

          expect(availableTimeForValidators).toBeGreaterThanOrEqual(requiredTimeForValidators);
        });

        it('should set attestation deadline at slotDuration minus l1PublishingTime', () => {
          const attestationDeadline = timetable.getMaxAllowedTime(SequencerState.PUBLISHING_CHECKPOINT);
          expect(attestationDeadline).toBe(AZTEC_SLOT_DURATION - L1_PUBLISHING_TIME);
        });

        it('should fit all operations within slot duration', () => {
          const totalRequiredTime =
            timetable.initializationOffset +
            timetable.maxNumberOfBlocks * BLOCK_DURATION +
            BLOCK_DURATION + // last sub-slot for validators
            2 * P2P_PROPAGATION_TIME +
            timetable.checkpointAssembleTime +
            L1_PUBLISHING_TIME;

          expect(totalRequiredTime).toBeLessThanOrEqual(AZTEC_SLOT_DURATION);
        });

        it('should have minExecutionTime less than blockDuration', () => {
          expect(timetable.minExecutionTime).toBeLessThan(BLOCK_DURATION);
        });

        it('should allow starting a block at the latest possible time in multi-block mode', () => {
          const lastSubSlotDeadline = timetable.initializationOffset + timetable.maxNumberOfBlocks * BLOCK_DURATION;
          const latestStartTime = lastSubSlotDeadline - timetable.minExecutionTime;

          const result = timetable.canStartNextBlock(latestStartTime);
          expect(result.canStart).toBe(true);
          expect(result.isLastBlock).toBe(true);

          // One second later, it should not be possible
          const tooLate = timetable.canStartNextBlock(latestStartTime + 1);
          expect(tooLate.canStart).toBe(false);
        });
      });
    });
  });
});
