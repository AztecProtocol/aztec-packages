import { DEFAULT_ATTESTATION_PROPAGATION_TIME } from '../config.js';
import { BLOCK_VALIDATION_TIME, MIN_EXECUTION_TIME, SequencerTimetable } from './timetable.js';
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

    it('allows a slot duration of at least three ethereum slots', () => {
      const aztecSlotDuration = ETHEREUM_SLOT_DURATION * 3;
      const timetable = new SequencerTimetable({
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecSlotDuration,
        l1PublishingTime: L1_PUBLISHING_TIME,
        enforce: ENFORCE_TIMETABLE,
      });
      expect(timetable.initializeDeadline).toEqual(
        aztecSlotDuration -
          L1_PUBLISHING_TIME - // time to publish to L1
          2 * timetable.attestationPropagationTime - // time to propagate the attestation
          timetable.blockValidationTime - // time to validate the block
          timetable.blockPrepareTime - // time to prepare the block
          2 * MIN_EXECUTION_TIME, // min guaranteed time to execute the block
      );
      expect(timetable.initializeDeadline).toEqual(12);
    });
  });

  describe('maxAllowedTime', () => {
    it('computes time from slot start', () => {
      expect(timetable.getMaxAllowedTime(SequencerState.INITIALIZING_CHECKPOINT)).toEqual(timetable.initializeDeadline);
    });

    it('computes time from slot end', () => {
      expect(timetable.getMaxAllowedTime(SequencerState.COLLECTING_ATTESTATIONS)).toEqual(
        AZTEC_SLOT_DURATION - L1_PUBLISHING_TIME - timetable.attestationPropagationTime * 2,
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
  });

  describe('canStartNextBlock', () => {
    const AZTEC_SLOT_DURATION = 72;

    let afterBlockBuildingTimeNeededWithoutReexec: number;

    beforeEach(() => {
      afterBlockBuildingTimeNeededWithoutReexec =
        BLOCK_VALIDATION_TIME + 2 * DEFAULT_ATTESTATION_PROPAGATION_TIME + L1_PUBLISHING_TIME;
    });

    describe('single block per slot', () => {
      beforeEach(() => {
        timetable = new SequencerTimetable({
          ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
          aztecSlotDuration: AZTEC_SLOT_DURATION,
          l1PublishingTime: L1_PUBLISHING_TIME,
          enforce: ENFORCE_TIMETABLE,
        });
      });

      it('should handle only block at the start of the slot', () => {
        const checkpointStartTime = 0;
        const blockIndex = 0;
        const previousBlockDuration = 0;
        const result = timetable.canStartNextBlock(0, checkpointStartTime, blockIndex, previousBlockDuration);
        expect(result.isLastBlock).toBe(true);
        expect(result.canStart).toBe(true);
        // Single block mode: deadline is aztecSlotDuration - l1PublishingTime
        expect(result.deadline).toBe(AZTEC_SLOT_DURATION - L1_PUBLISHING_TIME);
      });

      it('should handle only block into the slot', () => {
        const secondsIntoSlot = 4;
        const checkpointStartTime = 4;
        const blockIndex = 0;
        const previousBlockDuration = 0;
        const result = timetable.canStartNextBlock(
          secondsIntoSlot,
          checkpointStartTime,
          blockIndex,
          previousBlockDuration,
        );
        expect(result.isLastBlock).toBe(true);
        expect(result.canStart).toBe(true);
        // Single block mode: deadline is aztecSlotDuration - l1PublishingTime
        expect(result.deadline).toBe(AZTEC_SLOT_DURATION - L1_PUBLISHING_TIME);
      });

      it('should refuse to start with too little time available', () => {
        const secondsIntoSlot = AZTEC_SLOT_DURATION - afterBlockBuildingTimeNeededWithoutReexec - 1;
        const checkpointStartTime = secondsIntoSlot;
        const blockIndex = 0;
        const previousBlockDuration = 0;
        const result = timetable.canStartNextBlock(
          secondsIntoSlot,
          checkpointStartTime,
          blockIndex,
          previousBlockDuration,
        );
        expect(result.canStart).toBe(false);
      });
    });
  });
});
