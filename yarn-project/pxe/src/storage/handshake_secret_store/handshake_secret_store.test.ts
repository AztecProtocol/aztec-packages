import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { HandshakeSecretStore, computeHandshakeSecretHash } from './handshake_secret_store.js';

describe('HandshakeSecretStore', () => {
  let handshakeSecretStore: HandshakeSecretStore;

  const jobId = 'job-1';
  const otherJobId = 'job-2';

  beforeEach(async () => {
    handshakeSecretStore = new HandshakeSecretStore(await openTmpStore('test'));
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
});
