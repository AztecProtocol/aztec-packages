import { SequencerTimetable } from './timetable.js';
import { SequencerState } from './utils.js';

describe('sequencer-timetable', () => {
  let timetable: SequencerTimetable;

  const ethereumSlotDuration = 12;
  const aztecSlotDuration = 36;
  const maxL1TxInclusionTimeIntoSlot = 0;
  const enforce = true;

  beforeEach(() => {
    timetable = new SequencerTimetable({
      ethereumSlotDuration,
      aztecSlotDuration,
      maxL1TxInclusionTimeIntoSlot,
      enforce,
    });
  });

  describe('constructor', () => {
    it('fails to construct an instance with too short slot duration', () => {
      const aztecSlotDuration = ethereumSlotDuration;
      expect(
        () =>
          new SequencerTimetable({ ethereumSlotDuration, aztecSlotDuration, maxL1TxInclusionTimeIntoSlot, enforce }),
      ).toThrow(/initialize deadline cannot be negative/i);
    });

    it('allows a slot duration of at least two ethereum slots', () => {
      const aztecSlotDuration = ethereumSlotDuration * 2;
      const timetable = new SequencerTimetable({
        ethereumSlotDuration,
        aztecSlotDuration,
        maxL1TxInclusionTimeIntoSlot,
        enforce,
      });
      expect(timetable.initializeDeadline).toEqual(
        aztecSlotDuration -
          ethereumSlotDuration - // time to get included on L1 given maxL1TxInclusionTimeIntoSlot=0
          2 * timetable.attestationPropagationTime - // time to propagate the attestation
          timetable.blockValidationTime - // time to validate the block
          timetable.blockPrepareTime - // time to prepare the block
          2 * timetable.minExecutionTime, // min guaranteed time to execute the block
      );
      expect(timetable.initializeDeadline).toEqual(4);
    });
  });

  describe('maxAllowedTime', () => {
    it('computes time from slot start', () => {
      expect(timetable.getMaxAllowedTime(SequencerState.INITIALIZING_PROPOSAL)).toEqual(timetable.initializeDeadline);
    });

    it('computes time from slot end', () => {
      expect(timetable.getMaxAllowedTime(SequencerState.COLLECTING_ATTESTATIONS)).toEqual(
        aztecSlotDuration -
          (ethereumSlotDuration - maxL1TxInclusionTimeIntoSlot) -
          timetable.attestationPropagationTime * 2,
      );
    });

    it('returns an increasing time for each stage', () => {
      const stages = [
        SequencerState.INITIALIZING_PROPOSAL,
        SequencerState.CREATING_BLOCK,
        SequencerState.COLLECTING_ATTESTATIONS,
        SequencerState.PUBLISHING_BLOCK,
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
        timetable.assertTimeLeft(SequencerState.INITIALIZING_PROPOSAL, timetable.initializeDeadline + 1),
      ).toThrow(/Too far into slot/);
    });

    it('does not throw if enough time left', () => {
      expect(() => timetable.assertTimeLeft(SequencerState.INITIALIZING_PROPOSAL, 1)).not.toThrow();
    });

    it('handles negative seconds into slot', () => {
      expect(() => timetable.assertTimeLeft(SequencerState.INITIALIZING_PROPOSAL, -1)).not.toThrow();
      expect(() => timetable.assertTimeLeft(SequencerState.PUBLISHING_BLOCK, -1)).not.toThrow();
    });

    it('skips check if enforcement is off', () => {
      timetable = new SequencerTimetable({
        ethereumSlotDuration,
        aztecSlotDuration,
        maxL1TxInclusionTimeIntoSlot,
        enforce: false,
      });
      expect(() => timetable.assertTimeLeft(SequencerState.INITIALIZING_PROPOSAL, 1000)).not.toThrow();
    });
  });

  describe('getBlockProposalExecTimeEnd', () => {
    it('sets deadline considering unused time from init phase', () => {
      const actual = timetable.getBlockProposalExecTimeEnd(1);
      const available =
        aztecSlotDuration -
        timetable.attestationPropagationTime * 2 -
        timetable.l1PublishingTime -
        timetable.blockValidationTime -
        1;
      const expected = available / 2 + 1;
      expect(actual).toEqual(expected);
      expect(expected).toEqual(10);
    });

    it('sets deadline considering starting before slot', () => {
      const actual = timetable.getBlockProposalExecTimeEnd(-1);
      const available =
        aztecSlotDuration -
        timetable.attestationPropagationTime * 2 -
        timetable.l1PublishingTime -
        timetable.blockValidationTime +
        1;
      const expected = available / 2 - 1;
      expect(actual).toEqual(expected);
      expect(expected).toEqual(9);
    });

    it('sets deadline when building on time', () => {
      const intoSlot = timetable.initializeDeadline + timetable.blockPrepareTime;
      const actual = timetable.getBlockProposalExecTimeEnd(intoSlot);
      const available =
        aztecSlotDuration -
        timetable.attestationPropagationTime * 2 -
        timetable.l1PublishingTime -
        timetable.blockValidationTime -
        intoSlot;
      const expected = available / 2 + intoSlot;
      expect(actual).toEqual(expected);
      expect(expected).toEqual(18);
    });

    it('sets deadline before current time if too late', () => {
      const intoSlot = aztecSlotDuration - 4;
      const actual = timetable.getBlockProposalExecTimeEnd(intoSlot);
      expect(actual).toBeLessThan(intoSlot);
    });
  });

  describe('getValidatorReexecTimeEnd', () => {
    it('sets deadline', () => {
      const actual = timetable.getValidatorReexecTimeEnd(10);
      const available = aztecSlotDuration - timetable.attestationPropagationTime - timetable.l1PublishingTime - 10;
      const expected = available + 10;
      expect(actual).toEqual(expected);
      expect(expected).toEqual(22);
    });

    it('sets time available equal to block building', () => {
      const { blockValidationTime, attestationPropagationTime, l1PublishingTime } = timetable;

      const intoSlot = 3;
      const blockBuildDeadline = timetable.getBlockProposalExecTimeEnd(intoSlot);
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
      ).toEqual(aztecSlotDuration);
    });
  });
});
