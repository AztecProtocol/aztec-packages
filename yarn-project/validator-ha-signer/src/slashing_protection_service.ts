/**
 * Slashing Protection Service
 *
 * Provides distributed locking and slashing protection for validator duties.
 * Uses an external database to coordinate across multiple validator nodes.
 */
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import type { DateProvider } from '@aztec/foundation/timer';

import type { BaseSignerConfig } from './config.js';
import {
  type CheckAndRecordParams,
  type DeleteDutyParams,
  DutyStatus,
  type RecordSuccessParams,
  getBlockIndexFromDutyIdentifier,
} from './db/types.js';
import { DutyAlreadySignedError, SlashingProtectionError } from './errors.js';
import type { HASignerMetrics } from './metrics.js';
import type { SlashingProtectionDatabase } from './types.js';

export interface SlashingProtectionServiceDeps {
  metrics: HASignerMetrics;
  dateProvider: DateProvider;
}

export class SlashingProtectionService {
  private readonly log: Logger;
  private readonly pollingIntervalMs: number;
  private readonly signingTimeoutMs: number;
  private readonly maxStuckDutiesAgeMs: number;

  private readonly metrics: HASignerMetrics;
  private readonly dateProvider: DateProvider;

  private cleanupRunningPromise: RunningPromise;
  private lastOldDutiesCleanupAtMs?: number;

  constructor(
    private readonly db: SlashingProtectionDatabase,
    private readonly config: BaseSignerConfig,
    deps: SlashingProtectionServiceDeps,
  ) {
    this.log = createLogger('slashing-protection');
    this.pollingIntervalMs = config.pollingIntervalMs;
    this.signingTimeoutMs = config.signingTimeoutMs;
    this.maxStuckDutiesAgeMs = config.maxStuckDutiesAgeMs ?? 144_000;

    this.cleanupRunningPromise = new RunningPromise(this.cleanup.bind(this), this.log, this.maxStuckDutiesAgeMs);
    this.metrics = deps.metrics;
    this.dateProvider = deps.dateProvider;
  }

  async checkAndRecord(params: CheckAndRecordParams): Promise<string> {
    const { validatorAddress, slot, dutyType, messageHash, nodeId } = params;
    const startTime = this.dateProvider.now();

    this.log.debug(`Checking duty: ${dutyType} for slot ${slot}`, {
      validatorAddress: validatorAddress.toString(),
      nodeId,
    });

    while (true) {
      const { isNew, record } = await this.db.tryInsertOrGetExisting(params);

      if (isNew) {
        this.log.info(`Acquired lock for duty ${dutyType} at slot ${slot}`, {
          validatorAddress: validatorAddress.toString(),
          nodeId,
        });
        this.metrics.recordLockAcquire(true);
        return record.lockToken;
      }

      if (record.status === DutyStatus.SIGNED) {
        if (record.messageHash !== messageHash) {
          this.log.verbose(`Slashing protection triggered for duty ${dutyType} at slot ${slot}`, {
            validatorAddress: validatorAddress.toString(),
            existingMessageHash: record.messageHash,
            attemptedMessageHash: messageHash,
            existingNodeId: record.nodeId,
            attemptingNodeId: nodeId,
          });
          this.metrics.recordSlashingProtection(dutyType);
          throw new SlashingProtectionError(
            slot,
            dutyType,
            record.blockIndexWithinCheckpoint,
            record.messageHash,
            messageHash,
            record.nodeId,
          );
        }
        this.metrics.recordDutyAlreadySigned(dutyType);
        throw new DutyAlreadySignedError(slot, dutyType, record.blockIndexWithinCheckpoint, record.nodeId);
      } else if (record.status === DutyStatus.SIGNING) {
        if (this.dateProvider.now() - startTime > this.signingTimeoutMs) {
          this.log.warn(`Timeout waiting for signing to complete for duty ${dutyType} at slot ${slot}`, {
            validatorAddress: validatorAddress.toString(),
            timeoutMs: this.signingTimeoutMs,
            signingNodeId: record.nodeId,
          });
          this.metrics.recordDutyAlreadySigned(dutyType);
          throw new DutyAlreadySignedError(slot, dutyType, record.blockIndexWithinCheckpoint, 'unknown (timeout)');
        }

        this.log.debug(`Waiting for signing to complete for duty ${dutyType} at slot ${slot}`, {
          validatorAddress: validatorAddress.toString(),
          signingNodeId: record.nodeId,
        });
        await sleep(this.pollingIntervalMs);
      } else {
        throw new Error(`Unknown duty status: ${record.status}`);
      }
    }
  }

