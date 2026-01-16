import { EthAddress } from '@aztec/foundation/eth-address';

import {
  getFirstEligibleRoundForOffense,
  getOffenseIdentifiersFromPayload,
  offenseDataComparator,
  offensesToValidatorSlash,
} from './empire.js';
import { type Offense, type OffenseIdentifier, OffenseType, type SlashPayload } from './types.js';

describe('EmpireSlashingHelpers', () => {
  const mockValidator1 = EthAddress.fromString('0x1234567890123456789012345678901234567890');
  const mockValidator2 = EthAddress.fromString('0x2345678901234567890123456789012345678901');

  const constants = {
    slashingRoundSize: 10,
    epochDuration: 4,
    ethereumSlotDuration: 12,
    proofSubmissionEpochs: 2,
  };

  describe('getOffenseIdentifiersFromPayload', () => {
    it('extracts offense identifiers from slash payload', () => {
      const payload: SlashPayload = {
        address: EthAddress.ZERO,
        timestamp: 123456789n,
        slashes: [
          {
            validator: mockValidator1,
            amount: 100n,
            offenses: [
              { offenseType: OffenseType.INACTIVITY, epochOrSlot: 5n },
              { offenseType: OffenseType.DATA_WITHHOLDING, epochOrSlot: 6n },
            ],
          },
          {
            validator: mockValidator2,
            amount: 50n,
            offenses: [{ offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, epochOrSlot: 10n }],
          },
        ],
      };

      const identifiers = getOffenseIdentifiersFromPayload(payload);
      expect(identifiers).toHaveLength(3);
      expect(identifiers[0]).toEqual({
        validator: mockValidator1,
        offenseType: OffenseType.INACTIVITY,
        epochOrSlot: 5n,
      });
      expect(identifiers[1]).toEqual({
        validator: mockValidator1,
        offenseType: OffenseType.DATA_WITHHOLDING,
        epochOrSlot: 6n,
      });
      expect(identifiers[2]).toEqual({
        validator: mockValidator2,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        epochOrSlot: 10n,
      });
    });

    it('returns empty array for payload with no slashes', () => {
      const payload: SlashPayload = {
        address: EthAddress.ZERO,
        timestamp: 123456789n,
        slashes: [],
      };
      const identifiers = getOffenseIdentifiersFromPayload(payload);
      expect(identifiers).toEqual([]);
    });
  });

  describe('offensesToValidatorSlash', () => {
    it('converts offenses to validator slashes', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator1,
          amount: 100n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 5n,
        },
        {
          validator: mockValidator2,
          amount: 50n,
          offenseType: OffenseType.DATA_WITHHOLDING,
          epochOrSlot: 6n,
        },
      ];

      const validatorSlashes = offensesToValidatorSlash(offenses);
      expect(validatorSlashes).toHaveLength(2);
      expect(validatorSlashes[0]).toEqual({
        validator: mockValidator1,
        amount: 100n,
        offenses: [{ epochOrSlot: 5n, offenseType: OffenseType.INACTIVITY }],
      });
      expect(validatorSlashes[1]).toEqual({
        validator: mockValidator2,
        amount: 50n,
        offenses: [{ epochOrSlot: 6n, offenseType: OffenseType.DATA_WITHHOLDING }],
      });
    });

    it('returns empty array for no offenses', () => {
      const validatorSlashes = offensesToValidatorSlash([]);
      expect(validatorSlashes).toEqual([]);
    });
  });

  describe('offenseDataComparator', () => {
    const createOffense = (
      validator: EthAddress,
      offenseType: OffenseType,
      amount: bigint,
      epochOrSlot: bigint,
    ): Offense => ({
      validator,
      offenseType,
      amount,
      epochOrSlot,
    });

    it('sorts uncontroversial offenses first', () => {
      const controversial = createOffense(mockValidator1, OffenseType.INACTIVITY, 100n, 5n);
      const uncontroversial = createOffense(mockValidator1, OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, 100n, 5n);

      expect(offenseDataComparator(controversial, uncontroversial)).toBeGreaterThan(0);
      expect(offenseDataComparator(uncontroversial, controversial)).toBeLessThan(0);
    });

    it('sorts by slash amount descending within same controversy level', () => {
      const smallAmount = createOffense(mockValidator1, OffenseType.INACTIVITY, 50n, 5n);
      const largeAmount = createOffense(mockValidator1, OffenseType.INACTIVITY, 100n, 5n);

      expect(offenseDataComparator(smallAmount, largeAmount)).toBeGreaterThan(0);
      expect(offenseDataComparator(largeAmount, smallAmount)).toBeLessThan(0);
    });

    it('sorts by epoch/slot ascending when amounts are equal', () => {
      const later = createOffense(mockValidator1, OffenseType.INACTIVITY, 100n, 10n);
      const earlier = createOffense(mockValidator1, OffenseType.INACTIVITY, 100n, 5n);

      expect(offenseDataComparator(later, earlier)).toBeGreaterThan(0);
      expect(offenseDataComparator(earlier, later)).toBeLessThan(0);
    });

    it('sorts by validator address when amounts and epochs are equal', () => {
      const offense1 = createOffense(mockValidator1, OffenseType.INACTIVITY, 100n, 5n);
      const offense2 = createOffense(mockValidator2, OffenseType.INACTIVITY, 100n, 5n);

      const comparison = offenseDataComparator(offense1, offense2);
      expect(comparison).toBeLessThan(0); // validator1 address is smaller
    });
  });

  describe('getFirstEligibleRoundForOffense', () => {
    it('returns correct round for inactivity offense', () => {
      const offense: OffenseIdentifier = {
        validator: mockValidator1,
        offenseType: OffenseType.INACTIVITY,
        epochOrSlot: 2n,
      };
      const round = getFirstEligibleRoundForOffense(offense, constants);
      expect(round).toBeGreaterThan(0n);
    });

    it('returns correct round for valid epoch pruned offense', () => {
      const offense: OffenseIdentifier = {
        validator: mockValidator1,
        offenseType: OffenseType.VALID_EPOCH_PRUNED,
        epochOrSlot: 1n,
      };
      const round = getFirstEligibleRoundForOffense(offense, constants);
      expect(round).toBeGreaterThan(0n);
    });

    it('returns correct round for data withholding offense', () => {
      const offense: OffenseIdentifier = {
        validator: mockValidator1,
        offenseType: OffenseType.DATA_WITHHOLDING,
        epochOrSlot: 1n,
      };
      const round = getFirstEligibleRoundForOffense(offense, constants);
      expect(round).toBeGreaterThan(0n);
    });

    it('returns correct round for slot-based offenses', () => {
      const offense: OffenseIdentifier = {
        validator: mockValidator1,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        epochOrSlot: 15n,
      };
      const round = getFirstEligibleRoundForOffense(offense, constants);
      expect(round).toBeGreaterThan(0n);
    });

    it('returns correct round for broadcasted invalid block proposal offense', () => {
      const offense: OffenseIdentifier = {
        validator: mockValidator1,
        offenseType: OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
        epochOrSlot: 20n,
      };
      const round = getFirstEligibleRoundForOffense(offense, constants);
      expect(round).toBeGreaterThan(1n);
    });

    it('returns correct round for attested descendant of invalid offense', () => {
      const offense: OffenseIdentifier = {
        validator: mockValidator1,
        offenseType: OffenseType.ATTESTED_DESCENDANT_OF_INVALID,
        epochOrSlot: 8n,
      };
      const round = getFirstEligibleRoundForOffense(offense, constants);
      expect(round).toBeGreaterThan(0n);
    });

    it('handles unknown offense type', () => {
      const offense: OffenseIdentifier = {
        validator: mockValidator1,
        offenseType: OffenseType.UNKNOWN,
        epochOrSlot: 3n,
      };
      const round = getFirstEligibleRoundForOffense(offense, constants);
      expect(round).toBeGreaterThan(0n);
    });
  });
});
