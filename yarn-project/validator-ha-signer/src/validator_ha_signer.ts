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

import type { BaseSignerConfig } from './config.js';
import { type DutyIdentifier, DutyType } from './db/types.js';
import type { HASignerMetrics } from './metrics.js';
import { SlashingProtectionService } from './slashing_protection_service.js';
import {
  type HAProtectedSigningContext,
  type SlashingProtectionDatabase,
  getBlockNumberFromSigningContext,
} from './types.js';

export interface ValidatorHASignerDeps {
  metrics: HASignerMetrics;
  dateProvider: DateProvider;
}

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
    this.rollupAddress = config.l1Contracts.rollupAddress;
    this.slashingProtection = new SlashingProtectionService(db, config, {
      metrics: deps.metrics,
      dateProvider: deps.dateProvider,
    });
    this.log.info('Validator HA Signer initialized with slashing protection', {
      nodeId: config.nodeId,
      rollupAddress: this.rollupAddress.toString(),
    });
  }

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

    const blockNumber = getBlockNumberFromSigningContext(context);
    const lockToken = await this.slashingProtection.checkAndRecord({
      ...dutyIdentifier,
      blockNumber,
      messageHash: messageHash.toString(),
      nodeId: this.config.nodeId,
    });

    let signature: Signature;
    try {
      signature = await signFn(messageHash);
    } catch (error: any) {
      await this.slashingProtection.deleteDuty({ ...dutyIdentifier, lockToken });
      this.metrics.recordSigningError(dutyType);
      throw error;
    }

    await this.slashingProtection.recordSuccess({
      ...dutyIdentifier,
      signature,
      nodeId: this.config.nodeId,
      lockToken,
    });

    const duration = this.dateProvider.now() - startTime;
    this.metrics.recordSigningSuccess(dutyType, duration);

    return signature;
  }

  get nodeId(): string {
    return this.config.nodeId;
  }

  async start() {
    await this.slashingProtection.start();
  }

  async stop() {
    await this.slashingProtection.stop();
    await this.slashingProtection.close();
  }
}
