import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { DirectionalAppTaggingSecret, type PreTag } from '@aztec/stdlib/logs';

import { JobContext } from '../../job_coordinator/index.js';
import { RecipientTaggingDataProvider } from './recipient_tagging_data_provider.js';

describe('RecipientTaggingDataProvider', () => {
  let taggingDataProvider: RecipientTaggingDataProvider;
  let secret1: DirectionalAppTaggingSecret;
  let secret2: DirectionalAppTaggingSecret;

  beforeEach(async () => {
    taggingDataProvider = new RecipientTaggingDataProvider(await openTmpStore('test'));
    secret1 = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
    secret2 = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
  });

  describe('setLastUsedIndexes', () => {
    it('sets and retrieves last used indexes', async () => {
      const preTags: PreTag[] = [
        { secret: secret1, index: 5 },
        { secret: secret2, index: 10 },
      ];

      await taggingDataProvider.setLastUsedIndexes(preTags);

      const indexes = await taggingDataProvider.getLastUsedIndexes([secret1, secret2]);
      expect(indexes).toEqual([5, 10]);
    });

    it('throws when duplicate secrets are provided', () => {
      const preTags: PreTag[] = [
        { secret: secret1, index: 5 },
        { secret: secret1, index: 10 },
      ];

      expect(() => taggingDataProvider.setLastUsedIndexes(preTags)).toThrow(
        'Duplicate secrets found when setting last used indexes',
      );
    });

    it('returns undefined for unknown secrets', async () => {
      const indexes = await taggingDataProvider.getLastUsedIndexes([secret1]);
      expect(indexes).toEqual([undefined]);
    });
  });

  describe('resetNoteSyncData', () => {
    it('clears all last used indexes', async () => {
      const preTags: PreTag[] = [
        { secret: secret1, index: 5 },
        { secret: secret2, index: 10 },
      ];

      await taggingDataProvider.setLastUsedIndexes(preTags);
      await taggingDataProvider.resetNoteSyncData();

      const indexes = await taggingDataProvider.getLastUsedIndexes([secret1, secret2]);
      expect(indexes).toEqual([undefined, undefined]);
    });
  });

  describe('staging', () => {
    it('writes to staging when context provided', async () => {
      const context = new JobContext('test123', 'test');

      // First set committed data
      await taggingDataProvider.setLastUsedIndexes([{ secret: secret1, index: 5 }]);

      // Then set staged data
      await taggingDataProvider.setLastUsedIndexes([{ secret: secret1, index: 10 }], context);

      // Without context, should get committed data
      const indexesWithoutContext = await taggingDataProvider.getLastUsedIndexes([secret1]);
      expect(indexesWithoutContext).toEqual([5]);

      // With context, should get staged data
      const indexesWithContext = await taggingDataProvider.getLastUsedIndexes([secret1], context);
      expect(indexesWithContext).toEqual([10]);
    });

    it('commitStaging promotes staged data to main', async () => {
      const context = new JobContext('test123', 'test');

      await taggingDataProvider.setLastUsedIndexes([{ secret: secret1, index: 5 }]);
      await taggingDataProvider.setLastUsedIndexes([{ secret: secret1, index: 10 }], context);
      context.registerWrite(taggingDataProvider.storeName);

      // Commit the staging
      await taggingDataProvider.commitStaging(context);

      // Now without context should get the previously staged data
      const indexes = await taggingDataProvider.getLastUsedIndexes([secret1]);
      expect(indexes).toEqual([10]);
    });

    it('discardStaging removes staged data without affecting main', async () => {
      const context = new JobContext('test123', 'test');

      await taggingDataProvider.setLastUsedIndexes([{ secret: secret1, index: 5 }]);
      await taggingDataProvider.setLastUsedIndexes([{ secret: secret1, index: 10 }], context);

      // Discard the staging
      await taggingDataProvider.discardStaging(context.stagingPrefix);

      // Should still get the committed data
      const indexes = await taggingDataProvider.getLastUsedIndexes([secret1]);
      expect(indexes).toEqual([5]);

      // With context should fall back to committed since staging was discarded
      const indexesWithContext = await taggingDataProvider.getLastUsedIndexes([secret1], context);
      expect(indexesWithContext).toEqual([5]);
    });

    it('stages resetNoteSyncData correctly', async () => {
      const context = new JobContext('test123', 'test');

      await taggingDataProvider.setLastUsedIndexes([
        { secret: secret1, index: 5 },
        { secret: secret2, index: 10 },
      ]);

      // Reset in staging
      await taggingDataProvider.resetNoteSyncData(context);

      // Without context, data should still exist
      const indexesWithoutContext = await taggingDataProvider.getLastUsedIndexes([secret1, secret2]);
      expect(indexesWithoutContext).toEqual([5, 10]);

      // Commit the reset
      context.registerWrite(taggingDataProvider.storeName);
      await taggingDataProvider.commitStaging(context);

      // Now data should be cleared
      const indexesAfterCommit = await taggingDataProvider.getLastUsedIndexes([secret1, secret2]);
      expect(indexesAfterCommit).toEqual([undefined, undefined]);
    });
  });
});
