import { EthAddress } from '@aztec/foundation/eth-address';
import type { Offense } from '@aztec/stdlib/slashing';
import { OffenseType } from '@aztec/stdlib/slashing';

import { deserializeOffense, serializeOffense } from './serialization.js';

describe('slashing/serialization', () => {
  const createOffense = (
    validator = EthAddress.random(),
    amount = 1000n,
    offense = OffenseType.INACTIVITY,
    epochOrSlot = 50n,
  ): Offense => ({
    validator,
    amount,
    offenseType: offense,
    epochOrSlot,
  });

  describe('serializeOffense and deserializeOffense', () => {
    it('should serialize and deserialize a simple offense', () => {
      const offense = createOffense();

      const serialized = serializeOffense(offense);
      const deserialized = deserializeOffense(serialized);

      expect(deserialized.validator).toEqual(offense.validator);
      expect(deserialized.amount).toEqual(offense.amount);
      expect(deserialized.offenseType).toEqual(offense.offenseType);
      expect(deserialized.epochOrSlot).toEqual(offense.epochOrSlot);
    });

    it('should handle all offense types', () => {
      const offenseTypes = Object.values(OffenseType).filter(v => typeof v === 'number') as OffenseType[];

      offenseTypes.forEach((offenseType, index) => {
        const offense = createOffense(EthAddress.random(), BigInt(1000 + index), offenseType, BigInt(100 + index));

        const serialized = serializeOffense(offense);
        const deserialized = deserializeOffense(serialized);

        expect(deserialized.validator).toEqual(offense.validator);
        expect(deserialized.amount).toEqual(offense.amount);
        expect(deserialized.offenseType).toEqual(offenseType);
        expect(deserialized.epochOrSlot).toEqual(BigInt(100 + index));
      });
    });

    it('should handle zero amount and epoch/slot', () => {
      const offense = createOffense(EthAddress.random(), 0n, OffenseType.UNKNOWN, 0n);

      const serialized = serializeOffense(offense);
      const deserialized = deserializeOffense(serialized);

      expect(deserialized.validator).toEqual(offense.validator);
      expect(deserialized.amount).toEqual(0n);
      expect(deserialized.offenseType).toEqual(OffenseType.UNKNOWN);
      expect(deserialized.epochOrSlot).toEqual(0n);
    });

    it('should handle large values', () => {
      const largeAmount = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'); // Max uint128
      const largeEpochOrSlot = BigInt('0xFFFFFFFFFFFFFFFF'); // Max uint64

      const offense = createOffense(
        EthAddress.random(),
        largeAmount,
        OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
        largeEpochOrSlot,
      );

      const serialized = serializeOffense(offense);
      const deserialized = deserializeOffense(serialized);

      expect(deserialized.validator).toEqual(offense.validator);
      expect(deserialized.amount).toEqual(largeAmount);
      expect(deserialized.offenseType).toEqual(OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL);
      expect(deserialized.epochOrSlot).toEqual(largeEpochOrSlot);
    });

    it('should be deterministic', () => {
      const offense = createOffense();

      const serialized1 = serializeOffense(offense);
      const serialized2 = serializeOffense(offense);

      expect(serialized1).toEqual(serialized2);
    });

    it('should handle different validator addresses', () => {
      const validator1 = EthAddress.fromString('0x1111111111111111111111111111111111111111');
      const validator2 = EthAddress.fromString('0x2222222222222222222222222222222222222222');

      const offense1 = createOffense(validator1, 500n, OffenseType.DATA_WITHHOLDING, 25n);
      const offense2 = createOffense(validator2, 750n, OffenseType.INACTIVITY, 30n);

      const serialized1 = serializeOffense(offense1);
      const deserialized1 = deserializeOffense(serialized1);

      const serialized2 = serializeOffense(offense2);
      const deserialized2 = deserializeOffense(serialized2);

      expect(deserialized1.validator).toEqual(validator1);
      expect(deserialized1.amount).toEqual(500n);
      expect(deserialized1.offenseType).toEqual(OffenseType.DATA_WITHHOLDING);
      expect(deserialized1.epochOrSlot).toEqual(25n);

      expect(deserialized2.validator).toEqual(validator2);
      expect(deserialized2.amount).toEqual(750n);
      expect(deserialized2.offenseType).toEqual(OffenseType.INACTIVITY);
      expect(deserialized2.epochOrSlot).toEqual(30n);

      // Ensure they produce different serialized data
      expect(serialized1).not.toEqual(serialized2);
    });

    it('should handle multiple serialization cycles without data loss', () => {
      const originalOffense = createOffense(
        EthAddress.random(),
        12345n,
        OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS,
        98765n,
      );

      let currentOffense = originalOffense;

      // Serialize and deserialize multiple times
      for (let i = 0; i < 5; i++) {
        const serialized = serializeOffense(currentOffense);
        currentOffense = deserializeOffense(serialized);
      }

      expect(currentOffense).toEqual(originalOffense);
    });

    it('should handle minimum and maximum amounts', () => {
      const minAmountOffense = createOffense(EthAddress.random(), 1n, OffenseType.INACTIVITY, 1n);
      const maxAmountOffense = createOffense(
        EthAddress.random(),
        BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'), // Max uint128
        OffenseType.PROPOSED_INCORRECT_ATTESTATIONS,
        BigInt('0xFFFFFFFFFFFFFFFF'), // Max uint64
      );

      const minSerialized = serializeOffense(minAmountOffense);
      const minDeserialized = deserializeOffense(minSerialized);

      const maxSerialized = serializeOffense(maxAmountOffense);
      const maxDeserialized = deserializeOffense(maxSerialized);

      expect(minDeserialized.amount).toEqual(1n);
      expect(minDeserialized.epochOrSlot).toEqual(1n);

      expect(maxDeserialized.amount).toEqual(BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'));
      expect(maxDeserialized.epochOrSlot).toEqual(BigInt('0xFFFFFFFFFFFFFFFF'));
    });

    it('should handle different epoch vs slot based offenses', () => {
      // Epoch-based offenses
      const epochOffenses = [
        OffenseType.INACTIVITY,
        OffenseType.DATA_WITHHOLDING,
        OffenseType.INACTIVITY,
        OffenseType.UNKNOWN,
      ];

      // Slot-based offenses
      const slotOffenses = [
        OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        OffenseType.PROPOSED_INCORRECT_ATTESTATIONS,
        OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS,
        OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
        OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
      ];

      [...epochOffenses, ...slotOffenses].forEach((offenseType, index) => {
        const offense = createOffense(EthAddress.random(), BigInt(100 * (index + 1)), offenseType, BigInt(index + 1));

        const serialized = serializeOffense(offense);
        const deserialized = deserializeOffense(serialized);

        expect(deserialized.offenseType).toEqual(offenseType);
        expect(deserialized.amount).toEqual(BigInt(100 * (index + 1)));
        expect(deserialized.epochOrSlot).toEqual(BigInt(index + 1));
      });
    });
  });
});
