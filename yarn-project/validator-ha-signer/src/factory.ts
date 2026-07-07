/**
 * Factory functions for creating validator HA signers
 */
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import type { LocalSignerConfig, ValidatorHASignerConfig } from '@aztec/stdlib/ha-signing';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { Pool } from 'pg';

import { LmdbSlashingProtectionDatabase, migrateLmdbSlashingProtectionDatabase } from './db/lmdb.js';
import { PostgresSlashingProtectionDatabase } from './db/postgres.js';
import { HASignerMetrics } from './metrics.js';
import type { CreateHASignerDeps, CreateLocalSignerWithProtectionDeps, SlashingProtectionDatabase } from './types.js';
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
 *   nodeId: 'validator-node-1',
 *   pollingIntervalMs: 100,
 *   peerSigningTimeoutMs: 3000,
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

  const databaseUrlValue = databaseUrl?.getValue();
  if (!databaseUrlValue) {
    throw new Error('databaseUrl is required for createHASigner');
  }

  const telemetryClient = deps?.telemetryClient ?? getTelemetryClient();
  const dateProvider = deps?.dateProvider ?? new DateProvider();

  // Create connection pool (or use provided pool)
  let pool: Pool;
  if (!deps?.pool) {
    pool = new Pool({
      connectionString: databaseUrlValue,
      max: poolMaxCount ?? 10,
      min: poolMinCount ?? 0,
      idleTimeoutMillis: poolIdleTimeoutMs ?? 10_000,
      connectionTimeoutMillis: poolConnectionTimeoutMs ?? 0,
    });
  } else {
    pool = deps.pool;
  }

  // pg re-emits idle-client errors (e.g. a Postgres restart severing an idle connection) on the
  // pool. Without an 'error' listener, Node escalates these to an uncaughtException and crashes the
  // process - taking down every HA replica sharing the DB at once. pg destroys and replaces the
  // errored client itself, so logging is the only action needed. Log just message/code, never the
  // raw error object (it can carry connection metadata).
  const log = createLogger('validator-ha-signer:factory');
  pool.on('error', (err: NodeJS.ErrnoException) => {
    log.warn('Postgres pool error on idle client', { message: err.message, code: err.code });
  });

  // Create database instance
  const db = new PostgresSlashingProtectionDatabase(pool);

  // Verify database schema is initialized and version matches
  await db.initialize();

  // Create metrics
  const metrics = new HASignerMetrics(telemetryClient, signerConfig.nodeId);

  // Create signer
  const signer = new ValidatorHASigner(db, signerConfig, { metrics, dateProvider });

  return { signer, db };
}

/**
 * Create a local (single-node) signing protection signer backed by LMDB.
 *
 * This provides double-signing protection for nodes that are NOT running in a
 * high-availability (multi-node) setup. It prevents a proposer from sending two
 * proposals for the same slot if the node crashes and restarts mid-proposal.
 *
 * When `config.dataDirectory` is set, the protection database is persisted to disk
 * and survives crashes/restarts. When unset, an ephemeral in-memory store is
 * used which protects within a single run but not across restarts.
 *
 * @param config - Local signer config
 * @param deps - Optional dependencies (telemetry, date provider).
 * @returns An object containing the signer and database instances.
 */
export async function createLocalSignerWithProtection(
  config: LocalSignerConfig,
  deps?: CreateLocalSignerWithProtectionDeps,
): Promise<{
  signer: ValidatorHASigner;
  db: SlashingProtectionDatabase;
}> {
  const telemetryClient = deps?.telemetryClient ?? getTelemetryClient();
  const dateProvider = deps?.dateProvider ?? new DateProvider();

  const kvStore = await createStore(
    'signing-protection',
    LmdbSlashingProtectionDatabase.SCHEMA_VERSION,
    {
      dataDirectory: config.dataDirectory,
      dataStoreMapSizeKb: config.signingProtectionMapSizeKb ?? config.dataStoreMapSizeKb,
      rollupAddress: config.rollupAddress,
    },
    undefined,
    {
      onUpgrade: (dataDirectory, currentVersion, latestVersion) =>
        migrateLmdbSlashingProtectionDatabase(
          dataDirectory,
          currentVersion,
          latestVersion,
          config.signingProtectionMapSizeKb ?? config.dataStoreMapSizeKb,
        ),
      schemaVersionMismatchPolicy: 'throw',
    },
  );

  const db = new LmdbSlashingProtectionDatabase(kvStore, dateProvider);

  const signerConfig = {
    ...config,
    nodeId: config.nodeId || 'local',
  };

  const metrics = new HASignerMetrics(telemetryClient, signerConfig.nodeId, 'LocalSigningProtectionMetrics');

  const signer = new ValidatorHASigner(db, signerConfig, { metrics, dateProvider });

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
    'nodeId' | 'pollingIntervalMs' | 'peerSigningTimeoutMs' | 'maxStuckDutiesAgeMs' | 'rollupAddress'
  >,
  deps?: CreateLocalSignerWithProtectionDeps,
): { signer: ValidatorHASigner; db: SlashingProtectionDatabase } {
  const telemetryClient = deps?.telemetryClient ?? getTelemetryClient();
  const dateProvider = deps?.dateProvider ?? new DateProvider();
  const metrics = new HASignerMetrics(telemetryClient, config.nodeId, 'SharedSigningProtectionMetrics');
  const signer = new ValidatorHASigner(db, config, { metrics, dateProvider });
  return { signer, db };
}
