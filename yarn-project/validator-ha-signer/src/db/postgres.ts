/**
 * PostgreSQL implementation of SlashingProtectionDatabase
 */
import { randomBytes } from '@aztec/foundation/crypto/random';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';

import type { Pool, QueryResult } from 'pg';

import type { SlashingProtectionDatabase, TryInsertOrGetResult } from '../types.js';
import {
  CLEANUP_OWN_STUCK_DUTIES,
  DELETE_DUTY,
  INSERT_OR_GET_DUTY,
  SCHEMA_VERSION,
  UPDATE_DUTY_SIGNED,
} from './schema.js';
import type { CheckAndRecordParams, DutyRow, DutyType, InsertOrGetRow, ValidatorDutyRecord } from './types.js';

/**
 * PostgreSQL implementation of the slashing protection database
 */
export class PostgresSlashingProtectionDatabase implements SlashingProtectionDatabase {
  private readonly log: Logger;

  constructor(private readonly pool: Pool) {
    this.log = createLogger('slashing-protection:postgres');
  }

  /**
   * Verify that database migrations have been run and schema version matches.
   * Should be called once at startup.
   *
   * @throws Error if migrations haven't been run or schema version is outdated
   */
  async initialize(): Promise<void> {
    let dbVersion: number;

    try {
      const result = await this.pool.query<{ version: number }>(
        `SELECT version FROM schema_version ORDER BY version DESC LIMIT 1`,
      );

      if (result.rows.length === 0) {
        throw new Error('No version found');
      }

      dbVersion = result.rows[0].version;
    } catch {
      throw new Error(
        'Database schema not initialized. Please run migrations first: aztec migrate up --database-url <url>',
      );
    }

    if (dbVersion < SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${dbVersion} is outdated (expected ${SCHEMA_VERSION}). Please run migrations: aztec migrate up --database-url <url>`,
      );
    }

    if (dbVersion > SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${dbVersion} is newer than expected (${SCHEMA_VERSION}). Please update your application.`,
      );
    }

    this.log.info('Database schema verified', { version: dbVersion });
  }

  /**
   * Atomically try to insert a new duty record, or get the existing one if present.
   *
   * @returns { isNew: true, record } if we successfully inserted and acquired the lock
   * @returns { isNew: false, record } if a record already exists. lock_token is empty if the record already exists.
   */
  async tryInsertOrGetExisting(params: CheckAndRecordParams): Promise<TryInsertOrGetResult> {
    // create a token for ownership verification
    const lockToken = randomBytes(16).toString('hex');

    const result: QueryResult<InsertOrGetRow> = await this.pool.query(INSERT_OR_GET_DUTY, [
      params.validatorAddress.toString(),
      params.slot.toString(),
      params.blockNumber.toString(),
      params.dutyType,
      params.messageHash,
      params.nodeId,
      lockToken,
    ]);

    if (result.rows.length === 0) {
      // This shouldn't happen - the query always returns either the inserted or existing row
      throw new Error('INSERT_OR_GET_DUTY returned no rows');
    }

    const row = result.rows[0];
    return {
      isNew: row.is_new,
      record: this.rowToRecord(row),
    };
  }

  /**
   * Update a duty to 'signed' status with the signature.
   * Only succeeds if the lockToken matches (caller must be the one who created the duty).
   *
   * @returns true if the update succeeded, false if token didn't match or duty not found
   */
  async updateDutySigned(
    validatorAddress: EthAddress,
    slot: bigint,
    dutyType: DutyType,
    signature: string,
    lockToken: string,
  ): Promise<boolean> {
    const result = await this.pool.query(UPDATE_DUTY_SIGNED, [
      signature,
      validatorAddress.toString(),
      slot.toString(),
      dutyType,
      lockToken,
    ]);

    if (result.rowCount === 0) {
      this.log.warn('Failed to update duty to signed status: invalid token or duty not found', {
        validatorAddress: validatorAddress.toString(),
        slot: slot.toString(),
        dutyType,
      });
      return false;
    }
    return true;
  }

  /**
   * Delete a duty record.
   * Only succeeds if the lockToken matches (caller must be the one who created the duty).
   * Used when signing fails to allow another node/attempt to retry.
   *
   * @returns true if the delete succeeded, false if token didn't match or duty not found
   */
  async deleteDuty(
    validatorAddress: EthAddress,
    slot: bigint,
    dutyType: DutyType,
    lockToken: string,
  ): Promise<boolean> {
    const result = await this.pool.query(DELETE_DUTY, [
      validatorAddress.toString(),
      slot.toString(),
      dutyType,
      lockToken,
    ]);

    if (result.rowCount === 0) {
      this.log.warn('Failed to delete duty: invalid token or duty not found', {
        validatorAddress: validatorAddress.toString(),
        slot: slot.toString(),
        dutyType,
      });
      return false;
    }
    return true;
  }

  /**
   * Convert a database row to a ValidatorDutyRecord
   */
  private rowToRecord(row: DutyRow): ValidatorDutyRecord {
    return {
      validatorAddress: EthAddress.fromString(row.validator_address),
      slot: BigInt(row.slot),
      blockNumber: BigInt(row.block_number),
      dutyType: row.duty_type,
      status: row.status,
      messageHash: row.message_hash,
      signature: row.signature ?? undefined,
      nodeId: row.node_id,
      lockToken: row.lock_token,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      errorMessage: row.error_message ?? undefined,
    };
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.log.info('Database connection pool closed');
  }

  /**
   * Cleanup own stuck duties
   * @returns the number of duties cleaned up
   */
  async cleanupOwnStuckDuties(nodeId: string, maxAgeMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const result = await this.pool.query(CLEANUP_OWN_STUCK_DUTIES, [nodeId, cutoff]);
    return result.rowCount ?? 0;
  }
}
