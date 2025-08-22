import {
  getEpochForOffense,
  getEpochsForRound,
  getRoundForOffense,
  getRoundForSlot,
  getRoundsForEpoch,
  getSlotForOffense,
} from './helpers.js';
import { OffenseType } from './types.js';

describe('SlashingHelpers', () => {
  const constants = {
    slashingRoundSize: 10,
    epochDuration: 4,
    ethereumSlotDuration: 12,
    proofSubmissionEpochs: 2,
  };

  describe('getRoundForSlot', () => {
    it('returns correct round and voting slot for slot 0', () => {
      const result = getRoundForSlot(0n, constants);
      expect(result.round).toEqual(0n);
      expect(result.votingSlot).toEqual(0n);
    });

    it('returns correct round and voting slot for slot within first round', () => {
      const result = getRoundForSlot(7n, constants);
      expect(result.round).toEqual(0n);
      expect(result.votingSlot).toEqual(7n);
    });

    it('returns correct round and voting slot for slot in second round', () => {
      const result = getRoundForSlot(15n, constants);
      expect(result.round).toEqual(1n);
      expect(result.votingSlot).toEqual(5n);
    });

    it('returns correct round and voting slot for exact round boundary', () => {
      const result = getRoundForSlot(20n, constants);
      expect(result.round).toEqual(2n);
      expect(result.votingSlot).toEqual(0n);
    });
  });

  describe('getRoundsForEpoch', () => {
    it('returns correct rounds for epoch 0', () => {
      const [startRound, endRound] = getRoundsForEpoch(0n, constants);
      expect(startRound).toEqual(0n);
      expect(endRound).toEqual(0n);
    });

    it('returns correct rounds for epoch that spans multiple rounds', () => {
      const largeEpochConstants = { ...constants, epochDuration: 25 };
      const [startRound, endRound] = getRoundsForEpoch(1n, largeEpochConstants);
      expect(startRound).toEqual(2n);
      expect(endRound).toEqual(4n);
    });

    it('returns same round for epoch within single round', () => {
      const [startRound, endRound] = getRoundsForEpoch(1n, constants);
      expect(startRound).toEqual(endRound);
    });
  });

  describe('getEpochsForRound', () => {
    it('returns correct epochs for round 0', () => {
      const epochs = getEpochsForRound(0n, constants);
      expect(epochs).toEqual([0n, 1n, 2n]);
    });

    it('returns correct epochs for round 1', () => {
      const epochs = getEpochsForRound(1n, constants);
      expect(epochs).toEqual([2n, 3n, 4n]);
    });

    it('returns single epoch when round size equals epoch duration', () => {
      const singleEpochConstants = { slashingRoundSize: 4, epochDuration: 4 };
      const epochs = getEpochsForRound(2n, singleEpochConstants);
      expect(epochs).toEqual([2n]);
    });

    it('returns correct epochs when round size is multiple of epoch duration', () => {
      const singleEpochConstants = { slashingRoundSize: 12, epochDuration: 4 };
      const epochs = getEpochsForRound(1n, singleEpochConstants);
      expect(epochs).toEqual([3n, 4n, 5n]);
    });
  });

  describe('getSlotForOffense', () => {
    it('returns slot directly for slot-based offenses', () => {
      const offense = {
        epochOrSlot: 25n,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      };
      const slot = getSlotForOffense(offense, constants);
      expect(slot).toEqual(25n);
    });

    it('returns first slot of epoch for epoch-based offenses', () => {
      const offense = {
        epochOrSlot: 5n,
        offenseType: OffenseType.INACTIVITY,
      };
      const slot = getSlotForOffense(offense, constants);
      expect(slot).toEqual(20n); // epoch 5 * epochDuration 4 = slot 20
    });
  });

  describe('getEpochForOffense', () => {
    it('returns epoch directly for epoch-based offenses', () => {
      const offense = {
        epochOrSlot: 5n,
        offenseType: OffenseType.INACTIVITY,
      };
      const epoch = getEpochForOffense(offense, constants);
      expect(epoch).toEqual(5n);
    });

    it('returns calculated epoch for slot-based offenses', () => {
      const offense = {
        epochOrSlot: 20n,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      };
      const epoch = getEpochForOffense(offense, constants);
      expect(epoch).toEqual(5n); // slot 20 / epochDuration 4 = epoch 5
    });

    it('handles partial epoch calculations for slot-based offenses', () => {
      const offense = {
        epochOrSlot: 22n, // Not at epoch boundary
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      };
      const epoch = getEpochForOffense(offense, constants);
      expect(epoch).toEqual(5n); // floor(22/4) = 5
    });
  });

  describe('getRoundForOffense', () => {
    it('returns correct round for slot-based offenses', () => {
      const offense = {
        epochOrSlot: 25n, // slot 25
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      };
      const round = getRoundForOffense(offense, constants);
      expect(round).toEqual(2n); // slot 25 / roundSize 10 = round 2
    });

    it('returns correct round for epoch-based offenses', () => {
      const offense = {
        epochOrSlot: 5n, // epoch 5 = slot 20
        offenseType: OffenseType.INACTIVITY,
      };
      const round = getRoundForOffense(offense, constants);
      expect(round).toEqual(2n); // slot 20 / roundSize 10 = round 2
    });

    it('handles offense at round boundary', () => {
      const offense = {
        epochOrSlot: 30n, // slot 30, exactly at round boundary
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      };
      const round = getRoundForOffense(offense, constants);
      expect(round).toEqual(3n); // slot 30 / roundSize 10 = round 3
    });

    it('handles epoch-based offense that spans multiple rounds', () => {
      const offense = {
        epochOrSlot: 2n, // epoch 2 = slot 8
        offenseType: OffenseType.DATA_WITHHOLDING,
      };
      const round = getRoundForOffense(offense, constants);
      expect(round).toEqual(0n); // slot 8 / roundSize 10 = round 0
    });

    it('handles epoch-based offense when round is multiple of epoch duration', () => {
      const offense = {
        epochOrSlot: 2n, // epoch 2 = slot 8
        offenseType: OffenseType.DATA_WITHHOLDING,
      };
      const round = getRoundForOffense(offense, { ...constants, slashingRoundSize: 8 });
      expect(round).toEqual(1n); // slot 8 / roundSize 8 = round 1
    });
  });
});
