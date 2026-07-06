/**
 * Validator High Availability Signer
 *
 * Wraps signing operations with distributed locking and slashing protection.
 * This ensures that even with multiple validator nodes running, only one
 * node will sign for a given duty (slot + duty type).
 */
import type { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';
import {
  type BaseSignerConfig,
  DutyType,
  type HAProtectedSigningContext,
  getBlockNumberFromSigningContext,
  getCheckpointNumberFromSigningContext,
} from '@aztec/stdlib/ha-signing';

import type { DutyIdentifier } from './db/types.js';
import { SigningLockLostError } from './errors.js';
import type { HASignerMetrics } from './metrics.js';
import { SlashingProtectionService } from './slashing_protection_service.js';
import type { SlashingProtectionDatabase } from './types.js';

export interface ValidatorHASignerDeps {
  metrics: HASignerMetrics;
  dateProvider: DateProvider;
}

/**
 * Validator High Availability Signer
 *
 * Provides signing capabilities with distributed locking for validators
 * in a high-availability setup.
 *
 * Usage:
 * ```
 * const signer = new ValidatorHASigner(db, config);
 *
 * // Sign with slashing protection
 * const signature = await signer.signWithProtection(
 *   validatorAddress,
 *   messageHash,
 *   { slot: 100n, blockNumber: 50n, dutyType: 'BLOCK_PROPOSAL' },
 *   async (root) => localSigner.signMessage(root),
 * );
 * ```
 */
export class ValidatorHASigner {
  private readonly log: Logger;
  private readonly slashingProtection: SlashingProtectionService;
  private readonly rollupAddress: EthAddress;

  private readonly dateProvider: DateProvider;
  private readonly metrics: HASignerMetrics;

  constructor(
    db: SlashingProtectionDatabase,
    private readonly config: BaseSignerConfig,
    deps: ValidatorHASignerDeps,
  ) {
    this.log = createLogger('validator-ha-signer');

    this.metrics = deps.metrics;
    this.dateProvider = deps.dateProvider;

    if (!config.nodeId || config.nodeId === '') {
      throw new Error('NODE_ID is required for high-availability setups');
    }
    this.rollupAddress = config.rollupAddress;
    this.slashingProtection = new SlashingProtectionService(db, config, {
      metrics: deps.metrics,
      dateProvider: deps.dateProvider,
    });
    this.log.info('Validator HA Signer initialized with slashing protection', {
      nodeId: config.nodeId,
      rollupAddress: this.rollupAddress.toString(),
    });
  }

  /**
   * Sign a message with slashing protection.
   *
   * This method:
   * 1. Acquires a distributed lock for (validator, slot, dutyType)
   * 2. Calls the provided signing function
   * 3. Records the result (success or failure)
   *
   * @param validatorAddress - The validator's Ethereum address
   * @param messageHash - The hash to be signed
   * @param context - The signing context (HA-protected duty types only)
   * @param signFn - Function that performs the actual signing
   * @returns The signature
   *
   * @throws DutyAlreadySignedError if the duty was already signed (expected in HA)
   * @throws SlashingProtectionError if attempting to sign different data for same slot (expected in HA)
   */
  async signWithProtection(
    validatorAddress: EthAddress,
    messageHash: Buffer32,
    context: HAProtectedSigningContext,
    signFn: (messageHash: Buffer32) => Promise<Signature>,
  ): Promise<Signature> {
    const startTime = this.dateProvider.now();
    const dutyType = context.dutyType;

    let dutyIdentifier: DutyIdentifier;
    if (context.dutyType === DutyType.BLOCK_PROPOSAL) {
      dutyIdentifier = {
        rollupAddress: this.rollupAddress,
        validatorAddress,
        slot: context.slot,
        blockIndexWithinCheckpoint: context.blockIndexWithinCheckpoint,
        dutyType: context.dutyType,
      };
    } else {
      dutyIdentifier = {
        rollupAddress: this.rollupAddress,
        validatorAddress,
        slot: context.slot,
        dutyType: context.dutyType,
      };
    }

    // Acquire lock and get the token for ownership verification
    // DutyAlreadySignedError and SlashingProtectionError may be thrown here and are recorded in the service
    const blockNumber = getBlockNumberFromSigningContext(context);
    const checkpointNumber = getCheckpointNumberFromSigningContext(context);
    const lockToken = await this.slashingProtection.checkAndRecord({
      ...dutyIdentifier,
      blockNumber,
      checkpointNumber,
      messageHash: messageHash.toString(),
      nodeId: this.config.nodeId,
    });

    // Perform signing
    let signature: Signature;
    try {
      signature = await signFn(messageHash);
    } catch (error: any) {
      // Delete duty to allow retry (only succeeds if we own the lock)
      await this.slashingProtection.deleteDuty({ ...dutyIdentifier, lockToken });
      this.metrics.recordSigningError(dutyType);
      throw error;
    }

    // Record success (only succeeds if we still own the lock).
    // A false result means our SIGNING row is gone or no longer ours (e.g. deleted by stuck-duty
    // cleanup while signing was slow). We must not broadcast this signature: without a protection
    // record, a later attempt for the same duty with different data would sign freely (slashable).
    // Do not delete the duty here - we no longer own it, and another node may legitimately hold it.
    const recorded = await this.slashingProtection.recordSuccess({
      ...dutyIdentifier,
      signature,
      nodeId: this.config.nodeId,
      lockToken,
    });
    if (!recorded) {
      this.metrics.recordSigningError(dutyType);
      throw new SigningLockLostError(context.slot, dutyType, this.config.nodeId);
    }

    const duration = this.dateProvider.now() - startTime;
    this.metrics.recordSigningSuccess(dutyType, duration);

    return signature;
  }

  /**
   * Get the node ID for this signer
   */
  get nodeId(): string {
    return this.config.nodeId;
  }

  /**
   * Start the HA signer background tasks (cleanup of stuck duties).
   * Should be called after construction and before signing operations.
   */
  async start() {
    await this.slashingProtection.start();
  }

  /**
   * Stop the HA signer background tasks and close database connection.
   * Should be called during graceful shutdown.
   */
  async stop() {
    await this.slashingProtection.stop();
    await this.slashingProtection.close();
  }
}
