import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, rm } from 'fs/promises';
import { runner } from 'node-pg-migrate';
import { tmpdir } from 'os';
import { join } from 'path';
import type { QueryResult } from 'pg';

import { Client, Pool } from '../test/pglite_pool.js';
import { PostgresSlashingProtectionDatabase } from './postgres.js';
import {
  DELETE_DUTY,
  INSERT_OR_GET_DUTY,
  INSERT_SCHEMA_VERSION,
  SCHEMA_SETUP,
  SCHEMA_VERSION,
  UPDATE_DUTY_SIGNED,
} from './schema.js';
import { setupTestSchema } from './test_helper.js';
import { type DutyRow, DutyStatus, DutyType, type InsertOrGetRow } from './types.js';

/**
 * Integration tests for PostgreSQL queries using PGlite.
 */
describe('PostgreSQL Queries', () => {
  let db: PGlite;

  const ROLLUP_ADDRESS = EthAddress.random().toString();
  const VALIDATOR_ADDRESS = EthAddress.random().toString();
  const SLOT = 100n;
  const BLOCK_NUMBER = 50n;
  const BLOCK_INDEX_WITHIN_CHECKPOINT = 0;
  const DUTY_TYPE = DutyType.BLOCK_PROPOSAL;
  const MESSAGE_HASH = Buffer32.random().toString();
  const NODE_ID = 'node-1';
  const LOCK_TOKEN = 'test-lock-token-12345';
  const SIGNATURE = '0xsignature';
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pglite-'));
    db = await PGlite.create(tmpDir);

    await setupTestSchema(db);
  });

  afterEach(async () => {
    await db.close();
    await rm(tmpDir, { force: true, recursive: true, maxRetries: 3, retryDelay: 100 });
  });

  describe('INSERT_OR_GET_DUTY', () => {
    it('should insert new record and return is_new=true', async () => {
      const result = await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);

      expect(result.rows.length).toBe(1);
      const row = result.rows[0];
      expect(row.is_new).toBe(true);
      expect(row.status).toBe(DutyStatus.SIGNING);
      expect(row.rollup_address).toBe(ROLLUP_ADDRESS);
      expect(row.validator_address).toBe(VALIDATOR_ADDRESS);
      expect(BigInt(row.slot)).toBe(SLOT);
      expect(row.node_id).toBe(NODE_ID);
      expect(row.lock_token).toBe(LOCK_TOKEN);
    });

    it('should return existing record with is_new=false on duplicate', async () => {
      // First insert
      await db.query(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);

      // Second insert attempt with different node
      const result = await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        'node-2', // Different node trying to acquire
        'different-token',
      ]);

      expect(result.rows.length).toBe(1);
      const row = result.rows[0];
      expect(row.is_new).toBe(false);
      expect(row.node_id).toBe(NODE_ID); // Original node still owns it
    });

    it('should not expose lock_token for existing records', async () => {
      // node acquires the lock
      const insertResult = await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);
      expect(insertResult.rows[0].is_new).toBe(true);
      expect(insertResult.rows[0].lock_token).toBe(LOCK_TOKEN);

      // Second insert attempt - should not get the original lock_token
      const conflictResult = await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        'competing-node',
        'competing-token',
      ]);
      expect(conflictResult.rows[0].is_new).toBe(false);
      expect(conflictResult.rows[0].lock_token).toBe(''); // Empty string, not the original token
    });

    it('should allow different duty types for same slot', async () => {
      // Insert BLOCK_PROPOSAL
      const result1 = await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DutyType.BLOCK_PROPOSAL,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);

      // Insert ATTESTATION for same slot
      const result2 = await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        '0',
        -1,
        DutyType.ATTESTATION,
        MESSAGE_HASH,
        NODE_ID,
        'token-2',
      ]);

      expect(result1.rows[0].is_new).toBe(true);
      expect(result2.rows[0].is_new).toBe(true);
    });

    it('should allow same duty type for different slots', async () => {
      const result1 = await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        '100',
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        'token-1',
      ]);

      const result2 = await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        '101',
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        'token-2',
      ]);

      expect(result1.rows[0].is_new).toBe(true);
      expect(result2.rows[0].is_new).toBe(true);
    });
  });

  describe('UPDATE_DUTY_SIGNED', () => {
    it('should update status to signed and set signature with correct token', async () => {
      // Insert a duty first
      await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);

      // Update to signed with correct token
      const updateResult = await db.query(UPDATE_DUTY_SIGNED, [
        SIGNATURE,
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        LOCK_TOKEN,
      ]);

      expect(updateResult.affectedRows).toBe(1);

      // Verify the update
      const selectResult = await db.query<DutyRow>(
        `SELECT status, signature, completed_at FROM validator_duties
         WHERE validator_address = $1 AND slot = $2 AND duty_type = $3 AND block_index_within_checkpoint = $4`,
        [VALIDATOR_ADDRESS, SLOT.toString(), DUTY_TYPE, BLOCK_INDEX_WITHIN_CHECKPOINT],
      );

      const row = selectResult.rows[0];
      expect(row.status).toBe(DutyStatus.SIGNED);
      expect(row.signature).toBe(SIGNATURE);
      expect(row.completed_at).toBeTruthy();
    });

    it('should not update with wrong token', async () => {
      await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);

      // Try to update with wrong token
      const updateResult = await db.query<DutyRow>(UPDATE_DUTY_SIGNED, [
        SIGNATURE,
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        'wrong-token',
      ]);

      expect(updateResult.affectedRows).toBe(0);

      // Verify still in signing state
      const selectResult = await db.query<DutyRow>(
        `SELECT status FROM validator_duties WHERE validator_address = $1 AND slot = $2`,
        [VALIDATOR_ADDRESS, SLOT.toString()],
      );
      expect(selectResult.rows[0].status).toBe(DutyStatus.SIGNING);
    });

    it('should not update if status is not signing', async () => {
      // Insert and mark as signed
      await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);
      await db.query<DutyRow>(UPDATE_DUTY_SIGNED, [
        SIGNATURE,
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        LOCK_TOKEN,
      ]);

      // Try to update again with correct token
      const result = await db.query<DutyRow>(UPDATE_DUTY_SIGNED, [
        ROLLUP_ADDRESS,
        'new-signature',
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        LOCK_TOKEN,
      ]);

      expect(result.affectedRows).toBe(0);

      // Verify signature unchanged
      const selectResult = await db.query<DutyRow>(
        `SELECT signature FROM validator_duties WHERE validator_address = $1 AND slot = $2`,
        [VALIDATOR_ADDRESS, SLOT.toString()],
      );
      expect(selectResult.rows[0].signature).toBe(SIGNATURE);
    });
  });

  describe('DELETE_DUTY', () => {
    it('should delete a signing duty with correct token', async () => {
      await db.query(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS.toString(),
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);

      const deleteResult = await db.query(DELETE_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        LOCK_TOKEN,
      ]);

      expect(deleteResult.affectedRows).toBe(1);

      // Verify deleted
      const selectResult = await db.query(`SELECT * FROM validator_duties WHERE validator_address = $1 AND slot = $2`, [
        VALIDATOR_ADDRESS,
        SLOT.toString(),
      ]);
      expect(selectResult.rows.length).toBe(0);
    });

    it('should not delete with wrong token', async () => {
      await db.query(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS.toString(),
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);

      const deleteResult = await db.query(DELETE_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        'wrong-token',
      ]);

      expect(deleteResult.affectedRows).toBe(0);

      // Verify still exists
      const selectResult = await db.query(`SELECT * FROM validator_duties WHERE validator_address = $1 AND slot = $2`, [
        VALIDATOR_ADDRESS,
        SLOT.toString(),
      ]);
      expect(selectResult.rows.length).toBe(1);
    });

    it('should not delete a signed duty', async () => {
      await db.query(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS.toString(),
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);
      await db.query(UPDATE_DUTY_SIGNED, [
        SIGNATURE,
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        LOCK_TOKEN,
      ]);

      // Even with correct token, can't delete a signed duty
      const deleteResult = await db.query(DELETE_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        LOCK_TOKEN,
      ]);

      expect(deleteResult.affectedRows).toBe(0);

      // Verify still exists
      const selectResult = await db.query(`SELECT * FROM validator_duties WHERE validator_address = $1 AND slot = $2`, [
        VALIDATOR_ADDRESS,
        SLOT.toString(),
      ]);
      expect(selectResult.rows.length).toBe(1);
    });
  });

  describe('constraints', () => {
    it('should enforce primary key constraint (validator_address, slot, duty_type, block_index_within_checkpoint)', async () => {
      await db.query(INSERT_OR_GET_DUTY, [
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        '0',
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);

      // Direct insert should fail due to primary key constraint
      await expect(
        db.query(
          `INSERT INTO validator_duties (validator_address, slot, block_number, block_index_within_checkpoint, duty_type, status, message_hash, node_id, lock_token)
           VALUES ($1, $2, $3, $4, $5, 'signing', $6, $7, $8)`,
          [
            VALIDATOR_ADDRESS,
            SLOT.toString(),
            BLOCK_NUMBER.toString(),
            BLOCK_INDEX_WITHIN_CHECKPOINT,
            DUTY_TYPE,
            MESSAGE_HASH,
            'node-2',
            'token-2',
          ],
        ),
      ).rejects.toThrow();
    });

    it('should enforce duty_type check constraint', async () => {
      await expect(
        db.query(
          `INSERT INTO validator_duties (validator_address, slot, block_number, block_index_within_checkpoint, duty_type, status, message_hash, node_id, lock_token)
           VALUES ($1, $2, $3, $4, 'INVALID_TYPE', 'signing', $5, $6, $7)`,
          [
            VALIDATOR_ADDRESS,
            SLOT.toString(),
            BLOCK_NUMBER.toString(),
            BLOCK_INDEX_WITHIN_CHECKPOINT,
            MESSAGE_HASH,
            NODE_ID,
            LOCK_TOKEN,
          ],
        ),
      ).rejects.toThrow();
    });

    it('should enforce status check constraint', async () => {
      await expect(
        db.query(
          `INSERT INTO validator_duties (validator_address, slot, block_number, block_index_within_checkpoint, duty_type, status, message_hash, node_id, lock_token)
           VALUES ($1, $2, $3, $4, $5, 'invalid_status', $6, $7, $8)`,
          [
            VALIDATOR_ADDRESS,
            SLOT.toString(),
            BLOCK_NUMBER.toString(),
            BLOCK_INDEX_WITHIN_CHECKPOINT,
            DUTY_TYPE,
            MESSAGE_HASH,
            NODE_ID,
            LOCK_TOKEN,
          ],
        ),
      ).rejects.toThrow();
    });
  });
});

