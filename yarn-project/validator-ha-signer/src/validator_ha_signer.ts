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

import type { ValidatorHASignerConfig } from './config.js';
import { type DutyIdentifier, DutyType } from './db/types.js';
import { SlashingProtectionService } from './slashing_protection_service.js';
import {
  type HAProtectedSigningContext,
  type SlashingProtectionDatabase,
  getBlockNumberFromSigningContext,
} from './types.js';

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

  constructor(
    db: SlashingProtectionDatabase,
    private readonly config: ValidatorHASignerConfig,
  ) {
    this.log = createLogger('validator-ha-signer');

    if (!config.haSigningEnabled) {
      // this shouldn't happen, the validator should use different signer for non-HA setups
      throw new Error('Validator HA Signer is not enabled in config');
    }

    if (!config.nodeId || config.nodeId === '') {
      throw new Error('NODE_ID is required for high-availability setups');
    }
    this.rollupAddress = config.l1Contracts.rollupAddress;
    this.slashingProtection = new SlashingProtectionService(db, config);
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
    const blockNumber = getBlockNumberFromSigningContext(context);
    const lockToken = await this.slashingProtection.checkAndRecord({
      ...dutyIdentifier,
      blockNumber,
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
      throw error;
    }

    // Record success (only succeeds if we own the lock)
    await this.slashingProtection.recordSuccess({
      ...dutyIdentifier,
      signature,
      nodeId: this.config.nodeId,
      lockToken,
    });

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
