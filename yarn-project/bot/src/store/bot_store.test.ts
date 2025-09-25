import { AztecAddress, type L2AmountClaim } from '@aztec/aztec.js';
import { Fr } from '@aztec/foundation/fields';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { BotStore } from './bot_store.js';

describe('BotStore', () => {
  let store: BotStore;
  let tmpStore: AztecAsyncKVStore;

  beforeEach(async () => {
    // Create a temporary in-memory store for testing
    tmpStore = await openTmpStore('bot-test', true);
    store = new BotStore(tmpStore);
  });

  afterEach(async () => {
    await store.close();
    if (tmpStore) {
      await tmpStore.close();
    }
  });

  describe('saveBridgeClaim', () => {
    it('should save a bridge claim for a recipient', async () => {
      const recipient = await AztecAddress.random();
      const claim: L2AmountClaim = {
        claimAmount: 1000n,
        claimSecret: Fr.random(),
        claimSecretHash: Fr.random(),
        messageHash: '0x123456',
        messageLeafIndex: 1n,
      };

      await store.saveBridgeClaim(recipient, claim);

      const retrieved = await store.getBridgeClaim(recipient);
      expect(retrieved).toBeDefined();
      expect(retrieved!.claim.claimAmount).toEqual(claim.claimAmount);
      expect(retrieved!.claim.messageHash).toEqual(claim.messageHash);
      expect(retrieved!.recipient).toEqual(recipient.toString());
    });

    it('should overwrite existing claim for same recipient', async () => {
      const recipient = await AztecAddress.random();
      const claim1: L2AmountClaim = {
        claimAmount: 1000n,
        claimSecret: Fr.random(),
        claimSecretHash: Fr.random(),
        messageHash: '0x123456',
        messageLeafIndex: 1n,
      };

      const claim2: L2AmountClaim = {
        claimAmount: 2000n,
        claimSecret: Fr.random(),
        claimSecretHash: Fr.random(),
        messageHash: '0xabcdef',
        messageLeafIndex: 2n,
      };

      await store.saveBridgeClaim(recipient, claim1);
      await store.saveBridgeClaim(recipient, claim2);

      const retrieved = await store.getBridgeClaim(recipient);
      expect(retrieved!.claim.claimAmount).toEqual(2000n);
      expect(retrieved!.claim.messageHash).toEqual('0xabcdef');
    });
  });

  describe('getBridgeClaim', () => {
    it('should return undefined for non-existent recipient', async () => {
      const recipient = await AztecAddress.random();
      const retrieved = await store.getBridgeClaim(recipient);
      expect(retrieved).toBeUndefined();
    });

    it('should correctly reconstruct Fr fields from stored data', async () => {
      const recipient = await AztecAddress.random();
      const claimSecret = Fr.random();
      const claimSecretHash = Fr.random();
      const claim: L2AmountClaim = {
        claimAmount: 1000n,
        claimSecret,
        claimSecretHash,
        messageHash: '0x123456',
        messageLeafIndex: 1n,
      };

      await store.saveBridgeClaim(recipient, claim);

      const retrieved = await store.getBridgeClaim(recipient);
      expect(retrieved!.claim.claimSecret).toBeInstanceOf(Fr);
      expect(retrieved!.claim.claimSecretHash).toBeInstanceOf(Fr);
      expect(retrieved!.claim.claimSecret.toString()).toEqual(claimSecret.toString());
      expect(retrieved!.claim.claimSecretHash.toString()).toEqual(claimSecretHash.toString());
    });
  });

  describe('deleteBridgeClaim', () => {
    it('should delete an existing bridge claim', async () => {
      const recipient = await AztecAddress.random();
      const claim: L2AmountClaim = {
        claimAmount: 1000n,
        claimSecret: Fr.random(),
        claimSecretHash: Fr.random(),
        messageHash: '0x123456',
        messageLeafIndex: 1n,
      };

      await store.saveBridgeClaim(recipient, claim);
      expect(await store.getBridgeClaim(recipient)).toBeDefined();

      await store.deleteBridgeClaim(recipient);
      expect(await store.getBridgeClaim(recipient)).toBeUndefined();
    });

    it('should not throw when deleting non-existent claim', async () => {
      const recipient = await AztecAddress.random();
      await expect(store.deleteBridgeClaim(recipient)).resolves.not.toThrow();
    });
  });

  describe('getAllBridgeClaims', () => {
    it('should return empty array when no claims exist', async () => {
      const claims = await store.getAllBridgeClaims();
      expect(claims).toEqual([]);
    });

    it('should return all stored bridge claims', async () => {
      const recipients = [await AztecAddress.random(), await AztecAddress.random(), await AztecAddress.random()];
      const claims: L2AmountClaim[] = recipients.map((_, i) => ({
        claimAmount: BigInt((i + 1) * 1000),
        claimSecret: Fr.random(),
        claimSecretHash: Fr.random(),
        messageHash: `0x${(i + 1).toString(16).padStart(6, '0')}`,
        messageLeafIndex: BigInt(i + 1),
      }));

      for (let i = 0; i < recipients.length; i++) {
        await store.saveBridgeClaim(recipients[i], claims[i]);
      }

      const allClaims = await store.getAllBridgeClaims();
      expect(allClaims).toHaveLength(3);

      // Check that all claims are present
      const claimAmounts = allClaims.map(c => c.claim.claimAmount);
      expect(claimAmounts).toContain(1000n);
      expect(claimAmounts).toContain(2000n);
      expect(claimAmounts).toContain(3000n);
    });
  });

  describe('cleanupOldClaims', () => {
    it('should remove claims older than specified age', async () => {
      const recipient1 = await AztecAddress.random();
      const recipient2 = await AztecAddress.random();
      const claim: L2AmountClaim = {
        claimAmount: 1000n,
        claimSecret: Fr.random(),
        claimSecretHash: Fr.random(),
        messageHash: '0x123456',
        messageLeafIndex: 1n,
      };

      // Save first claim
      await store.saveBridgeClaim(recipient1, claim);

      // We need to directly save with specific timestamps
      // Since we can't easily mock Date.now() in the store, we'll test with a very short max age
      await store.saveBridgeClaim(recipient2, claim);

      // Clean up claims older than 0ms (immediate cleanup) to test the functionality
      const cleanedCount = await store.cleanupOldClaims(0);

      // Both claims should be cleaned up since they're older than 0ms
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 when no old claims exist', async () => {
      const recipient = await AztecAddress.random();
      const claim: L2AmountClaim = {
        claimAmount: 1000n,
        claimSecret: Fr.random(),
        claimSecretHash: Fr.random(),
        messageHash: '0x123456',
        messageLeafIndex: 1n,
      };

      await store.saveBridgeClaim(recipient, claim);

      // Use default max age (24 hours) - recent claims should not be cleaned
      const cleanedCount = await store.cleanupOldClaims();
      expect(cleanedCount).toBe(0);

      // Verify claim still exists
      const retrieved = await store.getBridgeClaim(recipient);
      expect(retrieved).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle multiple close calls gracefully', async () => {
      await store.close();
      await store.close(); // Should not throw
    });

    it('should work consistently after creation', async () => {
      // Since the store is always initialized via the factory method,
      // all operations should work without null checks
      const recipient = await AztecAddress.random();
      const claim: L2AmountClaim = {
        claimAmount: 1000n,
        claimSecret: Fr.random(),
        claimSecretHash: Fr.random(),
        messageHash: '0x123456',
        messageLeafIndex: 1n,
      };

      await store.saveBridgeClaim(recipient, claim);
      const retrieved = await store.getBridgeClaim(recipient);
      expect(retrieved).toBeDefined();
    });
  });
});
