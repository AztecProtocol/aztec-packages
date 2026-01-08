import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { sleep } from '@aztec/foundation/sleep';

import { PGlite } from '@electric-sql/pglite';
import { Pool } from '@middle-management/pglite-pg-adapter';

import { PostgresSlashingProtectionDatabase } from './db/postgres.js';
import { setupTestSchema } from './db/test_helper.js';
import { DutyAlreadySignedError, SlashingProtectionError } from './errors.js';
import { SlashingProtectionService } from './slashing_protection_service.js';
import { type CheckAndRecordParams, DutyStatus, DutyType, type SlashingProtectionConfig } from './types.js';

// Test data constants
const VALIDATOR_ADDRESS = EthAddress.random();
const SLOT = 100n;
const BLOCK_NUMBER = 50n;
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
  let config: SlashingProtectionConfig;

  beforeEach(async () => {
    pglite = new PGlite();
    pool = new Pool({ pglite });

    await setupTestSchema(pglite);
    db = new PostgresSlashingProtectionDatabase(pool as any);
    await db.initialize();

    config = {
      enabled: true,
      nodeId: NODE_ID,
      pollingIntervalMs: 50,
      signingTimeoutMs: 1000,
      maxStuckDutiesAgeMs: 60_000,
    };
    service = new SlashingProtectionService(db, config);
  });

  afterEach(async () => {
    await service.stop();
    await pool.end();
  });

  describe('checkAndRecord', () => {
    it('should acquire lock on first attempt', async () => {
      const params: CheckAndRecordParams = {
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      // First node signs
      const lockToken = await service.checkAndRecord(params);
      await service.recordSuccess({
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      // First node signs
      const lockToken = await service.checkAndRecord(params);
      await service.recordSuccess({
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      // First node acquires lock then deletes (simulating failure)
      const lockToken = await service.checkAndRecord(params);
      await service.deleteDuty({
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      // First node acquires lock
      const lockToken = await service.checkAndRecord(params);

      // First node deletes on failure
      await service.deleteDuty({
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
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
      const shortTimeoutConfig = { ...config, signingTimeoutMs: 200 };
      const serviceWithShortTimeout = new SlashingProtectionService(db, shortTimeoutConfig);

      try {
        const params: CheckAndRecordParams = {
          validatorAddress: VALIDATOR_ADDRESS,
          slot: SLOT,
          blockNumber: BLOCK_NUMBER,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      const lockToken = await service.checkAndRecord(params);
      const success = await service.recordSuccess({
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      await service.checkAndRecord(params);
      const success = await service.recordSuccess({
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      const lockToken = await service.checkAndRecord(params);
      const success = await service.deleteDuty({
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      await service.checkAndRecord(params);
      const success = await service.deleteDuty({
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
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
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
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
          validatorAddress: VALIDATOR_ADDRESS,
          slot: BigInt(100 + i),
          blockNumber: BigInt(50 + i),
          dutyType: DUTY_TYPE,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
        };
        promises.push(service.checkAndRecord(params));
      }

      await Promise.all(promises);

      // Verify all duties were created
      for (let i = 0; i < 5; i++) {
        const result = await db.tryInsertOrGetExisting({
          validatorAddress: VALIDATOR_ADDRESS,
          slot: BigInt(100 + i),
          blockNumber: BigInt(50 + i),
          dutyType: DUTY_TYPE,
          messageHash: MESSAGE_HASH,
          nodeId: NODE_ID,
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
      service.start();
      await service.stop();
    });

    it('should cleanup stuck duties on start', async () => {
      // Create a stuck duty by directly inserting (simulating a crash)
      const params: CheckAndRecordParams = {
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SLOT,
        blockNumber: BLOCK_NUMBER,
        dutyType: DUTY_TYPE,
        messageHash: MESSAGE_HASH,
        nodeId: NODE_ID,
      };

      // Insert a duty that will be "stuck"
      await service.checkAndRecord(params);

      // Verify duty exists and is in signing state
      let result = await db.tryInsertOrGetExisting(params);
      expect(result.isNew).toBe(false);
      expect(result.record.status).toBe(DutyStatus.SIGNING);

      // Create a new service with a very short maxStuckDutiesAgeMs
      const shortAgeConfig = { ...config, maxStuckDutiesAgeMs: 1 };
      const newService = new SlashingProtectionService(db, shortAgeConfig);

      // Wait a bit for the duty to become "old"
      await sleep(10);

      // Start the new service - this should trigger immediate cleanup
      newService.start();

      // Give cleanup time to run
      await sleep(100);

      await newService.stop();

      // Now the duty should be deleted, so we can insert again
      result = await db.tryInsertOrGetExisting(params);
      expect(result.isNew).toBe(true);
    });
  });
});
