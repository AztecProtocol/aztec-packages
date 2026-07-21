import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';
import { type BaseSignerConfig, DutyType } from '@aztec/stdlib/ha-signing';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { PGlite } from '@electric-sql/pglite';
import { jest } from '@jest/globals';

import { PostgresSlashingProtectionDatabase } from './db/postgres.js';
import { setupTestSchema } from './db/test_helper.js';
import { DutyStatus } from './db/types.js';
import { DutyAlreadySignedError, SlashingProtectionError } from './errors.js';
import { HASignerMetrics } from './metrics.js';
import { SlashingProtectionService } from './slashing_protection_service.js';
import { Pool } from './test/pglite_pool.js';
import type { CheckAndRecordParams } from './types.js';

// Test data constants
const ROLLUP_ADDRESS = EthAddress.random();
const VALIDATOR_ADDRESS = EthAddress.random();
const SLOT = SlotNumber(100);
const BLOCK_NUMBER = BlockNumber(50);
const CHECKPOINT_NUMBER = CheckpointNumber(1);
const BLOCK_INDEX_WITHIN_CHECKPOINT = IndexWithinCheckpoint(0);
const DUTY_TYPE: DutyType = DutyType.BLOCK_PROPOSAL;
const MESSAGE_HASH = Buffer32.random().toString();
const MESSAGE_HASH_2 = Buffer32.random().toString();
const NODE_ID = 'node-1';
const NODE_ID_2 = 'node-2';
const SIGNATURE = '0xsignature';

