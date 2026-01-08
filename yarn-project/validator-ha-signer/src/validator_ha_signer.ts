/**
 * Validator High Availability Signer
 *
 * Wraps signing operations with distributed locking and slashing protection.
 * This ensures that even with multiple validator nodes running, only one
 * node will sign for a given duty (slot + duty type).
 */
import type { Buffer32 } from '@aztec/foundation/buffer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { type Logger, createLogger } from '@aztec/foundation/log';

import type { CreateHASignerConfig } from './config.js';
import { SlashingProtectionService } from './slashing_protection_service.js';
import type { SigningContext, SlashingProtectionDatabase } from './types.js';

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
  private readonly slashingProtection: SlashingProtectionService | undefined;

  constructor(
    db: SlashingProtectionDatabase,
    private readonly config: CreateHASignerConfig,
  ) {
    this.log = createLogger('validator-ha-signer');

    if (!config.enabled) {
      // this shouldn't happen, the validator should use different signer for non-HA setups
      throw new Error('Validator HA Signer is not enabled in config');
    }

    if (!config.nodeId || config.nodeId === '') {
      throw new Error('NODE_ID is required for high-availability setups');
    }
    this.slashingProtection = new SlashingProtectionService(db, config);
    this.log.info('Validator HA Signer initialized with slashing protection', {
      nodeId: config.nodeId,
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
   * @param context - The signing context (slot, block number, duty type)
   * @param signFn - Function that performs the actual signing
   * @returns The signature
   *
   * @throws DutyAlreadySignedError if the duty was already signed (expected in HA)
   * @throws SlashingProtectionError if attempting to sign different data for same slot (expected in HA)
   */
  async signWithProtection(
    validatorAddress: EthAddress,
    messageHash: Buffer32,
    context: SigningContext,
    signFn: (messageHash: Buffer32) => Promise<Signature>,
  ): Promise<Signature> {
    // If slashing protection is disabled, just sign directly
    if (!this.slashingProtection) {
      this.log.info('Signing without slashing protection enabled', {
        validatorAddress: validatorAddress.toString(),
        nodeId: this.config.nodeId,
        dutyType: context.dutyType,
        slot: context.slot,
        blockNumber: context.blockNumber,
      });
      return await signFn(messageHash);
    }

    const { slot, blockNumber, dutyType } = context;

    // Acquire lock and get the token for ownership verification
    const lockToken = await this.slashingProtection.checkAndRecord({
      validatorAddress,
      slot,
      blockNumber,
      dutyType,
      messageHash: messageHash.toString(),
      nodeId: this.config.nodeId,
    });

    // Perform signing
    let signature: Signature;
    try {
      signature = await signFn(messageHash);
    } catch (error: any) {
      // Delete duty to allow retry (only succeeds if we own the lock)
      await this.slashingProtection.deleteDuty({
        validatorAddress,
        slot,
        dutyType,
        lockToken,
      });
      throw error;
    }

    // Record success (only succeeds if we own the lock)
    await this.slashingProtection.recordSuccess({
      validatorAddress,
      slot,
      dutyType,
      signature,
      nodeId: this.config.nodeId,
      lockToken,
    });

    return signature;
  }

  /**
   * Check if slashing protection is enabled
   */
  get isEnabled(): boolean {
    return this.slashingProtection !== undefined;
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
  start() {
    this.slashingProtection?.start();
  }

  /**
   * Stop the HA signer background tasks.
   * Should be called during graceful shutdown.
   */
  async stop() {
    await this.slashingProtection?.stop();
  }
}
