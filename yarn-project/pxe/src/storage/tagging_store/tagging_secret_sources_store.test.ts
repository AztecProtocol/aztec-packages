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
    it('adds and retrieves an arbitrary secret scoped to a recipient', async () => {
      const recipient = await AztecAddress.random();
      const secret = await Point.random();

      expect(await store.addSharedSecret(recipient, 'arbitrary-secret', secret)).toBe(true);
      expect(await store.getSharedSecretsForRecipient(recipient)).toEqual([{ kind: 'arbitrary-secret', secret }]);
    });

    it('round-trips the kind of a handshake secret', async () => {
      const recipient = await AztecAddress.random();
      const secret = await Point.random();

      expect(await store.addSharedSecret(recipient, 'handshake', secret)).toBe(true);
      expect(await store.getSharedSecretsForRecipient(recipient)).toEqual([{ kind: 'handshake', secret }]);
    });

    it('returns false when adding a duplicate secret for the same recipient', async () => {
      const recipient = await AztecAddress.random();
      const secret = await Point.random();

      expect(await store.addSharedSecret(recipient, 'arbitrary-secret', secret)).toBe(true);
      expect(await store.addSharedSecret(recipient, 'arbitrary-secret', secret)).toBe(false);
      expect(await store.getSharedSecretsForRecipient(recipient)).toEqual([{ kind: 'arbitrary-secret', secret }]);
    });

    it('rejects re-registering a secret under a different kind', async () => {
      const recipient = await AztecAddress.random();
      const secret = await Point.random();

      await store.addSharedSecret(recipient, 'handshake', secret);

      await expect(store.addSharedSecret(recipient, 'arbitrary-secret', secret)).rejects.toThrow(
        `Secret already registered for recipient with kind 'handshake', cannot re-register it as 'arbitrary-secret'.`,
      );
      expect(await store.getSharedSecretsForRecipient(recipient)).toEqual([{ kind: 'handshake', secret }]);
    });

    it('scopes secrets per recipient', async () => {
      const recipientA = await AztecAddress.random();
      const recipientB = await AztecAddress.random();
      const secretA = await Point.random();
      const secretB = await Point.random();

      await store.addSharedSecret(recipientA, 'arbitrary-secret', secretA);
      await store.addSharedSecret(recipientB, 'arbitrary-secret', secretB);

      expect(await store.getSharedSecretsForRecipient(recipientA)).toEqual([
        { kind: 'arbitrary-secret', secret: secretA },
      ]);
      expect(await store.getSharedSecretsForRecipient(recipientB)).toEqual([
        { kind: 'arbitrary-secret', secret: secretB },
      ]);
    });

    it('lists every shared secret across recipients', async () => {
      const recipientA = await AztecAddress.random();
      const recipientB = await AztecAddress.random();
      const secretA1 = await Point.random();
      const secretA2 = await Point.random();
      const secretB = await Point.random();

      await store.addSharedSecret(recipientA, 'arbitrary-secret', secretA1);
      await store.addSharedSecret(recipientA, 'handshake', secretA2);
      await store.addSharedSecret(recipientB, 'arbitrary-secret', secretB);

      const all = await store.getAllSharedSecrets();

      expect(all).toHaveLength(3);
      expect(all).toEqual(
        expect.arrayContaining([
          { recipient: recipientA, kind: 'arbitrary-secret', secret: secretA1 },
          { recipient: recipientA, kind: 'handshake', secret: secretA2 },
          { recipient: recipientB, kind: 'arbitrary-secret', secret: secretB },
        ]),
      );
    });

    it('returns an empty list when no shared secrets are registered', async () => {
      expect(await store.getAllSharedSecrets()).toEqual([]);
    });

    it('removes a shared secret', async () => {
      const recipient = await AztecAddress.random();
      const secret = await Point.random();

      await store.addSharedSecret(recipient, 'arbitrary-secret', secret);

      expect(await store.removeSharedSecret(recipient, 'arbitrary-secret', secret)).toBe(true);
      expect(await store.getSharedSecretsForRecipient(recipient)).toEqual([]);
    });

    it('returns false when removing a secret that is not registered', async () => {
      const recipient = await AztecAddress.random();
      const secret = await Point.random();

      expect(await store.removeSharedSecret(recipient, 'arbitrary-secret', secret)).toBe(false);
    });

    it('does not remove a secret when the kind does not match', async () => {
      const recipient = await AztecAddress.random();
      const secret = await Point.random();

      await store.addSharedSecret(recipient, 'handshake', secret);

      expect(await store.removeSharedSecret(recipient, 'arbitrary-secret', secret)).toBe(false);
      expect(await store.getSharedSecretsForRecipient(recipient)).toEqual([{ kind: 'handshake', secret }]);
    });

    it('keeps senders and shared secrets separate', async () => {
      const recipient = await AztecAddress.random();
      const sender = await AztecAddress.random();
      const secret = await Point.random();

      await store.addSender(sender);
      await store.addSharedSecret(recipient, 'arbitrary-secret', secret);

      expect(await store.getSenders()).toEqual([sender]);
      expect(await store.getSharedSecretsForRecipient(recipient)).toEqual([{ kind: 'arbitrary-secret', secret }]);
    });
  });
});