describe('SlashingProtectionService', () => {
  let pglite: PGlite;
  let pool: Pool;
  let db: PostgresSlashingProtectionDatabase;
  let service: SlashingProtectionService;
  let config: BaseSignerConfig;
  let dateProvider: TestDateProvider;
  const telemetryClient = getTelemetryClient();

  beforeEach(async () => {
    pglite = new PGlite();
    pool = new Pool({ pglite });

    await setupTestSchema(pglite);
    db = new PostgresSlashingProtectionDatabase(pool);
    await db.initialize();

    dateProvider = new TestDateProvider();

    config = {
      rollupAddress: ROLLUP_ADDRESS,
      nodeId: NODE_ID,
      pollingIntervalMs: 50,
      peerSigningTimeoutMs: 1000,
      maxStuckDutiesAgeMs: 60_000,
    };
    const metrics = new HASignerMetrics(telemetryClient, NODE_ID);
    service = new SlashingProtectionService(db, config, { metrics, dateProvider });
  });

  afterEach(async () => {
    await service.stop();
    await pool.end();
  });

  describe('checkAndRecord', () => {
    it('should acquire lock on first attempt', async () => {
      const params: CheckAndRecordParams = {
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      await service.checkAndRecord(params);

      // Verify via tryInsertOrGetExisting - should return the existing record
      const result = await db.tryInsertOrGetExisting(params);
      expect(result.isNew).toBe(false); // Already exists
      expect(result.record.status).toBe(DutyStatus.SIGNING);
      expect(result.record.nodeId).toBe(NODE_ID);
      expect(result.record.messageHash).toBe(MESSAGE_HASH);
    });

    it('should throw DutyAlreadySignedError when duty already signed with same data', async () => {
      const params: CheckAndRecordParams = {
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      // First node signs
      const lockToken = await service.checkAndRecord(params);
      await service.recordSuccess({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        signature: { toString: () => SIGNATURE } as any,
        nodeId: NODE_ID,
        lockToken,
      });

      // Second node tries to sign same data
      const params2 = { ...params, nodeId: NODE_ID_2 };
      await expect(service.checkAndRecord(params2)).rejects.toThrow(DutyAlreadySignedError);
    });

    it('should throw SlashingProtectionError when duty already signed with different data', async () => {
      const params: CheckAndRecordParams = {
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      // First node signs
      const lockToken = await service.checkAndRecord(params);
      await service.recordSuccess({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        signature: { toString: () => SIGNATURE } as any,
        nodeId: NODE_ID,
        lockToken,
      });

      // Second node tries to sign different data
      const params2 = { ...params, messageHash: MESSAGE_HASH_2, nodeId: NODE_ID_2 };
      await expect(service.checkAndRecord(params2)).rejects.toThrow(SlashingProtectionError);
    });

    it('should allow retry after deleted duty', async () => {
      const params: CheckAndRecordParams = {
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      // First node acquires lock then deletes (simulating failure)
      const lockToken = await service.checkAndRecord(params);
      await service.deleteDuty({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        lockToken,
      });

      // Second node should be able to retry
      const params2 = { ...params, nodeId: NODE_ID_2 };
      await service.checkAndRecord(params2);

      const result = await db.tryInsertOrGetExisting(params2);
      expect(result.isNew).toBe(false);
      expect(result.record.status).toBe(DutyStatus.SIGNING);
      expect(result.record.nodeId).toBe(NODE_ID_2);
    });

    it('should wait and throw when another node is signing same data', async () => {
      const params: CheckAndRecordParams = {
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      // First node acquires lock
      const lockToken = await service.checkAndRecord(params);

      // Second node tries to acquire lock
      const params2 = { ...params, nodeId: NODE_ID_2 };
      const promise = service.checkAndRecord(params2);

      // Complete first node's signing after a short delay
      await sleep(100);
      await service.recordSuccess({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        signature: { toString: () => SIGNATURE } as any,
        nodeId: NODE_ID,
        lockToken,
      });

      // Second node should get DutyAlreadySignedError
      await expect(promise).rejects.toThrow(DutyAlreadySignedError);
    });

    it('should wait and throw when another node is signing different data', async () => {
      const params: CheckAndRecordParams = {
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      // First node acquires lock
      const lockToken = await service.checkAndRecord(params);

      // Second node tries to acquire lock with different data
      const params2 = { ...params, messageHash: MESSAGE_HASH_2, nodeId: NODE_ID_2 };
      const promise = service.checkAndRecord(params2);

      // Complete first node's signing after a short delay
      await sleep(100);
      await service.recordSuccess({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        signature: { toString: () => SIGNATURE } as any,
        nodeId: NODE_ID,
        lockToken,
      });

      // Second node should get SlashingProtectionError
      await expect(promise).rejects.toThrow(SlashingProtectionError);
    });

    it('should acquire lock after other node deletes duty on failure', async () => {
      const params: CheckAndRecordParams = {
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      // First node acquires lock
      const lockToken = await service.checkAndRecord(params);

      // First node deletes on failure
      await service.deleteDuty({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        lockToken,
      });

      // Second node should be able to acquire the lock (retry)
      const params2 = { ...params, nodeId: NODE_ID_2 };
      await service.checkAndRecord(params2);

      // Verify second node acquired the lock
      const result = await db.tryInsertOrGetExisting(params2);
      expect(result.isNew).toBe(false);
      expect(result.record.status).toBe(DutyStatus.SIGNING);
      expect(result.record.nodeId).toBe(NODE_ID_2);
    });

    it('should timeout if signing takes too long', async () => {
      const shortTimeoutConfig = { ...config, peerSigningTimeoutMs: 200 };
      const serviceWithShortTimeout = new SlashingProtectionService(db, shortTimeoutConfig, {
        metrics: new HASignerMetrics(telemetryClient, shortTimeoutConfig.nodeId),
        dateProvider,
      });

      try {
        const params: CheckAndRecordParams = {
          rollupAddress: ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SLOT,
          blockNumber: BLOCK_NUMBER,
          checkpointNumber: CHECKPOINT_NUMBER,
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
        };

        // First node acquires lock but never completes
        await serviceWithShortTimeout.checkAndRecord(params);

        // Second node tries to acquire lock
        const params2 = { ...params, nodeId: NODE_ID_2 };
        await expect(serviceWithShortTimeout.checkAndRecord(params2)).rejects.toThrow(DutyAlreadySignedError);
      } finally {
        await serviceWithShortTimeout.stop();
      }
    });
  });

  describe('recordSuccess', () => {
    it('should update duty to signed status', async () => {
      const params: CheckAndRecordParams = {
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      const lockToken = await service.checkAndRecord(params);
      const success = await service.recordSuccess({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        signature: { toString: () => SIGNATURE } as any,
        nodeId: NODE_ID,
        lockToken,
      });

      expect(success).toBe(true);
      const result = await db.tryInsertOrGetExisting(params);
      expect(result.isNew).toBe(false);
      expect(result.record.status).toBe(DutyStatus.SIGNED);
      expect(result.record.signature).toBe(SIGNATURE);
      expect(result.record.completedAt).toBeDefined();
    });

    it('should fail to update with wrong lockToken', async () => {
      const params: CheckAndRecordParams = {
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      await service.checkAndRecord(params);
      const success = await service.recordSuccess({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        signature: { toString: () => SIGNATURE } as any,
        nodeId: NODE_ID,
        lockToken: 'wrong-token',
      });

      expect(success).toBe(false);
      // Duty should still be in signing state
      const result = await db.tryInsertOrGetExisting(params);
      expect(result.record.status).toBe(DutyStatus.SIGNING);
    });
  });

  describe('deleteDuty', () => {
    it('should delete duty with correct lockToken', async () => {
      const params: CheckAndRecordParams = {
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      const lockToken = await service.checkAndRecord(params);
      const success = await service.deleteDuty({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        lockToken,
      });

      expect(success).toBe(true);
      // Duty should be gone - new insert should succeed
      const result = await db.tryInsertOrGetExisting(params);
      expect(result.isNew).toBe(true);
    });

    it('should fail to delete with wrong lockToken', async () => {
      const params: CheckAndRecordParams = {
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      await service.checkAndRecord(params);
      const success = await service.deleteDuty({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        lockToken: 'wrong-token',
      });

      expect(success).toBe(false);
      // Duty should still be in signing state
      const result = await db.tryInsertOrGetExisting(params);
      expect(result.record.status).toBe(DutyStatus.SIGNING);
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple nodes competing for the same duty', async () => {
      const params1: CheckAndRecordParams = {
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: 'node-1',
      };
      const params2 = { ...params1, nodeId: 'node-2' };
      const params3 = { ...params1, nodeId: 'node-3' };

      // All three nodes try to acquire lock simultaneously
      const promises = [params1, params2, params3].map(params =>
        service.checkAndRecord(params).then(lockToken => ({ nodeId: params.nodeId, lockToken })),
      );

      // Whichever resolves first is the actual winner
      const winner = await Promise.race(promises);
      await service.recordSuccess({
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        signature: { toString: () => SIGNATURE } as any,
        nodeId: winner.nodeId,
        lockToken: winner.lockToken,
      });

      // Wait for all promises to complete
      const results = await Promise.allSettled(promises);

      // Exactly one should succeed
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected').length;

      expect(successes).toBe(1);
      expect(failures).toBe(2);

      // Both failures should be DutyAlreadySignedError
      results.forEach(result => {
        if (result.status === 'rejected') {
          expect(result.reason).toBeInstanceOf(DutyAlreadySignedError);
        }
      });
    });

    it('should handle multiple different duties concurrently', async () => {
      const promises = [];

      for (let i = 0; i < 5; i++) {
        const params: CheckAndRecordParams = {
          rollupAddress: ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CHECKPOINT_NUMBER,
          dutyType: DUTY_TYPE,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(i),
        };
        promises.push(service.checkAndRecord(params));
      }

      await Promise.all(promises);

      // Verify all duties were created
      for (let i = 0; i < 5; i++) {
        const result = await db.tryInsertOrGetExisting({
          rollupAddress: ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CHECKPOINT_NUMBER,
          dutyType: DUTY_TYPE,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(i),
        });
        expect(result.isNew).toBe(false);
        expect(result.record.status).toBe(DutyStatus.SIGNING);
        expect(result.record.nodeId).toBe(NODE_ID);
      }
    });
  });

  describe('nodeId', () => {
    it('should return the configured node ID', () => {
      expect(service.nodeId).toBe(NODE_ID);
    });
  });

  describe('lifecycle', () => {
    it('should start and stop without error', async () => {
      await service.start();
      await service.stop();
    });

    it('should cleanup stuck duties on start', async () => {
      // Create a stuck duty by directly inserting (simulating a crash)
      const params: CheckAndRecordParams = {
        rollupAddress: ROLLUP_ADDRESS,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
      };

      // Insert a duty that will be "stuck"
      await service.checkAndRecord(params);

      // Verify duty exists and is in signing state
      let result = await db.tryInsertOrGetExisting(params);
      expect(result.isNew).toBe(false);
      expect(result.record.status).toBe(DutyStatus.SIGNING);

      // Advance time to make the duty "stuck" (older than threshold)
      dateProvider.advanceTime(1); // Advance 1 second to make duty exceed maxStuckDutiesAgeMs

      // Create a new service with a very short maxStuckDutiesAgeMs
      const shortAgeConfig = { ...config, maxStuckDutiesAgeMs: 1 };
      const newService = new SlashingProtectionService(db, shortAgeConfig, {
        metrics: new HASignerMetrics(telemetryClient, shortAgeConfig.nodeId),
        dateProvider,
      });

      // Start the new service - this should trigger immediate cleanup
      await newService.start();

      // Give cleanup time to run
      await sleep(100);

      await newService.stop();

      // Now the duty should be deleted, so we can insert again
      result = await db.tryInsertOrGetExisting(params);
      expect(result.isNew).toBe(true);
    });
  });

  describe('Rollup Upgrade Scenarios', () => {
    it('should allow same slot/duty for different rollup addresses', async () => {
      const rollupAddress1 = EthAddress.random();
      const rollupAddress2 = EthAddress.random();

      const service1 = new SlashingProtectionService(
        db,
        {
          ...config,
          rollupAddress: rollupAddress1,
        },
        { metrics: new HASignerMetrics(telemetryClient, config.nodeId), dateProvider },
      );
      const service2 = new SlashingProtectionService(
        db,
        {
          ...config,
          rollupAddress: rollupAddress2,
        },
        { metrics: new HASignerMetrics(telemetryClient, config.nodeId), dateProvider },
      );

      // Sign same slots for both rollups (e.g. rollup upgrade: slots reset, same slot numbers reused)
      for (let slotNum = 1; slotNum <= 5; slotNum++) {
        const params1: CheckAndRecordParams = {
          rollupAddress: rollupAddress1,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SlotNumber(slotNum),
          blockNumber: BlockNumber(slotNum),
          checkpointNumber: CHECKPOINT_NUMBER,
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
        };

        const lockToken1 = await service1.checkAndRecord(params1);
        await service1.recordSuccess({
          rollupAddress: rollupAddress1,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SlotNumber(slotNum),
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          signature: { toString: () => SIGNATURE } as any,
          nodeId: NODE_ID,
          lockToken: lockToken1,
        });

        const params2 = { ...params1, rollupAddress: rollupAddress2 };
        const lockToken2 = await service2.checkAndRecord(params2);
        await service2.recordSuccess({
          rollupAddress: rollupAddress2,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SlotNumber(slotNum),
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          signature: { toString: () => SIGNATURE } as any,
          nodeId: NODE_ID,
          lockToken: lockToken2,
        });
      }

      // Both rollups should have records for each slot
      const paramsForSlot1Rollup1: CheckAndRecordParams = {
        rollupAddress: rollupAddress1,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SlotNumber(1),
        blockNumber: BlockNumber(1),
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };
      const paramsForSlot1Rollup2: CheckAndRecordParams = {
        ...paramsForSlot1Rollup1,
        rollupAddress: rollupAddress2,
      };
      const result1 = await db.tryInsertOrGetExisting(paramsForSlot1Rollup1);
      const result2 = await db.tryInsertOrGetExisting(paramsForSlot1Rollup2);
      expect(result1.isNew).toBe(false);
      expect(result2.isNew).toBe(false);
      expect(result1.record.rollupAddress).toEqual(rollupAddress1);
      expect(result2.record.rollupAddress).toEqual(rollupAddress2);
    });

    it('should handle multiple validators across rollup upgrade', async () => {
      const oldRollupAddress = EthAddress.random();
      const newRollupAddress = EthAddress.random();
      const validator1 = EthAddress.random();
      const validator2 = EthAddress.random();
      const validator3 = EthAddress.random();
      const validators = [validator1, validator2, validator3];

      const oldService = new SlashingProtectionService(
        db,
        {
          ...config,
          rollupAddress: oldRollupAddress,
        },
        { metrics: new HASignerMetrics(telemetryClient, config.nodeId), dateProvider },
      );
      const newService = new SlashingProtectionService(
        db,
        {
          ...config,
          rollupAddress: newRollupAddress,
        },
        { metrics: new HASignerMetrics(telemetryClient, config.nodeId), dateProvider },
      );

      // Old rollup: all validators sign slot 100
      for (const validator of validators) {
        const params: CheckAndRecordParams = {
          rollupAddress: oldRollupAddress,
          validatorAddress: validator,
          slot: SLOT,
          blockNumber: BLOCK_NUMBER,
          checkpointNumber: CHECKPOINT_NUMBER,
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
        };

        const lockToken = await oldService.checkAndRecord(params);
        await oldService.recordSuccess({
          rollupAddress: oldRollupAddress,
          validatorAddress: validator,
          slot: SLOT,
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          signature: { toString: () => SIGNATURE } as any,
          nodeId: NODE_ID,
          lockToken,
        });
      }

      // New rollup: all validators should be able to sign slot 100 again
      for (const validator of validators) {
        const params: CheckAndRecordParams = {
          rollupAddress: newRollupAddress,
          validatorAddress: validator,
          slot: SLOT, // Same slot!
          blockNumber: BLOCK_NUMBER,
          checkpointNumber: CHECKPOINT_NUMBER,
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
        };

        const lockToken = await newService.checkAndRecord(params);
        await newService.recordSuccess({
          rollupAddress: newRollupAddress,
          validatorAddress: validator,
          slot: SLOT,
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          signature: { toString: () => SIGNATURE } as any,
          nodeId: NODE_ID,
          lockToken,
        });

        const result = await db.tryInsertOrGetExisting(params);
        expect(result.isNew).toBe(false);
        expect(result.record.rollupAddress).toEqual(newRollupAddress);
      }
    });

    it('should prevent cross-rollup duty deletion/update', async () => {
      const rollupAddress1 = EthAddress.random();
      const rollupAddress2 = EthAddress.random();

      const service1 = new SlashingProtectionService(
        db,
        {
          ...config,
          rollupAddress: rollupAddress1,
        },
        { metrics: new HASignerMetrics(telemetryClient, config.nodeId), dateProvider },
      );

      const params: CheckAndRecordParams = {
        rollupAddress: rollupAddress1,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };
      const params2: CheckAndRecordParams = {
        rollupAddress: rollupAddress2,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        checkpointNumber: CHECKPOINT_NUMBER,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      // Create duty for rollup1
      const lockToken1 = await service1.checkAndRecord(params);
      // Create duty for rollup2 (same slot/validator is allowed across rollups)
      const lockToken2 = await service1.checkAndRecord(params2);

      // Try to delete rollup1 duty using rollup2 address - should fail
      const deleted = await service1.deleteDuty({
        rollupAddress: rollupAddress2, // Wrong rollup!
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        lockToken: lockToken1,
      });

      expect(deleted).toBe(false);

      // Duty should still exist for rollup1
      const result = await db.tryInsertOrGetExisting(params);
      expect(result.isNew).toBe(false);
      expect(result.record.status).toBe(DutyStatus.SIGNING);

      // Duty for rollup2 should still exist
      const result2 = await db.tryInsertOrGetExisting(params2);
      expect(result2.isNew).toBe(false);
      expect(result2.record.status).toBe(DutyStatus.SIGNING);

      // Delete rollup1 duty with correct rollup address should succeed
      const deletedCorrect = await service1.deleteDuty({
        rollupAddress: rollupAddress1,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        lockToken: lockToken1,
      });
      expect(deletedCorrect).toBe(true);

      // Delete rollup2 duty with correct rollup address should succeed
      const deletedCorrect2 = await service1.deleteDuty({
        rollupAddress: rollupAddress2,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
        dutyType: DUTY_TYPE,
        lockToken: lockToken2,
      });
      expect(deletedCorrect2).toBe(true);
    });
  });

  describe('cleanup methods', () => {
    describe('cleanupOutdatedRollupDuties', () => {
      it('cleans up outdated rollup duties at startup', async () => {
        const oldRollupAddress = EthAddress.random();
        const newRollupAddress = EthAddress.random();

        // Create duties for old rollup
        for (let i = 0; i < 3; i++) {
          const params: CheckAndRecordParams = {
            rollupAddress: oldRollupAddress,
            validatorAddress: VALIDATOR_ADDRESS,
            slot: SlotNumber(100 + i),
            blockNumber: BlockNumber(50 + i),
            checkpointNumber: CHECKPOINT_NUMBER,
            blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
            dutyType: DUTY_TYPE,
            messageHash: MESSAGE_HASH,
            nodeId: NODE_ID,
          };
          await service.checkAndRecord(params);
        }

        // Create duties for new rollup
        for (let i = 0; i < 2; i++) {
          const params: CheckAndRecordParams = {
            rollupAddress: newRollupAddress,
            validatorAddress: VALIDATOR_ADDRESS,
            slot: SlotNumber(200 + i),
            blockNumber: BlockNumber(150 + i),
            checkpointNumber: CHECKPOINT_NUMBER,
            blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
            dutyType: DUTY_TYPE,
            messageHash: MESSAGE_HASH,
            nodeId: NODE_ID,
          };
          await service.checkAndRecord(params);
        }

        // Create a new service with the new rollup address.
        // Use default maxStuckDutiesAgeMs so background cleanup does not remove the new rollup duties
        // (they are in 'signing' and would be treated as stuck if maxStuckDutiesAgeMs were 1ms).
        const newService = new SlashingProtectionService(
          db,
          {
            ...config,
            rollupAddress: newRollupAddress,
          },
          { metrics: new HASignerMetrics(telemetryClient, config.nodeId), dateProvider },
        );

        // Start the service - this should trigger cleanup at startup
        await newService.start();
        await newService.stop();

        // Old rollup duties should be gone
        for (let i = 0; i < 3; i++) {
          const params: CheckAndRecordParams = {
            rollupAddress: oldRollupAddress,
            validatorAddress: VALIDATOR_ADDRESS,
            slot: SlotNumber(100 + i),
            blockNumber: BlockNumber(50 + i),
            checkpointNumber: CHECKPOINT_NUMBER,
            blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
            dutyType: DUTY_TYPE,
            messageHash: MESSAGE_HASH,
            nodeId: NODE_ID,
          };
          const result = await db.tryInsertOrGetExisting(params);
          expect(result.isNew).toBe(true);
        }

        // New rollup duties should still exist
        for (let i = 0; i < 2; i++) {
          const params: CheckAndRecordParams = {
            rollupAddress: newRollupAddress,
            validatorAddress: VALIDATOR_ADDRESS,
            slot: SlotNumber(200 + i),
            blockNumber: BlockNumber(150 + i),
            checkpointNumber: CHECKPOINT_NUMBER,
            blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
            dutyType: DUTY_TYPE,
            messageHash: MESSAGE_HASH,
            nodeId: NODE_ID,
          };
          const result = await db.tryInsertOrGetExisting(params);
          expect(result.isNew).toBe(false);
        }
      });
    });

    describe('cleanupOldDuties', () => {
      it('should only clean up old signed duties', async () => {
        // Insert some old signed duties directly
        // Use dateProvider to create timestamp 1 hour in the past
        const oldStartedAt = new Date(dateProvider.now() - 60 * 60 * 1000);
        for (let i = 0; i < 3; i++) {
          await pool.query(
            `INSERT INTO validator_duties (
               rollup_address,
               validator_address,
               slot,
               block_number,
               block_index_within_checkpoint,
               duty_type,
               status,
               message_hash,
               signature,
               node_id,
               lock_token,
               started_at,
               completed_at
             ) VALUES ($1, $2, $3, $4, $5, $6, 'signed', $7, $8, $9, $10, $11, $12)`,
            [
              ROLLUP_ADDRESS.toString(),
              VALIDATOR_ADDRESS.toString(),
              SlotNumber(100 + i),
              BlockNumber(50 + i),
              BLOCK_INDEX_WITHIN_CHECKPOINT,
              DUTY_TYPE,
              MESSAGE_HASH,
              SIGNATURE,
              NODE_ID,
              `lock-${i}`,
              oldStartedAt,
              oldStartedAt,
            ],
          );
        }

        // Create a recent signed duty
        const recentParams: CheckAndRecordParams = {
          rollupAddress: ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SlotNumber(1000),
          blockNumber: BlockNumber(900),
          checkpointNumber: CHECKPOINT_NUMBER,
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
        };
        const recentLockToken = await service.checkAndRecord(recentParams);
        await service.recordSuccess({
          rollupAddress: ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SlotNumber(1000),
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          signature: { toString: () => SIGNATURE } as any,
          nodeId: NODE_ID,
          lockToken: recentLockToken,
        });

        // Create a duty in signing status (not completed)
        const signingParams: CheckAndRecordParams = {
          rollupAddress: ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SlotNumber(500),
          blockNumber: BlockNumber(250),
          checkpointNumber: CHECKPOINT_NUMBER,
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
        };
        await service.checkAndRecord(signingParams);

        // Run cleanup via the service (old signed duties should be deleted)
        const cleanupService = new SlashingProtectionService(
          db,
          {
            ...config,
            cleanupOldDutiesAfterHours: 0.5, // 30 minutes
          },
          { metrics: new HASignerMetrics(telemetryClient, config.nodeId), dateProvider },
        );
        await cleanupService.start();
        await sleep(50);
        await cleanupService.stop();

        // Verify old signed duties are gone
        for (let i = 0; i < 3; i++) {
          const params: CheckAndRecordParams = {
            rollupAddress: ROLLUP_ADDRESS,
            validatorAddress: VALIDATOR_ADDRESS,
            slot: SlotNumber(100 + i),
            blockNumber: BlockNumber(50 + i),
            checkpointNumber: CHECKPOINT_NUMBER,
            blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
            dutyType: DUTY_TYPE,
            messageHash: MESSAGE_HASH,
            nodeId: NODE_ID,
          };
          const result = await db.tryInsertOrGetExisting(params);
          expect(result.isNew).toBe(true);
        }

        // Verify recent signed duty still exists
        const recentResult = await db.tryInsertOrGetExisting(recentParams);
        expect(recentResult.isNew).toBe(false);

        // Verify signing duty still exists and is still signing
        const signingResult = await db.tryInsertOrGetExisting(signingParams);
        expect(signingResult.isNew).toBe(false);
        expect(signingResult.record.status).toBe(DutyStatus.SIGNING);
      });

      it('should be called during cleanup cycle when configured', async () => {
        // Create and sign a duty at current time
        const params: CheckAndRecordParams = {
          rollupAddress: ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SLOT,
          blockNumber: BLOCK_NUMBER,
          checkpointNumber: CHECKPOINT_NUMBER,
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
        };
        const lockToken = await service.checkAndRecord(params);
        await service.recordSuccess({
          rollupAddress: ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SLOT,
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          signature: { toString: () => SIGNATURE } as any,
          nodeId: NODE_ID,
          lockToken,
        });

        // Advance time to make the duty "old" (older than cleanup threshold)
        dateProvider.advanceTime(1); // Advance 10 seconds to ensure duty is old enough

        // Create a new service with cleanupOldDutiesAfterHours configured
        const newService = new SlashingProtectionService(
          db,
          {
            ...config,
            maxStuckDutiesAgeMs: 1,
            cleanupOldDutiesAfterHours: 0.000001, // ~3.6ms
          },
          { metrics: new HASignerMetrics(telemetryClient, config.nodeId), dateProvider },
        );

        // Start the service - this should trigger cleanup
        await newService.start();
        await sleep(100);
        await newService.stop();

        // Duty should be gone
        const result = await db.tryInsertOrGetExisting(params);
        expect(result.isNew).toBe(true);
      });

      it('should not run cleanupOldDuties more often than its max age', async () => {
        const cleanupSpy = jest.spyOn(db, 'cleanupOldDuties');

        const newService = new SlashingProtectionService(
          db,
          {
            ...config,
            maxStuckDutiesAgeMs: 1,
            cleanupOldDutiesAfterHours: 0.001, // ~3.6s
          },
          { metrics: new HASignerMetrics(telemetryClient, config.nodeId), dateProvider },
        );

        await newService.start();
        await sleep(50); // allow multiple cleanup cycles
        await newService.stop();

        expect(cleanupSpy).toHaveBeenCalledTimes(1);
      });

      it('should not cleanup when cleanupOldDutiesAfterHours is not configured', async () => {
        // Create a duty
        const params: CheckAndRecordParams = {
          rollupAddress: ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SLOT,
          blockNumber: BLOCK_NUMBER,
          checkpointNumber: CHECKPOINT_NUMBER,
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
        };
        await service.checkAndRecord(params);

        // Advance time to make duty old enough for stuck duty cleanup
        dateProvider.advanceTime(100); // Advance time to exceed maxStuckDutiesAgeMs

        // Create a new service without cleanupOldDutiesAfterHours configured
        const newService = new SlashingProtectionService(
          db,
          {
            ...config,
            maxStuckDutiesAgeMs: 1,
            // cleanupOldDutiesAfterHours is undefined
          },
          { metrics: new HASignerMetrics(telemetryClient, config.nodeId), dateProvider },
        );

        // Start the service
        await newService.start();
        await sleep(100);
        await newService.stop();

        // Duty should still exist (not cleaned up by old duties cleanup)
        // But it should be cleaned up by stuck duties cleanup since maxStuckDutiesAgeMs is 1ms
        const result = await db.tryInsertOrGetExisting(params);
        expect(result.isNew).toBe(true); // Cleaned by stuck duties cleanup
      });

      it('should use TestDateProvider for time-based comparisons', async () => {
        // This test demonstrates that TestDateProvider is used for age calculations
        // Set initial time
        const initialTime = dateProvider.now();

        // Create a duty
        const dutyParams: CheckAndRecordParams = {
          rollupAddress: ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CHECKPOINT_NUMBER,
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
        };

        const lockToken = await service.checkAndRecord(dutyParams);

        // Advance time past the signing timeout
        dateProvider.advanceTime(config.peerSigningTimeoutMs / 1000 + 1);

        // Verify time has advanced
        expect(dateProvider.now()).toBeGreaterThan(initialTime + config.peerSigningTimeoutMs);

        // Complete the duty
        await service.recordSuccess({
          rollupAddress: ROLLUP_ADDRESS,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SlotNumber(100),
          blockIndexWithinCheckpoint: BLOCK_INDEX_WITHIN_CHECKPOINT,
          dutyType: DUTY_TYPE,
          signature: { toString: () => SIGNATURE } as any,
          nodeId: NODE_ID,
          lockToken,
        });

        // Verify duty exists and is signed
        const result = await db.tryInsertOrGetExisting(dutyParams);
        expect(result.isNew).toBe(false);
        expect(result.record.status).toBe(DutyStatus.SIGNED);
      });
    });
  });
});