  async recordSuccess(params: RecordSuccessParams): Promise<boolean> {
    const { rollupAddress, validatorAddress, slot, dutyType, signature, nodeId, lockToken } = params;
    const blockIndexWithinCheckpoint = getBlockIndexFromDutyIdentifier(params);

    const success = await this.db.updateDutySigned(
      rollupAddress,
      validatorAddress,
      slot,
      dutyType,
      signature.toString(),
      lockToken,
      blockIndexWithinCheckpoint,
    );

    if (success) {
      this.log.info(`Recorded successful signing for duty ${dutyType} at slot ${slot}`, {
        validatorAddress: validatorAddress.toString(),
        nodeId,
      });
    } else {
      this.log.warn(`Failed to record successful signing for duty ${dutyType} at slot ${slot}: invalid token`, {
        validatorAddress: validatorAddress.toString(),
        nodeId,
      });
    }

    return success;
  }

  async deleteDuty(params: DeleteDutyParams): Promise<boolean> {
    const { rollupAddress, validatorAddress, slot, dutyType, lockToken } = params;
    const blockIndexWithinCheckpoint = getBlockIndexFromDutyIdentifier(params);

    const success = await this.db.deleteDuty(
      rollupAddress,
      validatorAddress,
      slot,
      dutyType,
      lockToken,
      blockIndexWithinCheckpoint,
    );

    if (success) {
      this.log.info(`Deleted duty ${dutyType} at slot ${slot} to allow retry`, {
        validatorAddress: validatorAddress.toString(),
      });
    } else {
      this.log.warn(`Failed to delete duty ${dutyType} at slot ${slot}: invalid token`, {
        validatorAddress: validatorAddress.toString(),
      });
    }

    return success;
  }

  get nodeId(): string {
    return this.config.nodeId;
  }

  async start() {
    const numOutdatedRollupDuties = await this.db.cleanupOutdatedRollupDuties(this.config.l1Contracts.rollupAddress);
    if (numOutdatedRollupDuties > 0) {
      this.log.info(`Cleaned up ${numOutdatedRollupDuties} duties with outdated rollup address at startup`, {
        currentRollupAddress: this.config.l1Contracts.rollupAddress.toString(),
      });
      this.metrics.recordCleanup('outdated_rollup', numOutdatedRollupDuties);
    }

    this.cleanupRunningPromise.start();
    this.log.info('Slashing protection service started', { nodeId: this.config.nodeId });
  }

  async stop() {
    await this.cleanupRunningPromise.stop();
    this.log.info('Slashing protection service stopped', { nodeId: this.config.nodeId });
  }

  async close() {
    await this.db.close();
    this.log.info('Slashing protection database connection closed');
  }

  private async cleanup() {
    const numStuckDuties = await this.db.cleanupOwnStuckDuties(this.config.nodeId, this.maxStuckDutiesAgeMs);
    if (numStuckDuties > 0) {
      this.log.verbose(`Cleaned up ${numStuckDuties} stuck duties`, {
        nodeId: this.config.nodeId,
        maxStuckDutiesAgeMs: this.maxStuckDutiesAgeMs,
      });
      this.metrics.recordCleanup('stuck', numStuckDuties);
    }

    if (this.config.cleanupOldDutiesAfterHours !== undefined) {
      const maxAgeMs = this.config.cleanupOldDutiesAfterHours * 60 * 60 * 1000;
      const nowMs = this.dateProvider.now();
      const shouldRun =
        this.lastOldDutiesCleanupAtMs === undefined || nowMs - this.lastOldDutiesCleanupAtMs >= maxAgeMs;
      if (shouldRun) {
        const numOldDuties = await this.db.cleanupOldDuties(maxAgeMs);
        this.lastOldDutiesCleanupAtMs = nowMs;
        if (numOldDuties > 0) {
          this.log.verbose(`Cleaned up ${numOldDuties} old signed duties`, {
            cleanupOldDutiesAfterHours: this.config.cleanupOldDutiesAfterHours,
            maxAgeMs,
          });
          this.metrics.recordCleanup('old', numOldDuties);
        }
      }
    }
  }
}
