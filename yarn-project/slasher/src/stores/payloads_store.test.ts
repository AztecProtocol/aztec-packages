import { EthAddress } from '@aztec/foundation/eth-address';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import { OffenseType, type SlashPayload, type SlashPayloadRound, type ValidatorSlash } from '@aztec/stdlib/slashing';

import { SlasherPayloadsStore } from './payloads_store.js';

describe('SlasherPayloadsStore', () => {
  let kvStore: ReturnType<typeof openTmpStore>;
  let store: SlasherPayloadsStore;

  beforeEach(() => {
    kvStore = openTmpStore();
    store = new SlasherPayloadsStore(kvStore, {
      slashingPayloadLifetimeInRounds: 5,
    });
  });

  afterEach(async () => {
    await kvStore.close();
  });

  const createValidatorSlash = (
    validator = EthAddress.random(),
    amount = 1000n,
    offenseType = OffenseType.INACTIVITY,
    epochOrSlot = 10n,
  ): ValidatorSlash => ({
    validator,
    amount,
    offenses: [{ offenseType, epochOrSlot }],
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

  describe('addPayload and getPayload', () => {
    it('should add and retrieve a slash payload', async () => {
      const payload = createSlashPayloadRound();

      await store.addPayload(payload);

      const retrievedPayload = await store.getPayload(payload.address);
      expect(retrievedPayload).toBeDefined();
      expect(retrievedPayload!.address).toEqual(payload.address);
      expect(retrievedPayload!.slashes).toEqual(payload.slashes);
      expect(retrievedPayload!.timestamp).toEqual(payload.timestamp);
    });

    it('should handle string addresses', async () => {
      const payload = createSlashPayloadRound();
      await store.addPayload(payload);

      const retrievedPayload = await store.getPayload(payload.address.toString());
      expect(retrievedPayload).toBeDefined();
      expect(retrievedPayload!.address).toEqual(payload.address);
    });

    it('should return undefined for non-existent payload', async () => {
      const nonExistentAddress = EthAddress.random();

      const retrievedPayload = await store.getPayload(nonExistentAddress);
      expect(retrievedPayload).toBeUndefined();
    });

    it('should handle empty slashes array', async () => {
      const payload = createSlashPayloadRound(createSlashPayload(EthAddress.random(), []));

      await store.addPayload(payload);

      const retrievedPayload = await store.getPayload(payload.address);
      expect(retrievedPayload).toBeDefined();
      expect(retrievedPayload!.slashes).toHaveLength(0);
    });

    it('should handle multiple validator slashes in one payload', async () => {
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();
      const validator3 = EthAddress.random();

      const slash1 = createValidatorSlash(validator1, 500n, OffenseType.DATA_WITHHOLDING, 5n);
      const slash2 = createValidatorSlash(validator2, 750n, OffenseType.INACTIVITY, 15n);
      const slash3 = createValidatorSlash(validator3, 1000n, OffenseType.VALID_EPOCH_PRUNED, 25n);

      const payload = createSlashPayloadRound(createSlashPayload(EthAddress.random(), [slash1, slash2, slash3]));

      await store.addPayload(payload);

      const retrievedPayload = await store.getPayload(payload.address);
      expect(retrievedPayload).toBeDefined();
      expect(retrievedPayload!.slashes).toHaveLength(3);
      expect(retrievedPayload!.slashes).toContainEqual(slash1);
      expect(retrievedPayload!.slashes).toContainEqual(slash2);
      expect(retrievedPayload!.slashes).toContainEqual(slash3);
    });

    it('should preserve all data fields correctly', async () => {
      const validator = EthAddress.fromString('0x1234567890abcdef1234567890abcdef12345678');
      const address = EthAddress.fromString('0xabcdef1234567890abcdef1234567890abcdef12');
      const timestamp = 1234567890n;
      const amount = 123456789n;
      const epochOrSlot = 987654321n;

      const slash = createValidatorSlash(
        validator,
        amount,
        OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        epochOrSlot,
      );
      const basePayload = createSlashPayload(address, [slash], timestamp);
      const payload = createSlashPayloadRound(basePayload, 7n, 42n);

      await store.addPayload(payload);

      const retrievedPayload = await store.getPayload(payload.address);
      expect(retrievedPayload!.address.toString()).toBe(address.toString());
      expect(retrievedPayload!.timestamp).toBe(timestamp);
      expect(retrievedPayload!.slashes[0].validator.toString()).toBe(validator.toString());
      expect(retrievedPayload!.slashes[0].amount).toBe(amount);
      expect(retrievedPayload!.slashes[0].offenses[0].epochOrSlot).toBe(epochOrSlot);
      expect(retrievedPayload!.slashes[0].offenses[0].offenseType).toBe(OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS);
    });
  });

  describe('hasPayload', () => {
    it('should return true for existing payload', async () => {
      const payload = createSlashPayloadRound();
      await store.addPayload(payload);

      const hasPayload = await store.hasPayload(payload.address);
      expect(hasPayload).toBe(true);
    });

    it('should return false for non-existent payload', async () => {
      const nonExistentAddress = EthAddress.random();

      const hasPayload = await store.hasPayload(nonExistentAddress);
      expect(hasPayload).toBe(false);
    });

    it('should work with multiple payloads', async () => {
      const payload1 = createSlashPayloadRound();
      const payload2 = createSlashPayloadRound();
      const nonExistentAddress = EthAddress.random();

      await store.addPayload(payload1);
      await store.addPayload(payload2);

      expect(await store.hasPayload(payload1.address)).toBe(true);
      expect(await store.hasPayload(payload2.address)).toBe(true);
      expect(await store.hasPayload(nonExistentAddress)).toBe(false);
    });
  });

  describe('getPayloadAtRound and round-specific operations', () => {
    it('should retrieve payload with votes for specific round', async () => {
      const payload = createSlashPayloadRound(createSlashPayload(), 3n, 5n);
      await store.addPayload(payload);

      const retrievedPayload = await store.getPayloadAtRound(payload.address, 5n);
      expect(retrievedPayload).toBeDefined();
      expect(retrievedPayload!.address).toEqual(payload.address);
      expect(retrievedPayload!.votes).toBe(3n);
      expect(retrievedPayload!.round).toBe(5n);
    });

    it('should return undefined for non-existent payload', async () => {
      const nonExistentAddress = EthAddress.random();

      const retrievedPayload = await store.getPayloadAtRound(nonExistentAddress, 5n);
      expect(retrievedPayload).toBeUndefined();
    });

    it('should handle zero votes', async () => {
      const payload = createSlashPayloadRound(createSlashPayload(), 0n, 1n);
      await store.addPayload(payload);

      const retrievedPayload = await store.getPayloadAtRound(payload.address, 1n);
      expect(retrievedPayload).toBeDefined();
      expect(retrievedPayload!.votes).toBe(0n);
    });

    it('should return zero votes for payload not in specific round', async () => {
      const payload = createSlashPayloadRound(createSlashPayload(), 5n, 10n);
      await store.addPayload(payload);

      // Query for different round - should return zero votes
      const retrievedPayload = await store.getPayloadAtRound(payload.address, 15n);
      expect(retrievedPayload).toBeDefined();
      expect(retrievedPayload!.votes).toBe(0n);
      expect(retrievedPayload!.round).toBe(15n); // Should use the requested round
    });
  });

  describe('incrementPayloadVotes', () => {
    it('should increment votes from zero', async () => {
      const payload = createSlashPayloadRound();
      await store.addPayload(payload);

      const newVotes = await store.incrementPayloadVotes(payload.address, 1n);
      expect(newVotes).toBe(1n);

      const retrievedPayload = await store.getPayloadAtRound(payload.address, 1n);
      expect(retrievedPayload!.votes).toBe(1n);
    });

    it('should increment existing votes', async () => {
      const payload = createSlashPayloadRound(createSlashPayload(), 5n, 1n);
      await store.addPayload(payload);

      const newVotes = await store.incrementPayloadVotes(payload.address, 1n);
      expect(newVotes).toBe(6n);

      const retrievedPayload = await store.getPayloadAtRound(payload.address, 1n);
      expect(retrievedPayload!.votes).toBe(6n);
    });

    it('should handle multiple increments', async () => {
      const payload = createSlashPayloadRound(createSlashPayload(), 0n, 2n);
      await store.addPayload(payload);

      await store.incrementPayloadVotes(payload.address, 2n);
      await store.incrementPayloadVotes(payload.address, 2n);
      const finalVotes = await store.incrementPayloadVotes(payload.address, 2n);

      expect(finalVotes).toBe(3n);
    });

    it('should increment votes for non-existent payload-round combination', async () => {
      const payloadAddress = EthAddress.random();

      const newVotes = await store.incrementPayloadVotes(payloadAddress, 1n);
      expect(newVotes).toBe(1n);
    });

    it('should handle different rounds independently', async () => {
      const payload = createSlashPayloadRound(createSlashPayload(), 2n, 1n);
      await store.addPayload(payload);

      // Increment votes for different rounds
      await store.incrementPayloadVotes(payload.address, 2n);
      await store.incrementPayloadVotes(payload.address, 3n);

      // Check votes for each round
      expect(await store.incrementPayloadVotes(payload.address, 1n)).toBe(3n); // Original + 1
      expect(await store.incrementPayloadVotes(payload.address, 2n)).toBe(2n); // 1 + 1
      expect(await store.incrementPayloadVotes(payload.address, 3n)).toBe(2n); // 1 + 1
    });
  });

  describe('getPayloadsForRound', () => {
    it('should return empty array for round with no payloads', async () => {
      const payloads = await store.getPayloadsForRound(1n);
      expect(payloads).toHaveLength(0);
    });

    it('should return payloads for specific round', async () => {
      const payload1 = createSlashPayloadRound(createSlashPayload(), 3n, 1n);
      const payload2 = createSlashPayloadRound(createSlashPayload(), 5n, 1n);
      const payload3 = createSlashPayloadRound(createSlashPayload(), 2n, 2n); // Different round

      await store.addPayload(payload1);
      await store.addPayload(payload2);
      await store.addPayload(payload3);

      const round1Payloads = await store.getPayloadsForRound(1n);
      expect(round1Payloads).toHaveLength(2);
      expect(round1Payloads.map(p => p.address.toString())).toContain(payload1.address.toString());
      expect(round1Payloads.map(p => p.address.toString())).toContain(payload2.address.toString());
      expect(round1Payloads.map(p => p.address.toString())).not.toContain(payload3.address.toString());

      const round2Payloads = await store.getPayloadsForRound(2n);
      expect(round2Payloads).toHaveLength(1);
      expect(round2Payloads[0].address).toEqual(payload3.address);
    });

    it('should preserve vote counts in returned payloads', async () => {
      const payload1 = createSlashPayloadRound(createSlashPayload(), 10n, 5n);
      const payload2 = createSlashPayloadRound(createSlashPayload(), 15n, 5n);

      await store.addPayload(payload1);
      await store.addPayload(payload2);

      const payloads = await store.getPayloadsForRound(5n);
      expect(payloads).toHaveLength(2);

      const votes = payloads.map(p => p.votes).sort((a, b) => Number(a - b));
      expect(votes).toEqual([10n, 15n]);
    });

    it('should handle payloads with incremented votes', async () => {
      const payload = createSlashPayloadRound(createSlashPayload(), 2n, 3n);
      await store.addPayload(payload);

      // Increment votes
      await store.incrementPayloadVotes(payload.address, 3n);
      await store.incrementPayloadVotes(payload.address, 3n);

      const payloads = await store.getPayloadsForRound(3n);
      expect(payloads).toHaveLength(1);
      expect(payloads[0].votes).toBe(4n); // 2 + 2 increments
    });

    it('should not return payloads that do not exist in the base payload store', async () => {
      // Manually add votes without corresponding payload
      await store.incrementPayloadVotes(EthAddress.random(), 1n);

      const payloads = await store.getPayloadsForRound(1n);
      expect(payloads).toHaveLength(0);
    });
  });

  describe('clearExpiredPayloads', () => {
    it('should clear expired payload votes and unused payloads', async () => {
      const currentRound = 10n;

      // Add payloads for different rounds
      const recentPayload = createSlashPayloadRound(createSlashPayload(), 5n, 7n); // Should not expire
      const expiredPayload1 = createSlashPayloadRound(createSlashPayload(), 5n, 3n); // Should expire
      const expiredPayload2 = createSlashPayloadRound(createSlashPayload(), 5n, 4n); // Should expire

      await store.addPayload(recentPayload);
      await store.addPayload(expiredPayload1);
      await store.addPayload(expiredPayload2);

      // Verify all payloads are present
      expect(await store.hasPayload(recentPayload.address)).toBe(true);
      expect(await store.hasPayload(expiredPayload1.address)).toBe(true);
      expect(await store.hasPayload(expiredPayload2.address)).toBe(true);

      // Clear expired payloads
      await store.clearExpiredPayloads(currentRound);

      // Verify expired votes are cleared, but recent votes remain
      const recentPayloads = await store.getPayloadsForRound(7n);
      expect(recentPayloads).toHaveLength(1);

      const expiredPayloads1 = await store.getPayloadsForRound(3n);
      expect(expiredPayloads1).toHaveLength(0);

      const expiredPayloads2 = await store.getPayloadsForRound(4n);
      expect(expiredPayloads2).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle adding the same payload multiple times', async () => {
      const payload = createSlashPayloadRound(createSlashPayload(), 3n, 1n);

      await store.addPayload(payload);
      await store.addPayload(payload); // Duplicate

      const retrievedPayload = await store.getPayload(payload.address);
      expect(retrievedPayload).toBeDefined();

      const payloads = await store.getPayloadsForRound(1n);
      expect(payloads).toHaveLength(1);
      expect(payloads[0].votes).toBe(3n); // Should maintain the votes from the last add
    });

    it('should handle payloads with same address but different rounds', async () => {
      const address = EthAddress.random();
      const payload1 = createSlashPayloadRound(createSlashPayload(address), 5n, 1n);
      const payload2 = createSlashPayloadRound(createSlashPayload(address), 10n, 2n);

      await store.addPayload(payload1);
      await store.addPayload(payload2);

      // Base payload should be the latest one
      const basePayload = await store.getPayload(address);
      expect(basePayload).toBeDefined();

      // Should have different votes per round
      const round1Payload = await store.getPayloadAtRound(address, 1n);
      const round2Payload = await store.getPayloadAtRound(address, 2n);

      expect(round1Payload!.votes).toBe(5n);
      expect(round2Payload!.votes).toBe(10n);
    });

    it('should handle large amounts and votes', async () => {
      const largeAmount = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF');
      const largeVotes = BigInt('0xFFFFFFFF'); // Max uint32

      const slash = createValidatorSlash(EthAddress.random(), largeAmount);
      const payload = createSlashPayloadRound(createSlashPayload(EthAddress.random(), [slash]), largeVotes, 1n);

      await store.addPayload(payload);

      const retrievedPayload = await store.getPayload(payload.address);
      expect(retrievedPayload!.slashes[0].amount).toBe(largeAmount);

      const roundPayload = await store.getPayloadAtRound(payload.address, 1n);
      expect(roundPayload!.votes).toBe(largeVotes);
    });

    it('should handle many payloads', async () => {
      const numPayloads = 50;
      const payloads: SlashPayloadRound[] = [];

      // Add many payloads
      for (let i = 0; i < numPayloads; i++) {
        const payload = createSlashPayloadRound(
          createSlashPayload(),
          BigInt(i + 1),
          BigInt((i % 5) + 1), // Distribute across 5 rounds
        );
        payloads.push(payload);
        await store.addPayload(payload);
      }

      // Verify all payloads exist
      for (const payload of payloads) {
        expect(await store.hasPayload(payload.address)).toBe(true);
      }

      // Verify round distribution
      for (let round = 1n; round <= 5n; round++) {
        const roundPayloads = await store.getPayloadsForRound(round);
        expect(roundPayloads.length).toBe(10); // 50 payloads / 5 rounds
      }
    });

    it('should preserve data integrity across multiple operations', async () => {
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();
      const address = EthAddress.random();

      const slash1 = createValidatorSlash(validator1, 500n, OffenseType.DATA_WITHHOLDING, 25n);
      const slash2 = createValidatorSlash(validator2, 750n, OffenseType.INACTIVITY, 30n);
      const payload = createSlashPayloadRound(createSlashPayload(address, [slash1, slash2], 1234567890n), 3n, 7n);

      // Add payload
      await store.addPayload(payload);

      // Increment votes multiple times
      await store.incrementPayloadVotes(address, 7n);
      await store.incrementPayloadVotes(address, 7n);

      // Verify all data is preserved
      const basePayload = await store.getPayload(address);
      expect(basePayload!.address).toEqual(address);
      expect(basePayload!.timestamp).toBe(1234567890n);
      expect(basePayload!.slashes).toHaveLength(2);
      expect(basePayload!.slashes[0].validator).toEqual(validator1);
      expect(basePayload!.slashes[1].validator).toEqual(validator2);

      const roundPayload = await store.getPayloadAtRound(address, 7n);
      expect(roundPayload!.votes).toBe(5n); // 3 + 2 increments
      expect(roundPayload!.round).toBe(7n);

      const roundPayloads = await store.getPayloadsForRound(7n);
      expect(roundPayloads).toHaveLength(1);
      expect(roundPayloads[0].address).toEqual(address);
      expect(roundPayloads[0].votes).toBe(5n);
    });

    it('should handle all offense types in payloads', async () => {
      const offenseTypes = Object.values(OffenseType).filter(v => typeof v === 'number') as OffenseType[];
      const slashes: ValidatorSlash[] = [];

      for (let i = 0; i < offenseTypes.length; i++) {
        const slash = createValidatorSlash(EthAddress.random(), BigInt(1000 + i), offenseTypes[i], BigInt(10 + i));
        slashes.push(slash);
      }

      const payload = createSlashPayloadRound(createSlashPayload(EthAddress.random(), slashes), 7n, 1n);

      await store.addPayload(payload);

      const retrievedPayload = await store.getPayload(payload.address);
      expect(retrievedPayload!.slashes).toHaveLength(offenseTypes.length);

      // Verify all offense types are preserved
      for (let i = 0; i < offenseTypes.length; i++) {
        expect(retrievedPayload!.slashes[i].offenses[0].offenseType).toBe(offenseTypes[i]);
      }
    });
  });

  describe('transaction consistency', () => {
    it('should maintain consistency when adding payload and votes together', async () => {
      const payload = createSlashPayloadRound(createSlashPayload(), 10n, 5n);

      await store.addPayload(payload);

      // The payload and votes should both be added in a transaction
      const retrievedPayload = await store.getPayload(payload.address);
      const roundPayload = await store.getPayloadAtRound(payload.address, 5n);

      expect(retrievedPayload).toBeDefined();
      expect(roundPayload).toBeDefined();
      expect(roundPayload!.votes).toBe(10n);
    });
  });

  describe('key generation and ordering', () => {
    it('should handle payload vote keys correctly for different rounds', async () => {
      const address = EthAddress.random();

      await store.incrementPayloadVotes(address, 1n);
      await store.incrementPayloadVotes(address, 2n);
      await store.incrementPayloadVotes(address, 10n);
      await store.incrementPayloadVotes(address, 100n);

      const round1Votes = await store.incrementPayloadVotes(address, 1n);
      const round2Votes = await store.incrementPayloadVotes(address, 2n);
      const round10Votes = await store.incrementPayloadVotes(address, 10n);
      const round100Votes = await store.incrementPayloadVotes(address, 100n);

      expect(round1Votes).toBe(2n);
      expect(round2Votes).toBe(2n);
      expect(round10Votes).toBe(2n);
      expect(round100Votes).toBe(2n);
    });

    it('should handle address formats correctly', async () => {
      const address = EthAddress.random();
      const payload = createSlashPayloadRound(createSlashPayload(address));

      await store.addPayload(payload);

      // Should work with both EthAddress and string
      const withEthAddress = await store.getPayload(address);
      const withString = await store.getPayload(address.toString());

      expect(withEthAddress).toEqual(withString);
    });
  });
});
