import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { HandshakeSecretStore, computeHandshakeSecretHash } from './handshake_secret_store.js';

describe('HandshakeSecretStore', () => {
  let store: AztecLMDBStoreV2;
  let handshakeSecretStore: HandshakeSecretStore;

  const jobId = 'job-1';
  const otherJobId = 'job-2';

  beforeEach(async () => {
    store = await openTmpStore('handshake_secret_store_test');
    handshakeSecretStore = new HandshakeSecretStore(store);
  });

  describe('staged reads and writes', () => {
    it('returns undefined for an unknown secret hash', async () => {
      const result = await handshakeSecretStore.getHandshakeSecret(Fr.random(), jobId);
      expect(result).toBeUndefined();
    });

    it('reads back a secret staged in the same job before commit', async () => {
      const secret = await Point.random();
      const secretHash = await computeHandshakeSecretHash(secret);

      await handshakeSecretStore.setHandshakeSecret(secret, jobId);

      expect(await handshakeSecretStore.getHandshakeSecret(secretHash, jobId)).toEqual(secret);
    });

    it('does not surface staged writes from another job before commit', async () => {
      const secret = await Point.random();
      const secretHash = await computeHandshakeSecretHash(secret);

      await handshakeSecretStore.setHandshakeSecret(secret, jobId);

      expect(await handshakeSecretStore.getHandshakeSecret(secretHash, otherJobId)).toBeUndefined();
    });

    it('persists committed secrets across jobs', async () => {
      const secret = await Point.random();
      const secretHash = await computeHandshakeSecretHash(secret);

      await handshakeSecretStore.setHandshakeSecret(secret, jobId);
      await handshakeSecretStore.commit(jobId);

      expect(await handshakeSecretStore.getHandshakeSecret(secretHash, otherJobId)).toEqual(secret);
    });

    it('discards staged secrets without persisting them', async () => {
      const secret = await Point.random();
      const secretHash = await computeHandshakeSecretHash(secret);

      await handshakeSecretStore.setHandshakeSecret(secret, jobId);
      await handshakeSecretStore.discardStaged(jobId);

      expect(await handshakeSecretStore.getHandshakeSecret(secretHash, jobId)).toBeUndefined();
      expect(await handshakeSecretStore.getHandshakeSecret(secretHash, otherJobId)).toBeUndefined();
    });

    it('persists multiple distinct secrets', async () => {
      const secrets = await Promise.all([Point.random(), Point.random(), Point.random()]);
      const hashes = await Promise.all(secrets.map(computeHandshakeSecretHash));

      for (const secret of secrets) {
        await handshakeSecretStore.setHandshakeSecret(secret, jobId);
      }
      await handshakeSecretStore.commit(jobId);

      for (let i = 0; i < secrets.length; i++) {
        expect(await handshakeSecretStore.getHandshakeSecret(hashes[i], otherJobId)).toEqual(secrets[i]);
      }
    });

    it('storing the same secret twice is idempotent', async () => {
      const secret = await Point.random();
      const secretHash = await computeHandshakeSecretHash(secret);

      await handshakeSecretStore.setHandshakeSecret(secret, jobId);
      await handshakeSecretStore.setHandshakeSecret(secret, jobId);
      await handshakeSecretStore.commit(jobId);

      expect(await handshakeSecretStore.getHandshakeSecret(secretHash, otherJobId)).toEqual(secret);
    });
  });

  describe('hashing', () => {
    it('keys agree with the Noir HandshakeNote::new construction', async () => {
      // Mirrors `poseidon2_hash_with_separator([x, y], DOM_SEP__HANDSHAKE_SECRET_HASH)`. Two distinct points produce
      // distinct keys, and hashing depends on both coordinates.
      const a = await Point.random();
      const b = await Point.random();

      const ha = await computeHandshakeSecretHash(a);
      const hb = await computeHandshakeSecretHash(b);

      expect(ha.equals(hb)).toBe(false);
      expect((await computeHandshakeSecretHash(a)).equals(ha)).toBe(true);
    });
  });
});
