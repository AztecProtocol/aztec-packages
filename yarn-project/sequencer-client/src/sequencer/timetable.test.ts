import { DEFAULT_ATTESTATION_PROPAGATION_TIME } from '../config.js';
import { CHECKPOINT_FINALIZATION_TIME, SequencerTimetable } from './timetable.js';
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

    it('allows a slot duration of at least two ethereum slots', () => {
      const aztecSlotDuration = ETHEREUM_SLOT_DURATION * 2;
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
          timetable.checkpointFinalizationTime - // time to validate the block
          timetable.checkpointInitializationTime - // time to prepare the block
          2 * timetable.minExecutionTime, // min guaranteed time to execute the block
      );
      expect(timetable.initializeDeadline).toEqual(4);
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
  });

  describe('getBlockProposalExecTimeEnd', () => {
    it('sets deadline considering unused time from init phase', () => {
      const actual = timetable.getProposerExecTimeEnd(1);
      const available =
        AZTEC_SLOT_DURATION -
        timetable.p2pPropagationTime * 2 -
        timetable.l1PublishingTime -
        timetable.checkpointFinalizationTime -
        1;
      const expected = available / 2 + 1;
      expect(actual).toEqual(expected);
      expect(expected).toEqual(10);
    });

    it('sets deadline considering starting before slot', () => {
      const actual = timetable.getProposerExecTimeEnd(-1);
      const available =
        AZTEC_SLOT_DURATION -
        timetable.p2pPropagationTime * 2 -
        timetable.l1PublishingTime -
        timetable.checkpointFinalizationTime +
        1;
      const expected = available / 2 - 1;
      expect(actual).toEqual(expected);
      expect(expected).toEqual(9);
    });

    it('sets deadline when building on time', () => {
      const intoSlot = timetable.initializeDeadline + timetable.checkpointInitializationTime;
      const actual = timetable.getProposerExecTimeEnd(intoSlot);
      const available =
        AZTEC_SLOT_DURATION -
        timetable.p2pPropagationTime * 2 -
        timetable.l1PublishingTime -
        timetable.checkpointFinalizationTime -
        intoSlot;
      const expected = available / 2 + intoSlot;
      expect(actual).toEqual(expected);
      expect(expected).toEqual(18);
    });

    it('sets deadline before current time if too late', () => {
      const intoSlot = AZTEC_SLOT_DURATION - 4;
      const actual = timetable.getProposerExecTimeEnd(intoSlot);
      expect(actual).toBeLessThan(intoSlot);
    });
  });

  describe('getValidatorReexecTimeEnd', () => {
    it('sets deadline', () => {
      const actual = timetable.getValidatorReexecTimeEnd(10);
      const available = AZTEC_SLOT_DURATION - timetable.p2pPropagationTime - timetable.l1PublishingTime - 10;
      const expected = available + 10;
      expect(actual).toEqual(expected);
      expect(expected).toEqual(22);
    });

    it('sets time available equal to block building', () => {
      const {
        checkpointFinalizationTime: blockValidationTime,
        p2pPropagationTime: attestationPropagationTime,
        l1PublishingTime,
      } = timetable;

      const intoSlot = 3;
      const blockBuildDeadline = timetable.getProposerExecTimeEnd(intoSlot);
      const blockBuildAvailable = blockBuildDeadline - intoSlot;

      const validatorIntoSlot = blockBuildDeadline + blockValidationTime + attestationPropagationTime;
      const validatorDeadline = timetable.getValidatorReexecTimeEnd(validatorIntoSlot);
      const validatorAvailable = validatorDeadline - validatorIntoSlot;

      expect(blockBuildAvailable).toEqual(validatorAvailable);

      expect(
        blockBuildAvailable +
          validatorAvailable +
          intoSlot +
          blockValidationTime +
          attestationPropagationTime * 2 +
          l1PublishingTime,
      ).toEqual(AZTEC_SLOT_DURATION);
    });
  });

  describe('getBlockTimingInfo', () => {
    const AZTEC_SLOT_DURATION = 72;

    let afterBlockBuildingTimeNeededWithoutReexec: number;
    let slotBuildDeadline: number;

    beforeEach(() => {
      afterBlockBuildingTimeNeededWithoutReexec =
        CHECKPOINT_FINALIZATION_TIME + 2 * DEFAULT_ATTESTATION_PROPAGATION_TIME + L1_PUBLISHING_TIME;
      slotBuildDeadline = AZTEC_SLOT_DURATION - afterBlockBuildingTimeNeededWithoutReexec;
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
        const result = timetable.canStartNextBlock(0);
        expect(result.isLastBlock).toBe(true);
        expect(result.canStart).toBe(true);
        expect(result.deadline).toBe(slotBuildDeadline / 2); // We need to account for reexecution
      });

      it('should handle only block into the slot', () => {
        const secondsIntoSlot = 4;
        const result = timetable.canStartNextBlock(secondsIntoSlot);
        expect(result.isLastBlock).toBe(true);
        expect(result.canStart).toBe(true);
        // When starting secondsIntoSlot into slot: available time is split 50/50 for execution and reexecution
        const available = slotBuildDeadline - secondsIntoSlot;
        const expectedDeadline = secondsIntoSlot + available / 2;
        expect(result.deadline).toBe(expectedDeadline);
      });

      it('should refuse to start with too little time available', () => {
        const result = timetable.canStartNextBlock(AZTEC_SLOT_DURATION - afterBlockBuildingTimeNeededWithoutReexec - 1);
        expect(result.canStart).toBe(false);
      });
    });
  });
});
