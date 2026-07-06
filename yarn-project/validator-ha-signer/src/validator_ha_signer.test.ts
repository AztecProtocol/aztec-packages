import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';
import { type BaseSignerConfig, defaultValidatorHASignerConfig } from '@aztec/stdlib/ha-signing';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { PostgresSlashingProtectionDatabase } from './db/postgres.js';
import { setupTestSchema } from './db/test_helper.js';
import { DutyStatus, DutyType } from './db/types.js';
import { DutyAlreadySignedError, SigningLockLostError, SlashingProtectionError } from './errors.js';
import { HASignerMetrics } from './metrics.js';
import { Pool } from './test/pglite_pool.js';
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
      rollupAddress: EthAddress.random(),
      nodeId: NODE_ID,
      pollingIntervalMs: 50,
      signingTimeoutMs: 1000,
      maxStuckDutiesAgeMs: 60_000,
    };
  });

  afterEach(async () => {
    await pool.end();
  });

  afterAll(async () => {
    await db.close();
    await pglite.close();
  });

  describe('initialization', () => {
    it('should not initialize when nodeId is not explicitly set', () => {
      const defaultConfig = {
        ...defaultValidatorHASignerConfig,
        rollupAddress: EthAddress.random(),
      };
      const metrics = new HASignerMetrics(telemetryClient, 'test-node');
      expect(() => new ValidatorHASigner(db, defaultConfig, { metrics, dateProvider })).toThrow(
        'NODE_ID is required for high-availability setups',
      );
    });
  });

  describe('lifecycle', () => {
    it('should start and stop without error when enabled', async () => {
      const metrics = new HASignerMetrics(telemetryClient, config.nodeId);
      const signer = new ValidatorHASigner(db, config, { metrics, dateProvider });
      await signer.start();
      await signer.stop();
    });
  });

  describe('signWithProtection - enabled', () => {
    let signer: ValidatorHASigner;
    let signFn: jest.Mock<(messageHash: Buffer32) => Promise<Signature>>;

    beforeEach(async () => {
      const metrics = new HASignerMetrics(telemetryClient, config.nodeId);
      signer = new ValidatorHASigner(db, config, { metrics, dateProvider });
      await signer.start();
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
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        },
        signFn,
      );

      expect(result).toBe(mockSignature);
      expect(signFn).toHaveBeenCalledWith(MESSAGE_HASH);
      expect(signFn).toHaveBeenCalledTimes(1);

      // Verify duty was recorded
      const dutyResult = await db.tryInsertOrGetExisting({
        rollupAddress: config.rollupAddress,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        checkpointNumber: CheckpointNumber(1),
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
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
            slot: SlotNumber(100),
            blockNumber: BlockNumber(50),
            checkpointNumber: CheckpointNumber(1),
            dutyType: DutyType.BLOCK_PROPOSAL,
            blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
          },
          signFn,
        ),
      ).rejects.toThrow('Signing failed');

      // Verify duty was deleted
      const dutyResult = await db.tryInsertOrGetExisting({
        rollupAddress: config.rollupAddress,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        checkpointNumber: CheckpointNumber(1),
        dutyType: DutyType.BLOCK_PROPOSAL,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        messageHash: MESSAGE_HASH.toString(),
        nodeId: NODE_ID,
      });
      expect(dutyResult.isNew).toBe(true);
    });

    it('should fail signing and not return a signature when the protection record is lost', async () => {
      // Simulate the SIGNING row being deleted (e.g. by stuck-duty cleanup) while the remote signer
      // was slow: recordSuccess can no longer find/own the row and returns false.
      jest.spyOn(db, 'updateDutySigned').mockResolvedValue(false);

      await expect(
        signer.signWithProtection(
          VALIDATOR_ADDRESS,
          MESSAGE_HASH,
          {
            slot: SlotNumber(100),
            blockNumber: BlockNumber(50),
            checkpointNumber: CheckpointNumber(1),
            dutyType: DutyType.BLOCK_PROPOSAL,
            blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
          },
          signFn,
        ),
      ).rejects.toThrow(SigningLockLostError);

      expect(signFn).toHaveBeenCalledTimes(1);
    });

    it('should time out a hung signing, release the lock, and allow a later retry', async () => {
      const shortTimeoutConfig = { ...config, signingOperationTimeoutMs: 100 };
      const metrics = new HASignerMetrics(telemetryClient, shortTimeoutConfig.nodeId);
      const timeoutSigner = new ValidatorHASigner(db, shortTimeoutConfig, { metrics, dateProvider });
      await timeoutSigner.start();

      const context = {
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        checkpointNumber: CheckpointNumber(1),
        dutyType: DutyType.BLOCK_PROPOSAL,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
      } as const;

      try {
        // Signer never returns - the operation must time out rather than hang forever.
        const hangingSignFn = jest.fn<(messageHash: Buffer32) => Promise<Signature>>();
        hangingSignFn.mockReturnValue(new Promise<Signature>(() => {}));

        await expect(
          timeoutSigner.signWithProtection(VALIDATOR_ADDRESS, MESSAGE_HASH, context, hangingSignFn),
        ).rejects.toThrow(/timed out/i);

        // The lock was released on timeout: a fresh signing for the same duty with different data
        // succeeds, proving nothing was broadcast and the SIGNING row was deleted.
        const retrySignFn = jest.fn<(messageHash: Buffer32) => Promise<Signature>>();
        retrySignFn.mockResolvedValue(mockSignature);
        const result = await timeoutSigner.signWithProtection(VALIDATOR_ADDRESS, MESSAGE_HASH_2, context, retrySignFn);

        expect(result).toBe(mockSignature);
        expect(retrySignFn).toHaveBeenCalledTimes(1);
      } finally {
        await timeoutSigner.stop();
      }
    });

    it('should throw DutyAlreadySignedError when duty already signed', async () => {
      // First signing
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        },
        signFn,
      );

      // Second attempt with same data
      await expect(
        signer.signWithProtection(
          VALIDATOR_ADDRESS,
          MESSAGE_HASH,
          {
            slot: SlotNumber(100),
            blockNumber: BlockNumber(50),
            checkpointNumber: CheckpointNumber(1),
            dutyType: DutyType.BLOCK_PROPOSAL,
            blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
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
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        },
        signFn,
      );

      // Second attempt with different data
      await expect(
        signer.signWithProtection(
          VALIDATOR_ADDRESS,
          MESSAGE_HASH_2,
          {
            slot: SlotNumber(100),
            blockNumber: BlockNumber(50),
            checkpointNumber: CheckpointNumber(1),
            dutyType: DutyType.BLOCK_PROPOSAL,
            blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
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
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        },
        signFn,
      );

      // Sign attestation for same slot
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        messageHash,
        {
          slot: SlotNumber(100),
          checkpointNumber: CheckpointNumber(0),
          dutyType: DutyType.ATTESTATION,
        },
        signFn,
      );

      expect(signFn).toHaveBeenCalledTimes(2);

      // Verify both duties exist
      const blockDutyResult = await db.tryInsertOrGetExisting({
        rollupAddress: config.rollupAddress,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        checkpointNumber: CheckpointNumber(1),
        dutyType: DutyType.BLOCK_PROPOSAL,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        messageHash: MESSAGE_HASH.toString(),
        nodeId: NODE_ID,
      });
      const attestationDutyResult = await db.tryInsertOrGetExisting({
        rollupAddress: config.rollupAddress,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SlotNumber(100),
        blockNumber: BlockNumber(0),
        checkpointNumber: CheckpointNumber(0),
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
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        },
        signFn,
      );

      // Sign slot 101
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: SlotNumber(101),
          blockNumber: BlockNumber(51),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        },
        signFn,
      );

      expect(signFn).toHaveBeenCalledTimes(2);
    });

    it('should allow signing different block indices within slot', async () => {
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        },
        signFn,
      );

      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(1),
        },
        signFn,
      );

      expect(signFn).toHaveBeenCalledTimes(2);

      // Verify both duties exist
      const blockDutyResult = await db.tryInsertOrGetExisting({
        rollupAddress: config.rollupAddress,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        checkpointNumber: CheckpointNumber(1),
        dutyType: DutyType.BLOCK_PROPOSAL,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        messageHash: MESSAGE_HASH.toString(),
        nodeId: NODE_ID,
      });
      const blockDutyResult2 = await db.tryInsertOrGetExisting({
        rollupAddress: config.rollupAddress,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        checkpointNumber: CheckpointNumber(1),
        dutyType: DutyType.BLOCK_PROPOSAL,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(1),
        messageHash: MESSAGE_HASH.toString(),
        nodeId: NODE_ID,
      });
      expect(blockDutyResult.isNew).toBe(false);
      expect(blockDutyResult2.isNew).toBe(false);
    });

    it('should allow checkpoint proposal alongside block proposals in same slot', async () => {
      const slot = SlotNumber(100);
      const blockNumber = BlockNumber(50);
      const checkpointNumber = CheckpointNumber(1);

      // Sign multiple block proposals
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot,
          blockNumber,
          checkpointNumber,
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        },
        signFn,
      );

      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot,
          blockNumber,
          checkpointNumber,
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(1),
        },
        signFn,
      );

      // Sign checkpoint proposal (index -1, since it's not a block within checkpoint)
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot,
          checkpointNumber,
          dutyType: DutyType.CHECKPOINT_PROPOSAL,
        },
        signFn,
      );

      expect(signFn).toHaveBeenCalledTimes(3);

      // Verify all three duties exist in database
      const block0Result = await db.tryInsertOrGetExisting({
        rollupAddress: config.rollupAddress,
        validatorAddress: VALIDATOR_ADDRESS,
        slot,
        blockNumber,
        checkpointNumber,
        dutyType: DutyType.BLOCK_PROPOSAL,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        messageHash: MESSAGE_HASH.toString(),
        nodeId: NODE_ID,
      });
      const block1Result = await db.tryInsertOrGetExisting({
        rollupAddress: config.rollupAddress,
        validatorAddress: VALIDATOR_ADDRESS,
        slot,
        blockNumber,
        checkpointNumber,
        dutyType: DutyType.BLOCK_PROPOSAL,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(1),
        messageHash: MESSAGE_HASH.toString(),
        nodeId: NODE_ID,
      });
      const checkpointResult = await db.tryInsertOrGetExisting({
        rollupAddress: config.rollupAddress,
        validatorAddress: VALIDATOR_ADDRESS,
        slot,
        blockNumber: BlockNumber(0),
        checkpointNumber,
        dutyType: DutyType.CHECKPOINT_PROPOSAL,
        messageHash: MESSAGE_HASH.toString(),
        nodeId: NODE_ID,
      });

      expect(block0Result.isNew).toBe(false);
      expect(block1Result.isNew).toBe(false);
      expect(checkpointResult.isNew).toBe(false);
    });

    it('should reject duplicate signing for same slot, duty type, and block index', async () => {
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        },
        signFn,
      );

      // Try to sign again with same parameters - should throw
      await expect(
        signer.signWithProtection(
          VALIDATOR_ADDRESS,
          MESSAGE_HASH,
          {
            slot: SlotNumber(100),
            blockNumber: BlockNumber(50),
            checkpointNumber: CheckpointNumber(1),
            dutyType: DutyType.BLOCK_PROPOSAL,
            blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
          },
          signFn,
        ),
      ).rejects.toThrow(DutyAlreadySignedError);

      // But different index should work
      await expect(
        signer.signWithProtection(
          VALIDATOR_ADDRESS,
          MESSAGE_HASH,
          {
            slot: SlotNumber(100),
            blockNumber: BlockNumber(50),
            checkpointNumber: CheckpointNumber(1),
            dutyType: DutyType.BLOCK_PROPOSAL,
            blockIndexWithinCheckpoint: IndexWithinCheckpoint(1),
          },
          signFn,
        ),
      ).resolves.toBeDefined();
    });

    it('should handle all duty types', async () => {
      // Sign BLOCK_PROPOSAL (requires blockIndexWithinCheckpoint)
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        },
        signFn,
      );

      // Sign ATTESTATION (no blockIndexWithinCheckpoint)
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: SlotNumber(100),
          checkpointNumber: CheckpointNumber(0),
          dutyType: DutyType.ATTESTATION,
        },
        signFn,
      );

      // Sign ATTESTATIONS_AND_SIGNERS (no blockIndexWithinCheckpoint)
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: SlotNumber(100),
          checkpointNumber: CheckpointNumber(0),
          dutyType: DutyType.ATTESTATIONS_AND_SIGNERS,
        },
        signFn,
      );

      // Sign CHECKPOINT_PROPOSAL (no blockIndexWithinCheckpoint)
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: SlotNumber(100),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.CHECKPOINT_PROPOSAL,
        },
        signFn,
      );

      // Sign GOVERNANCE_VOTE (VoteSigningContext - no blockNumber)
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: SlotNumber(100),
          dutyType: DutyType.GOVERNANCE_VOTE,
        },
        signFn,
      );

      // Sign SLASHING_VOTE (VoteSigningContext - no blockNumber)
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: SlotNumber(100),
          dutyType: DutyType.SLASHING_VOTE,
        },
        signFn,
      );

      expect(signFn).toHaveBeenCalledTimes(6);
    });

    it('should sign vote duties with VoteSigningContext (no blockNumber)', async () => {
      // GOVERNANCE_VOTE only needs slot, no blockNumber
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: SlotNumber(100),
          dutyType: DutyType.GOVERNANCE_VOTE,
        },
        signFn,
      );

      // SLASHING_VOTE only needs slot, no blockNumber
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot: SlotNumber(100),
          dutyType: DutyType.SLASHING_VOTE,
        },
        signFn,
      );

      expect(signFn).toHaveBeenCalledTimes(2);

      // Verify both duties were recorded with blockNumber = 0
      const governanceResult = await db.tryInsertOrGetExisting({
        rollupAddress: config.rollupAddress,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SlotNumber(100),
        blockNumber: BlockNumber(0), // getBlockNumberFromSigningContext returns 0 for vote duties
        checkpointNumber: CheckpointNumber(0),
        dutyType: DutyType.GOVERNANCE_VOTE,
        messageHash: MESSAGE_HASH.toString(),
        nodeId: NODE_ID,
      });
      const slashingResult = await db.tryInsertOrGetExisting({
        rollupAddress: config.rollupAddress,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SlotNumber(100),
        blockNumber: BlockNumber(0),
        checkpointNumber: CheckpointNumber(0),
        dutyType: DutyType.SLASHING_VOTE,
        messageHash: MESSAGE_HASH.toString(),
        nodeId: NODE_ID,
      });

      expect(governanceResult.isNew).toBe(false);
      expect(governanceResult.record.status).toBe(DutyStatus.SIGNED);
      expect(slashingResult.isNew).toBe(false);
      expect(slashingResult.record.status).toBe(DutyStatus.SIGNED);
    });

    it('should prevent duplicate governance votes for same slot', async () => {
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        { slot: SlotNumber(100), dutyType: DutyType.GOVERNANCE_VOTE },
        signFn,
      );

      await expect(
        signer.signWithProtection(
          VALIDATOR_ADDRESS,
          MESSAGE_HASH,
          { slot: SlotNumber(100), dutyType: DutyType.GOVERNANCE_VOTE },
          signFn,
        ),
      ).rejects.toThrow(DutyAlreadySignedError);

      expect(signFn).toHaveBeenCalledTimes(1);
    });

    it('should prevent duplicate slashing votes for same slot', async () => {
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        { slot: SlotNumber(100), dutyType: DutyType.SLASHING_VOTE },
        signFn,
      );

      await expect(
        signer.signWithProtection(
          VALIDATOR_ADDRESS,
          MESSAGE_HASH,
          { slot: SlotNumber(100), dutyType: DutyType.SLASHING_VOTE },
          signFn,
        ),
      ).rejects.toThrow(DutyAlreadySignedError);

      expect(signFn).toHaveBeenCalledTimes(1);
    });

    it('should trigger SlashingProtectionError for vote duties with different message hash', async () => {
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        { slot: SlotNumber(100), dutyType: DutyType.GOVERNANCE_VOTE },
        signFn,
      );

      await expect(
        signer.signWithProtection(
          VALIDATOR_ADDRESS,
          MESSAGE_HASH_2, // Different message hash
          { slot: SlotNumber(100), dutyType: DutyType.GOVERNANCE_VOTE },
          signFn,
        ),
      ).rejects.toThrow(SlashingProtectionError);

      expect(signFn).toHaveBeenCalledTimes(1);
    });

    it('should allow different vote types for same slot', async () => {
      // Sign governance vote
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        { slot: SlotNumber(100), dutyType: DutyType.GOVERNANCE_VOTE },
        signFn,
      );

      // Sign slashing vote for same slot - should succeed (different duty type)
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        { slot: SlotNumber(100), dutyType: DutyType.SLASHING_VOTE },
        signFn,
      );

      expect(signFn).toHaveBeenCalledTimes(2);
    });

    it('should allow vote duties alongside block proposals in same slot', async () => {
      const slot = SlotNumber(100);

      // Sign block proposal
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        {
          slot,
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        },
        signFn,
      );

      // Sign governance vote for same slot
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        { slot, dutyType: DutyType.GOVERNANCE_VOTE },
        signFn,
      );

      // Sign slashing vote for same slot
      await signer.signWithProtection(
        VALIDATOR_ADDRESS,
        MESSAGE_HASH,
        { slot, dutyType: DutyType.SLASHING_VOTE },
        signFn,
      );

      expect(signFn).toHaveBeenCalledTimes(3);
    });

    it('should handle multiple validator addresses', async () => {
      const validator1 = EthAddress.fromString('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
      const validator2 = EthAddress.fromString('0x70997970c51812dc3a010c7d01b50e0d17dc79c8');

      // Same slot but different validators should both succeed
      await signer.signWithProtection(
        validator1,
        MESSAGE_HASH,
        {
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        },
        signFn,
      );

      await signer.signWithProtection(
        validator2,
        MESSAGE_HASH,
        {
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        },
        signFn,
      );

      expect(signFn).toHaveBeenCalledTimes(2);
    });

    it('should allow only one signer to succeed when multiple signers for same validator try to sign the same duty', async () => {
      const numSigners = 10;
      const nodeIds = Array.from({ length: numSigners }, (_, i) => `node-${i + 1}`);

      // Create separate signers with different node IDs for the same validator
      const signers = nodeIds.map(
        nodeId =>
          new ValidatorHASigner(
            db,
            { ...config, nodeId },
            {
              metrics: new HASignerMetrics(telemetryClient, nodeId),
              dateProvider,
            },
          ),
      );

      // Start all signers
      await Promise.all(signers.map(signer => signer.start()));

      try {
        // All signers try to sign the same duty for the same validator
        const sameSlot = SlotNumber(200);
        const sameBlockNumber = BlockNumber(100);
        const sameDutyType = DutyType.BLOCK_PROPOSAL;
        const sameBlockIndex = IndexWithinCheckpoint(0);

        // Create signing functions for each signer
        const signFns = nodeIds.map(() => {
          const signFn = jest.fn<(messageHash: Buffer32) => Promise<Signature>>();
          signFn.mockResolvedValue(mockSignature);
          return signFn;
        });

        // All signers try to sign concurrently for the same validator
        const results = await Promise.allSettled(
          signers.map((signer, index) =>
            signer.signWithProtection(
              VALIDATOR_ADDRESS,
              MESSAGE_HASH,
              {
                slot: sameSlot,
                blockNumber: sameBlockNumber,
                checkpointNumber: CheckpointNumber(1),
                dutyType: sameDutyType,
                blockIndexWithinCheckpoint: sameBlockIndex,
              },
              signFns[index],
            ),
          ),
        );

        // Exactly one should succeed
        const successful = results.filter(r => r.status === 'fulfilled');
        const failed = results.filter(r => r.status === 'rejected');

        expect(successful.length).toBe(1);
        expect(failed.length).toBe(9);

        // All failures should be DutyAlreadySignedError
        for (const failure of failed) {
          if (failure.status === 'rejected') {
            expect(failure.reason).toBeInstanceOf(DutyAlreadySignedError);
          }
        }

        // Only one signing function should have been called
        const totalCalls = signFns.reduce((sum, fn) => sum + fn.mock.calls.length, 0);
        expect(totalCalls).toBe(1);

        // Verify the duty is recorded in the database with the winning nodeId
        const dutyResult = await db.tryInsertOrGetExisting({
          rollupAddress: config.rollupAddress,
          validatorAddress: VALIDATOR_ADDRESS,
          slot: sameSlot,
          blockNumber: sameBlockNumber,
          checkpointNumber: CheckpointNumber(1),
          dutyType: sameDutyType,
          blockIndexWithinCheckpoint: sameBlockIndex,
          messageHash: MESSAGE_HASH.toString(),
          // The record should exist already here, so tryInsertOrGetExisting with any nodeId
          // should return the same record
          nodeId: nodeIds[0],
        });
        expect(dutyResult.isNew).toBe(false);
        expect(dutyResult.record.status).toBe(DutyStatus.SIGNED);
        // The winning nodeId should be one of the ten
        expect(nodeIds).toContain(dutyResult.record.nodeId);
      } finally {
        // Stop all signers
        await Promise.all(signers.map(signer => signer.stop()));
      }
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
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
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
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
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
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
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
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          checkpointNumber: CheckpointNumber(1),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
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
        rollupAddress: config.rollupAddress,
        validatorAddress: VALIDATOR_ADDRESS,
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        checkpointNumber: CheckpointNumber(1),
        dutyType: DutyType.BLOCK_PROPOSAL,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        messageHash: MESSAGE_HASH.toString(),
        nodeId: NODE_ID,
      });
      expect(dutyResult.isNew).toBe(false);
      expect(dutyResult.record.status).toBe(DutyStatus.SIGNED);
    });
  });

  describe('Rollup Upgrade Scenarios', () => {
    it('should allow same slot signing across different rollup addresses', async () => {
      const oldRollupAddress = EthAddress.random();
      const newRollupAddress = EthAddress.random();

      // Create signer with old rollup address
      const oldSigner = new ValidatorHASigner(
        db,
        {
          ...config,
          rollupAddress: oldRollupAddress,
        },
        { metrics: new HASignerMetrics(telemetryClient, config.nodeId), dateProvider },
      );
      await oldSigner.start();

      try {
        const signFn = jest.fn<(messageHash: Buffer32) => Promise<Signature>>();
        signFn.mockResolvedValue(mockSignature);

        // Sign with old rollup
        await oldSigner.signWithProtection(
          VALIDATOR_ADDRESS,
          MESSAGE_HASH,
          {
            slot: SlotNumber(100),
            blockNumber: BlockNumber(50),
            checkpointNumber: CheckpointNumber(1),
            dutyType: DutyType.BLOCK_PROPOSAL,
            blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
          },
          signFn,
        );

        expect(signFn).toHaveBeenCalledTimes(1);

        // "Upgrade" - create new signer with new rollup address
        const newSigner = new ValidatorHASigner(
          db,
          {
            ...config,
            rollupAddress: newRollupAddress,
          },
          { metrics: new HASignerMetrics(telemetryClient, config.nodeId), dateProvider },
        );
        // Starting the new signer will clean up duties with outdated rollup addresses
        await newSigner.start();

        try {
          const signFn2 = jest.fn<(messageHash: Buffer32) => Promise<Signature>>();
          signFn2.mockResolvedValue(mockSignature);

          // Sign same slot with new rollup - should succeed (no conflict, old duty was cleaned up)
          await newSigner.signWithProtection(
            VALIDATOR_ADDRESS,
            MESSAGE_HASH,
            {
              slot: SlotNumber(100), // Same slot!
              blockNumber: BlockNumber(50),
              checkpointNumber: CheckpointNumber(1),
              dutyType: DutyType.BLOCK_PROPOSAL,
              blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
            },
            signFn2,
          );

          expect(signFn2).toHaveBeenCalledTimes(1);

          // Verify old duty was cleaned up at startup
          const oldDuty = await db.tryInsertOrGetExisting({
            rollupAddress: oldRollupAddress,
            validatorAddress: VALIDATOR_ADDRESS,
            slot: SlotNumber(100),
            blockNumber: BlockNumber(50),
            checkpointNumber: CheckpointNumber(1),
            dutyType: DutyType.BLOCK_PROPOSAL,
            blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
            messageHash: MESSAGE_HASH.toString(),
            nodeId: NODE_ID,
          });

          // Verify new duty exists
          const newDuty = await db.tryInsertOrGetExisting({
            rollupAddress: newRollupAddress,
            validatorAddress: VALIDATOR_ADDRESS,
            slot: SlotNumber(100),
            blockNumber: BlockNumber(50),
            checkpointNumber: CheckpointNumber(1),
            dutyType: DutyType.BLOCK_PROPOSAL,
            blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
            messageHash: MESSAGE_HASH.toString(),
            nodeId: NODE_ID,
          });

          expect(oldDuty.isNew).toBe(true); // Old duty was cleaned up
          expect(newDuty.isNew).toBe(false); // New duty exists
          expect(newDuty.record.rollupAddress).toEqual(newRollupAddress);
          expect(newDuty.record.status).toBe(DutyStatus.SIGNED);
        } finally {
          await newSigner.stop();
        }
      } finally {
        await oldSigner.stop();
      }
    });
  });
});
