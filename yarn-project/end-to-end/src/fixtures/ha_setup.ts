import { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { SecretValue } from '@aztec/foundation/config';

import { Pool } from 'pg';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Configuration for HA database connection
 */
export interface HADatabaseConfig {
  /** PostgreSQL connection URL */
  databaseUrl: SecretValue<string>;
  /** Node ID for HA coordination */
  nodeId: string;
  /** Enable HA signing */
  haSigningEnabled: boolean;
  /** Polling interval in ms */
  pollingIntervalMs: number;
  /** How long to wait for a peer node's in-progress signing in ms */
  peerSigningTimeoutMs: number;
  /** Max stuck duties age in ms */
  maxStuckDutiesAgeMs: number;
}

/**
 * Get database configuration from environment variables
 */
export function createHADatabaseConfig(nodeId: string): HADatabaseConfig {
  const databaseUrl = new SecretValue(
    process.env.DATABASE_URL || 'postgresql://aztec:aztec@localhost:5432/aztec_ha_test',
  );

  return {
    databaseUrl,
    nodeId,
    haSigningEnabled: true,
    pollingIntervalMs: 100,
    peerSigningTimeoutMs: 3000,
    maxStuckDutiesAgeMs: 72000,
  };
}

/**
 * Setup PostgreSQL database connection pool for HA tests
 *
 * Note: Database migrations should be run separately before starting tests,
 * either via docker-compose entrypoint or manually with: aztec migrate-ha-db up
 */
export function setupHADatabase(databaseUrl: string, logger?: Logger): Pool {
  try {
    // Create connection pool for test usage
    // Migrations are already run by docker-compose entrypoint before tests start
    const pool = new Pool({ connectionString: databaseUrl });

    // pg-pool re-emits idle-client errors on the pool; with no listener the emit throws - in production this crashes
    // the validator process.
    pool.on('error', (err: Error) => logger?.warn(`HA database pool error: ${err.message}`));

    logger?.info('Connected to HA database (migrations should already be applied)');

    return pool;
  } catch (error) {
    logger?.error(`Failed to connect to HA database: ${error}`);
    throw error;
  }
}

/**
 * Clean up HA database - drop all tables
 * Use this between tests to ensure clean state
 */
export async function cleanupHADatabase(pool: Pool, logger?: Logger): Promise<void> {
  try {
    // Drop all HA tables
    await pool.query('DROP TABLE IF EXISTS validator_duties CASCADE');
    await pool.query('DROP TABLE IF EXISTS schema_version CASCADE');
    // Drop migration tracking table (node-pg-migrate uses 'pgmigrations' by default)
    // This ensures migrations will run fresh on next startup
    await pool.query('DROP TABLE IF EXISTS pgmigrations CASCADE');

    logger?.info('HA database cleaned up successfully');
  } catch (error) {
    logger?.error(`Failed to cleanup HA database: ${error}`);
    throw error;
  }
}

/**
 * Query validator duties from the database
 */
export async function getValidatorDuties(
  pool: Pool,
  slot: bigint,
  dutyType?: 'ATTESTATION' | 'BLOCK_PROPOSAL' | 'GOVERNANCE_VOTE' | 'SLASHING_VOTE',
): Promise<
  Array<{
    slot: string;
    dutyType: string;
    validatorAddress: string;
    nodeId: string;
    startedAt: Date;
    completedAt: Date | undefined;
  }>
> {
  const query = dutyType
    ? 'SELECT slot, duty_type, validator_address, node_id, started_at, completed_at FROM validator_duties WHERE slot = $1 AND duty_type = $2 ORDER BY started_at'
    : 'SELECT slot, duty_type, validator_address, node_id, started_at, completed_at FROM validator_duties WHERE slot = $1 ORDER BY started_at';

  const params = dutyType ? [slot.toString(), dutyType] : [slot.toString()];

  const result = await pool.query<{
    slot: string;
    duty_type: string;
    validator_address: string;
    node_id: string;
    started_at: Date;
    completed_at: Date | undefined;
  }>(query, params);

  return result.rows.map(row => ({
    slot: row.slot,
    dutyType: row.duty_type,
    validatorAddress: row.validator_address,
    nodeId: row.node_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }));
}

/**
 * Convert private keys to Ethereum addresses
 */
export function getAddressesFromPrivateKeys(privateKeys: `0x${string}`[]): string[] {
  return privateKeys.map(pk => {
    const account = privateKeyToAccount(pk);
    return account.address;
  });
}

/**
 * Create initial validators from private keys for L1 contract deployment
 */
export function createInitialValidatorsFromPrivateKeys(attesterPrivateKeys: `0x${string}`[]): Array<{
  attester: EthAddress;
  withdrawer: EthAddress;
  privateKey: `0x${string}`;
  bn254SecretKey: SecretValue<bigint>;
}> {
  return attesterPrivateKeys.map(pk => {
    const account = privateKeyToAccount(pk);
    return {
      attester: EthAddress.fromString(account.address),
      withdrawer: EthAddress.fromString(account.address),
      privateKey: pk,
      bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
    };
  });
}

/**
 * Verify no duplicate attestations per validator (HA coordination check)
 * Groups duties by validator address and verifies each validator attested exactly once
 */
export function verifyNoDuplicateAttestations(
  attestationDuties: Array<{
    validatorAddress: string;
    nodeId: string;
    completedAt: Date | undefined;
  }>,
  logger?: Logger,
): Map<string, typeof attestationDuties> {
  const dutiesByValidator = new Map<string, typeof attestationDuties>();
  for (const duty of attestationDuties) {
    const existing = dutiesByValidator.get(duty.validatorAddress) || [];
    existing.push(duty);
    dutiesByValidator.set(duty.validatorAddress, existing);
  }

  for (const [validatorAddress, validatorDuties] of dutiesByValidator.entries()) {
    if (validatorDuties.length !== 1) {
      throw new Error(`Validator ${validatorAddress} attested ${validatorDuties.length} times (expected exactly once)`);
    }
    if (!validatorDuties[0].completedAt) {
      throw new Error(`Validator ${validatorAddress} attestation duty not completed`);
    }
    logger?.info(`Validator ${validatorAddress} attested once via node ${validatorDuties[0].nodeId}`);
  }

  return dutiesByValidator;
}
