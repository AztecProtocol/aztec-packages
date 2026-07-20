import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AppTaggingSecret, AppTaggingSecretKind } from '@aztec/stdlib/logs';
import { randomAppTaggingSecret } from '@aztec/stdlib/testing';

import { RecipientTaggingStore } from './recipient_tagging_store.js';

describe('RecipientTaggingStore', () => {
  let taggingStore: RecipientTaggingStore;
  let secret1: AppTaggingSecret;
  let secret2: AppTaggingSecret;

  beforeEach(async () => {
    taggingStore = new RecipientTaggingStore(await openTmpStore('test'));
    secret1 = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
    secret2 = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
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

  // A single handshake shared secret is scanned under both delivery modes (constrained + unconstrained). The two
  // share the same underlying Fr and app but differ in kind, so they must be tracked as independent index sequences:
  // advancing one mode's finalized index must not clobber the other's.
  describe('mode independence', () => {
    it('tracks the same secret under different kinds independently', async () => {
      const unconstrained = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
      const constrained = new AppTaggingSecret(
        unconstrained.secret,
        unconstrained.app,
        AppTaggingSecretKind.CONSTRAINED,
      );

      await taggingStore.updateHighestFinalizedIndex(unconstrained, 4, 'job1');
      await taggingStore.updateHighestFinalizedIndex(constrained, 9, 'job1');
      await taggingStore.commit('job1');

      expect(await taggingStore.getHighestFinalizedIndex(unconstrained, 'job2')).toBe(4);
      expect(await taggingStore.getHighestFinalizedIndex(constrained, 'job2')).toBe(9);
    });
  });
});
