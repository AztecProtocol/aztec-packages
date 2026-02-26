/**
 * Factory functions for creating validator HA signers
 */
import { DateProvider } from '@aztec/foundation/timer';
import type { ValidatorHASignerConfig } from '@aztec/stdlib/ha-signing';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { Pool } from 'pg';

import { PostgresSlashingProtectionDatabase } from './db/postgres.js';
import { HASignerMetrics } from './metrics.js';
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

  const telemetryClient = deps?.telemetryClient ?? getTelemetryClient();
  const dateProvider = deps?.dateProvider ?? new DateProvider();

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

  // Create metrics
  const metrics = new HASignerMetrics(telemetryClient, signerConfig.nodeId);

  // Create signer
  const signer = new ValidatorHASigner(db, { ...signerConfig, databaseUrl }, { metrics, dateProvider });

  return { signer, db };
}
