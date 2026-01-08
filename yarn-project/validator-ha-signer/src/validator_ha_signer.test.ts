import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { sleep } from '@aztec/foundation/sleep';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Pool } from '@middle-management/pglite-pg-adapter';

import { type CreateHASignerConfig, defaultSlashingProtectionConfig } from './config.js';
import { PostgresSlashingProtectionDatabase } from './db/postgres.js';
import { setupTestSchema } from './db/test_helper.js';
import { DutyStatus, DutyType } from './db/types.js';
import { DutyAlreadySignedError, SlashingProtectionError } from './errors.js';
import { ValidatorHASigner } from './validator_ha_signer.js';

// Test data constants
const VALIDATOR_ADDRESS = EthAddress.random();
const MESSAGE_HASH = Buffer32.random();
const MESSAGE_HASH_2 = Buffer32.random();
const NODE_ID = 'test-node-1';
const SIGNATURE_STRING = '0xsignature123';

// Mock signature
const mockSignature = {
  toString: () => SIGNATURE_STRING,
} as unknown as Signature;

describe('ValidatorHASigner', () => {
  let pglite: PGlite;
  let pool: Pool;
  let db: PostgresSlashingProtectionDatabase;
  let config: CreateHASignerConfig;

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
      databaseUrl: 'postgresql://user:pass@localhost:5432/testdb',
    };
  });

  afterEach(async () => {
    await pool.end();
  });

  describe('initialization', () => {
    it('should initialize with slashing protection enabled', () => {
      const signer = new ValidatorHASigner(db, config);
      expect(signer.isEnabled).toBe(true);
      expect(signer.nodeId).toBe(NODE_ID);
    });

    it('should not initialize when nodeId is not explicitly set', () => {
      const defaultConfig = { ...defaultSlashingProtectionConfig };
      expect(
        () =>
          new ValidatorHASigner(db, { ...defaultConfig, databaseUrl: 'postgresql://user:pass@localhost:5432/testdb' }),
      ).toThrow('NODE_ID is required for high-availability setups');
    });

    it('should not initialize when enabled is false', () => {
      const disabledConfig = { ...config, enabled: false };
      expect(() => new ValidatorHASigner(db, disabledConfig)).toThrow('Validator HA Signer is not enabled in config');
    });
  });

  describe('lifecycle', () => {
    it('should start and stop without error when enabled', async () => {
      const signer = new ValidatorHASigner(db, config);
      signer.start();
      await signer.stop();
    });
  });

  describe('signWithProtection - enabled', () => {
    let signer: ValidatorHASigner;
    let signFn: jest.Mock<(messageHash: Buffer32) => Promise<Signature>>;

    beforeEach(() => {
      signer = new ValidatorHASigner(db, config);
      signer.start();
      signFn = jest.fn<(messageHash: Buffer32) => Promise<Signature>>();
      signFn.mockResolvedValue(mockSignature);
    });

    afterEach(async () => {
      await signer.stop();
    });

    it('should sign successfully on first attempt', async () => {
      const result = await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: 100n,
          blockNumber: 50n,
          dutyType: DutyType.BLOCK_PROPOSAL,
        },
        signFn,
      );

      expect(result).toBe(mockSignature);
      expect(signFn).toHaveBeenCalledWith(MESSAGE_HASH);
      expect(signFn).toHaveBeenCalledTimes(1);

      // Verify duty was recorded
      const dutyResult = await db.tryInsertOrGetExisting({
        validatorAddress: VALIDATOR_ADDRESS,
        slot: 100n,
        blockNumber: 50n,
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH.toString(),
        nodeId: NODE_ID,
      });
      expect(dutyResult.isNew).toBe(false);
      expect(dutyResult.record.status).toBe(DutyStatus.SIGNED);
      expect(dutyResult.record.signature).toBe(SIGNATURE_STRING);
    });

    it('should delete duty when signing function throws', async () => {
      const error = new Error('Signing failed');
      signFn.mockRejectedValue(error);

      await expect(
        signer.signWithProtection(
          VALIDATOR_ADDRESS,
          MESSAGE_HASH,
          {
            slot: 100n,
            blockNumber: 50n,
            dutyType: DutyType.BLOCK_PROPOSAL,
          },
          signFn,
        ),
      ).rejects.toThrow('Signing failed');

      // Verify duty was deleted
      const dutyResult = await db.tryInsertOrGetExisting({
        validatorAddress: VALIDATOR_ADDRESS,
        slot: 100n,
        blockNumber: 50n,
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH.toString(),
        nodeId: NODE_ID,
      });
      expect(dutyResult.isNew).toBe(true);
    });

    it('should throw DutyAlreadySignedError when duty already signed', async () => {
      // First signing
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: 100n,
          blockNumber: 50n,
          dutyType: DutyType.BLOCK_PROPOSAL,
        },
        signFn,
      );

      // Second attempt with same data
      await expect(
        signer.signWithProtection(
          VALIDATOR_ADDRESS,
          MESSAGE_HASH,
          {
            slot: 100n,
            blockNumber: 50n,
            dutyType: DutyType.BLOCK_PROPOSAL,
          },
          signFn,
        ),
      ).rejects.toThrow(DutyAlreadySignedError);

      // Sign function should only be called once
      expect(signFn).toHaveBeenCalledTimes(1);
    });

    it('should throw SlashingProtectionError when signing different data for same slot', async () => {
      // First signing
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: 100n,
          blockNumber: 50n,
          dutyType: DutyType.BLOCK_PROPOSAL,
        },
        signFn,
      );

      // Second attempt with different data
      await expect(
        signer.signWithProtection(
          VALIDATOR_ADDRESS,
          MESSAGE_HASH_2,
          {
            slot: 100n,
            blockNumber: 50n,
            dutyType: DutyType.BLOCK_PROPOSAL,
          },
          signFn,
        ),
      ).rejects.toThrow(SlashingProtectionError);

      // Sign function should only be called once
      expect(signFn).toHaveBeenCalledTimes(1);
    });

    it('should allow signing different duty types for same slot', async () => {
      const messageHash = Buffer32.random();
      // Sign block proposal
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: 100n,
          blockNumber: 50n,
          dutyType: DutyType.BLOCK_PROPOSAL,
        },
        signFn,
      );

      // Sign attestation for same slot
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        messageHash,
        {
          slot: 100n,
          blockNumber: 50n,
          dutyType: DutyType.ATTESTATION,
        },
        signFn,
      );

      expect(signFn).toHaveBeenCalledTimes(2);

      // Verify both duties exist
      const blockDutyResult = await db.tryInsertOrGetExisting({
        validatorAddress: VALIDATOR_ADDRESS,
        slot: 100n,
        blockNumber: 50n,
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH.toString(),
        nodeId: NODE_ID,
      });
      const attestationDutyResult = await db.tryInsertOrGetExisting({
        validatorAddress: VALIDATOR_ADDRESS,
        slot: 100n,
        blockNumber: 50n,
        dutyType: DutyType.ATTESTATION,
        messageHash: messageHash.toString(),
        nodeId: NODE_ID,
      });
      expect(blockDutyResult.isNew).toBe(false);
      expect(attestationDutyResult.isNew).toBe(false);
      expect(attestationDutyResult.record.messageHash).toBe(messageHash.toString());
    });

    it('should allow signing different slots', async () => {
      // Sign slot 100
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: 100n,
          blockNumber: 50n,
          dutyType: DutyType.BLOCK_PROPOSAL,
        },
        signFn,
      );

      // Sign slot 101
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: 101n,
          blockNumber: 51n,
          dutyType: DutyType.BLOCK_PROPOSAL,
        },
        signFn,
      );

      expect(signFn).toHaveBeenCalledTimes(2);
    });

    it('should handle all duty types', async () => {
      const dutyTypes: DutyType[] = [DutyType.BLOCK_PROPOSAL, DutyType.ATTESTATION, DutyType.ATTESTATIONS_AND_SIGNERS];
      for (const dutyType of dutyTypes) {
        await signer.signWithProtection(
          VALIDATOR_ADDRESS,
          MESSAGE_HASH,
          { slot: 100n, blockNumber: 50n, dutyType },
          signFn,
        );
      }
      expect(signFn).toHaveBeenCalledTimes(dutyTypes.length);
    });

    it('should handle multiple validator addresses', async () => {
      const validator1 = EthAddress.fromString('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
      const validator2 = EthAddress.fromString('0x70997970c51812dc3a010c7d01b50e0d17dc79c8');

      // Same slot but different validators should both succeed
      await signer.signWithProtection(
        validator1,
        MESSAGE_HASH,
        {
          slot: 100n,
          blockNumber: 50n,
          dutyType: DutyType.BLOCK_PROPOSAL,
        },
        signFn,
      );

      await signer.signWithProtection(
        validator2,
        MESSAGE_HASH,
        {
          slot: 100n,
          blockNumber: 50n,
          dutyType: DutyType.BLOCK_PROPOSAL,
        },
        signFn,
      );

      expect(signFn).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent signing attempts - first succeeds', async () => {
      const localSignFn = jest.fn<(messageHash: Buffer32) => Promise<Signature>>();

      // First call sleeps for 200ms then succeeds
      localSignFn.mockImplementationOnce(async () => {
        await sleep(200);
        return mockSignature;
      });

      // Start first signing (don't await)
      const firstSign = signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: 100n,
          blockNumber: 50n,
          dutyType: DutyType.BLOCK_PROPOSAL,
        },
        localSignFn,
      );

      // Wait a bit to ensure first signing has started
      await sleep(50);

      // Start second signing while first is in progress
      const secondSign = signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: 100n,
          blockNumber: 50n,
          dutyType: DutyType.BLOCK_PROPOSAL,
        },
        localSignFn,
      );

      // First should succeed
      await expect(firstSign).resolves.toBe(mockSignature);

      // Second should throw DutyAlreadySignedError after waiting
      await expect(secondSign).rejects.toThrow(DutyAlreadySignedError);

      // Only first signer should have called the signing function
      expect(localSignFn).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent signing attempts - first fails, second succeeds', async () => {
      const localSignFn = jest.fn<(messageHash: Buffer32) => Promise<Signature>>();

      // First call sleeps for 200ms then fails
      localSignFn.mockImplementationOnce(async () => {
        await sleep(200);
        throw new Error('Signing failed');
      });

      // Second call succeeds
      localSignFn.mockImplementationOnce(() => Promise.resolve(mockSignature));

      // Start first signing (don't await)
      const firstSign = signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: 100n,
          blockNumber: 50n,
          dutyType: DutyType.BLOCK_PROPOSAL,
        },
        localSignFn,
      );

      // Wait a bit to ensure first signing has started
      await sleep(50);

      // Start second signing while first is in progress
      const secondSign = signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: 100n,
          blockNumber: 50n,
          dutyType: DutyType.BLOCK_PROPOSAL,
        },
        localSignFn,
      );

      // First should fail
      await expect(firstSign).rejects.toThrow('Signing failed');

      // Second should succeed after waiting for first to fail
      await expect(secondSign).resolves.toBe(mockSignature);

      // Both signers should have called the signing function
      expect(localSignFn).toHaveBeenCalledTimes(2);

      // Verify the duty is marked as signed by the second signer
      const dutyResult = await db.tryInsertOrGetExisting({
        validatorAddress: VALIDATOR_ADDRESS,
        slot: 100n,
        blockNumber: 50n,
        dutyType: DutyType.BLOCK_PROPOSAL,
        messageHash: MESSAGE_HASH.toString(),
        nodeId: NODE_ID,
      });
      expect(dutyResult.isNew).toBe(false);
      expect(dutyResult.record.status).toBe(DutyStatus.SIGNED);
    });
  });
});
