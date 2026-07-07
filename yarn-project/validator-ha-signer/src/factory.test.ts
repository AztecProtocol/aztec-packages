import { SecretValue } from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import { defaultValidatorHASignerConfig } from '@aztec/stdlib/ha-signing';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { Pool as PgPool } from 'pg';

import { setupTestSchema } from './db/test_helper.js';
import { createHASigner } from './factory.js';
import { Pool } from './test/pglite_pool.js';

describe('createHASigner', () => {
  let pglite: PGlite;
  let pool: Pool;

  beforeEach(async () => {
    pglite = new PGlite();
    pool = new Pool({ pglite });
    await setupTestSchema(pglite);
  });

  afterEach(async () => {
    await pool.end();
  });

  it('registers a pool error handler so idle-client errors do not crash the process', async () => {
    const { signer } = await createHASigner(
      {
        ...defaultValidatorHASignerConfig,
        nodeId: 'factory-test-node',
        rollupAddress: EthAddress.random(),
        databaseUrl: new SecretValue('postgresql://ignored'),
      },
      { pool: pool as unknown as PgPool },
    );

    try {
      // An EventEmitter with no 'error' listener rethrows synchronously on emit('error', ...).
      // After createHASigner the pool must have a listener, so emitting must not throw.
      expect(pool.listenerCount('error')).toBeGreaterThan(0);
      expect(() => pool.emit('error', new Error('idle client connection reset'))).not.toThrow();
    } finally {
      await signer.stop();
    }
  });
});
