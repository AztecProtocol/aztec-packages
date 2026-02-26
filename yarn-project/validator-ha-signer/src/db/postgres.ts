/**
 * PostgreSQL implementation of SlashingProtectionDatabase
 */
import { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';

import type { QueryResult, QueryResultRow } from 'pg';

import type { SlashingProtectionDatabase, TryInsertOrGetResult } from '../types.js';
import {
  CLEANUP_OLD_DUTIES,
  CLEANUP_OUTDATED_ROLLUP_DUTIES,
  CLEANUP_OWN_STUCK_DUTIES,
  DELETE_DUTY,
  INSERT_OR_GET_DUTY,
  SCHEMA_VERSION,
  UPDATE_DUTY_SIGNED,
} from './schema.js';
import type { CheckAndRecordParams, DutyRow, DutyType, InsertOrGetRow, ValidatorDutyRecord } from './types.js';
import { getBlockIndexFromDutyIdentifier } from './types.js';

/**
 * Minimal pool interface for database operations.
 * Both pg.Pool and test adapters (e.g., PGlite) satisfy this interface.
 */
export interface QueryablePool {
  query<R extends QueryResultRow = any>(text: string, values?: any[]): Promise<QueryResult<R>>;
  end(): Promise<void>;
}

/**
 * PostgreSQL implementation of the slashing protection database
 */
export class PostgresSlashingProtectionDatabase implements SlashingProtectionDatabase {
  private readonly log: Logger;

  constructor(private readonly pool: QueryablePool) {
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
        'Database schema not initialized. Please run migrations first: aztec migrate-ha-db up --database-url <url>',
      );
    }

    if (dbVersion < SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${dbVersion} is outdated (expected ${SCHEMA_VERSION}). Please run migrations: aztec migrate-ha-db up --database-url <url>`,
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
   *
   * Retries if no rows are returned, which can happen under high concurrency
   * when another transaction just committed the row but it's not yet visible.
   */
  async tryInsertOrGetExisting(params: CheckAndRecordParams): Promise<TryInsertOrGetResult> {
    // create a token for ownership verification
    const lockToken = randomBytes(16).toString('hex');

    // Use fast retries with custom backoff: 10ms, 20ms, 30ms (then stop)
    const fastBackoff = makeBackoff([0.01, 0.02, 0.03]);

    // Get the normalized block index using type-safe helper
    const blockIndexWithinCheckpoint = getBlockIndexFromDutyIdentifier(params);

    const result = await retry<QueryResult<InsertOrGetRow>>(
      async () => {
        const queryResult: QueryResult<InsertOrGetRow> = await this.pool.query(INSERT_OR_GET_DUTY, [
          params.rollupAddress.toString(),
          params.validatorAddress.toString(),
          params.slot.toString(),
          params.blockNumber.toString(),
          blockIndexWithinCheckpoint,
          params.dutyType,
          params.messageHash,
          params.nodeId,
          lockToken,
        ]);

        // Throw error if no rows to trigger retry
        if (queryResult.rows.length === 0) {
          throw new Error('INSERT_OR_GET_DUTY returned no rows');
        }

        return queryResult;
      },
      `INSERT_OR_GET_DUTY for node ${params.nodeId}`,
      fastBackoff,
      this.log,
      true,
    );

    if (result.rows.length === 0) {
      // this should never happen as the retry function should throw if it still fails after retries
      throw new Error('INSERT_OR_GET_DUTY returned no rows after retries');
    }

    if (result.rows.length > 1) {
      // this should never happen if database constraints are correct (PRIMARY KEY should prevent duplicates)
      throw new Error(`INSERT_OR_GET_DUTY returned ${result.rows.length} rows (expected exactly 1).`);
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
    rollupAddress: EthAddress,
    validatorAddress: EthAddress,
    slot: SlotNumber,
    dutyType: DutyType,
    signature: string,
    lockToken: string,
    blockIndexWithinCheckpoint: number,
  ): Promise<boolean> {
    const result = await this.pool.query(UPDATE_DUTY_SIGNED, [
      signature,
      rollupAddress.toString(),
      validatorAddress.toString(),
      slot.toString(),
      dutyType,
      blockIndexWithinCheckpoint,
      lockToken,
    ]);

    if (result.rowCount === 0) {
      this.log.warn('Failed to update duty to signed status: invalid token or duty not found', {
        rollupAddress: rollupAddress.toString(),
        validatorAddress: validatorAddress.toString(),
        slot: slot.toString(),
        dutyType,
        blockIndexWithinCheckpoint,
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
    rollupAddress: EthAddress,
    validatorAddress: EthAddress,
    slot: SlotNumber,
    dutyType: DutyType,
    lockToken: string,
    blockIndexWithinCheckpoint: number,
  ): Promise<boolean> {
    const result = await this.pool.query(DELETE_DUTY, [
      rollupAddress.toString(),
      validatorAddress.toString(),
      slot.toString(),
      dutyType,
      blockIndexWithinCheckpoint,
      lockToken,
    ]);

    if (result.rowCount === 0) {
      this.log.warn('Failed to delete duty: invalid token or duty not found', {
        rollupAddress: rollupAddress.toString(),
        validatorAddress: validatorAddress.toString(),
        slot: slot.toString(),
        dutyType,
        blockIndexWithinCheckpoint,
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
      rollupAddress: EthAddress.fromString(row.rollup_address),
      validatorAddress: EthAddress.fromString(row.validator_address),
      slot: SlotNumber.fromString(row.slot),
      blockNumber: BlockNumber.fromString(row.block_number),
      blockIndexWithinCheckpoint: row.block_index_within_checkpoint,
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
    const result = await this.pool.query(CLEANUP_OWN_STUCK_DUTIES, [nodeId, maxAgeMs]);
    return result.rowCount ?? 0;
  }

  /**
   * Cleanup duties with outdated rollup address.
   * Removes all duties where the rollup address doesn't match the current one.
   * Used after a rollup upgrade to clean up duties for the old rollup.
   * @returns the number of duties cleaned up
   */
  async cleanupOutdatedRollupDuties(currentRollupAddress: EthAddress): Promise<number> {
    const result = await this.pool.query(CLEANUP_OUTDATED_ROLLUP_DUTIES, [currentRollupAddress.toString()]);
    return result.rowCount ?? 0;
  }

  /**
   * Cleanup old signed duties.
   * Removes only signed duties older than the specified age.
   * Does not remove 'signing' duties as they may be in progress.
   * @returns the number of duties cleaned up
   */
  async cleanupOldDuties(maxAgeMs: number): Promise<number> {
    const result = await this.pool.query(CLEANUP_OLD_DUTIES, [maxAgeMs]);
    return result.rowCount ?? 0;
  }
}
