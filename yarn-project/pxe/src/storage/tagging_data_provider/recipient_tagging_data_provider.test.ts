import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { DirectionalAppTaggingSecret } from '@aztec/stdlib/logs';

import { JobContext } from '../../job_coordinator/index.js';
import { RecipientTaggingDataProvider } from './recipient_tagging_data_provider.js';

describe('RecipientTaggingDataProvider', () => {
  let provider: RecipientTaggingDataProvider;
  let secret1: DirectionalAppTaggingSecret;
  let secret2: DirectionalAppTaggingSecret;

  beforeEach(async () => {
    provider = new RecipientTaggingDataProvider(await openTmpStore('test'));
    secret1 = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
    secret2 = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
  });

  describe('highestAgedIndex', () => {
    it('returns undefined when not set', async () => {
      expect(await provider.getHighestAgedIndex(secret1)).toBeUndefined();
    });

    it('stores and retrieves highestAgedIndex', async () => {
      await provider.updateHighestAgedIndex(secret1, 5);
      expect(await provider.getHighestAgedIndex(secret1)).toBe(5);
    });

    it('stores different indexes for different secrets', async () => {
      await provider.updateHighestAgedIndex(secret1, 5);
      await provider.updateHighestAgedIndex(secret2, 10);
      expect(await provider.getHighestAgedIndex(secret1)).toBe(5);
      expect(await provider.getHighestAgedIndex(secret2)).toBe(10);
    });

    it('throws when setting lower or equal index', async () => {
      await provider.updateHighestAgedIndex(secret1, 10);
      await expect(provider.updateHighestAgedIndex(secret1, 5)).rejects.toThrow(
        'New highest aged index (5) must be higher than the current one (10)',
      );
      await expect(provider.updateHighestAgedIndex(secret1, 10)).rejects.toThrow(
        'New highest aged index (10) must be higher than the current one (10)',
      );
    });

    it('allows setting higher index', async () => {
      await provider.updateHighestAgedIndex(secret1, 5);
      await provider.updateHighestAgedIndex(secret1, 10);
      expect(await provider.getHighestAgedIndex(secret1)).toBe(10);
    });
  });

  describe('highestFinalizedIndex', () => {
    it('returns undefined when not set', async () => {
      expect(await provider.getHighestFinalizedIndex(secret1)).toBeUndefined();
    });

    it('stores and retrieves highestFinalizedIndex', async () => {
      await provider.updateHighestFinalizedIndex(secret1, 5);
      expect(await provider.getHighestFinalizedIndex(secret1)).toBe(5);
    });

    it('stores different indexes for different secrets', async () => {
      await provider.updateHighestFinalizedIndex(secret1, 5);
      await provider.updateHighestFinalizedIndex(secret2, 10);
      expect(await provider.getHighestFinalizedIndex(secret1)).toBe(5);
      expect(await provider.getHighestFinalizedIndex(secret2)).toBe(10);
    });

    it('throws when setting lower index', async () => {
      await provider.updateHighestFinalizedIndex(secret1, 10);
      await expect(provider.updateHighestFinalizedIndex(secret1, 5)).rejects.toThrow(
        'New highest finalized index (5) must be higher than the current one (10)',
      );
    });

    it('allows setting same or higher index', async () => {
      await provider.updateHighestFinalizedIndex(secret1, 5);
      // Same index is allowed for finalized
      await provider.updateHighestFinalizedIndex(secret1, 5);
      expect(await provider.getHighestFinalizedIndex(secret1)).toBe(5);

      await provider.updateHighestFinalizedIndex(secret1, 10);
      expect(await provider.getHighestFinalizedIndex(secret1)).toBe(10);
    });
  });

  describe('staging', () => {
    it('writes to staging when context provided', async () => {
      const context = new JobContext('test123', 'test');

      // First set committed data
      await provider.updateHighestAgedIndex(secret1, 5);

      // Then set staged data
      await provider.updateHighestAgedIndex(secret1, 10, context);

      // Without context, should get committed data
      expect(await provider.getHighestAgedIndex(secret1)).toBe(5);

      // With context, should get staged data
      expect(await provider.getHighestAgedIndex(secret1, context)).toBe(10);
    });

    it('staged writes check against staged values for validation', async () => {
      const context = new JobContext('test123', 'test');

      // Stage a value
      await provider.updateHighestAgedIndex(secret1, 10, context);

      // Should throw when trying to set lower staged value
      await expect(provider.updateHighestAgedIndex(secret1, 5, context)).rejects.toThrow(
        'New highest aged index (5) must be higher than the current one (10)',
      );
    });

    it('staged finalized index works correctly', async () => {
      const context = new JobContext('test123', 'test');

      await provider.updateHighestFinalizedIndex(secret1, 5);
      await provider.updateHighestFinalizedIndex(secret1, 10, context);

      // Without context, should get committed data
      expect(await provider.getHighestFinalizedIndex(secret1)).toBe(5);

      // With context, should get staged data
      expect(await provider.getHighestFinalizedIndex(secret1, context)).toBe(10);
    });

    it('commitStaged promotes staged data to main storage', async () => {
      const context = new JobContext('test123', 'test');

      await provider.updateHighestAgedIndex(secret1, 5);
      await provider.updateHighestFinalizedIndex(secret1, 3);

      await provider.updateHighestAgedIndex(secret1, 10, context);
      await provider.updateHighestFinalizedIndex(secret1, 8, context);

      // Commit the staging
      await provider.commitStaged(context);

      // Now without context should get the previously staged data
      expect(await provider.getHighestAgedIndex(secret1)).toBe(10);
      expect(await provider.getHighestFinalizedIndex(secret1)).toBe(8);
    });

    it('commitStaged handles multiple secrets', async () => {
      const context = new JobContext('test123', 'test');

      await provider.updateHighestAgedIndex(secret1, 10, context);
      await provider.updateHighestAgedIndex(secret2, 20, context);

      await provider.commitStaged(context);

      expect(await provider.getHighestAgedIndex(secret1)).toBe(10);
      expect(await provider.getHighestAgedIndex(secret2)).toBe(20);
    });

    it('commitStaged is a no-op when no staged data', async () => {
      const context = new JobContext('test123', 'test');

      await provider.updateHighestAgedIndex(secret1, 5);

      // Commit with no staged data should not throw
      await provider.commitStaged(context);

      expect(await provider.getHighestAgedIndex(secret1)).toBe(5);
    });

    it('discardStaged removes staged data without affecting main storage', async () => {
      const context = new JobContext('test123', 'test');

      // Set committed data
      await provider.updateHighestAgedIndex(secret1, 5);

      // Set staged data
      await provider.updateHighestAgedIndex(secret1, 10, context);

      // Discard the staging
      await provider.discardStaged(context.stagingPrefix);

      // Should still get the committed data
      expect(await provider.getHighestAgedIndex(secret1)).toBe(5);

      // With context should fall back to committed since staging was discarded
      expect(await provider.getHighestAgedIndex(secret1, context)).toBe(5);
    });

    it('discardStaged handles no staged data gracefully', async () => {
      const context = new JobContext('test123', 'test');

      // Discard with no staged data should not throw
      await provider.discardStaged(context.stagingPrefix);
    });

    it('supports multiple concurrent job contexts', async () => {
      const context1 = new JobContext('job1', 'test');
      const context2 = new JobContext('job2', 'test');

      // Set committed data
      await provider.updateHighestAgedIndex(secret1, 5);

      // Set different staged data for each context
      await provider.updateHighestAgedIndex(secret1, 10, context1);
      await provider.updateHighestAgedIndex(secret1, 20, context2);

      // Each context should see its own staged data
      expect(await provider.getHighestAgedIndex(secret1, context1)).toBe(10);
      expect(await provider.getHighestAgedIndex(secret1, context2)).toBe(20);

      // Without context should see committed data
      expect(await provider.getHighestAgedIndex(secret1)).toBe(5);

      // Discard one context, commit the other
      await provider.discardStaged(context1.stagingPrefix);
      await provider.commitStaged(context2);

      // Committed data should now be from context2
      expect(await provider.getHighestAgedIndex(secret1)).toBe(20);
    });
  });
});
