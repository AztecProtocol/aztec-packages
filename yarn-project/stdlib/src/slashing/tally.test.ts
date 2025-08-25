import { EthAddress } from '@aztec/foundation/eth-address';

import { encodeSlashConsensusVotes, getSlashConsensusVotesFromOffenses } from './tally.js';
import { type Offense, OffenseType } from './types.js';

describe('TallySlashingHelpers', () => {
  const mockValidator1 = EthAddress.fromString('0x1234567890123456789012345678901234567890');
  const mockValidator2 = EthAddress.fromString('0x2345678901234567890123456789012345678901');
  const mockValidator3 = EthAddress.fromString('0x3456789012345678901234567890123456789012');
  const mockValidator4 = EthAddress.fromString('0x4567890123456789012345678901234567890123');

  describe('getSlashConsensusVotesFromOffenses', () => {
    const settings = { slashingUnit: 10n };

    it('creates votes based on offenses and committees', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator1,
          amount: 25n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 5n,
        },
        {
          validator: mockValidator1,
          amount: 5n,
          offenseType: OffenseType.DATA_WITHHOLDING,
          epochOrSlot: 6n,
        },
        {
          validator: mockValidator2,
          amount: 5n,
          offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
          epochOrSlot: 10n,
        },
      ];

      const committees = [[mockValidator1, mockValidator2, mockValidator3]];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, settings);

      expect(votes).toHaveLength(3);
      expect(votes[0]).toEqual(3); // 30 / 10 = 3 slash units for validator1
      expect(votes[1]).toEqual(0); // 5 / 10 = 0 slash units for validator2
      expect(votes[2]).toEqual(0); // 0 / 10 = 0 slash units for validator3
    });

    it('caps slash units at maximum per validator', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator1,
          amount: 1000n, // Should be capped at 3 units
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 5n,
        },
      ];

      const committees = [[mockValidator1]];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, settings);

      expect(votes).toHaveLength(1);
      expect(votes[0]).toEqual(3); // Capped at MAX_SLASH_UNITS_PER_VALIDATOR
    });

    it('handles multiple committees', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator1,
          amount: 20n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 5n,
        },
        {
          validator: mockValidator4,
          amount: 30n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 6n,
        },
      ];

      const committees = [
        [mockValidator1, mockValidator2],
        [mockValidator3, mockValidator4],
      ];

      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, settings);

      expect(votes).toHaveLength(4);
      expect(votes[0]).toEqual(2); // validator1 in committee1
      expect(votes[1]).toEqual(0); // validator2 in committee1
      expect(votes[2]).toEqual(0); // validator3 in committee2
      expect(votes[3]).toEqual(3); // validator4 in committee2
    });

    it('does not repeat slashes for the same validator in different committees', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator1,
          amount: 20n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 5n,
        },
        {
          validator: mockValidator1,
          amount: 10n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 6n,
        },
      ];

      const committees = [
        [mockValidator1, mockValidator2],
        [mockValidator1, mockValidator3],
      ];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, settings);

      expect(votes).toHaveLength(4);
      expect(votes[0]).toEqual(3); // validator1 in committee1
      expect(votes[1]).toEqual(0); // validator2 in committee1
      expect(votes[2]).toEqual(0); // validator1 in committee2
      expect(votes[3]).toEqual(0); // validator3 in committee2
    });

    it('returns empty votes for empty committees', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator1,
          amount: 20n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 5n,
        },
      ];

      const committees: EthAddress[][] = [];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, settings);

      expect(votes).toEqual([]);
    });

    it('returns zero votes when no offenses match committee validators', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator1,
          amount: 50n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 5n,
        },
      ];

      const committees = [[mockValidator2, mockValidator3]];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, settings);

      expect(votes).toHaveLength(2);
      expect(votes[0]).toEqual(0); // validator2 has no offenses
      expect(votes[1]).toEqual(0); // validator3 has no offenses
    });
  });

  describe('encodeSlashConsensusVotes', () => {
    it('encodes votes into buffer correctly', () => {
      const votes = [1, 2, 0, 3];
      const buffer = encodeSlashConsensusVotes(votes);

      expect(buffer.length).toEqual(1);
      expect(buffer[0]).toEqual((1 << 6) | (2 << 4) | (0 << 2) | 3); // 0x73
    });

    it('throws on non-multiple-of-4 number of votes', () => {
      const votes = [1, 2, 3];
      expect(() => encodeSlashConsensusVotes(votes)).toThrow(/multiple of 4/);
    });

    it('returns empty buffer for empty votes', () => {
      const votes: number[] = [];
      const buffer = encodeSlashConsensusVotes(votes);
      expect(buffer.length).toEqual(0);
    });

    it('handles maximum vote values (3)', () => {
      const votes = [3, 3, 3, 3];
      const buffer = encodeSlashConsensusVotes(votes);

      expect(buffer.length).toEqual(1);
      expect(buffer[0]).toEqual((3 << 6) | (3 << 4) | (3 << 2) | 3); // 0xFF
    });

    it('handles zero votes', () => {
      const votes = [0, 0, 1, 2];
      const buffer = encodeSlashConsensusVotes(votes);

      expect(buffer.length).toEqual(1);
      expect(buffer[0]).toEqual((0 << 6) | (0 << 4) | (1 << 2) | 2); // 0x06
    });
  });
});
