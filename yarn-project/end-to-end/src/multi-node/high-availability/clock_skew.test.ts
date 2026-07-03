/**
 * Clock-skew and timezone safety for the HA slashing-protection database.
 *
 * These assertions were extracted from `composed/ha/e2e_ha_full.parallel.test.ts`, where each one used to
 * ride the full 5-node Postgres/Web3Signer HA cluster just to poke the slashing-protection database
 * directly. They do not need any node cluster — only a PostgreSQL-semantics database and a skewable clock.
 *
 * The properties under test are specific to `PostgresSlashingProtectionDatabase`: duty timestamps are
 * stored in absolute time (immune to `process.env.TZ`), and the cleanup queries use the database clock
 * (`CURRENT_TIMESTAMP`) rather than the node's application clock, so a node whose wall clock is skewed
 * cannot delete duties it should keep or keep duties it should delete. Because the property is a
 * PostgreSQL behavior, they cannot be recreated on the mock-gossip HA stack, whose shared
 * slashing-protection DB is driven by the node's `dateProvider`. Instead we run against PGlite — real
 * PostgreSQL compiled to WASM, running in-process — so the exact database semantics are preserved with no
 * docker Postgres. The `dateProvider` here only simulates a skewed node clock; the database never reads
 * it.
 */
import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';
import {
  INSERT_SCHEMA_VERSION,
  PostgresSlashingProtectionDatabase,
  SCHEMA_SETUP,
  SCHEMA_VERSION,
} from '@aztec/validator-ha-signer/db';
import { Pool } from '@aztec/validator-ha-signer/test';
import { type DutyRow, DutyType } from '@aztec/validator-ha-signer/types';

import { PGlite } from '@electric-sql/pglite';
import { jest } from '@jest/globals';

