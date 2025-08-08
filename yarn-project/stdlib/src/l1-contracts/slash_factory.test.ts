import { OffenseType, type ValidatorSlashOffense } from '../slashing/types.js';
import { packValidatorSlashOffense, unpackValidatorSlashOffense } from './slash_factory.js';

describe('SlashFactory', () => {
  describe('packValidatorSlashOffense', () => {
    it('packs and unpacks a validator slash offense correctly', () => {
      const offense: ValidatorSlashOffense = {
        offenseType: OffenseType.DATA_WITHHOLDING,
        epochOrSlot: 12345n,
      };

      const packed = packValidatorSlashOffense(offense);
      const unpacked = unpackValidatorSlashOffense(packed);

      expect(unpacked).toEqual(offense);
      expect(packed).toBeLessThan(1n << 128n); // Ensure it fits within 128 bits
    });

    it('handles maximum epoch or slot value', () => {
      const maxEpochOrSlot = (1n << 120n) - 1n; // Maximum value for 120 bits
      const offense: ValidatorSlashOffense = {
        offenseType: OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
        epochOrSlot: maxEpochOrSlot,
      };

      const packed = packValidatorSlashOffense(offense);
      const unpacked = unpackValidatorSlashOffense(packed);

      expect(unpacked).toEqual(offense);
    });

    it('handles minimum epoch or slot value', () => {
      const offense: ValidatorSlashOffense = {
        offenseType: OffenseType.INACTIVITY,
        epochOrSlot: 0n,
      };

      const packed = packValidatorSlashOffense(offense);
      const unpacked = unpackValidatorSlashOffense(packed);

      expect(unpacked).toEqual(offense);
    });

    it('preserves data integrity for multiple pack and unpack cycles', () => {
      const offense: ValidatorSlashOffense = {
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        epochOrSlot: 98765n,
      };

      let packed = packValidatorSlashOffense(offense);

      // Pack and unpack multiple times
      for (let i = 0; i < 5; i++) {
        const unpacked = unpackValidatorSlashOffense(packed);
        packed = packValidatorSlashOffense(unpacked);
      }

      const final = unpackValidatorSlashOffense(packed);
      expect(final).toEqual(offense);
    });
  });
});