describe('PostgresSlashingProtectionDatabase', () => {
  let pglite: PGlite;
  let pool: Pool;

  beforeEach(() => {
    pglite = new PGlite();
    pool = new Pool({ pglite });
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('initialize', () => {
    it('should succeed when schema_version table exists with correct version', async () => {
      // Set up schema with correct version
      for (const statement of SCHEMA_SETUP) {
        await pglite.query(statement);
      }
      await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION]);

      const spDb = new PostgresSlashingProtectionDatabase(pool);

      await expect(spDb.initialize()).resolves.not.toThrow();
    });

    it('should throw when schema_version table does not exist', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      await expect(spDb.initialize()).rejects.toThrow(
        'Database schema not initialized. Please run migrations first: aztec migrate-ha-db up --database-url <url>',
      );
    });

    it('should throw when schema_version table is empty', async () => {
      // Create schema_version table but don't insert any version
      await pglite.query(`
        CREATE TABLE schema_version (
          version INTEGER PRIMARY KEY,
          applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const spDb = new PostgresSlashingProtectionDatabase(pool);

      await expect(spDb.initialize()).rejects.toThrow(
        'Database schema not initialized. Please run migrations first: aztec migrate-ha-db up --database-url <url>',
      );
    });

    it('should throw when schema version is lower than expected', async () => {
      // Set up schema with outdated version
      for (const statement of SCHEMA_SETUP) {
        await pglite.query(statement);
      }
      await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION - 1]);

      const spDb = new PostgresSlashingProtectionDatabase(pool);

      await expect(spDb.initialize()).rejects.toThrow(
        `Database schema version ${SCHEMA_VERSION - 1} is outdated (expected ${SCHEMA_VERSION}). Please run migrations: aztec migrate-ha-db up --database-url <url>`,
      );
    });

    it('should throw when schema version is higher than expected', async () => {
      // Set up schema with newer version
      for (const statement of SCHEMA_SETUP) {
        await pglite.query(statement);
      }
      await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION + 1]);

      const spDb = new PostgresSlashingProtectionDatabase(pool);

      await expect(spDb.initialize()).rejects.toThrow(
        `Database schema version ${SCHEMA_VERSION + 1} is newer than expected (${SCHEMA_VERSION}). Please update your application.`,
      );
    });

    it('should allow closing the database connection', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      const endSpy = jest.spyOn(pool, 'end');
      await spDb.close();
      expect(endSpy).toHaveBeenCalled();
    });
  });

  describe('tryInsertOrGetExisting retry logic', () => {
    const ROLLUP_ADDRESS = EthAddress.random();
    const VALIDATOR_ADDRESS = EthAddress.random();
    const SLOT = SlotNumber(100);
    const BLOCK_NUMBER = BlockNumber(50);
    const MESSAGE_HASH = Buffer32.random().toString();
    const NODE_ID = 'node-1';

    beforeEach(async () => {
      for (const statement of SCHEMA_SETUP) {
        await pglite.query(statement);
      }
      await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION]);
    });

    it.each([1, 2, 3])('should retry %i time(s) and eventually succeed', async numRetries => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);
      let callCount = 0;

      // Mock pool.query to return no rows on first numRetries calls, then rows on subsequent call
      const originalQuery = pool.query.bind(pool);
      jest.spyOn(pool, 'query').mockImplementation(async (text: string, values?: any[]) => {
        callCount++;
        if (callCount <= numRetries) {
          // First numRetries calls: simulate race condition - no rows returned
          return { rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] } as QueryResult;
        }
        // Subsequent call: return actual result
        return await originalQuery(text, values);
      });

      const result = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      // Should have retried numRetries times (initial attempt + numRetries retries)
      expect(callCount).toBe(numRetries + 1);
      // Should eventually succeed
      expect(result.isNew).toBe(true);
      expect(result.record.validatorAddress).toEqual(VALIDATOR_ADDRESS);
      expect(result.record.slot).toBe(SLOT);

      // Restore original query
      jest.restoreAllMocks();
    });

    it('should throw error after all 3 retries are exhausted', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Mock pool.query to always return no rows
      jest
        .spyOn(pool, 'query')
        .mockResolvedValue({ rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] } as QueryResult);

      await expect(
        spDb.tryInsertOrGetExisting({
          rollupAddress: ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SLOT,
          blockNumber: BLOCK_NUMBER,
          checkpointNumber: CheckpointNumber(1),
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
          dutyType: DutyType.BLOCK_PROPOSAL,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
        }),
      ).rejects.toThrow('INSERT_OR_GET_DUTY returned no rows');

      // Restore original query
      jest.restoreAllMocks();
    });

    it('should throw error if query returns more than one row (database constraint violation)', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Mock pool.query to return multiple rows (simulating a database constraint violation)
      // These use snake_case to match database column names
      /* eslint-disable camelcase */
      const mockRow1 = {
        rollup_address: ROLLUP_ADDRESS.toString(),
        validator_address: VALIDATOR_ADDRESS.toString(),
        slot: SLOT.toString(),
        block_number: BLOCK_NUMBER.toString(),
        block_index_within_checkpoint: 0,
        duty_type: DutyType.BLOCK_PROPOSAL,
        status: DutyStatus.SIGNING,
        message_hash: MESSAGE_HASH,
        signature: null,
        node_id: NODE_ID,
        lock_token: 'token-1',
        started_at: new Date(),
        completed_at: null,
        error_message: null,
        is_new: true,
      } as InsertOrGetRow;
      const mockRow2 = {
        rollup_address: ROLLUP_ADDRESS.toString(),
        validator_address: VALIDATOR_ADDRESS.toString(),
        slot: SLOT.toString(),
        block_number: BLOCK_NUMBER.toString(),
        block_index_within_checkpoint: 0,
        duty_type: DutyType.BLOCK_PROPOSAL,
        status: DutyStatus.SIGNING,
        message_hash: MESSAGE_HASH,
        signature: null,
        node_id: 'node-2',
        lock_token: 'token-2',
        started_at: new Date(),
        completed_at: null,
        error_message: null,
        is_new: false,
      } as InsertOrGetRow;
      /* eslint-enable camelcase */

      jest.spyOn(pool, 'query').mockResolvedValue({
        rows: [mockRow1, mockRow2],
        command: 'SELECT',
        rowCount: 2,
        oid: 0,
        fields: [],
      } as QueryResult);

      await expect(
        spDb.tryInsertOrGetExisting({
          rollupAddress: ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SLOT,
          blockNumber: BLOCK_NUMBER,
          checkpointNumber: CheckpointNumber(1),
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
          dutyType: DutyType.BLOCK_PROPOSAL,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
        }),
      ).rejects.toThrow('INSERT_OR_GET_DUTY returned 2 rows (expected exactly 1).');

      // Restore original query
      jest.restoreAllMocks();
    });
  });

  describe('large numbers handling', () => {
    const ROLLUP_ADDRESS = EthAddress.random();
    const VALIDATOR_ADDRESS = EthAddress.random();
    const SLOT = SlotNumber(100);
    const BLOCK_NUMBER = BlockNumber(50);
    const MESSAGE_HASH = Buffer32.random().toString();
    const NODE_ID = 'node-1';

    beforeEach(async () => {
      for (const statement of SCHEMA_SETUP) {
        await pglite.query(statement);
      }
      await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION]);
    });

    it('should handle large slot numbers correctly', async () => {
      const largeSlot = SlotNumber(Number.MAX_SAFE_INTEGER); // Max safe integer

      const spDb = new PostgresSlashingProtectionDatabase(pool);
      const result = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: largeSlot,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(result.isNew).toBe(true);
      expect(result.record.slot).toBe(largeSlot);
    });

    it('should handle large block numbers correctly', async () => {
      const largeBlockNumber = BlockNumber(Number.MAX_SAFE_INTEGER);

      const spDb = new PostgresSlashingProtectionDatabase(pool);
      const result = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: largeBlockNumber,
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(result.isNew).toBe(true);
      expect(result.record.blockNumber).toBe(largeBlockNumber);
    });
  });

  describe('updateDutySigned', () => {
    const ROLLUP_ADDRESS = EthAddress.random();
    const VALIDATOR_ADDRESS = EthAddress.random();
    const SLOT = SlotNumber(100);
    const BLOCK_NUMBER = BlockNumber(50);
    const MESSAGE_HASH = Buffer32.random().toString();
    const NODE_ID = 'node-1';
    const SIGNATURE = '0xsignature123';

    beforeEach(async () => {
      for (const statement of SCHEMA_SETUP) {
        await pglite.query(statement);
      }
      await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION]);
    });

    it('should return true and update duty to signed status with correct token', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Insert a duty first
      const insertResult = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(insertResult.isNew).toBe(true);
      const lockToken = insertResult.record.lockToken;

      // Update to signed
      const success = await spDb.updateDutySigned(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DutyType.BLOCK_PROPOSAL,
        SIGNATURE,
        lockToken,
        0,
      );

      expect(success).toBe(true);

      // Verify the update
      const selectResult = await pglite.query<DutyRow>(
        `SELECT status, signature, completed_at FROM validator_duties
         WHERE validator_address = $1 AND slot = $2 AND duty_type = $3 AND block_index_within_checkpoint = $4`,
        [VALIDATOR_ADDRESS.toString(), SLOT.toString(), DutyType.BLOCK_PROPOSAL, 0],
      );

      const row = selectResult.rows[0];
      expect(row.status).toBe(DutyStatus.SIGNED);
      expect(row.signature).toBe(SIGNATURE);
      expect(row.completed_at).toBeTruthy();
    });

    it('should return false with wrong token', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Insert a duty first
      const insertResult = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(insertResult.isNew).toBe(true);

      // Try to update with wrong token
      const success = await spDb.updateDutySigned(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DutyType.BLOCK_PROPOSAL,
        SIGNATURE,
        'wrong-token',
        0,
      );

      expect(success).toBe(false);

      // Verify still in signing state
      const selectResult = await pglite.query<DutyRow>(
        `SELECT status FROM validator_duties WHERE validator_address = $1 AND slot = $2`,
        [VALIDATOR_ADDRESS.toString(), SLOT.toString()],
      );
      expect(selectResult.rows[0].status).toBe(DutyStatus.SIGNING);
    });

    it('should return false if duty not found', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      const success = await spDb.updateDutySigned(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DutyType.BLOCK_PROPOSAL,
        SIGNATURE,
        'some-token',
        0,
      );

      expect(success).toBe(false);
    });

    it('should return false if status is not signing', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Insert and mark as signed
      const insertResult = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      const lockToken = insertResult.record.lockToken;
      await spDb.updateDutySigned(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DutyType.BLOCK_PROPOSAL,
        SIGNATURE,
        lockToken,
        0,
      );

      // Try to update again with correct token
      const success = await spDb.updateDutySigned(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DutyType.BLOCK_PROPOSAL,
        'new-signature',
        lockToken,
        0,
      );

      expect(success).toBe(false);

      // Verify signature unchanged
      const selectResult = await pglite.query<DutyRow>(
        `SELECT signature FROM validator_duties WHERE validator_address = $1 AND slot = $2`,
        [VALIDATOR_ADDRESS.toString(), SLOT.toString()],
      );
      expect(selectResult.rows[0].signature).toBe(SIGNATURE);
    });

    it('should handle non-block-proposal duties (uses -1 for block index)', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Insert an ATTESTATION duty (non-block-proposal, so no blockIndexWithinCheckpoint)
      const insertResult = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BlockNumber(0),
        checkpointNumber: CheckpointNumber(0),
        dutyType: DutyType.ATTESTATION,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(insertResult.isNew).toBe(true);
      const lockToken = insertResult.record.lockToken;

      // Update to signed with -1 for block index (non-block-proposal duty)
      const success = await spDb.updateDutySigned(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DutyType.ATTESTATION,
        SIGNATURE,
        lockToken,
        -1,
      );

      expect(success).toBe(true);

      // Verify the update (block_index_within_checkpoint should be -1)
      const selectResult = await pglite.query<DutyRow>(
        `SELECT status, signature, completed_at, block_index_within_checkpoint FROM validator_duties
         WHERE validator_address = $1 AND slot = $2 AND duty_type = $3`,
        [VALIDATOR_ADDRESS.toString(), SLOT.toString(), DutyType.ATTESTATION],
      );

      const row = selectResult.rows[0];
      expect(row.status).toBe(DutyStatus.SIGNED);
      expect(row.signature).toBe(SIGNATURE);
      expect(row.completed_at).toBeTruthy();
      expect(row.block_index_within_checkpoint).toBe(-1);
    });
  });

  describe('deleteDuty', () => {
    const ROLLUP_ADDRESS = EthAddress.random();
    const VALIDATOR_ADDRESS = EthAddress.random();
    const SLOT = SlotNumber(100);
    const BLOCK_NUMBER = BlockNumber(50);
    const MESSAGE_HASH = Buffer32.random().toString();
    const NODE_ID = 'node-1';

    beforeEach(async () => {
      for (const statement of SCHEMA_SETUP) {
        await pglite.query(statement);
      }
      await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION]);
    });

    it('should return true and delete a signing duty with correct token', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Insert a duty first
      const insertResult = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(insertResult.isNew).toBe(true);
      const lockToken = insertResult.record.lockToken;

      // Delete the duty
      const success = await spDb.deleteDuty(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DutyType.BLOCK_PROPOSAL,
        lockToken,
        0,
      );

      expect(success).toBe(true);

      // Verify deleted
      const selectResult = await pglite.query(
        `SELECT * FROM validator_duties WHERE validator_address = $1 AND slot = $2`,
        [VALIDATOR_ADDRESS.toString(), SLOT.toString()],
      );
      expect(selectResult.rows.length).toBe(0);
    });

    it('should return false with wrong token', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Insert a duty first
      await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      // Try to delete with wrong token
      const success = await spDb.deleteDuty(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DutyType.BLOCK_PROPOSAL,
        'wrong-token',
        0,
      );

      expect(success).toBe(false);

      // Verify still exists
      const selectResult = await pglite.query(
        `SELECT * FROM validator_duties WHERE validator_address = $1 AND slot = $2`,
        [VALIDATOR_ADDRESS.toString(), SLOT.toString()],
      );
      expect(selectResult.rows.length).toBe(1);
    });

    it('should return false if duty not found', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      const success = await spDb.deleteDuty(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DutyType.BLOCK_PROPOSAL,
        'some-token',
        0,
      );

      expect(success).toBe(false);
    });

    it('should return false if duty is already signed', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Insert and mark as signed
      const insertResult = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      const lockToken = insertResult.record.lockToken;
      await spDb.updateDutySigned(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DutyType.BLOCK_PROPOSAL,
        '0xsignature',
        lockToken,
        0,
      );

      // Try to delete with correct token (should fail because duty is signed)
      const success = await spDb.deleteDuty(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DutyType.BLOCK_PROPOSAL,
        lockToken,
        0,
      );

      expect(success).toBe(false);

      // Verify still exists
      const selectResult = await pglite.query(
        `SELECT * FROM validator_duties WHERE validator_address = $1 AND slot = $2`,
        [VALIDATOR_ADDRESS.toString(), SLOT.toString()],
      );
      expect(selectResult.rows.length).toBe(1);
    });

    it('should handle non-block-proposal duties (uses -1 for block index)', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Insert an ATTESTATION duty (non-block-proposal, so no blockIndexWithinCheckpoint)
      const insertResult = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BlockNumber(0),
        checkpointNumber: CheckpointNumber(0),
        dutyType: DutyType.ATTESTATION,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(insertResult.isNew).toBe(true);
      const lockToken = insertResult.record.lockToken;

      // Delete with -1 for block index (non-block-proposal duty)
      const success = await spDb.deleteDuty(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DutyType.ATTESTATION,
        lockToken,
        -1,
      );

      expect(success).toBe(true);

      // Verify deleted
      const selectResult = await pglite.query(
        `SELECT * FROM validator_duties WHERE validator_address = $1 AND slot = $2 AND duty_type = $3`,
        [VALIDATOR_ADDRESS.toString(), SLOT.toString(), DutyType.ATTESTATION],
      );
      expect(selectResult.rows.length).toBe(0);
    });
  });

  describe('Rollup Address Isolation', () => {
    const ROLLUP_ADDRESS_1 = EthAddress.random();
    const ROLLUP_ADDRESS_2 = EthAddress.random();
    const VALIDATOR_ADDRESS = EthAddress.random();
    const SLOT = SlotNumber(100);
    const BLOCK_NUMBER = BlockNumber(50);
    const MESSAGE_HASH = Buffer32.random().toString();
    const NODE_ID = 'node-1';

    beforeEach(async () => {
      for (const statement of SCHEMA_SETUP) {
        await pglite.query(statement);
      }
      await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION]);
    });

    it('should allow same validator/slot/duty for different rollup addresses', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Insert duty for rollup1
      const result1 = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS_1,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      // Insert same duty but for rollup2 - should succeed (no conflict)
      const result2 = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS_2,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT, // Same slot!
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(result1.isNew).toBe(true);
      expect(result2.isNew).toBe(true); // Both should succeed
      expect(result1.record.rollupAddress).toEqual(ROLLUP_ADDRESS_1);
      expect(result2.record.rollupAddress).toEqual(ROLLUP_ADDRESS_2);
      expect(result1.record.slot).toBe(SLOT);
      expect(result2.record.slot).toBe(SLOT);
    });

    it('should only update duties for the specified rollup address', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Create duty for rollup1
      const result1 = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS_1,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(result1.isNew).toBe(true);
      const lockToken = result1.record.lockToken;

      // Try to update using rollup2 address - should fail (no match)
      const updated = await spDb.updateDutySigned(
        ROLLUP_ADDRESS_2, // Wrong rollup!
        VALIDATOR_ADDRESS,
        SLOT,
        DutyType.BLOCK_PROPOSAL,
        '0xsignature',
        lockToken,
        0,
      );

      expect(updated).toBe(false); // Should not update duty from different rollup
    });

    it('should only delete duties for the specified rollup address', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Create duty for rollup1
      const result1 = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS_1,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(result1.isNew).toBe(true);
      const lockToken = result1.record.lockToken;

      // Try to delete using rollup2 address - should fail (no match)
      const deleted = await spDb.deleteDuty(
        ROLLUP_ADDRESS_2, // Wrong rollup!
        VALIDATOR_ADDRESS,
        SLOT,
        DutyType.BLOCK_PROPOSAL,
        lockToken,
        0,
      );

      expect(deleted).toBe(false); // Should not delete duty from different rollup

      // Verify the duty still exists for rollup1
      const result2 = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS_1,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(result2.isNew).toBe(false); // Still exists
    });
  });

  describe('Rollup Upgrade Scenario', () => {
    const VALIDATOR_ADDRESS = EthAddress.random();
    const NODE_ID = 'node-1';

    beforeEach(async () => {
      for (const statement of SCHEMA_SETUP) {
        await pglite.query(statement);
      }
      await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION]);
    });

    it('should allow overlapping block proposals across rollup addresses', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);
      const oldRollupAddress = EthAddress.random();
      const newRollupAddress = EthAddress.random();
      const slot = SlotNumber(100);
      const blockNumber = BlockNumber(50);

      // Old rollup: validator proposes 3 blocks in same slot
      for (let blockIdx = 0; blockIdx < 3; blockIdx++) {
        const result = await spDb.tryInsertOrGetExisting({
          rollupAddress: oldRollupAddress,
          validatorAddress: VALIDATOR_ADDRESS,
          slot,
          blockNumber,
          checkpointNumber: CheckpointNumber(1),
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(blockIdx),
          dutyType: DutyType.BLOCK_PROPOSAL,
          messageHash: Buffer32.random().toString(),
          nodeId: NODE_ID,
        });
        expect(result.isNew).toBe(true);
      }

      // New rollup: validator should be able to propose 3 blocks in same slot again
      for (let blockIdx = 0; blockIdx < 3; blockIdx++) {
        const result = await spDb.tryInsertOrGetExisting({
          rollupAddress: newRollupAddress,
          validatorAddress: VALIDATOR_ADDRESS,
          slot, // Same slot!
          blockNumber,
          checkpointNumber: CheckpointNumber(1),
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(blockIdx), // Same index!
          dutyType: DutyType.BLOCK_PROPOSAL,
          messageHash: Buffer32.random().toString(),
          nodeId: NODE_ID,
        });
        expect(result.isNew).toBe(true);
        expect(result.record.rollupAddress).toEqual(newRollupAddress);
      }
    });
  });

  describe('cleanupOwnStuckDuties', () => {
    const ROLLUP_ADDRESS = EthAddress.random();
    const VALIDATOR_ADDRESS = EthAddress.random();
    const NODE_ID = 'node-1';

    beforeEach(async () => {
      for (const statement of SCHEMA_SETUP) {
        await pglite.query(statement);
      }
      await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION]);
    });

    const insertStuckDuty = async (slot: number, lockToken: string) => {
      const oldStartedAt = new Date(Date.now() - 10 * 60 * 1000);
      await pglite.query(
        `INSERT INTO validator_duties (
           rollup_address, validator_address, slot, block_number,
           block_index_within_checkpoint, duty_type, status, message_hash,
           node_id, lock_token, started_at
         ) VALUES ($1, $2, $3, $4, $5, $6, 'signing', $7, $8, $9, $10)`,
        [
          ROLLUP_ADDRESS.toString(),
          VALIDATOR_ADDRESS.toString(),
          slot,
          50,
          0,
          DutyType.BLOCK_PROPOSAL,
          Buffer32.random().toString(),
          NODE_ID,
          lockToken,
          oldStartedAt,
        ],
      );
    };

    it('removes stuck duties but never those whose lock token is excluded', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);
      await insertStuckDuty(100, 'held-token');
      await insertStuckDuty(200, 'stuck-token');

      const cleaned = await spDb.cleanupOwnStuckDuties(NODE_ID, 60_000, ['held-token']);
      expect(cleaned).toBe(1);

      const remaining = await pglite.query<{ lock_token: string }>(
        `SELECT lock_token FROM validator_duties WHERE node_id = $1`,
        [NODE_ID],
      );
      expect(remaining.rows.map(r => r.lock_token)).toEqual(['held-token']);
    });

    it('removes all stuck duties when no lock tokens are excluded', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);
      await insertStuckDuty(100, 'token-a');
      await insertStuckDuty(200, 'token-b');

      const cleaned = await spDb.cleanupOwnStuckDuties(NODE_ID, 60_000);
      expect(cleaned).toBe(2);
    });
  });

  describe('cleanupOutdatedRollupDuties', () => {
    const CURRENT_ROLLUP_ADDRESS = EthAddress.random();
    const OLD_ROLLUP_ADDRESS_1 = EthAddress.random();
    const OLD_ROLLUP_ADDRESS_2 = EthAddress.random();
    const VALIDATOR_ADDRESS = EthAddress.random();
    const NODE_ID = 'node-1';

    beforeEach(async () => {
      for (const statement of SCHEMA_SETUP) {
        await pglite.query(statement);
      }
      await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION]);
    });

    it('should clean up duties with outdated rollup addresses', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Create duties for old rollup addresses
      for (let i = 0; i < 3; i++) {
        await spDb.tryInsertOrGetExisting({
          rollupAddress: OLD_ROLLUP_ADDRESS_1,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SlotNumber(100 + i),
          blockNumber: BlockNumber(50 + i),
          checkpointNumber: CheckpointNumber(1),
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
          dutyType: DutyType.BLOCK_PROPOSAL,
          messageHash: Buffer32.random().toString(),
          nodeId: NODE_ID,
        });
      }

      for (let i = 0; i < 2; i++) {
        await spDb.tryInsertOrGetExisting({
          rollupAddress: OLD_ROLLUP_ADDRESS_2,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SlotNumber(200 + i),
          blockNumber: BlockNumber(150 + i),
          checkpointNumber: CheckpointNumber(1),
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
          dutyType: DutyType.BLOCK_PROPOSAL,
          messageHash: Buffer32.random().toString(),
          nodeId: NODE_ID,
        });
      }

      // Create duties for current rollup address
      for (let i = 0; i < 2; i++) {
        await spDb.tryInsertOrGetExisting({
          rollupAddress: CURRENT_ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SlotNumber(300 + i),
          blockNumber: BlockNumber(250 + i),
          checkpointNumber: CheckpointNumber(1),
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
          dutyType: DutyType.BLOCK_PROPOSAL,
          messageHash: Buffer32.random().toString(),
          nodeId: NODE_ID,
        });
      }

      // Clean up outdated rollup duties
      const numCleaned = await spDb.cleanupOutdatedRollupDuties(CURRENT_ROLLUP_ADDRESS);
      expect(numCleaned).toBe(5); // 3 from OLD_ROLLUP_ADDRESS_1 + 2 from OLD_ROLLUP_ADDRESS_2

      // Verify old rollup duties are gone
      const oldDuties = await pglite.query(`SELECT * FROM validator_duties WHERE rollup_address != $1`, [
        CURRENT_ROLLUP_ADDRESS.toString(),
      ]);
      expect(oldDuties.rows.length).toBe(0);

      // Verify current rollup duties still exist
      const currentDuties = await pglite.query(`SELECT * FROM validator_duties WHERE rollup_address = $1`, [
        CURRENT_ROLLUP_ADDRESS.toString(),
      ]);
      expect(currentDuties.rows.length).toBe(2);
    });

    it('should return 0 when no outdated duties exist', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Create duties only for current rollup
      await spDb.tryInsertOrGetExisting({
        rollupAddress: CURRENT_ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: Buffer32.random().toString(),
        nodeId: NODE_ID,
      });

      const numCleaned = await spDb.cleanupOutdatedRollupDuties(CURRENT_ROLLUP_ADDRESS);
      expect(numCleaned).toBe(0);

      // Verify duty still exists
      const duties = await pglite.query(`SELECT * FROM validator_duties`);
      expect(duties.rows.length).toBe(1);
    });
  });

  describe('cleanupOldDuties', () => {
    const ROLLUP_ADDRESS = EthAddress.random();
    const VALIDATOR_ADDRESS = EthAddress.random();
    const NODE_ID = 'node-1';

    beforeEach(async () => {
      for (const statement of SCHEMA_SETUP) {
        await pglite.query(statement);
      }
      await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION]);
    });

    it('should only clean up old signed duties, not signing or recent duties', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Insert old signed duties (should be cleaned up) - 2 hours old
      for (let i = 0; i < 2; i++) {
        await pglite.query(
          `INSERT INTO validator_duties (
            rollup_address, validator_address, slot, block_number, block_index_within_checkpoint,
            duty_type, status, message_hash, signature, node_id, lock_token, started_at, completed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'signed', $7, '0xsignature', $8, 'token',
            CURRENT_TIMESTAMP - INTERVAL '2 hours',
            CURRENT_TIMESTAMP - INTERVAL '2 hours')`,
          [
            ROLLUP_ADDRESS.toString(),
            VALIDATOR_ADDRESS.toString(),
            (100 + i).toString(),
            (50 + i).toString(),
            0,
            DutyType.BLOCK_PROPOSAL,
            Buffer32.random().toString(),
            NODE_ID,
          ],
        );
      }

      // Insert old signing duties (should NOT be cleaned up) - 2 hours old but still signing
      for (let i = 0; i < 2; i++) {
        await pglite.query(
          `INSERT INTO validator_duties (
            rollup_address, validator_address, slot, block_number, block_index_within_checkpoint,
            duty_type, status, message_hash, node_id, lock_token, started_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 'signing', $7, $8, 'token',
            CURRENT_TIMESTAMP - INTERVAL '2 hours')`,
          [
            ROLLUP_ADDRESS.toString(),
            VALIDATOR_ADDRESS.toString(),
            (200 + i).toString(),
            (150 + i).toString(),
            0,
            DutyType.BLOCK_PROPOSAL,
            Buffer32.random().toString(),
            NODE_ID,
          ],
        );
      }

      // Insert recent signed duty (should NOT be cleaned up)
      const recentResult = await spDb.tryInsertOrGetExisting({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SlotNumber(300),
        blockNumber: BlockNumber(250),
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: Buffer32.random().toString(),
        nodeId: NODE_ID,
      });
      await spDb.updateDutySigned(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SlotNumber(300),
        DutyType.BLOCK_PROPOSAL,
        '0xsignature',
        recentResult.record.lockToken,
        0,
      );

      // Clean up duties older than 1 hour
      const maxAgeMs = 60 * 60 * 1000; // 1 hour
      const numCleaned = await spDb.cleanupOldDuties(maxAgeMs);
      expect(numCleaned).toBe(2); // Only the 2 old signed duties

      // Verify old signed duties are gone
      const oldSignedDuties = await pglite.query(`SELECT * FROM validator_duties WHERE slot >= 100 AND slot < 200`);
      expect(oldSignedDuties.rows.length).toBe(0);

      // Verify old signing duties still exist (critical safety check)
      const signingDuties = await pglite.query(`SELECT * FROM validator_duties WHERE status = 'signing'`);
      expect(signingDuties.rows.length).toBe(2);

      // Verify recent signed duty still exists
      const recentDuty = await pglite.query<DutyRow>(`SELECT * FROM validator_duties WHERE slot = 300`);
      expect(recentDuty.rows.length).toBe(1);
      expect(recentDuty.rows[0].status).toBe('signed');
    });

    it('should return 0 when no old signed duties exist', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);
      const numCleaned = await spDb.cleanupOldDuties(60 * 60 * 1000);
      expect(numCleaned).toBe(0);
    });
  });
});

/** Query the columns and primary key constraints for the validator_duties table. */
async function dumpValidatorDutiesSchema(db: PGlite): Promise<{
  columns: Array<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>;
  primaryKey: string[];
}> {
  const columnsResult = await db.query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_name = 'validator_duties'
     ORDER BY ordinal_position`,
  );

  const pkResult = await db.query<{ column_name: string }>(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_name = kcu.table_name
     WHERE tc.constraint_type = 'PRIMARY KEY'
       AND tc.table_name = 'validator_duties'
     ORDER BY kcu.ordinal_position`,
  );

  return {
    columns: columnsResult.rows,
    primaryKey: pkResult.rows.map(r => r.column_name),
  };
}

describe('migrations', () => {
  let db: PGlite;
  let tmpDir: string;

  // Compiled migrations are in dest/db/migrations relative to the package root.
  // process.cwd() is the package root when running jest.
  const migrationsDir = join(process.cwd(), 'dest/db/migrations');

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pglite-migrations-'));
    db = await PGlite.create(tmpDir);
  });

  afterEach(async () => {
    await db.close();
    await rm(tmpDir, { force: true, recursive: true, maxRetries: 3, retryDelay: 100 });
  });

  it('should produce the same schema after running migrations down and up again', async () => {
    const client = new Client({ pglite: db });
    await client.connect();

    const runnerOptions = {
      dbClient: client as any,
      dir: migrationsDir,
      migrationsTable: 'pgmigrations',
      noLock: true,
      singleTransaction: true,
      ignorePattern: '.*\\.d\\.(ts|js)$|.*\\.d\\.ts\\.map$',
    };

    // Step 1: run all migrations up and capture the resulting schema.
    await runner({ ...runnerOptions, direction: 'up' });
    const schemaAfterFirstUp = await dumpValidatorDutiesSchema(db);

    expect(schemaAfterFirstUp.columns.length).toBeGreaterThan(0);
    expect(schemaAfterFirstUp.primaryKey.length).toBeGreaterThan(0);

    // Step 2: roll back all migrations one at a time.
    await runner({ ...runnerOptions, direction: 'down', count: 1 });
    await runner({ ...runnerOptions, direction: 'down', count: 1 });

    // validator_duties table should no longer exist.
    const tablesResult = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'validator_duties'`,
    );
    expect(tablesResult.rows.length).toBe(0);

    // Step 3: run all migrations up again.
    await runner({ ...runnerOptions, direction: 'up' });
    const schemaAfterSecondUp = await dumpValidatorDutiesSchema(db);

    // Step 4: assert the schema matches.
    expect(schemaAfterSecondUp.columns).toEqual(schemaAfterFirstUp.columns);
    expect(schemaAfterSecondUp.primaryKey).toEqual(schemaAfterFirstUp.primaryKey);

    await client.end();
  });
});
