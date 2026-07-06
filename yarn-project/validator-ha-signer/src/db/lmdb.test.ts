import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { TestDateProvider } from '@aztec/foundation/timer';
import { type AztecLMDBStoreV2, createStore, openStoreAt, openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { createLocalSignerWithProtection } from '../factory.js';
import { LmdbSlashingProtectionDatabase } from './lmdb.js';
import { DutyStatus, DutyType, type StoredDutyRecord } from './types.js';

describe('LmdbSlashingProtectionDatabase', () => {
  let store: AztecLMDBStoreV2;
  let db: LmdbSlashingProtectionDatabase;
  let dateProvider: TestDateProvider;

  const ROLLUP_ADDRESS = EthAddress.random();
  const VALIDATOR_ADDRESS = EthAddress.random();
  const SLOT = SlotNumber(100);
  const BLOCK_NUMBER = BlockNumber(50);
  const BLOCK_INDEX = IndexWithinCheckpoint(0);
  const DUTY_TYPE = DutyType.BLOCK_PROPOSAL;
  const MESSAGE_HASH = '0xdeadbeef';
  const NODE_ID = 'local';
  const SIGNATURE = '0xsignature';

  const defaultParams = () => ({
    rollupAddress: ROLLUP_ADDRESS,
    validatorAddress: VALIDATOR_ADDRESS,
    slot: SLOT,
    blockNumber: BLOCK_NUMBER,
    checkpointNumber: CheckpointNumber(1),
    blockIndexWithinCheckpoint: BLOCK_INDEX,
    dutyType: DUTY_TYPE,
    messageHash: MESSAGE_HASH,
    nodeId: NODE_ID,
  });

  beforeEach(async () => {
    store = await openTmpStore('lmdb-slashing-test', true);
    dateProvider = new TestDateProvider();
    db = new LmdbSlashingProtectionDatabase(store, dateProvider);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('tryInsertOrGetExisting', () => {
    it('should insert a new duty and return isNew=true', async () => {
      const result = await db.tryInsertOrGetExisting(defaultParams());

      expect(result.isNew).toBe(true);
      expect(result.record.status).toBe(DutyStatus.SIGNING);
      expect(result.record.rollupAddress.equals(ROLLUP_ADDRESS)).toBe(true);
      expect(result.record.validatorAddress.equals(VALIDATOR_ADDRESS)).toBe(true);
      expect(result.record.slot).toBe(SLOT);
      expect(result.record.dutyType).toBe(DUTY_TYPE);
      expect(result.record.messageHash).toBe(MESSAGE_HASH);
      expect(result.record.nodeId).toBe(NODE_ID);
      expect(result.record.lockToken).toBeTruthy();
    });

    it('should return isNew=false and existing record on duplicate', async () => {
      const first = await db.tryInsertOrGetExisting(defaultParams());
      expect(first.isNew).toBe(true);

      const second = await db.tryInsertOrGetExisting({ ...defaultParams(), nodeId: 'other-node' });
      expect(second.isNew).toBe(false);
      expect(second.record.nodeId).toBe(NODE_ID);
    });

    it('should strip lockToken from existing record', async () => {
      const first = await db.tryInsertOrGetExisting(defaultParams());
      expect(first.isNew).toBe(true);
      expect(first.record.lockToken).toBeTruthy();

      const second = await db.tryInsertOrGetExisting({ ...defaultParams(), nodeId: 'other-node' });
      expect(second.isNew).toBe(false);
      expect(second.record.lockToken).toBe('');
    });

    it('should allow independent duties for different slots, duty types, and validators', async () => {
      const [slot1, slot2] = await Promise.all([
        db.tryInsertOrGetExisting({ ...defaultParams(), slot: SlotNumber(1) }),
        db.tryInsertOrGetExisting({ ...defaultParams(), slot: SlotNumber(2) }),
      ]);
      expect(slot1.isNew).toBe(true);
      expect(slot2.isNew).toBe(true);

      const [proposalResult, attestResult] = await Promise.all([
        db.tryInsertOrGetExisting({ ...defaultParams(), dutyType: DutyType.BLOCK_PROPOSAL }),
        db.tryInsertOrGetExisting({
          rollupAddress: ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SLOT,
          blockNumber: BlockNumber(0),
          checkpointNumber: CheckpointNumber(0),
          dutyType: DutyType.ATTESTATION,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
        }),
      ]);
      expect(proposalResult.isNew).toBe(true);
      expect(attestResult.isNew).toBe(true);

      const [v1, v2] = await Promise.all([
        db.tryInsertOrGetExisting({ ...defaultParams(), validatorAddress: EthAddress.random() }),
        db.tryInsertOrGetExisting({ ...defaultParams(), validatorAddress: EthAddress.random() }),
      ]);
      expect(v1.isNew).toBe(true);
      expect(v2.isNew).toBe(true);
    });
  });

  describe('updateDutySigned', () => {
    it('should update duty to signed status with correct lockToken', async () => {
      const { record } = await db.tryInsertOrGetExisting(defaultParams());

      const success = await db.updateDutySigned(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DUTY_TYPE,
        SIGNATURE,
        record.lockToken,
        BLOCK_INDEX,
      );

      expect(success).toBe(true);

      // Subsequent insert attempt returns existing record with SIGNED status
      const second = await db.tryInsertOrGetExisting(defaultParams());
      expect(second.isNew).toBe(false);
      expect(second.record.status).toBe(DutyStatus.SIGNED);
      expect(second.record.signature).toBe(SIGNATURE);
    });

    it('should return false when lockToken does not match', async () => {
      await db.tryInsertOrGetExisting(defaultParams());

      const success = await db.updateDutySigned(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DUTY_TYPE,
        SIGNATURE,
        'wrong-token',
        BLOCK_INDEX,
      );

      expect(success).toBe(false);
    });

    it('should return false when duty does not exist', async () => {
      const success = await db.updateDutySigned(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DUTY_TYPE,
        SIGNATURE,
        'any-token',
        BLOCK_INDEX,
      );

      expect(success).toBe(false);
    });
  });

  describe('deleteDuty', () => {
    it('should delete duty with correct lockToken', async () => {
      const { record } = await db.tryInsertOrGetExisting(defaultParams());

      const success = await db.deleteDuty(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DUTY_TYPE,
        record.lockToken,
        BLOCK_INDEX,
      );

      expect(success).toBe(true);

      // Should now be insertable again
      const retry = await db.tryInsertOrGetExisting(defaultParams());
      expect(retry.isNew).toBe(true);
    });

    it('should return false when lockToken does not match', async () => {
      await db.tryInsertOrGetExisting(defaultParams());

      const success = await db.deleteDuty(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DUTY_TYPE,
        'wrong-token',
        BLOCK_INDEX,
      );

      expect(success).toBe(false);
    });

    it('should return false when duty does not exist', async () => {
      const success = await db.deleteDuty(ROLLUP_ADDRESS, VALIDATOR_ADDRESS, SLOT, DUTY_TYPE, 'any-token', BLOCK_INDEX);

      expect(success).toBe(false);
    });
  });

  describe('cleanupOwnStuckDuties', () => {
    it('should remove stuck SIGNING duties older than maxAgeMs', async () => {
      await db.tryInsertOrGetExisting(defaultParams());

      // Advance past the maxAge threshold
      dateProvider.advanceTime(120);
      const count = await db.cleanupOwnStuckDuties(NODE_ID, 60_000);
      expect(count).toBe(1);

      // Should now be insertable again (duty was deleted)
      const retry = await db.tryInsertOrGetExisting(defaultParams());
      expect(retry.isNew).toBe(true);
    });

    it('should not remove duties for other node IDs', async () => {
      await db.tryInsertOrGetExisting(defaultParams());

      dateProvider.advanceTime(120);
      const count = await db.cleanupOwnStuckDuties('different-node', 60_000);
      expect(count).toBe(0);
    });

    it('should not remove SIGNED duties', async () => {
      const { record } = await db.tryInsertOrGetExisting(defaultParams());
      await db.updateDutySigned(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DUTY_TYPE,
        SIGNATURE,
        record.lockToken,
        BLOCK_INDEX,
      );

      dateProvider.advanceTime(120);
      const count = await db.cleanupOwnStuckDuties(NODE_ID, 60_000);
      expect(count).toBe(0);
    });

    it('should not remove fresh SIGNING duties within maxAgeMs', async () => {
      await db.tryInsertOrGetExisting(defaultParams());

      dateProvider.advanceTime(30);
      const count = await db.cleanupOwnStuckDuties(NODE_ID, 60_000);
      expect(count).toBe(0);
    });

    it('should not remove stuck duties whose lock token is excluded', async () => {
      const { record } = await db.tryInsertOrGetExisting(defaultParams());

      dateProvider.advanceTime(120);
      const count = await db.cleanupOwnStuckDuties(NODE_ID, 60_000, [record.lockToken]);
      expect(count).toBe(0);

      // The in-flight row must survive, so re-inserting finds the existing record.
      const retry = await db.tryInsertOrGetExisting(defaultParams());
      expect(retry.isNew).toBe(false);
    });

    it('should remove stuck duties whose lock token is not in the exclude list', async () => {
      await db.tryInsertOrGetExisting(defaultParams());

      dateProvider.advanceTime(120);
      const count = await db.cleanupOwnStuckDuties(NODE_ID, 60_000, ['some-other-token']);
      expect(count).toBe(1);

      const retry = await db.tryInsertOrGetExisting(defaultParams());
      expect(retry.isNew).toBe(true);
    });
  });

  describe('cleanupOutdatedRollupDuties', () => {
    it('is always a no-op: rollup address changes are handled at startup by DatabaseVersionManager', async () => {
      await db.tryInsertOrGetExisting(defaultParams());

      const differentRollup = EthAddress.random();
      const count = await db.cleanupOutdatedRollupDuties(differentRollup);
      expect(count).toBe(0);
    });
  });

  describe('cleanupOldDuties', () => {
    it('should remove old SIGNED duties', async () => {
      const { record } = await db.tryInsertOrGetExisting(defaultParams());
      await db.updateDutySigned(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DUTY_TYPE,
        SIGNATURE,
        record.lockToken,
        BLOCK_INDEX,
      );

      dateProvider.advanceTime(120);
      const count = await db.cleanupOldDuties(60_000);
      expect(count).toBe(1);
    });

    it('should not remove SIGNING duties', async () => {
      await db.tryInsertOrGetExisting(defaultParams());

      dateProvider.advanceTime(120);
      const count = await db.cleanupOldDuties(60_000);
      expect(count).toBe(0);
    });

    it('should not remove fresh SIGNED duties within maxAgeMs', async () => {
      const { record } = await db.tryInsertOrGetExisting(defaultParams());
      await db.updateDutySigned(
        ROLLUP_ADDRESS,
        VALIDATOR_ADDRESS,
        SLOT,
        DUTY_TYPE,
        SIGNATURE,
        record.lockToken,
        BLOCK_INDEX,
      );

      dateProvider.advanceTime(30);
      const count = await db.cleanupOldDuties(60_000);
      expect(count).toBe(0);
    });
  });
});

/**
 * Restart-persistence tests.
 *
 * These tests verify the core motivation for the local LMDB slashing protection:
 * a sequencer that sends a block/checkpoint proposal and then restarts must NOT
 * send a duplicate proposal for the same slot.
 */
describe('LmdbSlashingProtectionDatabase - persistence across restarts', () => {
  const ROLLUP_ADDRESS = EthAddress.random();
  const VALIDATOR_ADDRESS = EthAddress.random();
  const SLOT = SlotNumber(100);
  const BLOCK_NUMBER = BlockNumber(50);
  const BLOCK_INDEX = IndexWithinCheckpoint(0);
  const DUTY_TYPE = DutyType.BLOCK_PROPOSAL;
  const MESSAGE_HASH = '0xdeadbeef';
  const NODE_ID = 'local';
  const SIGNATURE = '0xsignature';

  const defaultParams = () => ({
    rollupAddress: ROLLUP_ADDRESS,
    validatorAddress: VALIDATOR_ADDRESS,
    slot: SLOT,
    blockNumber: BLOCK_NUMBER,
    checkpointNumber: CheckpointNumber(1),
    blockIndexWithinCheckpoint: BLOCK_INDEX,
    dutyType: DUTY_TYPE,
    messageHash: MESSAGE_HASH,
    nodeId: NODE_ID,
  });

  let dataDir: string;
  let dateProvider: TestDateProvider;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'lmdb-slashing-restart-'));
    await mkdir(dataDir, { recursive: true });
    dateProvider = new TestDateProvider();
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  const openDb = async () => {
    const store = await openStoreAt(dataDir);
    return { store, db: new LmdbSlashingProtectionDatabase(store, dateProvider) };
  };

  it('should block duplicate block proposals after a node restart', async () => {
    // First run: node signs a block proposal and records it successfully.
    const { db: db1 } = await openDb();
    const { record } = await db1.tryInsertOrGetExisting(defaultParams());
    await db1.updateDutySigned(
      ROLLUP_ADDRESS,
      VALIDATOR_ADDRESS,
      SLOT,
      DUTY_TYPE,
      SIGNATURE,
      record.lockToken,
      BLOCK_INDEX,
    );
    await db1.close();

    // Restart: reopen the same store.
    const { db: db2 } = await openDb();
    try {
      const result = await db2.tryInsertOrGetExisting(defaultParams());

      // The existing SIGNED record is returned; the node must not sign again.
      expect(result.isNew).toBe(false);
      expect(result.record.status).toBe(DutyStatus.SIGNED);
      expect(result.record.signature).toBe(SIGNATURE);
    } finally {
      await db2.close();
    }
  });

  it('should allow re-signing after crash-cleanup of a stuck SIGNING duty', async () => {
    // First run: node starts signing but crashes before completing. The lockToken
    // held in memory is lost; the duty is left in SIGNING state on disk.
    const { db: db1 } = await openDb();
    await db1.tryInsertOrGetExisting(defaultParams());
    await db1.close(); // crash - lockToken is lost

    // Restart: the stuck SIGNING duty is visible on disk.
    dateProvider.advanceTime(120);
    const { db: db2 } = await openDb();
    try {
      const stuck = await db2.tryInsertOrGetExisting(defaultParams());
      expect(stuck.isNew).toBe(false);
      expect(stuck.record.status).toBe(DutyStatus.SIGNING);

      // On startup, the node cleans up its own stuck duties
      const cleaned = await db2.cleanupOwnStuckDuties(NODE_ID, 60_000);
      expect(cleaned).toBe(1);

      // The duty is gone; the node can now safely re-attempt the signing.
      const retry = await db2.tryInsertOrGetExisting(defaultParams());
      expect(retry.isNew).toBe(true);
    } finally {
      await db2.close();
    }
  });
});

describe('LmdbSlashingProtectionDatabase - schema migration', () => {
  const ROLLUP_ADDRESS = EthAddress.random();
  const VALIDATOR_ADDRESS = EthAddress.random();
  const SLOT = SlotNumber(100);
  const BLOCK_NUMBER = BlockNumber(50);
  const BLOCK_INDEX = IndexWithinCheckpoint(0);
  const DUTY_TYPE = DutyType.BLOCK_PROPOSAL;
  const MESSAGE_HASH = '0xdeadbeef';
  const NODE_ID = 'local';
  const SIGNATURE = '0xsignature';

  type StoredDutyRecordV1 = Omit<StoredDutyRecord, 'checkpointNumber'>;

  let dataDir: string;
  let dateProvider: TestDateProvider;

  const defaultParams = () => ({
    rollupAddress: ROLLUP_ADDRESS,
    validatorAddress: VALIDATOR_ADDRESS,
    slot: SLOT,
    blockNumber: BLOCK_NUMBER,
    checkpointNumber: CheckpointNumber(1),
    blockIndexWithinCheckpoint: BLOCK_INDEX,
    dutyType: DUTY_TYPE,
    messageHash: MESSAGE_HASH,
    nodeId: NODE_ID,
  });

  const createConfig = () => ({
    rollupAddress: ROLLUP_ADDRESS,
    nodeId: NODE_ID,
    pollingIntervalMs: 100,
    signingTimeoutMs: 3_000,
    dataDirectory: dataDir,
    dataStoreMapSizeKb: 1024 * 1024,
  });

  const seedSchemaVersion1Duty = async (record: StoredDutyRecordV1) => {
    const store = await createStore('signing-protection', 1, createConfig());
    const duties = store.openMap<string, StoredDutyRecordV1>('signing-protection-duties');
    await duties.set(
      `${record.rollupAddress}:${record.validatorAddress}:${record.slot}:${record.dutyType}:${record.blockIndexWithinCheckpoint}`,
      record,
    );
    await store.close();
  };

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'lmdb-slashing-migration-'));
    await mkdir(dataDir, { recursive: true });
    dateProvider = new TestDateProvider();
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  it('migrates schema 1 duty records without allowing duplicate signing', async () => {
    await seedSchemaVersion1Duty({
      rollupAddress: ROLLUP_ADDRESS.toString(),
      validatorAddress: VALIDATOR_ADDRESS.toString(),
      slot: SLOT.toString(),
      blockNumber: BLOCK_NUMBER.toString(),
      blockIndexWithinCheckpoint: BLOCK_INDEX,
      dutyType: DUTY_TYPE,
      status: DutyStatus.SIGNED,
      messageHash: MESSAGE_HASH,
      signature: SIGNATURE,
      nodeId: NODE_ID,
      lockToken: 'legacy-lock-token',
      startedAtMs: dateProvider.now(),
      completedAtMs: dateProvider.now(),
    });

    const { db } = await createLocalSignerWithProtection(createConfig(), { dateProvider });
    try {
      const result = await db.tryInsertOrGetExisting(defaultParams());

      expect(result.isNew).toBe(false);
      expect(result.record.status).toBe(DutyStatus.SIGNED);
      expect(result.record.signature).toBe(SIGNATURE);
      expect(result.record.checkpointNumber).toBe(CheckpointNumber(0));
    } finally {
      await db.close();
    }
  });

  it('fails closed instead of resetting when the stored schema is newer', async () => {
    const store = await createStore(
      'signing-protection',
      LmdbSlashingProtectionDatabase.SCHEMA_VERSION + 1,
      createConfig(),
    );
    await store.close();

    await expect(createLocalSignerWithProtection(createConfig(), { dateProvider })).rejects.toThrow(
      `stored schema version ${LmdbSlashingProtectionDatabase.SCHEMA_VERSION + 1} is incompatible with expected schema version ${LmdbSlashingProtectionDatabase.SCHEMA_VERSION}`,
    );
  });
});
