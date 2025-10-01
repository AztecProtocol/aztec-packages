import { Fr } from '@aztec/foundation/fields';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { IndexedTaggingSecret } from '@aztec/stdlib/logs';

import { TaggingDataProvider } from './tagging_data_provider.js';

describe('TaggingDataProvider', () => {
  let taggingDataProvider: TaggingDataProvider;
  let store: Awaited<ReturnType<typeof openTmpStore>>;

  beforeEach(async () => {
    store = await openTmpStore('tagging_data_provider_test');
    taggingDataProvider = new TaggingDataProvider(store);
  });

  describe('tagging secret indexes', () => {
    let sender: AztecAddress;
    let recipient: AztecAddress;
    let secretA: Fr;
    let secretB: Fr;

    beforeEach(async () => {
      sender = await AztecAddress.random();
      recipient = await AztecAddress.random();
      secretA = Fr.random();
      secretB = Fr.random();
    });

    it('returns 0 for unset indexes', async () => {
      const asSender = await taggingDataProvider.getTaggingSecretsIndexesAsSender([secretA, secretB], sender);
      const asRecipient = await taggingDataProvider.getTaggingSecretsIndexesAsRecipient([secretA, secretB], recipient);
      expect(asSender).toEqual([0, 0]);
      expect(asRecipient).toEqual([0, 0]);
    });

    it('sets and gets indexes for sender direction', async () => {
      const indexed: IndexedTaggingSecret[] = [
        new IndexedTaggingSecret(secretA, 1),
        new IndexedTaggingSecret(secretB, 2),
      ];
      await taggingDataProvider.setTaggingSecretsIndexesAsSender(indexed, sender);

      const got = await taggingDataProvider.getTaggingSecretsIndexesAsSender([secretA, secretB], sender);
      expect(got).toEqual([1, 2]);
    });

    it('sets and gets indexes for recipient direction', async () => {
      const indexed: IndexedTaggingSecret[] = [
        new IndexedTaggingSecret(secretA, 5),
        new IndexedTaggingSecret(secretB, 7),
      ];
      await taggingDataProvider.setTaggingSecretsIndexesAsRecipient(indexed, recipient);

      const got = await taggingDataProvider.getTaggingSecretsIndexesAsRecipient([secretA, secretB], recipient);
      expect(got).toEqual([5, 7]);
    });

    it('keeps sender and recipient directions independent', async () => {
      await taggingDataProvider.setTaggingSecretsIndexesAsSender(
        [new IndexedTaggingSecret(secretA, 3), new IndexedTaggingSecret(secretB, 4)],
        sender,
      );
      await taggingDataProvider.setTaggingSecretsIndexesAsRecipient(
        [new IndexedTaggingSecret(secretA, 9), new IndexedTaggingSecret(secretB, 11)],
        recipient,
      );

      const asSender = await taggingDataProvider.getTaggingSecretsIndexesAsSender([secretA, secretB], sender);
      const asRecipient = await taggingDataProvider.getTaggingSecretsIndexesAsRecipient([secretA, secretB], recipient);
      expect(asSender).toEqual([3, 4]);
      expect(asRecipient).toEqual([9, 11]);
    });

    it('resetNoteSyncData clears stored indexes', async () => {
      await taggingDataProvider.setTaggingSecretsIndexesAsSender(
        [new IndexedTaggingSecret(secretA, 8), new IndexedTaggingSecret(secretB, 12)],
        sender,
      );
      await taggingDataProvider.setTaggingSecretsIndexesAsRecipient(
        [new IndexedTaggingSecret(secretA, 13), new IndexedTaggingSecret(secretB, 21)],
        recipient,
      );

      await taggingDataProvider.resetNoteSyncData();

      const asSender = await taggingDataProvider.getTaggingSecretsIndexesAsSender([secretA, secretB], sender);
      const asRecipient = await taggingDataProvider.getTaggingSecretsIndexesAsRecipient([secretA, secretB], recipient);
      expect(asSender).toEqual([0, 0]);
      expect(asRecipient).toEqual([0, 0]);
    });
  });

  describe('address book', () => {
    it('adds, lists and removes sender addresses', async () => {
      const a1 = await AztecAddress.random();
      const a2 = await AztecAddress.random();

      expect(await taggingDataProvider.addSenderAddress(a1)).toBe(true);
      expect(await taggingDataProvider.addSenderAddress(a1)).toBe(false); // duplicate
      expect(await taggingDataProvider.addSenderAddress(a2)).toBe(true);

      const senders = await taggingDataProvider.getSenderAddresses();
      expect(senders.map(a => a.toString()).sort()).toEqual([a1.toString(), a2.toString()].sort());

      expect(await taggingDataProvider.removeSenderAddress(a1)).toBe(true);
      expect(await taggingDataProvider.removeSenderAddress(a1)).toBe(false); // already removed

      const remaining = await taggingDataProvider.getSenderAddresses();
      expect(remaining.map(a => a.toString())).toEqual([a2.toString()]);
    });

    it('tracks size based on address count', async () => {
      expect(await taggingDataProvider.getSize()).toBe(0);
      const a1 = await AztecAddress.random();
      const a2 = await AztecAddress.random();
      await taggingDataProvider.addSenderAddress(a1);
      await taggingDataProvider.addSenderAddress(a2);
      const expected = 3 * 2 * AztecAddress.SIZE_IN_BYTES; // 3 entries per address
      expect(await taggingDataProvider.getSize()).toBe(expected);
    });
  });

  describe('dangling indices', () => {
    it('associates dangling indices with a tx and clears them', async () => {
      const appTag1 = Fr.random();
      const appTag2 = Fr.random();
      const sender = await AztecAddress.random();
      const recipient = await AztecAddress.random();

      await taggingDataProvider.storeDanglingIndex(appTag1, sender, recipient, 1);
      await taggingDataProvider.storeDanglingIndex(appTag2, sender, recipient, 2);

      // Before association, entries exist in dangling store
      const dangling = store.openMap<string, { sender: string; recipient: string; index: number }>('dangling_indices');
      const keysBefore = await Array.fromAsync(dangling.keysAsync());
      expect(keysBefore.sort()).toEqual([appTag1.toString(), appTag2.toString()].sort());

      const txHash = '0xdeadbeef';
      await taggingDataProvider.associateDanglingIndicesWithTx(txHash);

      // After association, dangling should be cleared
      const keysAfter = await Array.fromAsync(dangling.keysAsync());
      expect(keysAfter).toEqual([]);

      // And indices should be recorded under indices_by_tx_hash
      const byTx = store.openMap<string, { appTag: string; sender: string; recipient: string; index: number }[]>(
        'indices_by_tx_hash',
      );
      const entries = await byTx.getAsync(txHash);
      expect(entries?.length).toBe(2);
      const tags = (entries ?? []).map(e => e.appTag).sort();
      expect(tags).toEqual([appTag1.toString(), appTag2.toString()].sort());
    });

    it('prunes dangling indices', async () => {
      const appTag = Fr.random();
      const sender = await AztecAddress.random();
      const recipient = await AztecAddress.random();

      await taggingDataProvider.storeDanglingIndex(appTag, sender, recipient, 42);

      const dangling = store.openMap<string, { sender: string; recipient: string; index: number }>('dangling_indices');
      const keysBefore = await Array.fromAsync(dangling.keysAsync());
      expect(keysBefore).toEqual([appTag.toString()]);

      await taggingDataProvider.pruneDanglingIndices();

      const keysAfter = await Array.fromAsync(dangling.keysAsync());
      expect(keysAfter).toEqual([]);
    });

    it('throws if storing duplicate app tag', async () => {
      const appTag = Fr.random();
      const sender = await AztecAddress.random();
      const recipient = await AztecAddress.random();

      await taggingDataProvider.storeDanglingIndex(appTag, sender, recipient, 42);

      await expect(taggingDataProvider.storeDanglingIndex(appTag, sender, recipient, 43)).rejects.toThrow(
        `Dangling index already exists for app tag ${appTag.toString()}`,
      );
    });
  });
});