describe('multi-node/high-availability/clock_skew', () => {
  jest.setTimeout(60 * 1000);

  const rollupAddress = EthAddress.random();
  const validatorAddress = EthAddress.random();

  let pglite: PGlite;
  let pool: Pool;
  let spDb: PostgresSlashingProtectionDatabase;
  let dateProvider: TestDateProvider;

  beforeEach(async () => {
    pglite = new PGlite();
    pool = new Pool({ pglite });
    for (const statement of SCHEMA_SETUP) {
      await pglite.query(statement);
    }
    await pglite.query(INSERT_SCHEMA_VERSION, [SCHEMA_VERSION]);
    spDb = new PostgresSlashingProtectionDatabase(pool);
    dateProvider = new TestDateProvider();
  });

  afterEach(async () => {
    dateProvider.reset();
    await pool.end();
    await pglite.close();
  });

  it('should not be affected by process.env.TZ changes', async () => {
    const originalTZ = process.env.TZ;

    try {
      // Node 1 in UTC creates and signs a duty
      process.env.TZ = 'UTC';
      const duty1 = await spDb.tryInsertOrGetExisting({
        rollupAddress,
        validatorAddress,
        slot: SlotNumber(100),
        blockNumber: BlockNumber(0),
        checkpointNumber: CheckpointNumber(0),
        dutyType: DutyType.ATTESTATION,
        messageHash: Buffer32.random().toString(),
        nodeId: 'node-utc',
      });
      expect(duty1.isNew).toBe(true);
      await spDb.updateDutySigned(
        rollupAddress,
        validatorAddress,
        SlotNumber(100),
        DutyType.ATTESTATION,
        '0xsig',
        duty1.record.lockToken,
        -1,
      );

      // Wait for real database time to pass (duties need different timestamps in PostgreSQL)
      await sleep(100);

      // Node 2 in Tokyo creates and signs a duty at approximately the same time
      process.env.TZ = 'Asia/Tokyo';
      const duty2 = await spDb.tryInsertOrGetExisting({
        rollupAddress,
        validatorAddress,
        slot: SlotNumber(101),
        blockNumber: BlockNumber(0),
        checkpointNumber: CheckpointNumber(0),
        dutyType: DutyType.ATTESTATION,
        messageHash: Buffer32.random().toString(),
        nodeId: 'node-tokyo',
      });
      expect(duty2.isNew).toBe(true);
      await spDb.updateDutySigned(
        rollupAddress,
        validatorAddress,
        SlotNumber(101),
        DutyType.ATTESTATION,
        '0xsig',
        duty2.record.lockToken,
        -1,
      );

      // Verify both duties were stored at correct absolute times (seconds apart, not hours)
      const result = await pool.query<{ slot: string; unix_timestamp: string }>(
        `SELECT slot, EXTRACT(EPOCH FROM started_at) as unix_timestamp
         FROM validator_duties
         WHERE slot IN ('100', '101')
         ORDER BY slot DESC`,
      );

      const timestamp1 = parseFloat(result.rows[0].unix_timestamp);
      const timestamp2 = parseFloat(result.rows[1].unix_timestamp);
      const diffSeconds = Math.abs(timestamp1 - timestamp2);

      // Should be less than 10 seconds apart (not hours due to timezone interpretation)
      expect(diffSeconds).toBeLessThan(10);
    } finally {
      process.env.TZ = originalTZ;
    }
  });

  it('should not delete recent duties via cleanupOldDuties when node clock is ahead', async () => {
    // Create and sign a duty using our actual methods
    const duty = await spDb.tryInsertOrGetExisting({
      rollupAddress,
      validatorAddress,
      slot: SlotNumber(200),
      blockNumber: BlockNumber(0),
      checkpointNumber: CheckpointNumber(0),
      dutyType: DutyType.ATTESTATION,
      messageHash: Buffer32.random().toString(),
      nodeId: 'test-node',
    });
    expect(duty.isNew).toBe(true);

    await spDb.updateDutySigned(
      rollupAddress,
      validatorAddress,
      SlotNumber(200),
      DutyType.ATTESTATION,
      '0xsig',
      duty.record.lockToken,
      -1,
    );

    // Verify duty exists before cleanup
    const beforeCleanup = await pool.query<DutyRow>(
      `SELECT * FROM validator_duties WHERE slot = $1 AND validator_address = $2`,
      ['200', validatorAddress.toString().toLowerCase()],
    );
    expect(beforeCleanup.rows.length).toBe(1);
    expect(beforeCleanup.rows[0].status).toBe('signed');

    // Simulate node with clock 2 hours ahead using dateProvider
    // NOTE: Database cleanup uses PostgreSQL's CURRENT_TIMESTAMP, not application time
    // This test verifies that even if the application clock is skewed, cleanup
    // correctly uses database time to determine duty age
    dateProvider.setTime(Date.now() + 2 * 60 * 60 * 1000); // 2 hours ahead

    try {
      // Use our actual cleanupOldDuties method
      const numCleaned = await spDb.cleanupOldDuties(60 * 60 * 1000); // 1 hour

      // Should NOT delete the duty we just created (it uses DB's clock, not node's)
      expect(numCleaned).toBe(0);
    } finally {
      // Reset dateProvider back to real time
      dateProvider.reset();
    }

    // Verify duty still exists
    const result = await pool.query<DutyRow>(
      `SELECT * FROM validator_duties WHERE slot = $1 AND validator_address = $2`,
      ['200', validatorAddress.toString().toLowerCase()],
    );
    expect(result.rows.length).toBe(1);
  });

  it('should delete old duties via cleanupOldDuties based on DB time, not node time', async () => {
    // Create and sign a duty using our actual methods
    const duty = await spDb.tryInsertOrGetExisting({
      rollupAddress,
      validatorAddress,
      slot: SlotNumber(300),
      blockNumber: BlockNumber(0),
      checkpointNumber: CheckpointNumber(0),
      dutyType: DutyType.ATTESTATION,
      messageHash: Buffer32.random().toString(),
      nodeId: 'test-node',
    });
    expect(duty.isNew).toBe(true);

    await spDb.updateDutySigned(
      rollupAddress,
      validatorAddress,
      SlotNumber(300),
      DutyType.ATTESTATION,
      '0xsig',
      duty.record.lockToken,
      -1,
    );

    // Manually backdate the duty to 2 hours old (simulating an old duty from DB's perspective)
    const updateResult = await pool.query(
      `UPDATE validator_duties
       SET started_at = CURRENT_TIMESTAMP - INTERVAL '2 hours',
           completed_at = CURRENT_TIMESTAMP - INTERVAL '2 hours'
       WHERE slot = $1 AND validator_address = $2`,
      ['300', validatorAddress.toString().toLowerCase()],
    );
    expect(updateResult.rowCount).toBe(1);

    // Verify duty is backdated (should be ~2 hours old)
    const beforeCleanup = await pool.query<DutyRow & { age_seconds: string }>(
      `SELECT *, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at)) as age_seconds
       FROM validator_duties WHERE slot = $1`,
      ['300'],
    );
    expect(beforeCleanup.rows.length).toBe(1);
    expect(beforeCleanup.rows[0].status).toBe('signed');
    expect(parseFloat(beforeCleanup.rows[0].age_seconds)).toBeGreaterThan(7000); // ~2 hours in seconds

    // Simulate node with clock 1 hour behind using
    dateProvider.setTime(Date.now() - 1 * 60 * 60 * 1000); // 1 hour behind

    try {
      // Use our actual cleanupOldDuties method - should delete based on DB time
      const numCleaned = await spDb.cleanupOldDuties(60 * 60 * 1000); // 1 hour
      expect(numCleaned).toBeGreaterThanOrEqual(1);
    } finally {
      // Reset dateProvider back to real time
      dateProvider.reset();
    }

    // Verify duty was deleted
    const result = await pool.query<DutyRow>(
      `SELECT * FROM validator_duties WHERE slot = $1 AND validator_address = $2`,
      ['300', validatorAddress.toString().toLowerCase()],
    );
    expect(result.rows.length).toBe(0);
  });

  it('should not delete recent stuck duties via cleanupOwnStuckDuties when node clock is ahead', async () => {
    // Create a signing duty (stuck, not completed) using our actual method
    const duty = await spDb.tryInsertOrGetExisting({
      rollupAddress,
      validatorAddress,
      slot: SlotNumber(400),
      blockNumber: BlockNumber(0),
      checkpointNumber: CheckpointNumber(0),
      dutyType: DutyType.ATTESTATION,
      messageHash: Buffer32.random().toString(),
      nodeId: 'stuck-node',
    });
    expect(duty.isNew).toBe(true);
    // Don't call updateDutySigned - leave it in 'signing' state (stuck)

    // Simulate node with clock 3 hours ahead
    dateProvider.setTime(Date.now() + 3 * 60 * 60 * 1000); // 3 hours ahead

    try {
      // Use our actual cleanupOwnStuckDuties method
      const numCleaned = await spDb.cleanupOwnStuckDuties('stuck-node', 60 * 60 * 1000); // 1 hour

      // Should NOT delete the duty (it uses DB's clock, not node's)
      expect(numCleaned).toBe(0);
    } finally {
      // Reset dateProvider back to real time
      dateProvider.reset();
    }
  });
});
