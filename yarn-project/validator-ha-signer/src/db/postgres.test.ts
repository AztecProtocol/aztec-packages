import { BlockNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { QueryResult } from 'pg';

import { Pool } from '../test/pglite_pool.js';
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
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
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
      expect(row.validator_address).toBe(VALIDATOR_ADDRESS.toString());
      expect(BigInt(row.slot)).toBe(SLOT);
      expect(row.node_id).toBe(NODE_ID);
      expect(row.lock_token).toBe(LOCK_TOKEN);
    });

    it('should return existing record with is_new=false on duplicate', async () => {
      // First insert
      await db.query(INSERT_OR_GET_DUTY, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);

      // Second insert attempt with different node
      const result = await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
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
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
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
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
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
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DutyType.BLOCK_PROPOSAL,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);

      // Insert ATTESTATION for same slot
      const result2 = await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
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
        VALIDATOR_ADDRESS.toString(),
        '100',
        BLOCK_NUMBER.toString(),
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        'token-1',
      ]);

      const result2 = await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        VALIDATOR_ADDRESS.toString(),
        '101',
        BLOCK_NUMBER.toString(),
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
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);

      // Update to signed with correct token
      const updateResult = await db.query(UPDATE_DUTY_SIGNED, [
        SIGNATURE,
        VALIDATOR_ADDRESS.toString(),
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
        [VALIDATOR_ADDRESS.toString(), SLOT.toString(), DUTY_TYPE, BLOCK_INDEX_WITHIN_CHECKPOINT],
      );

      const row = selectResult.rows[0];
      expect(row.status).toBe(DutyStatus.SIGNED);
      expect(row.signature).toBe(SIGNATURE);
      expect(row.completed_at).toBeTruthy();
    });

    it('should not update with wrong token', async () => {
      await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);

      // Try to update with wrong token
      const updateResult = await db.query<DutyRow>(UPDATE_DUTY_SIGNED, [
        SIGNATURE,
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        'wrong-token',
      ]);

      expect(updateResult.affectedRows).toBe(0);

      // Verify still in signing state
      const selectResult = await db.query<DutyRow>(
        `SELECT status FROM validator_duties WHERE validator_address = $1 AND slot = $2`,
        [VALIDATOR_ADDRESS.toString(), SLOT.toString()],
      );
      expect(selectResult.rows[0].status).toBe(DutyStatus.SIGNING);
    });

    it('should not update if status is not signing', async () => {
      // Insert and mark as signed
      await db.query<InsertOrGetRow>(INSERT_OR_GET_DUTY, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);
      await db.query<DutyRow>(UPDATE_DUTY_SIGNED, [
        SIGNATURE,
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        LOCK_TOKEN,
      ]);

      // Try to update again with correct token
      const result = await db.query<DutyRow>(UPDATE_DUTY_SIGNED, [
        'new-signature',
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        LOCK_TOKEN,
      ]);

      expect(result.affectedRows).toBe(0);

      // Verify signature unchanged
      const selectResult = await db.query<DutyRow>(
        `SELECT signature FROM validator_duties WHERE validator_address = $1 AND slot = $2`,
        [VALIDATOR_ADDRESS.toString(), SLOT.toString()],
      );
      expect(selectResult.rows[0].signature).toBe(SIGNATURE);
    });
  });

  describe('DELETE_DUTY', () => {
    it('should delete a signing duty with correct token', async () => {
      await db.query(INSERT_OR_GET_DUTY, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);

      const deleteResult = await db.query(DELETE_DUTY, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        LOCK_TOKEN,
      ]);

      expect(deleteResult.affectedRows).toBe(1);

      // Verify deleted
      const selectResult = await db.query(`SELECT * FROM validator_duties WHERE validator_address = $1 AND slot = $2`, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
      ]);
      expect(selectResult.rows.length).toBe(0);
    });

    it('should not delete with wrong token', async () => {
      await db.query(INSERT_OR_GET_DUTY, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);

      const deleteResult = await db.query(DELETE_DUTY, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        'wrong-token',
      ]);

      expect(deleteResult.affectedRows).toBe(0);

      // Verify still exists
      const selectResult = await db.query(`SELECT * FROM validator_duties WHERE validator_address = $1 AND slot = $2`, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
      ]);
      expect(selectResult.rows.length).toBe(1);
    });

    it('should not delete a signed duty', async () => {
      await db.query(INSERT_OR_GET_DUTY, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        DUTY_TYPE,
        MESSAGE_HASH,
        NODE_ID,
        LOCK_TOKEN,
      ]);
      await db.query(UPDATE_DUTY_SIGNED, [
        SIGNATURE,
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        LOCK_TOKEN,
      ]);

      // Even with correct token, can't delete a signed duty
      const deleteResult = await db.query(DELETE_DUTY, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        DUTY_TYPE,
        BLOCK_INDEX_WITHIN_CHECKPOINT,
        LOCK_TOKEN,
      ]);

      expect(deleteResult.affectedRows).toBe(0);

      // Verify still exists
      const selectResult = await db.query(`SELECT * FROM validator_duties WHERE validator_address = $1 AND slot = $2`, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
      ]);
      expect(selectResult.rows.length).toBe(1);
    });
  });

  describe('constraints', () => {
    it('should enforce primary key constraint (validator_address, slot, duty_type, block_index_within_checkpoint)', async () => {
      await db.query(INSERT_OR_GET_DUTY, [
        VALIDATOR_ADDRESS.toString(),
        SLOT.toString(),
        BLOCK_NUMBER.toString(),
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
            VALIDATOR_ADDRESS.toString(),
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
            VALIDATOR_ADDRESS.toString(),
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
            VALIDATOR_ADDRESS.toString(),
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
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
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SLOT,
          blockNumber: BLOCK_NUMBER,
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
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SLOT,
          blockNumber: BLOCK_NUMBER,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: largeSlot,
        blockNumber: BLOCK_NUMBER,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: largeBlockNumber,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(insertResult.isNew).toBe(true);
      const lockToken = insertResult.record.lockToken;

      // Update to signed
      const success = await spDb.updateDutySigned(
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(insertResult.isNew).toBe(true);

      // Try to update with wrong token
      const success = await spDb.updateDutySigned(
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      const lockToken = insertResult.record.lockToken;
      await spDb.updateDutySigned(VALIDATOR_ADDRESS, SLOT, DutyType.BLOCK_PROPOSAL, SIGNATURE, lockToken, 0);

      // Try to update again with correct token
      const success = await spDb.updateDutySigned(
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        dutyType: DutyType.ATTESTATION,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(insertResult.isNew).toBe(true);
      const lockToken = insertResult.record.lockToken;

      // Update to signed with -1 for block index (non-block-proposal duty)
      const success = await spDb.updateDutySigned(
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(insertResult.isNew).toBe(true);
      const lockToken = insertResult.record.lockToken;

      // Delete the duty
      const success = await spDb.deleteDuty(VALIDATOR_ADDRESS, SLOT, DutyType.BLOCK_PROPOSAL, lockToken, 0);

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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      // Try to delete with wrong token
      const success = await spDb.deleteDuty(VALIDATOR_ADDRESS, SLOT, DutyType.BLOCK_PROPOSAL, 'wrong-token', 0);

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

      const success = await spDb.deleteDuty(VALIDATOR_ADDRESS, SLOT, DutyType.BLOCK_PROPOSAL, 'some-token', 0);

      expect(success).toBe(false);
    });

    it('should return false if duty is already signed', async () => {
      const spDb = new PostgresSlashingProtectionDatabase(pool);

      // Insert and mark as signed
      const insertResult = await spDb.tryInsertOrGetExisting({
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      const lockToken = insertResult.record.lockToken;
      await spDb.updateDutySigned(VALIDATOR_ADDRESS, SLOT, DutyType.BLOCK_PROPOSAL, '0xsignature', lockToken, 0);

      // Try to delete with correct token (should fail because duty is signed)
      const success = await spDb.deleteDuty(VALIDATOR_ADDRESS, SLOT, DutyType.BLOCK_PROPOSAL, lockToken, 0);

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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        dutyType: DutyType.ATTESTATION,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      });

      expect(insertResult.isNew).toBe(true);
      const lockToken = insertResult.record.lockToken;

      // Delete with -1 for block index (non-block-proposal duty)
      const success = await spDb.deleteDuty(VALIDATOR_ADDRESS, SLOT, DutyType.ATTESTATION, lockToken, -1);

      expect(success).toBe(true);

      // Verify deleted
      const selectResult = await pglite.query(
        `SELECT * FROM validator_duties WHERE validator_address = $1 AND slot = $2 AND duty_type = $3`,
        [VALIDATOR_ADDRESS.toString(), SLOT.toString(), DutyType.ATTESTATION],
      );
      expect(selectResult.rows.length).toBe(0);
    });
  });
});
