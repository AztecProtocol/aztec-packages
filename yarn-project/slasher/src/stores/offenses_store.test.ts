import { EthAddress } from '@aztec/foundation/eth-address';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import { type Offense, type OffenseIdentifier, OffenseType } from '@aztec/stdlib/slashing';

import { SlasherOffensesStore } from './offenses_store.js';

describe('SlasherOffensesStore', () => {
  let kvStore: ReturnType<typeof openTmpStore>;
  let store: SlasherOffensesStore;

  const defaultSettings = {
    slashingRoundSize: 100n,
    epochDuration: 32,
    proofSubmissionEpochs: 2,
  };

  beforeEach(() => {
    kvStore = openTmpStore();
    store = new SlasherOffensesStore(kvStore, defaultSettings);
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

  describe('addPendingOffense and getPendingOffenses', () => {
    it('should add and retrieve a single offense', async () => {
      const offense = createOffense();

      await store.addPendingOffense(offense);

      const pendingOffenses = await store.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0]).toEqual(offense);
    });

    it('should add and retrieve multiple offenses', async () => {
      const offense1 = createOffense(EthAddress.random(), 500n, OffenseType.DATA_WITHHOLDING, 5n);
      const offense2 = createOffense(EthAddress.random(), 750n, OffenseType.INACTIVITY, 15n);
      const offense3 = createOffense(EthAddress.random(), 1000n, OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, 25n);

      await store.addPendingOffense(offense1);
      await store.addPendingOffense(offense2);
      await store.addPendingOffense(offense3);

      const pendingOffenses = await store.getPendingOffenses();
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
        await store.addPendingOffense(offense);
      }

      const pendingOffenses = await store.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(offenseTypes.length);

      // Verify all offense types are present
      for (const offenseType of offenseTypes) {
        expect(pendingOffenses.some(o => o.offenseType === offenseType)).toBe(true);
      }
    });

    it('should handle zero amount and epoch/slot values', async () => {
      const offense = createOffense(EthAddress.random(), 0n, OffenseType.UNKNOWN, 0n);

      await store.addPendingOffense(offense);

      const pendingOffenses = await store.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0].amount).toBe(0n);
      expect(pendingOffenses[0].epochOrSlot).toBe(0n);
    });

    it('should handle large amounts and epoch/slot values', async () => {
      const largeAmount = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'); // Max uint128
      const largeEpochOrSlot = BigInt('0xFFFFFFFFFFFFFFFF'); // Max uint64
      const offense = createOffense(EthAddress.random(), largeAmount, OffenseType.VALID_EPOCH_PRUNED, largeEpochOrSlot);

      await store.addPendingOffense(offense);

      const pendingOffenses = await store.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0].amount).toBe(largeAmount);
      expect(pendingOffenses[0].epochOrSlot).toBe(largeEpochOrSlot);
    });

    it('should preserve offense data across store operations', async () => {
      const validator = EthAddress.fromString('0x1234567890abcdef1234567890abcdef12345678');
      const offense = createOffense(validator, 12345n, OffenseType.ATTESTED_DESCENDANT_OF_INVALID, 54321n);

      await store.addPendingOffense(offense);

      const pendingOffenses = await store.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0].validator.toString()).toBe(validator.toString());
      expect(pendingOffenses[0].amount).toBe(12345n);
      expect(pendingOffenses[0].offenseType).toBe(OffenseType.ATTESTED_DESCENDANT_OF_INVALID);
      expect(pendingOffenses[0].epochOrSlot).toBe(54321n);
    });
  });

  describe('hasPendingOffense', () => {
    it('should return true for pending offenses', async () => {
      const offense = createOffense();
      await store.addPendingOffense(offense);

      const hasPending = await store.hasPendingOffense(offense);
      expect(hasPending).toBe(true);
    });

    it('should return false for non-existent offenses', async () => {
      const offense = createOffenseIdentifier();

      const hasPending = await store.hasPendingOffense(offense);
      expect(hasPending).toBe(false);
    });

    it('should return false for slashed offenses', async () => {
      const offense = createOffense();
      await store.addPendingOffense(offense);

      // Mark as slashed
      await store.markAsSlashed([offense]);

      const hasPending = await store.hasPendingOffense(offense);
      expect(hasPending).toBe(false);
    });

    it('should work with different validators for same offense type', async () => {
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();
      const offense1 = createOffense(validator1, 1000n, OffenseType.INACTIVITY, 10n);
      const offense2 = createOffense(validator2, 1000n, OffenseType.INACTIVITY, 10n);

      await store.addPendingOffense(offense1);

      expect(await store.hasPendingOffense(offense1)).toBe(true);
      expect(await store.hasPendingOffense(offense2)).toBe(false);
    });

    it('should differentiate by epochOrSlot', async () => {
      const validator = EthAddress.random();
      const offense1 = createOffense(validator, 1000n, OffenseType.INACTIVITY, 10n);
      const offense2 = createOffense(validator, 1000n, OffenseType.INACTIVITY, 11n);

      await store.addPendingOffense(offense1);

      expect(await store.hasPendingOffense(offense1)).toBe(true);
      expect(await store.hasPendingOffense(offense2)).toBe(false);
    });
  });

  describe('hasOffense', () => {
    it('should return true for any offense (pending or slashed)', async () => {
      const offense = createOffense();
      await store.addPendingOffense(offense);

      expect(await store.hasOffense(offense)).toBe(true);

      // Mark as slashed
      await store.markAsSlashed([offense]);

      expect(await store.hasOffense(offense)).toBe(true); // Still exists, just not pending
    });

    it('should return false for non-existent offenses', async () => {
      const offense = createOffenseIdentifier();

      expect(await store.hasOffense(offense)).toBe(false);
    });

    it('should work after adding multiple offenses', async () => {
      const offense1 = createOffense();
      const offense2 = createOffense();
      const nonExistentOffense = createOffenseIdentifier();

      await store.addPendingOffense(offense1);
      await store.addPendingOffense(offense2);

      expect(await store.hasOffense(offense1)).toBe(true);
      expect(await store.hasOffense(offense2)).toBe(true);
      expect(await store.hasOffense(nonExistentOffense)).toBe(false);
    });
  });

  describe('markAsSlashed', () => {
    it('should mark single offense as slashed', async () => {
      const offense = createOffense();
      await store.addPendingOffense(offense);

      expect(await store.hasPendingOffense(offense)).toBe(true);

      await store.markAsSlashed([offense]);

      expect(await store.hasPendingOffense(offense)).toBe(false);
      expect(await store.hasOffense(offense)).toBe(true); // Still exists, just marked as slashed
    });

    it('should mark multiple offenses as slashed', async () => {
      const offense1 = createOffense();
      const offense2 = createOffense();
      const offense3 = createOffense();

      await store.addPendingOffense(offense1);
      await store.addPendingOffense(offense2);
      await store.addPendingOffense(offense3);

      await store.markAsSlashed([offense1, offense2]);

      expect(await store.hasPendingOffense(offense1)).toBe(false);
      expect(await store.hasPendingOffense(offense2)).toBe(false);
      expect(await store.hasPendingOffense(offense3)).toBe(true); // Not marked as slashed

      // Verify they still exist
      expect(await store.hasOffense(offense1)).toBe(true);
      expect(await store.hasOffense(offense2)).toBe(true);
      expect(await store.hasOffense(offense3)).toBe(true);
    });

    it('should handle marking non-existent offenses gracefully', async () => {
      const nonExistentOffense = createOffenseIdentifier();

      // Should not throw
      await expect(store.markAsSlashed([nonExistentOffense])).resolves.toBeUndefined();
      expect(await store.hasPendingOffense(nonExistentOffense)).toBe(false);
      expect(await store.hasOffense(nonExistentOffense)).toBe(false);
    });

    it('should flag offense as slashed and then add the offense', async () => {
      const offense = createOffense();
      await store.markAsSlashed([offense]);

      expect(await store.hasOffense(offense)).toBe(false);

      await store.addPendingOffense(offense);

      expect(await store.hasPendingOffense(offense)).toBe(false);
      expect(await store.hasOffense(offense)).toBe(true);
    });

    it('should exclude slashed offenses from pending offenses list', async () => {
      const offense1 = createOffense();
      const offense2 = createOffense();
      const offense3 = createOffense();

      await store.addPendingOffense(offense1);
      await store.addPendingOffense(offense2);
      await store.addPendingOffense(offense3);

      let pendingOffenses = await store.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(3);

      await store.markAsSlashed([offense1, offense3]);

      pendingOffenses = await store.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0]).toEqual(offense2);
    });

    it('should handle empty array', async () => {
      await expect(store.markAsSlashed([])).resolves.toBeUndefined();
    });
  });

  describe('clearExpiredOffenses', () => {
    it.todo('should clear expired offenses');
  });

  describe('edge cases', () => {
    it('should handle duplicate offense additions', async () => {
      const offense = createOffense();

      await store.addPendingOffense(offense);
      await store.addPendingOffense(offense); // Duplicate

      const pendingOffenses = await store.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0]).toEqual(offense);
    });

    it('should handle same offense for different validators', async () => {
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();
      const offense1 = createOffense(validator1, 1000n, OffenseType.INACTIVITY, 10n);
      const offense2 = createOffense(validator2, 1000n, OffenseType.INACTIVITY, 10n);

      await store.addPendingOffense(offense1);
      await store.addPendingOffense(offense2);

      const pendingOffenses = await store.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(2);
      expect(pendingOffenses).toContainEqual(offense1);
      expect(pendingOffenses).toContainEqual(offense2);
    });

    it('should handle large number of offenses', async () => {
      const offenses: Offense[] = [];
      const numOffenses = 100;

      for (let i = 0; i < numOffenses; i++) {
        const offense = createOffense(EthAddress.random(), BigInt(1000 + i), OffenseType.UNKNOWN, BigInt(10 + i));
        offenses.push(offense);
        await store.addPendingOffense(offense);
      }

      const pendingOffenses = await store.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(numOffenses);

      // Mark half as slashed
      const toSlash = offenses.slice(0, numOffenses / 2);
      await store.markAsSlashed(toSlash);

      const remainingPending = await store.getPendingOffenses();
      expect(remainingPending).toHaveLength(numOffenses / 2);
    });

    it('should maintain data integrity across multiple operations', async () => {
      const offense1 = createOffense(EthAddress.random(), 500n, OffenseType.DATA_WITHHOLDING, 5n);
      const offense2 = createOffense(EthAddress.random(), 750n, OffenseType.VALID_EPOCH_PRUNED, 15n);

      // Add offenses
      await store.addPendingOffense(offense1);
      await store.addPendingOffense(offense2);

      // Verify both are pending
      expect(await store.hasPendingOffense(offense1)).toBe(true);
      expect(await store.hasPendingOffense(offense2)).toBe(true);

      // Mark one as slashed
      await store.markAsSlashed([offense1]);

      // Verify states
      expect(await store.hasPendingOffense(offense1)).toBe(false);
      expect(await store.hasPendingOffense(offense2)).toBe(true);
      expect(await store.hasOffense(offense1)).toBe(true);
      expect(await store.hasOffense(offense2)).toBe(true);

      // Verify pending list
      const pendingOffenses = await store.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(1);
      expect(pendingOffenses[0]).toEqual(offense2);
    });
  });

  describe('offense key generation', () => {
    it('should generate unique keys for different offenses', async () => {
      const validator = EthAddress.random();
      const offense1 = createOffense(validator, 1000n, OffenseType.INACTIVITY, 10n);
      const offense2 = createOffense(validator, 1000n, OffenseType.DATA_WITHHOLDING, 10n); // Different type
      const offense3 = createOffense(validator, 1000n, OffenseType.INACTIVITY, 11n); // Different epoch/slot

      await store.addPendingOffense(offense1);
      await store.addPendingOffense(offense2);
      await store.addPendingOffense(offense3);

      expect(await store.hasPendingOffense(offense1)).toBe(true);
      expect(await store.hasPendingOffense(offense2)).toBe(true);
      expect(await store.hasPendingOffense(offense3)).toBe(true);

      const pendingOffenses = await store.getPendingOffenses();
      expect(pendingOffenses).toHaveLength(3);
    });
  });
});
