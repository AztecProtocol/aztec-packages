import { EthAddress } from '@aztec/foundation/eth-address';

import { encodeSlashConsensusVotes, getSlashConsensusVotesFromOffenses } from './tally.js';
import { type Offense, OffenseType } from './types.js';

describe('TallySlashingHelpers', () => {
  const mockValidator1 = EthAddress.fromString('0x1234567890123456789012345678901234567890');
  const mockValidator2 = EthAddress.fromString('0x2345678901234567890123456789012345678901');
  const mockValidator3 = EthAddress.fromString('0x3456789012345678901234567890123456789012');
  const mockValidator4 = EthAddress.fromString('0x4567890123456789012345678901234567890123');

  describe('getSlashConsensusVotesFromOffenses', () => {
    const settings = {
      slashingAmounts: [10n, 20n, 30n] as [bigint, bigint, bigint],
      epochDuration: 32,
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

      expect(votes).toHaveLength(3);
      expect(votes[0]).toEqual(2); // Only 25n from epoch 5 offense for validator1
      expect(votes[1]).toEqual(0); // Offense is in slot 10, which is epoch 0, not 5
      expect(votes[2]).toEqual(0); // No offenses for validator3
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

      const epochsForCommittees = [5n, 6n]; // Committees for epochs 5 and 6
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(4);
      expect(votes[0]).toEqual(2); // validator1 in committee1
      expect(votes[1]).toEqual(0); // validator2 in committee1
      expect(votes[2]).toEqual(0); // validator3 in committee2
      expect(votes[3]).toEqual(3); // validator4 in committee2
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

      expect(votes).toHaveLength(4);
      expect(votes[0]).toEqual(2); // validator1 in committee1, epoch 5 offense (20n)
      expect(votes[1]).toEqual(0); // validator2 in committee1, no offenses
      expect(votes[2]).toEqual(1); // validator1 in committee2, epoch 6 offense (10n)
      expect(votes[3]).toEqual(0); // validator3 in committee2, no offenses
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

      expect(votes).toHaveLength(2);
      expect(votes[0]).toEqual(0); // validator2 has no offenses
      expect(votes[1]).toEqual(0); // validator3 has no offenses
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

      expect(votes).toHaveLength(4);
      expect(votes[0]).toEqual(3); // validator1 in committee1, always-slash (30n)
      expect(votes[1]).toEqual(1); // validator2 in committee1, epoch 5 offense (10n)
      expect(votes[2]).toEqual(3); // validator1 in committee2, always-slash (30n)
      expect(votes[3]).toEqual(0); // validator3 in committee2, no offenses
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

      expect(votes).toHaveLength(3);
      expect(votes[0]).toEqual(1); // validator1: 15n offense maps to epoch 2
      expect(votes[1]).toEqual(2); // validator2: 20n offense maps to epoch 2
      expect(votes[2]).toEqual(0); // validator3: no offenses
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

      expect(votes).toHaveLength(2);
      expect(votes[0]).toEqual(2); // validator1: 10n + 15n = 25n total for epoch 2
      expect(votes[1]).toEqual(0); // validator2: no offenses
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
          offenseType: OffenseType.DATA_WITHHOLDING,
          epochOrSlot: 3n,
        },
        {
          validator: mockValidator1,
          amount: 5n,
          offenseType: OffenseType.VALID_EPOCH_PRUNED,
          epochOrSlot: 3n,
        },
      ];

      const committees = [[mockValidator1, mockValidator2]];
      const epochsForCommittees = [3n];
      const votes = getSlashConsensusVotesFromOffenses(offenses, committees, epochsForCommittees, settings);

      expect(votes).toHaveLength(2);
      expect(votes[0]).toEqual(2); // validator1: 8n + 7n + 5n = 20n total
      expect(votes[1]).toEqual(0); // validator2: no offenses
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

      expect(votes).toHaveLength(4);
      expect(votes[0]).toEqual(3); // validator1 committee1: 20n(always) + 15n(epoch5) = 35n
      expect(votes[1]).toEqual(0); // validator2: no offenses
      expect(votes[2]).toEqual(2); // validator1 committee2: 20n(always) only
      expect(votes[3]).toEqual(0); // validator3: no offenses
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

      expect(votes).toHaveLength(4);
      expect(votes[0]).toEqual(1); // validator1 epoch0: 15n offense
      expect(votes[1]).toEqual(0); // validator2 epoch0: no matching offenses
      expect(votes[2]).toEqual(0); // validator1 epoch1: no matching offenses
      expect(votes[3]).toEqual(2); // validator2 epoch1: 20n offense
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

      expect(votes).toHaveLength(3);
      expect(votes[0]).toEqual(0); // validator1: 0n amount = 0 slash units
      expect(votes[1]).toEqual(1); // validator2: 15n amount = 1 slash unit
      expect(votes[2]).toEqual(0); // validator3: no offenses
    });
  });

  describe('encodeSlashConsensusVotes', () => {
    it('encodes votes into buffer correctly', () => {
      const votes = [1, 2, 0, 3];
      const buffer = encodeSlashConsensusVotes(votes);

      expect(buffer.length).toEqual(1);
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

      expect(buffer.length).toEqual(1);
      // Corrected encoding: all validators get 3 units
      expect(buffer[0]).toEqual(3 | (3 << 2) | (3 << 4) | (3 << 6)); // 0xFF
    });

    it('handles zero votes', () => {
      const votes = [0, 0, 1, 2];
      const buffer = encodeSlashConsensusVotes(votes);

      expect(buffer.length).toEqual(1);
      // Corrected encoding: validator[0]=0, validator[1]=0, validator[2]=1, validator[3]=2
      expect(buffer[0]).toEqual(0 | (0 << 2) | (1 << 4) | (2 << 6)); // 0x90
    });
  });
});
