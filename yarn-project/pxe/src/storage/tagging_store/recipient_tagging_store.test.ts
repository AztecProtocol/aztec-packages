import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { DirectionalAppTaggingSecret } from '@aztec/stdlib/logs';

import { RecipientTaggingStore } from './recipient_tagging_store.js';

describe('RecipientTaggingStore', () => {
  let taggingStore: RecipientTaggingStore;
  let secret1: DirectionalAppTaggingSecret;
  let secret2: DirectionalAppTaggingSecret;

  beforeEach(async () => {
    taggingStore = new RecipientTaggingStore(await openTmpStore('test', createLogger('pxe:test')));
    secret1 = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
    secret2 = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
  });

  describe('staged writes', () => {
    it('persists staged highest aged index to the store', async () => {
      await taggingStore.updateHighestAgedIndex(secret1, 5, 'job1');

      expect(await taggingStore.getHighestAgedIndex(secret1, 'job2')).toBeUndefined();

      await taggingStore.commit('job1');

      expect(await taggingStore.getHighestAgedIndex(secret1, 'job2')).toBe(5);
    });

    it('persists staged highest finalized index to the store', async () => {
      await taggingStore.updateHighestFinalizedIndex(secret1, 10, 'job1');

      expect(await taggingStore.getHighestFinalizedIndex(secret1, 'job2')).toBeUndefined();

      await taggingStore.commit('job1');

      expect(await taggingStore.getHighestFinalizedIndex(secret1, 'job2')).toBe(10);
    });

    it('persists multiple secrets for the same job', async () => {
      await taggingStore.updateHighestAgedIndex(secret1, 5, 'job1');
      await taggingStore.updateHighestAgedIndex(secret2, 8, 'job1');
      await taggingStore.updateHighestFinalizedIndex(secret1, 3, 'job1');
      await taggingStore.updateHighestFinalizedIndex(secret2, 6, 'job1');

      await taggingStore.commit('job1');

      expect(await taggingStore.getHighestAgedIndex(secret1, 'job2')).toBe(5);
      expect(await taggingStore.getHighestAgedIndex(secret2, 'job2')).toBe(8);
      expect(await taggingStore.getHighestFinalizedIndex(secret1, 'job2')).toBe(3);
      expect(await taggingStore.getHighestFinalizedIndex(secret2, 'job2')).toBe(6);
    });

    it('clears staged data after commit', async () => {
      await taggingStore.updateHighestAgedIndex(secret1, 5, 'job1');
      await taggingStore.commit('job1');

      // Updating again with a higher value in the same job should work
      // (if staged data wasn't cleared, it would still have the old value cached)
      await taggingStore.updateHighestAgedIndex(secret1, 10, 'job2');
      expect(await taggingStore.getHighestAgedIndex(secret1, 'job2')).toBe(10);
      await taggingStore.commit('job2');

      expect(await taggingStore.getHighestAgedIndex(secret1, 'job1')).toBe(10);
    });

    it('does not affect other jobs when committing', async () => {
      await taggingStore.updateHighestAgedIndex(secret1, 5, 'job1');
      await taggingStore.updateHighestAgedIndex(secret1, 10, 'job2');

      await taggingStore.commit('job2');

      // job1's staged value should still be intact
      expect(await taggingStore.getHighestAgedIndex(secret1, 'job1')).toBe(5);
    });

    it('discards staged highest aged index without persisting', async () => {
      await taggingStore.updateHighestAgedIndex(secret1, 5, 'job1');
      await taggingStore.discardStaged('job1');
      expect(await taggingStore.getHighestAgedIndex(secret1, 'job1')).toBeUndefined();
    });

    it('discards staged highest finalized index without persisting', async () => {
      await taggingStore.updateHighestFinalizedIndex(secret1, 5, 'job1');
      await taggingStore.discardStaged('job1');
      expect(await taggingStore.getHighestFinalizedIndex(secret1, 'job1')).toBeUndefined();
    });
  });
});
