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

    // Leave a change set open for the tests to operate under: every store operation requires one.
    taggingStore.beginChangeSet('change-set-1');
  });

  describe('staged writes', () => {
    it('persists staged highest aged index to the store', async () => {
      await taggingStore.updateHighestAgedIndex(secret1, 5, 'change-set-1');

      await taggingStore.commitChangeSet('change-set-1');

      taggingStore.beginChangeSet('change-set-2');
      expect(await taggingStore.getHighestAgedIndex(secret1, 'change-set-2')).toBe(5);
    });

    it('persists staged highest finalized index to the store', async () => {
      await taggingStore.updateHighestFinalizedIndex(secret1, 10, 'change-set-1');

      await taggingStore.commitChangeSet('change-set-1');

      taggingStore.beginChangeSet('change-set-2');
      expect(await taggingStore.getHighestFinalizedIndex(secret1, 'change-set-2')).toBe(10);
    });

    it('persists multiple secrets for the same change set', async () => {
      await taggingStore.updateHighestAgedIndex(secret1, 5, 'change-set-1');
      await taggingStore.updateHighestAgedIndex(secret2, 8, 'change-set-1');
      await taggingStore.updateHighestFinalizedIndex(secret1, 3, 'change-set-1');
      await taggingStore.updateHighestFinalizedIndex(secret2, 6, 'change-set-1');

      await taggingStore.commitChangeSet('change-set-1');

      taggingStore.beginChangeSet('change-set-2');
      expect(await taggingStore.getHighestAgedIndex(secret1, 'change-set-2')).toBe(5);
      expect(await taggingStore.getHighestAgedIndex(secret2, 'change-set-2')).toBe(8);
      expect(await taggingStore.getHighestFinalizedIndex(secret1, 'change-set-2')).toBe(3);
      expect(await taggingStore.getHighestFinalizedIndex(secret2, 'change-set-2')).toBe(6);
    });

    it('clears staged data after commit', async () => {
      await taggingStore.updateHighestAgedIndex(secret1, 5, 'change-set-1');
      await taggingStore.commitChangeSet('change-set-1');

      // Updating again with a higher value in a new change set should work
      // (if staged data wasn't cleared on commit, the old value would still be cached)
      taggingStore.beginChangeSet('change-set-2');
      await taggingStore.updateHighestAgedIndex(secret1, 10, 'change-set-2');
      expect(await taggingStore.getHighestAgedIndex(secret1, 'change-set-2')).toBe(10);
      await taggingStore.commitChangeSet('change-set-2');

      taggingStore.beginChangeSet('change-set-3');
      expect(await taggingStore.getHighestAgedIndex(secret1, 'change-set-3')).toBe(10);
    });

    it('discards staged highest aged index without persisting', async () => {
      await taggingStore.updateHighestAgedIndex(secret1, 5, 'change-set-1');
      taggingStore.discardChangeSet('change-set-1');
      taggingStore.beginChangeSet('change-set-2');
      expect(await taggingStore.getHighestAgedIndex(secret1, 'change-set-2')).toBeUndefined();
    });

    it('discards staged highest finalized index without persisting', async () => {
      await taggingStore.updateHighestFinalizedIndex(secret1, 5, 'change-set-1');
      taggingStore.discardChangeSet('change-set-1');
      taggingStore.beginChangeSet('change-set-2');
      expect(await taggingStore.getHighestFinalizedIndex(secret1, 'change-set-2')).toBeUndefined();
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

      await taggingStore.updateHighestFinalizedIndex(unconstrained, 4, 'change-set-1');
      await taggingStore.updateHighestFinalizedIndex(constrained, 9, 'change-set-1');
      await taggingStore.commitChangeSet('change-set-1');

      taggingStore.beginChangeSet('change-set-2');
      expect(await taggingStore.getHighestFinalizedIndex(unconstrained, 'change-set-2')).toBe(4);
      expect(await taggingStore.getHighestFinalizedIndex(constrained, 'change-set-2')).toBe(9);
    });
  });
});
