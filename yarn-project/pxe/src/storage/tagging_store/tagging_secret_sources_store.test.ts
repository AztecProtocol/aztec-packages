import { Point } from '@aztec/foundation/curves/grumpkin';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { TaggingSecretSourcesStore } from './tagging_secret_sources_store.js';

describe('TaggingSecretSourcesStore', () => {
  let store: TaggingSecretSourcesStore;

  beforeEach(async () => {
    store = new TaggingSecretSourcesStore(await openTmpStore('test'));
  });

  describe('senders', () => {
    it('adds, lists and removes senders', async () => {
      const sender = await AztecAddress.random();

      expect(await store.addSender(sender)).toBe(true);
      expect(await store.addSender(sender)).toBe(false);
      expect(await store.getSenders()).toEqual([sender]);

      expect(await store.removeSender(sender)).toBe(true);
      expect(await store.removeSender(sender)).toBe(false);
      expect(await store.getSenders()).toEqual([]);
    });
  });

  describe('shared secrets', () => {
    it('adds and retrieves shared secrets scoped to a recipient', async () => {
      const recipient = await AztecAddress.random();
      const secret = await Point.random();

      expect(await store.addSharedSecret(recipient, secret)).toBe(true);
      expect(await store.getSharedSecrets(recipient)).toEqual([secret]);
    });

    it('returns false when adding a duplicate secret for the same recipient', async () => {
      const recipient = await AztecAddress.random();
      const secret = await Point.random();

      expect(await store.addSharedSecret(recipient, secret)).toBe(true);
      expect(await store.addSharedSecret(recipient, secret)).toBe(false);
      expect(await store.getSharedSecrets(recipient)).toEqual([secret]);
    });

    it('scopes secrets per recipient', async () => {
      const recipientA = await AztecAddress.random();
      const recipientB = await AztecAddress.random();
      const secretA = await Point.random();
      const secretB = await Point.random();

      await store.addSharedSecret(recipientA, secretA);
      await store.addSharedSecret(recipientB, secretB);

      expect(await store.getSharedSecrets(recipientA)).toEqual([secretA]);
      expect(await store.getSharedSecrets(recipientB)).toEqual([secretB]);
    });

    it('removes a shared secret', async () => {
      const recipient = await AztecAddress.random();
      const secret = await Point.random();

      await store.addSharedSecret(recipient, secret);

      expect(await store.removeSharedSecret(recipient, secret)).toBe(true);
      expect(await store.getSharedSecrets(recipient)).toEqual([]);
    });

    it('returns false when removing a secret that is not registered', async () => {
      const recipient = await AztecAddress.random();
      const secret = await Point.random();

      expect(await store.removeSharedSecret(recipient, secret)).toBe(false);
    });

    it('keeps senders and shared secrets separate', async () => {
      const recipient = await AztecAddress.random();
      const sender = await AztecAddress.random();
      const secret = await Point.random();

      await store.addSender(sender);
      await store.addSharedSecret(recipient, secret);

      expect(await store.getSenders()).toEqual([sender]);
      expect(await store.getSharedSecrets(recipient)).toEqual([secret]);
    });
  });
});
