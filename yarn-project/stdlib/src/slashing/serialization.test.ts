import { EthAddress } from '@aztec/foundation/eth-address';

import {
  deserializeOffense,
  deserializeSlashPayload,
  deserializeSlashPayloadRound,
  serializeOffense,
  serializeSlashPayload,
  serializeSlashPayloadRound,
} from './serialization.js';
import type { Offense, SlashPayload, SlashPayloadRound, ValidatorSlash, ValidatorSlashOffense } from './types.js';
import { OffenseType } from './types.js';

describe('slashing/serialization', () => {
  const createValidatorSlashOffense = (
    offenseType = OffenseType.INACTIVITY,
    epochOrSlot = 100n,
  ): ValidatorSlashOffense => ({
    offenseType,
    epochOrSlot,
  });

  const createValidatorSlash = (
    validator = EthAddress.random(),
    amount = 1000n,
    offenses = [createValidatorSlashOffense()],
  ): ValidatorSlash => ({
    validator,
    amount,
    offenses,
  });

  const createSlashPayload = (
    address = EthAddress.random(),
    slashes = [createValidatorSlash()],
    timestamp = BigInt(Date.now()),
  ): SlashPayload => ({
    address,
    slashes,
    timestamp,
  });

  const createSlashPayloadRound = (payload = createSlashPayload(), votes = 5n, round = 10n): SlashPayloadRound => ({
    ...payload,
    votes,
    round,
  });

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

  describe('serializeSlashPayload and deserializeSlashPayload', () => {
    it('should serialize and deserialize a simple payload', () => {
      const payload = createSlashPayload();

      const serialized = serializeSlashPayload(payload);
      const deserialized = deserializeSlashPayload(serialized);

      expect(deserialized.address).toEqual(payload.address);
      expect(deserialized.slashes).toHaveLength(payload.slashes.length);
      expect(deserialized.slashes[0].validator).toEqual(payload.slashes[0].validator);
      expect(deserialized.slashes[0].amount).toEqual(payload.slashes[0].amount);
      expect(deserialized.slashes[0].offenses).toHaveLength(payload.slashes[0].offenses.length);
      expect(deserialized.slashes[0].offenses[0].offenseType).toEqual(payload.slashes[0].offenses[0].offenseType);
      expect(deserialized.slashes[0].offenses[0].epochOrSlot).toEqual(payload.slashes[0].offenses[0].epochOrSlot);
      expect(deserialized.timestamp).toEqual(payload.timestamp);
    });

    it('should handle empty slashes array', () => {
      const payload = createSlashPayload(EthAddress.random(), []);

      const serialized = serializeSlashPayload(payload);
      const deserialized = deserializeSlashPayload(serialized);

      expect(deserialized.address).toEqual(payload.address);
      expect(deserialized.slashes).toHaveLength(0);
      expect(deserialized.timestamp).toEqual(payload.timestamp);
    });

    it('should handle multiple validators with multiple offenses', () => {
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();

      const offense1 = createValidatorSlashOffense(OffenseType.DATA_WITHHOLDING, 50n);
      const offense2 = createValidatorSlashOffense(OffenseType.INACTIVITY, 75n);
      const offense3 = createValidatorSlashOffense(OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, 125n);

      const slash1 = createValidatorSlash(validator1, 500n, [offense1, offense2]);
      const slash2 = createValidatorSlash(validator2, 750n, [offense3]);

      const payload = createSlashPayload(EthAddress.random(), [slash1, slash2]);

      const serialized = serializeSlashPayload(payload);
      const deserialized = deserializeSlashPayload(serialized);

      expect(deserialized.address).toEqual(payload.address);
      expect(deserialized.slashes).toHaveLength(2);

      // First validator
      expect(deserialized.slashes[0].validator).toEqual(validator1);
      expect(deserialized.slashes[0].amount).toEqual(500n);
      expect(deserialized.slashes[0].offenses).toHaveLength(2);
      expect(deserialized.slashes[0].offenses[0].offenseType).toEqual(OffenseType.DATA_WITHHOLDING);
      expect(deserialized.slashes[0].offenses[0].epochOrSlot).toEqual(50n);
      expect(deserialized.slashes[0].offenses[1].offenseType).toEqual(OffenseType.INACTIVITY);
      expect(deserialized.slashes[0].offenses[1].epochOrSlot).toEqual(75n);

      // Second validator
      expect(deserialized.slashes[1].validator).toEqual(validator2);
      expect(deserialized.slashes[1].amount).toEqual(750n);
      expect(deserialized.slashes[1].offenses).toHaveLength(1);
      expect(deserialized.slashes[1].offenses[0].offenseType).toEqual(OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS);
      expect(deserialized.slashes[1].offenses[0].epochOrSlot).toEqual(125n);

      expect(deserialized.timestamp).toEqual(payload.timestamp);
    });

    it('should handle all offense types', () => {
      const offenseTypes = Object.values(OffenseType).filter(v => typeof v === 'number') as OffenseType[];
      const offenses = offenseTypes.map((type, i) => createValidatorSlashOffense(type, BigInt(i * 10)));
      const slash = createValidatorSlash(EthAddress.random(), 2000n, offenses);
      const payload = createSlashPayload(EthAddress.random(), [slash]);

      const serialized = serializeSlashPayload(payload);
      const deserialized = deserializeSlashPayload(serialized);

      expect(deserialized.slashes[0].offenses).toHaveLength(offenseTypes.length);
      offenseTypes.forEach((type, i) => {
        expect(deserialized.slashes[0].offenses[i].offenseType).toEqual(type);
        expect(deserialized.slashes[0].offenses[i].epochOrSlot).toEqual(BigInt(i * 10));
      });
    });

    it('should handle large values', () => {
      const largeAmount = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'); // Max uint128
      const largeEpochOrSlot = BigInt('0xFFFFFFFFFFFFFFFF'); // Max uint64
      const largeTimestamp = BigInt('0xFFFFFFFFFFFFFFFF'); // Max uint64

      const offense = createValidatorSlashOffense(OffenseType.UNKNOWN, largeEpochOrSlot);
      const slash = createValidatorSlash(EthAddress.random(), largeAmount, [offense]);
      const payload = createSlashPayload(EthAddress.random(), [slash], largeTimestamp);

      const serialized = serializeSlashPayload(payload);
      const deserialized = deserializeSlashPayload(serialized);

      expect(deserialized.slashes[0].amount).toEqual(largeAmount);
      expect(deserialized.slashes[0].offenses[0].epochOrSlot).toEqual(largeEpochOrSlot);
      expect(deserialized.timestamp).toEqual(largeTimestamp);
    });

    it('should be deterministic', () => {
      const payload = createSlashPayload();

      const serialized1 = serializeSlashPayload(payload);
      const serialized2 = serializeSlashPayload(payload);

      expect(serialized1).toEqual(serialized2);
    });
  });

  describe('serializeSlashPayloadRound and deserializeSlashPayloadRound', () => {
    it('should serialize and deserialize a payload round', () => {
      const payloadRound = createSlashPayloadRound();

      const serialized = serializeSlashPayloadRound(payloadRound);
      const deserialized = deserializeSlashPayloadRound(serialized);

      expect(deserialized.address).toEqual(payloadRound.address);
      expect(deserialized.slashes).toHaveLength(payloadRound.slashes.length);
      expect(deserialized.slashes[0].validator).toEqual(payloadRound.slashes[0].validator);
      expect(deserialized.slashes[0].amount).toEqual(payloadRound.slashes[0].amount);
      expect(deserialized.slashes[0].offenses[0].offenseType).toEqual(payloadRound.slashes[0].offenses[0].offenseType);
      expect(deserialized.slashes[0].offenses[0].epochOrSlot).toEqual(payloadRound.slashes[0].offenses[0].epochOrSlot);
      expect(deserialized.timestamp).toEqual(payloadRound.timestamp);
      expect(deserialized.votes).toEqual(payloadRound.votes);
      expect(deserialized.round).toEqual(payloadRound.round);
    });

    it('should handle zero votes and round', () => {
      const payloadRound = createSlashPayloadRound(createSlashPayload(), 0n, 0n);

      const serialized = serializeSlashPayloadRound(payloadRound);
      const deserialized = deserializeSlashPayloadRound(serialized);

      expect(deserialized.votes).toEqual(0n);
      expect(deserialized.round).toEqual(0n);
    });

    it('should handle large votes and round values', () => {
      const largeVotes = 4294967295n; // Max uint32 value
      const largeRound = BigInt('0xFFFFFFFFFFFFFFFF'); // Max uint64

      const payloadRound = createSlashPayloadRound(createSlashPayload(), largeVotes, largeRound);

      const serialized = serializeSlashPayloadRound(payloadRound);
      const deserialized = deserializeSlashPayloadRound(serialized);

      expect(deserialized.votes).toEqual(largeVotes);
      expect(deserialized.round).toEqual(largeRound);
    });

    it('should handle empty slashes with votes and round', () => {
      const emptyPayload = createSlashPayload(EthAddress.random(), []);
      const payloadRound = createSlashPayloadRound(emptyPayload, 3n, 7n);

      const serialized = serializeSlashPayloadRound(payloadRound);
      const deserialized = deserializeSlashPayloadRound(serialized);

      expect(deserialized.slashes).toHaveLength(0);
      expect(deserialized.votes).toEqual(3n);
      expect(deserialized.round).toEqual(7n);
    });

    it('should preserve all SlashPayload properties plus round-specific ones', () => {
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();

      const offense1 = createValidatorSlashOffense(OffenseType.DATA_WITHHOLDING, 25n);
      const offense2 = createValidatorSlashOffense(OffenseType.VALID_EPOCH_PRUNED, 30n);

      const slash1 = createValidatorSlash(validator1, 800n, [offense1]);
      const slash2 = createValidatorSlash(validator2, 1200n, [offense2]);

      const basePayload = createSlashPayload(EthAddress.random(), [slash1, slash2], BigInt(Date.now()));
      const payloadRound = createSlashPayloadRound(basePayload, 15n, 42n);

      const serialized = serializeSlashPayloadRound(payloadRound);
      const deserialized = deserializeSlashPayloadRound(serialized);

      // Verify all base payload properties
      expect(deserialized.address).toEqual(basePayload.address);
      expect(deserialized.timestamp).toEqual(basePayload.timestamp);
      expect(deserialized.slashes).toHaveLength(2);
      expect(deserialized.slashes[0].validator).toEqual(validator1);
      expect(deserialized.slashes[0].amount).toEqual(800n);
      expect(deserialized.slashes[0].offenses[0].offenseType).toEqual(OffenseType.DATA_WITHHOLDING);
      expect(deserialized.slashes[0].offenses[0].epochOrSlot).toEqual(25n);
      expect(deserialized.slashes[1].validator).toEqual(validator2);
      expect(deserialized.slashes[1].amount).toEqual(1200n);
      expect(deserialized.slashes[1].offenses[0].offenseType).toEqual(OffenseType.VALID_EPOCH_PRUNED);
      expect(deserialized.slashes[1].offenses[0].epochOrSlot).toEqual(30n);

      // Verify round-specific properties
      expect(deserialized.votes).toEqual(15n);
      expect(deserialized.round).toEqual(42n);
    });

    it('should be deterministic', () => {
      const payloadRound = createSlashPayloadRound();

      const serialized1 = serializeSlashPayloadRound(payloadRound);
      const serialized2 = serializeSlashPayloadRound(payloadRound);

      expect(serialized1).toEqual(serialized2);
    });

    it('should work with different payload round configurations', () => {
      // Test different combinations to ensure robustness
      const testCases = [
        { votes: 1n, round: 1n },
        { votes: 100n, round: 5n },
        { votes: 0n, round: 999n },
        { votes: 4294967295n, round: 1n }, // Max uint32 value
      ];

      testCases.forEach(({ votes, round }) => {
        const payloadRound = createSlashPayloadRound(createSlashPayload(), votes, round);

        const serialized = serializeSlashPayloadRound(payloadRound);
        const deserialized = deserializeSlashPayloadRound(serialized);

        expect(deserialized.votes).toEqual(votes);
        expect(deserialized.round).toEqual(round);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle validator with no offenses', () => {
      const slash = createValidatorSlash(EthAddress.random(), 500n, []);
      const payload = createSlashPayload(EthAddress.random(), [slash]);

      const serialized = serializeSlashPayload(payload);
      const deserialized = deserializeSlashPayload(serialized);

      expect(deserialized.slashes[0].offenses).toHaveLength(0);
    });

    it('should handle minimum and maximum timestamp values', () => {
      const minPayload = createSlashPayload(EthAddress.random(), [], 0n);
      const maxPayload = createSlashPayload(EthAddress.random(), [], BigInt('0xFFFFFFFFFFFFFFFF'));

      const minSerialized = serializeSlashPayload(minPayload);
      const minDeserialized = deserializeSlashPayload(minSerialized);
      expect(minDeserialized.timestamp).toEqual(0n);

      const maxSerialized = serializeSlashPayload(maxPayload);
      const maxDeserialized = deserializeSlashPayload(maxSerialized);
      expect(maxDeserialized.timestamp).toEqual(BigInt('0xFFFFFFFFFFFFFFFF'));
    });
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
      const offense2 = createOffense(validator2, 750n, OffenseType.VALID_EPOCH_PRUNED, 30n);

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
      expect(deserialized2.offenseType).toEqual(OffenseType.VALID_EPOCH_PRUNED);
      expect(deserialized2.epochOrSlot).toEqual(30n);

      // Ensure they produce different serialized data
      expect(serialized1).not.toEqual(serialized2);
    });

    it('should handle multiple serialization cycles without data loss', () => {
      const originalOffense = createOffense(
        EthAddress.random(),
        12345n,
        OffenseType.ATTESTED_DESCENDANT_OF_INVALID,
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
        OffenseType.VALID_EPOCH_PRUNED,
        OffenseType.UNKNOWN,
      ];

      // Slot-based offenses
      const slotOffenses = [
        OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        OffenseType.PROPOSED_INCORRECT_ATTESTATIONS,
        OffenseType.ATTESTED_DESCENDANT_OF_INVALID,
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
