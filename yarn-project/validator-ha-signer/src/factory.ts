/**
 * Factory functions for creating validator HA signers
 */
import { Pool } from 'pg';

import type { ValidatorHASignerConfig } from './config.js';
import { PostgresSlashingProtectionDatabase } from './db/postgres.js';
import type { CreateHASignerDeps, SlashingProtectionDatabase } from './types.js';
import { ValidatorHASigner } from './validator_ha_signer.js';

/**
 * Create a validator HA signer with PostgreSQL backend
 *
 * After creating the signer, call `signer.start()` to begin background
 * cleanup tasks. Call `signer.stop()` during graceful shutdown.
 *
 * Example with manual migrations (recommended for production):
 * ```bash
 * # Run migrations separately
 * yarn migrate:up
 * ```
 *
 * ```typescript
 * const { signer, db } = await createHASigner({
 *   databaseUrl: process.env.DATABASE_URL,
 *   haSigningEnabled: true,
 *   nodeId: 'validator-node-1',
 *   pollingIntervalMs: 100,
 *   signingTimeoutMs: 3000,
 * });
 * signer.start(); // Start background cleanup
 *
 * // ... use signer ...
 *
 * await signer.stop(); // On shutdown
 * ```
 *
 * Note: Migrations must be run separately using `aztec migrate-ha-db up` before
 * creating the signer. The factory will verify the schema is initialized via `db.initialize()`.
 *
 * @param config - Configuration for the HA signer
 * @param deps - Optional dependencies (e.g., for testing)
 * @returns An object containing the signer and database instances
 */
export async function createHASigner(
  config: ValidatorHASignerConfig,
  deps?: CreateHASignerDeps,
): Promise<{
  signer: ValidatorHASigner;
  db: SlashingProtectionDatabase;
}> {
  const { databaseUrl, poolMaxCount, poolMinCount, poolIdleTimeoutMs, poolConnectionTimeoutMs, ...signerConfig } =
    config;

  if (!databaseUrl) {
    throw new Error('databaseUrl is required for createHASigner');
  }
  // Create connection pool (or use provided pool)
  let pool: Pool;
  if (!deps?.pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: poolMaxCount ?? 10,
      min: poolMinCount ?? 0,
      idleTimeoutMillis: poolIdleTimeoutMs ?? 10_000,
      connectionTimeoutMillis: poolConnectionTimeoutMs ?? 0,
    });
  } else {
    pool = deps.pool;
  }

  // Create database instance
  const db = new PostgresSlashingProtectionDatabase(pool);

  // Verify database schema is initialized and version matches
  await db.initialize();

  // Create signer
  const signer = new ValidatorHASigner(db, { ...signerConfig, databaseUrl });

  return { signer, db };
}

/**
 * Create an in-memory LMDB-backed SlashingProtectionDatabase that can be shared across
 * multiple validator nodes in the same process. Used for testing HA setups.
 */
export async function createSharedSlashingProtectionDb(
  dateProvider: DateProvider = new DateProvider(),
): Promise<SlashingProtectionDatabase> {
  const kvStore = await createStore('shared-signing-protection', LmdbSlashingProtectionDatabase.SCHEMA_VERSION, {
    dataStoreMapSizeKb: 1024 * 1024,
  });
  return new LmdbSlashingProtectionDatabase(kvStore, dateProvider);
}

/**
 * Create a ValidatorHASigner backed by a pre-existing SlashingProtectionDatabase.
 * Used for testing HA setups where multiple nodes share the same protection database.
 */
export function createSignerFromSharedDb(
  db: SlashingProtectionDatabase,
  config: Pick<
    ValidatorHASignerConfig,
    'nodeId' | 'pollingIntervalMs' | 'signingTimeoutMs' | 'maxStuckDutiesAgeMs' | 'l1Contracts'
  >,
  deps?: CreateLocalSignerWithProtectionDeps,
): { signer: ValidatorHASigner; db: SlashingProtectionDatabase } {
  const telemetryClient = deps?.telemetryClient ?? getTelemetryClient();
  const dateProvider = deps?.dateProvider ?? new DateProvider();
  const metrics = new HASignerMetrics(telemetryClient, config.nodeId, 'SharedSigningProtectionMetrics');
  const signer = new ValidatorHASigner(db, config, { metrics, dateProvider });
  return { signer, db };
}
