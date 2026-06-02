import { EthAddress } from '@aztec/foundation/eth-address';
import { type AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { type Offense, type OffenseIdentifier, OffenseType } from '@aztec/stdlib/slashing';

import { SlasherOffensesStore } from './offenses_store.js';

describe('SlasherOffensesStore', () => {
  let kvStore: AztecLMDBStoreV2;
  let store: SlasherOffensesStore;

  const defaultSettings = {
    slashingRoundSize: 100,
    epochDuration: 32,
  };

  beforeEach(async () => {
    kvStore = await openTmpStore('slasher-offenses-store-test');
    store = new SlasherOffensesStore(kvStore, {
      ...defaultSettings,
      slashOffenseExpirationRounds: 4,
    });
  });

  afterEach(async () => {
    await kvStore.close();
  });

  const createOffense = (
    validator = EthAddress.random(),
    amount = 1000n,
    offense = OffenseType.INACTIVITY,
    epochOrSlot = 10n,
  ): Offense => ({
    validator,
    amount,
    offenseType: offense,
    epochOrSlot,
  });

  const createOffenseIdentifier = (
    validator = EthAddress.random(),
    offense = OffenseType.INACTIVITY,
    epochOrSlot = 10n,
  ): OffenseIdentifier => ({
    validator,
    offenseType: offense,
    epochOrSlot,
  });

  describe('addOffense', () => {
    it('should add and retrieve a single offense', async () => {
      const offense = createOffense();

      await expect(store.addOffense(offense)).resolves.toBe(true);

      const pendingOffenses = await store.getOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0]).toEqual(offense);
    });

    it('should add and retrieve multiple offenses', async () => {
      const offense1 = createOffense(EthAddress.random(), 500n, OffenseType.DATA_WITHHOLDING, 5n);
      const offense2 = createOffense(EthAddress.random(), 750n, OffenseType.INACTIVITY, 15n);
      const offense3 = createOffense(EthAddress.random(), 1000n, OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, 25n);

      await store.addOffense(offense1);
      await store.addOffense(offense2);
      await store.addOffense(offense3);

      const pendingOffenses = await store.getOffenses();
      expect(pendingOffenses).toHaveLength(3);
      expect(pendingOffenses).toContainEqual(offense1);
      expect(pendingOffenses).toContainEqual(offense2);
      expect(pendingOffenses).toContainEqual(offense3);
    });

    it('should handle all offense types', async () => {
      const offenseTypes = Object.values(OffenseType).filter(v => typeof v === 'number') as OffenseType[];
      const offenses: Offense[] = [];

      for (let i = 0; i < offenseTypes.length; i++) {
        const offense = createOffense(EthAddress.random(), BigInt(1000 + i), offenseTypes[i], BigInt(10 + i));
        offenses.push(offense);
        await store.addOffense(offense);
      }

      const pendingOffenses = await store.getOffenses();
      expect(pendingOffenses).toHaveLength(offenseTypes.length);

      // Verify all offense types are present
      for (const offenseType of offenseTypes) {
        expect(pendingOffenses.some(o => o.offenseType === offenseType)).toBe(true);
      }
    });

    it('should handle zero amount and epoch/slot values', async () => {
      const offense = createOffense(EthAddress.random(), 0n, OffenseType.UNKNOWN, 0n);

      await store.addOffense(offense);

      const pendingOffenses = await store.getOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0].amount).toBe(0n);
      expect(pendingOffenses[0].epochOrSlot).toBe(0n);
    });

    it('should handle large amounts and epoch/slot values', async () => {
      const largeAmount = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'); // Max uint128
      const largeEpochOrSlot = BigInt(1_000_000_000);
      const offense = createOffense(EthAddress.random(), largeAmount, OffenseType.INACTIVITY, largeEpochOrSlot);

      await store.addOffense(offense);

      const pendingOffenses = await store.getOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0].amount).toBe(largeAmount);
      expect(pendingOffenses[0].epochOrSlot).toBe(largeEpochOrSlot);
    });

    it('should preserve offense data across store operations', async () => {
      const validator = EthAddress.fromString('0x1234567890abcdef1234567890abcdef12345678');
      const offense = createOffense(
        validator,
        12345n,
        OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS,
        54321n,
      );

      await store.addOffense(offense);

      const pendingOffenses = await store.getOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0].validator.toString()).toBe(validator.toString());
      expect(pendingOffenses[0].amount).toBe(12345n);
      expect(pendingOffenses[0].offenseType).toBe(
        OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS,
      );
      expect(pendingOffenses[0].epochOrSlot).toBe(54321n);
    });

    it('should get offenses for a specific round', async () => {
      // Use slot-based offenses for more predictable round calculation
      // With slashingRoundSize: 100, slot 150-199 should be in round 1, slot 200-299 in round 2
      const round = 1n;
      const offense1 = createOffense(EthAddress.random(), 1000n, OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, 150n); // slot 150 -> round 1
      const offense2 = createOffense(EthAddress.random(), 1000n, OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, 199n); // slot 199 -> round 1
      const offense3 = createOffense(EthAddress.random(), 1000n, OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, 200n); // slot 200 -> round 2

      await store.addOffense(offense1);
      await store.addOffense(offense2);
      await store.addOffense(offense3);

      const offenses = await store.getOffensesForRound(round);
      expect(offenses).toHaveLength(2);
      expect(offenses).toContainEqual(offense1);
      expect(offenses).toContainEqual(offense2);
    });
  });

  describe('hasOffense', () => {
    it('should return true for added offenses', async () => {
      const offense = createOffense();
      await store.addOffense(offense);

      expect(await store.hasOffense(offense)).toBe(true);
    });

    it('should return false for non-existent offenses', async () => {
      const offense = createOffenseIdentifier();

      expect(await store.hasOffense(offense)).toBe(false);
    });

    it('should work with different validators for same offense type', async () => {
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();
      const offense1 = createOffense(validator1, 1000n, OffenseType.INACTIVITY, 10n);
      const offense2 = createOffense(validator2, 1000n, OffenseType.INACTIVITY, 10n);

      await store.addOffense(offense1);

      expect(await store.hasOffense(offense1)).toBe(true);
      expect(await store.hasOffense(offense2)).toBe(false);
    });

    it('should differentiate by epochOrSlot', async () => {
      const validator = EthAddress.random();
      const offense1 = createOffense(validator, 1000n, OffenseType.INACTIVITY, 10n);
      const offense2 = createOffense(validator, 1000n, OffenseType.INACTIVITY, 11n);

      await store.addOffense(offense1);

      expect(await store.hasOffense(offense1)).toBe(true);
      expect(await store.hasOffense(offense2)).toBe(false);
    });

    it('should work after adding multiple offenses', async () => {
      const offense1 = createOffense();
      const offense2 = createOffense();
      const nonExistentOffense = createOffenseIdentifier();

      await store.addOffense(offense1);
      await store.addOffense(offense2);

      expect(await store.hasOffense(offense1)).toBe(true);
      expect(await store.hasOffense(offense2)).toBe(true);
      expect(await store.hasOffense(nonExistentOffense)).toBe(false);
    });
  });

  describe('clearExpiredOffenses', () => {
    it('should clear expired offenses based on expiration rounds', async () => {
      const currentRound = 8n;

      // Round 6: slots 600-699, Round 1: slots 100-199, Round 0: slots 0-99
      const recentOffense = createOffense(EthAddress.random(), 1000n, OffenseType.INACTIVITY, 650n / 32n); // Round 6, should not expire
      const expiredOffense1 = createOffense(EthAddress.random(), 1000n, OffenseType.INACTIVITY, 150n / 32n); // Round 1, should expire
      const expiredOffense2 = createOffense(EthAddress.random(), 1000n, OffenseType.INACTIVITY, 50n / 32n); // Round 0, should expire

      await store.addOffense(recentOffense);
      await store.addOffense(expiredOffense1);
      await store.addOffense(expiredOffense2);

      // Verify all offenses are present
      expect(await store.hasOffense(recentOffense)).toBe(true);
      expect(await store.hasOffense(expiredOffense1)).toBe(true);
      expect(await store.hasOffense(expiredOffense2)).toBe(true);

      // Clear expired offenses
      await store.clearExpiredOffenses(currentRound);

      // Recent offense should remain, expired offenses should be gone
      expect(await store.hasOffense(recentOffense)).toBe(true);
      expect(await store.hasOffense(expiredOffense1)).toBe(false);
      expect(await store.hasOffense(expiredOffense2)).toBe(false);
    });

    it('should not clear anything when expiration is disabled', async () => {
      const storeWithNoExpiration = new SlasherOffensesStore(kvStore, {
        ...defaultSettings,
        slashOffenseExpirationRounds: 0,
      });

      const offense = createOffense(EthAddress.random(), 1000n, OffenseType.INACTIVITY, 10n);
      await storeWithNoExpiration.addOffense(offense);

      await storeWithNoExpiration.clearExpiredOffenses(100n);

      expect(await storeWithNoExpiration.hasOffense(offense)).toBe(true);
    });

    it('should not clear anything when not enough rounds have passed', async () => {
      const currentRound = 2n; // Less than expiration rounds

      const offense = createOffense(EthAddress.random(), 1000n, OffenseType.INACTIVITY, 10n);
      await store.addOffense(offense);

      await store.clearExpiredOffenses(currentRound);

      expect(await store.hasOffense(offense)).toBe(true);
    });
  });

  describe('clearOffenses', () => {
    it('clears matching offenses and keeps unrelated offenses', async () => {
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();
      const matching1 = createOffense(validator1, 1000n, OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL, 150n);
      const matching2 = createOffense(validator2, 1000n, OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL, 150n);
      const otherSlot = createOffense(validator1, 1000n, OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL, 151n);
      const otherType = createOffense(validator1, 1000n, OffenseType.DUPLICATE_PROPOSAL, 150n);

      await store.addOffense(matching1);
      await store.addOffense(matching2);
      await store.addOffense(otherSlot);
      await store.addOffense(otherType);

      const cleared = await store.clearOffenses({
        offenseType: OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
        epochOrSlot: 150n,
      });

      expect(cleared).toBe(2);
      expect(await store.hasOffense(matching1)).toBe(false);
      expect(await store.hasOffense(matching2)).toBe(false);
      expect(await store.hasOffense(otherSlot)).toBe(true);
      expect(await store.hasOffense(otherType)).toBe(true);
      const roundOffenses = await store.getOffensesForRound(1n);
      expect(roundOffenses).toHaveLength(2);
      expect(roundOffenses).toContainEqual(otherSlot);
      expect(roundOffenses).toContainEqual(otherType);
    });

    it('can clear only selected validators', async () => {
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();
      const matching1 = createOffense(validator1, 1000n, OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL, 150n);
      const matching2 = createOffense(validator2, 1000n, OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL, 150n);

      await store.addOffense(matching1);
      await store.addOffense(matching2);

      const cleared = await store.clearOffenses({
        offenseType: OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
        epochOrSlot: 150n,
        validators: [validator1],
      });

      expect(cleared).toBe(1);
      expect(await store.hasOffense(matching1)).toBe(false);
      expect(await store.hasOffense(matching2)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle duplicate offense additions', async () => {
      const offense = createOffense();

      await expect(store.addOffense(offense)).resolves.toBe(true);
      await expect(store.addOffense(offense)).resolves.toBe(false);

      const pendingOffenses = await store.getOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0]).toEqual(offense);
    });

    it('should handle same offense for different validators', async () => {
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();
      const offense1 = createOffense(validator1, 1000n, OffenseType.INACTIVITY, 10n);
      const offense2 = createOffense(validator2, 1000n, OffenseType.INACTIVITY, 10n);

      await store.addOffense(offense1);
      await store.addOffense(offense2);

      const pendingOffenses = await store.getOffenses();
      expect(pendingOffenses).toHaveLength(2);
      expect(pendingOffenses).toContainEqual(offense1);
      expect(pendingOffenses).toContainEqual(offense2);
    });

    it('should handle large number of offenses', async () => {
      const numOffenses = 100;

      for (let i = 0; i < numOffenses; i++) {
        const offense = createOffense(EthAddress.random(), BigInt(1000 + i), OffenseType.UNKNOWN, BigInt(10 + i));
        await store.addOffense(offense);
      }

      const pendingOffenses = await store.getOffenses();
      expect(pendingOffenses).toHaveLength(numOffenses);
    });
  });

  describe('offense key generation', () => {
    it('should generate unique keys for different offenses', async () => {
      const validator = EthAddress.random();
      const offense1 = createOffense(validator, 1000n, OffenseType.INACTIVITY, 10n);
      const offense2 = createOffense(validator, 1000n, OffenseType.DATA_WITHHOLDING, 10n); // Different type
      const offense3 = createOffense(validator, 1000n, OffenseType.INACTIVITY, 11n); // Different epoch/slot

      await store.addOffense(offense1);
      await store.addOffense(offense2);
      await store.addOffense(offense3);

      expect(await store.hasOffense(offense1)).toBe(true);
      expect(await store.hasOffense(offense2)).toBe(true);
      expect(await store.hasOffense(offense3)).toBe(true);

      const pendingOffenses = await store.getOffenses();
      expect(pendingOffenses).toHaveLength(3);
    });
  });
});
