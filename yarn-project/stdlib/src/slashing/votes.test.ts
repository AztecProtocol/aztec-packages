import { BlockNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';

import { type Offense, OffenseType } from './types.js';
import { encodeSlashConsensusVotes, getSlashConsensusVotesFromOffenses } from './votes.js';

describe('SlashingHelpers', () => {
  const mockValidator1 = EthAddress.fromString('0x1234567890123456789012345678901234567890');
  const mockValidator2 = EthAddress.fromString('0x2345678901234567890123456789012345678901');
  const mockValidator3 = EthAddress.fromString('0x3456789012345678901234567890123456789012');
  const mockValidator4 = EthAddress.fromString('0x4567890123456789012345678901234567890123');

  describe('getSlashConsensusVotesFromOffenses', () => {
    const settings = {
      slashingAmounts: [10n, 20n, 30n] as [bigint, bigint, bigint],
      epochDuration: 32,
      targetCommitteeSize: 4,
    };

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
      const epochsForCommittees = [5n]; // Committee for epoch 5
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(4); // Padded to targetCommitteeSize
      expect(votes[0]).toEqual(2); // Only 25n from epoch 5 offense for validator1
      expect(votes[1]).toEqual(0); // Offense is in slot 10, which is epoch 0, not 5
      expect(votes[2]).toEqual(0); // No offenses for validator3
      expect(votes[3]).toEqual(0); // Padded position
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
      const epochsForCommittees = [5n];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(4); // Padded to targetCommitteeSize
      expect(votes[0]).toEqual(3); // Capped at MAX_SLASH_UNITS_PER_VALIDATOR
      expect(votes.slice(1)).toEqual([0, 0, 0]); // Padded positions
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

      const epochsForCommittees = [5n, 6n]; // Committees for epochs 5 and 6
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(8); // 2 committees × 4 targetCommitteeSize
      expect(votes[0]).toEqual(2); // validator1 in committee1
      expect(votes[1]).toEqual(0); // validator2 in committee1
      expect(votes[2]).toEqual(0); // padded position in committee1
      expect(votes[3]).toEqual(0); // padded position in committee1
      expect(votes[4]).toEqual(0); // validator3 in committee2
      expect(votes[5]).toEqual(3); // validator4 in committee2
      expect(votes[6]).toEqual(0); // padded position in committee2
      expect(votes[7]).toEqual(0); // padded position in committee2
    });

    it('correctly handles validators appearing in multiple committees with different epochs', () => {
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
      const epochsForCommittees = [5n, 6n];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(8); // 2 committees × 4 targetCommitteeSize
      expect(votes[0]).toEqual(2); // validator1 in committee1, epoch 5 offense (20n)
      expect(votes[1]).toEqual(0); // validator2 in committee1, no offenses
      expect(votes[2]).toEqual(0); // padded position in committee1
      expect(votes[3]).toEqual(0); // padded position in committee1
      expect(votes[4]).toEqual(BlockNumber(1)); // validator1 in committee2, epoch 6 offense (10n)
      expect(votes[5]).toEqual(0); // validator3 in committee2, no offenses
      expect(votes[6]).toEqual(0); // padded position in committee2
      expect(votes[7]).toEqual(0); // padded position in committee2
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
      const epochsForCommittees: bigint[] = [];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

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
      const epochsForCommittees = [5n];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(4); // Padded to targetCommitteeSize
      expect(votes[0]).toEqual(0); // validator2 has no offenses
      expect(votes[1]).toEqual(0); // validator3 has no offenses
      expect(votes[2]).toEqual(0); // padded position
      expect(votes[3]).toEqual(0); // padded position
    });

    it('handles offenses without epochOrSlot (slashValidatorsAlways)', () => {
      const offenses = [
        {
          validator: mockValidator1,
          amount: 30n,
          offenseType: OffenseType.UNKNOWN,
          epochOrSlot: undefined, // No epoch/slot for always-slash validators
        },
        {
          validator: mockValidator2,
          amount: 10n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 5n,
        },
      ];

      const committees = [
        [mockValidator1, mockValidator2],
        [mockValidator1, mockValidator3],
      ];
      const epochsForCommittees = [5n, 6n];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(8); // 2 committees × 4 targetCommitteeSize
      expect(votes[0]).toEqual(3); // validator1 in committee1, always-slash (30n)
      expect(votes[1]).toEqual(BlockNumber(1)); // validator2 in committee1, epoch 5 offense (10n)
      expect(votes[2]).toEqual(0); // padded position in committee1
      expect(votes[3]).toEqual(0); // padded position in committee1
      expect(votes[4]).toEqual(3); // validator1 in committee2, always-slash (30n)
      expect(votes[5]).toEqual(0); // validator3 in committee2, no offenses
      expect(votes[6]).toEqual(0); // padded position in committee2
      expect(votes[7]).toEqual(0); // padded position in committee2
    });

    it('correctly converts slot-based offenses to epochs', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator1,
          amount: 15n,
          offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
          epochOrSlot: 64n, // slot 64 = epoch 2 (64/32)
        },
        {
          validator: mockValidator2,
          amount: 20n,
          offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
          epochOrSlot: 95n, // slot 95 = epoch 2 (95/32 = 2.96... -> 2)
        },
      ];

      const committees = [[mockValidator1, mockValidator2, mockValidator3]];
      const epochsForCommittees = [2n]; // Committee for epoch 2
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(4); // Padded to targetCommitteeSize
      expect(votes[0]).toEqual(BlockNumber(1)); // validator1: 15n offense maps to epoch 2
      expect(votes[1]).toEqual(2); // validator2: 20n offense maps to epoch 2
      expect(votes[2]).toEqual(0); // validator3: no offenses
      expect(votes[3]).toEqual(0); // padded position
    });

    it('handles mixed epoch and slot-based offenses resolving to same epoch', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator1,
          amount: 10n,
          offenseType: OffenseType.INACTIVITY, // epoch-based
          epochOrSlot: 2n, // epoch 2
        },
        {
          validator: mockValidator1,
          amount: 15n,
          offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
          epochOrSlot: 75n, // slot 75 = epoch 2 (75/32 = 2.34... -> 2)
        },
      ];

      const committees = [[mockValidator1, mockValidator2]];
      const epochsForCommittees = [2n];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(4); // Padded to targetCommitteeSize
      expect(votes[0]).toEqual(2); // validator1: 10n + 15n = 25n total for epoch 2
      expect(votes[1]).toEqual(0); // validator2: no offenses
      expect(votes[2]).toEqual(0); // padded position
      expect(votes[3]).toEqual(0); // padded position
    });

    it('sums multiple offenses for same validator in same epoch', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator1,
          amount: 8n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 3n,
        },
        {
          validator: mockValidator1,
          amount: 7n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 3n,
        },
        {
          validator: mockValidator1,
          amount: 5n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 3n,
        },
      ];

      const committees = [[mockValidator1, mockValidator2]];
      const epochsForCommittees = [3n];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(4); // Padded to targetCommitteeSize
      expect(votes[0]).toEqual(2); // validator1: 8n + 7n + 5n = 20n total
      expect(votes[1]).toEqual(0); // validator2: no offenses
      expect(votes[2]).toEqual(0); // padded position
      expect(votes[3]).toEqual(0); // padded position
    });

    it('handles always-slash validator with additional epoch-specific offenses', () => {
      const offenses = [
        {
          validator: mockValidator1,
          amount: 20n, // always-slash
          offenseType: OffenseType.UNKNOWN,
          epochOrSlot: undefined,
        },
        {
          validator: mockValidator1,
          amount: 15n, // epoch-specific
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 5n,
        },
      ];

      const committees = [
        [mockValidator1, mockValidator2],
        [mockValidator1, mockValidator3],
      ];
      const epochsForCommittees = [5n, 6n];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(8); // 2 committees × 4 targetCommitteeSize
      expect(votes[0]).toEqual(3); // validator1 committee1: 20n(always) + 15n(epoch5) = 35n
      expect(votes[1]).toEqual(0); // validator2: no offenses
      expect(votes[2]).toEqual(0); // padded position in committee1
      expect(votes[3]).toEqual(0); // padded position in committee1
      expect(votes[4]).toEqual(2); // validator1 committee2: 20n(always) only
      expect(votes[5]).toEqual(0); // validator3: no offenses
      expect(votes[6]).toEqual(0); // padded position in committee2
      expect(votes[7]).toEqual(0); // padded position in committee2
    });

    it('handles epoch boundary conditions', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator1,
          amount: 15n,
          offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
          epochOrSlot: 31n, // slot 31 = epoch 0 (31/32 = 0.96... -> 0)
        },
        {
          validator: mockValidator2,
          amount: 20n,
          offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // slot-based
          epochOrSlot: 32n, // slot 32 = epoch 1 (32/32 = 1)
        },
      ];

      const committees = [
        [mockValidator1, mockValidator2],
        [mockValidator1, mockValidator2],
      ];
      const epochsForCommittees = [0n, 1n];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(8); // 2 committees × 4 targetCommitteeSize
      expect(votes[0]).toEqual(BlockNumber(1)); // validator1 epoch0: 15n offense
      expect(votes[1]).toEqual(0); // validator2 epoch0: no matching offenses
      expect(votes[2]).toEqual(0); // padded position in committee0
      expect(votes[3]).toEqual(0); // padded position in committee0
      expect(votes[4]).toEqual(0); // validator1 epoch1: no matching offenses
      expect(votes[5]).toEqual(2); // validator2 epoch1: 20n offense
      expect(votes[6]).toEqual(0); // padded position in committee1
      expect(votes[7]).toEqual(0); // padded position in committee1
    });

    it('handles zero amount offenses', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator1,
          amount: 0n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 5n,
        },
        {
          validator: mockValidator2,
          amount: 15n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 5n,
        },
      ];

      const committees = [[mockValidator1, mockValidator2, mockValidator3]];
      const epochsForCommittees = [5n];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(4); // Padded to targetCommitteeSize
      expect(votes[0]).toEqual(0); // validator1: 0n amount = 0 slash units
      expect(votes[1]).toEqual(BlockNumber(1)); // validator2: 15n amount = 1 slash unit
      expect(votes[2]).toEqual(0); // validator3: no offenses
      expect(votes[3]).toEqual(0); // padded position
    });

    it('pads empty committees to maintain index alignment', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator4,
          amount: 25n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 7n,
        },
      ];

      const committees = [
        [mockValidator1, mockValidator2, mockValidator3, mockValidator4], // Full committee
        [], // EMPTY (not enough validators)
        [mockValidator1, mockValidator2, mockValidator3, mockValidator4], // Full committee
      ];

      const epochsForCommittees = [5n, 6n, 7n];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      // Should be 12 elements (4 per committee), not 8
      expect(votes).toHaveLength(12);
      // Committee 0: all zeros
      expect(votes.slice(0, 4)).toEqual([0, 0, 0, 0]);
      // Committee 1: padded zeros for empty committee
      expect(votes.slice(4, 8)).toEqual([0, 0, 0, 0]);
      // Committee 2: validator4 has offense (25n = 2 units)
      expect(votes.slice(8, 12)).toEqual([0, 0, 0, 2]);
    });

    it('handles first committee being empty', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator1,
          amount: 15n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 6n,
        },
      ];

      const committees = [
        [], // EMPTY first committee (not enough validators)
        [mockValidator1, mockValidator2, mockValidator3, mockValidator4], // Full committee
      ];

      const epochsForCommittees = [5n, 6n];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(8);
      expect(votes.slice(0, 4)).toEqual([0, 0, 0, 0]); // Padded empty committee
      expect(votes.slice(4, 8)).toEqual([1, 0, 0, 0]); // validator1 in second committee (15n = 1 unit)
    });

    it('handles last committee being empty', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator2,
          amount: 20n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 5n,
        },
      ];

      const committees = [
        [mockValidator1, mockValidator2, mockValidator3, mockValidator4], // Full committee
        [], // EMPTY last committee (not enough validators)
      ];

      const epochsForCommittees = [5n, 6n];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(8);
      expect(votes.slice(0, 4)).toEqual([0, 2, 0, 0]); // validator2 in first committee (20n = 2 units)
      expect(votes.slice(4, 8)).toEqual([0, 0, 0, 0]); // Padded empty committee
    });

    it('truncates to maxSlashedValidators unique (validator, epoch) pairs', () => {
      const offenses: Offense[] = [
        { validator: mockValidator1, amount: 30n, offenseType: OffenseType.INACTIVITY, epochOrSlot: 5n },
        { validator: mockValidator2, amount: 20n, offenseType: OffenseType.INACTIVITY, epochOrSlot: 5n },
        { validator: mockValidator3, amount: 10n, offenseType: OffenseType.INACTIVITY, epochOrSlot: 5n },
      ];

      const committees = [[mockValidator1, mockValidator2, mockValidator3, mockValidator4]];
      const epochsForCommittees = [5n];
      // Only 2 slashed validators allowed; validator3 should be zeroed out
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, {
        ...settings,
        maxSlashedValidators: 2,
      });

      expect(votes).toHaveLength(4);
      expect(votes[0]).toEqual(3); // validator1: included (1st)
      expect(votes[1]).toEqual(2); // validator2: included (2nd)
      expect(votes[2]).toEqual(0); // validator3: zeroed out (limit reached)
      expect(votes[3]).toEqual(0); // validator4: no offenses
    });

    it('counts the same validator in multiple epochs as separate slashed pairs', () => {
      // An always-slash validator appears once per epoch committee, each generating a slash() call
      const offenses = [
        {
          validator: mockValidator1,
          amount: 30n,
          offenseType: OffenseType.UNKNOWN,
          epochOrSlot: undefined, // always-slash
        },
        { validator: mockValidator2, amount: 20n, offenseType: OffenseType.INACTIVITY, epochOrSlot: 5n },
        { validator: mockValidator3, amount: 10n, offenseType: OffenseType.INACTIVITY, epochOrSlot: 6n },
      ];

      const committees = [
        [mockValidator1, mockValidator2],
        [mockValidator1, mockValidator3],
      ];
      const epochsForCommittees = [5n, 6n];
      // Limit of 3: validator1@epoch5, validator2@epoch5, validator1@epoch6 are included;
      // validator3@epoch6 is zeroed out
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, {
        ...settings,
        maxSlashedValidators: 3,
      });

      expect(votes).toHaveLength(8); // 2 committees × 4 targetCommitteeSize
      expect(votes[0]).toEqual(3); // validator1 @ epoch5: included (1st)
      expect(votes[1]).toEqual(2); // validator2 @ epoch5: included (2nd)
      expect(votes[2]).toEqual(0); // padded
      expect(votes[3]).toEqual(0); // padded
      expect(votes[4]).toEqual(3); // validator1 @ epoch6: included (3rd)
      expect(votes[5]).toEqual(0); // validator3 @ epoch6: zeroed out (limit reached)
      expect(votes[6]).toEqual(0); // padded
      expect(votes[7]).toEqual(0); // padded
    });

    it('truncates based on validator count, not offense count', () => {
      // 3 offenses for validator1, 2 for validator2, 1 for validator3 — but only 2 validators allowed.
      // Truncation must cut one validator (not one offense record).
      const offenses: Offense[] = [
        { validator: mockValidator1, amount: 15n, offenseType: OffenseType.INACTIVITY, epochOrSlot: 5n },
        { validator: mockValidator1, amount: 8n, offenseType: OffenseType.INACTIVITY, epochOrSlot: 5n },
        { validator: mockValidator1, amount: 5n, offenseType: OffenseType.INACTIVITY, epochOrSlot: 5n },
        { validator: mockValidator2, amount: 20n, offenseType: OffenseType.INACTIVITY, epochOrSlot: 5n },
        { validator: mockValidator2, amount: 5n, offenseType: OffenseType.INACTIVITY, epochOrSlot: 5n },
        { validator: mockValidator3, amount: 10n, offenseType: OffenseType.INACTIVITY, epochOrSlot: 5n },
      ];

      const committees = [[mockValidator1, mockValidator2, mockValidator3, mockValidator4]];
      const epochsForCommittees = [5n];
      // validator1: 15n+8n+5n=28n → 2 units, validator2: 20n+5n=25n → 2 units, validator3: 10n → 1 unit
      // Limit of 2 validators: validator3 (lowest vote) is zeroed out
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, {
        ...settings,
        maxSlashedValidators: 2,
      });

      expect(votes).toHaveLength(4);
      expect(votes[0]).toEqual(2); // validator1: 28n → 2 units, included
      expect(votes[1]).toEqual(2); // validator2: 25n → 2 units, included
      expect(votes[2]).toEqual(0); // validator3: 10n → 1 unit, zeroed out (only 2 validators allowed)
      expect(votes[3]).toEqual(0); // validator4: no offenses
    });

    it('handles multiple consecutive empty committees', () => {
      const offenses: Offense[] = [
        {
          validator: mockValidator1,
          amount: 30n,
          offenseType: OffenseType.INACTIVITY,
          epochOrSlot: 8n,
        },
      ];

      const committees = [
        [mockValidator1, mockValidator2, mockValidator3, mockValidator4], // Full committee
        [], // EMPTY (not enough validators)
        [], // EMPTY (not enough validators)
        [mockValidator1, mockValidator2, mockValidator3, mockValidator4], // Full committee
      ];

      const epochsForCommittees = [5n, 6n, 7n, 8n];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(16); // 4 committees × 4 targetCommitteeSize
      expect(votes.slice(0, 4)).toEqual([0, 0, 0, 0]); // Committee 0: no matching offenses
      expect(votes.slice(4, 8)).toEqual([0, 0, 0, 0]); // Committee 1: empty, padded
      expect(votes.slice(8, 12)).toEqual([0, 0, 0, 0]); // Committee 2: empty, padded
      expect(votes.slice(12, 16)).toEqual([3, 0, 0, 0]); // Committee 3: validator1 (30n = 3 units)
    });
  });

  describe('encodeSlashConsensusVotes', () => {
    it('encodes votes into buffer correctly', () => {
      const votes = [1, 2, 0, 3];
      const buffer = encodeSlashConsensusVotes(votes);

      expect(buffer.length).toEqual(BlockNumber(1));
      expect(buffer[0]).toEqual(1 | (2 << 2) | (0 << 4) | (3 << 6)); // 0xC9
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

      expect(buffer.length).toEqual(BlockNumber(1));
      // Corrected encoding: all validators get 3 units
      expect(buffer[0]).toEqual(3 | (3 << 2) | (3 << 4) | (3 << 6)); // 0xFF
    });

    it('handles zero votes', () => {
      const votes = [0, 0, 1, 2];
      const buffer = encodeSlashConsensusVotes(votes);

      expect(buffer.length).toEqual(BlockNumber(1));
      // Corrected encoding: validator[0]=0, validator[1]=0, validator[2]=1, validator[3]=2
      expect(buffer[0]).toEqual(0 | (0 << 2) | (1 << 4) | (2 << 6)); // 0x90
    });
  });
});
