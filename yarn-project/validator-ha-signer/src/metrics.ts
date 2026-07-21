import {
  Attributes,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  createUpDownCounterWithDefault,
} from '@aztec/telemetry-client';

export type HACleanupType = 'stuck' | 'old' | 'outdated_rollup';

/**
 * Metrics for HA signer tracking signing operations, lock acquisition, and cleanup.
 */
export class HASignerMetrics {
  // Signing lifecycle metrics
  private signingDuration: Histogram;
  private signingSuccessCount: UpDownCounter;
  private dutyAlreadySignedCount: UpDownCounter;
  private slashingProtectionCount: UpDownCounter;
  private signingErrorCount: UpDownCounter;

  // Lock acquisition metrics
  private lockAcquiredCount: UpDownCounter;

  // Cleanup metrics
  private cleanupStuckDutiesCount: UpDownCounter;
  private cleanupOldDutiesCount: UpDownCounter;
  private cleanupOutdatedRollupDutiesCount: UpDownCounter;

  constructor(
    client: TelemetryClient,
    private nodeId: string,
    name = 'HASignerMetrics',
  ) {
    const meter = client.getMeter(name);

    // Signing lifecycle
    this.signingDuration = meter.createHistogram(Metrics.HA_SIGNER_SIGNING_DURATION);
    this.signingSuccessCount = createUpDownCounterWithDefault(meter, Metrics.HA_SIGNER_SIGNING_SUCCESS_COUNT);
    this.dutyAlreadySignedCount = createUpDownCounterWithDefault(meter, Metrics.HA_SIGNER_DUTY_ALREADY_SIGNED_COUNT);
    this.slashingProtectionCount = createUpDownCounterWithDefault(meter, Metrics.HA_SIGNER_SLASHING_PROTECTION_COUNT);
    this.signingErrorCount = createUpDownCounterWithDefault(meter, Metrics.HA_SIGNER_SIGNING_ERROR_COUNT);

    // Lock acquisition
    this.lockAcquiredCount = createUpDownCounterWithDefault(meter, Metrics.HA_SIGNER_LOCK_ACQUIRED_COUNT);

    // Cleanup
    this.cleanupStuckDutiesCount = createUpDownCounterWithDefault(meter, Metrics.HA_SIGNER_CLEANUP_STUCK_DUTIES_COUNT);
    this.cleanupOldDutiesCount = createUpDownCounterWithDefault(meter, Metrics.HA_SIGNER_CLEANUP_OLD_DUTIES_COUNT);
    this.cleanupOutdatedRollupDutiesCount = createUpDownCounterWithDefault(
      meter,
      Metrics.HA_SIGNER_CLEANUP_OUTDATED_ROLLUP_DUTIES_COUNT,
    );
  }

  /**
   * Record a successful signing operation.
   * @param dutyType - The type of duty signed
   * @param durationMs - Duration from start of signWithProtection to completion
   */
  public recordSigningSuccess(dutyType: string, durationMs: number): void {
    const attributes = {
      [Attributes.HA_DUTY_TYPE]: dutyType,
      [Attributes.HA_NODE_ID]: this.nodeId,
    };
    this.signingSuccessCount.add(1, attributes);
    this.signingDuration.record(durationMs, attributes);
  }

  /**
   * Record a DutyAlreadySignedError (expected in HA; another node signed first).
   * @param dutyType - The type of duty
   */
  public recordDutyAlreadySigned(dutyType: string): void {
    const attributes = {
      [Attributes.HA_DUTY_TYPE]: dutyType,
      [Attributes.HA_NODE_ID]: this.nodeId,
    };
    this.dutyAlreadySignedCount.add(1, attributes);
  }

  /**
   * Record a SlashingProtectionError (attempted to sign different data for same duty).
   * @param dutyType - The type of duty
   */
  public recordSlashingProtection(dutyType: string): void {
    const attributes = {
      [Attributes.HA_DUTY_TYPE]: dutyType,
      [Attributes.HA_NODE_ID]: this.nodeId,
    };
    this.slashingProtectionCount.add(1, attributes);
  }

  /**
   * Record a signing function failure (lock will be deleted for retry).
   * @param dutyType - The type of duty
   */
  public recordSigningError(dutyType: string): void {
    const attributes = {
      [Attributes.HA_DUTY_TYPE]: dutyType,
      [Attributes.HA_NODE_ID]: this.nodeId,
    };
    this.signingErrorCount.add(1, attributes);
  }

  /**
   * Record lock acquisition.
   * @param acquired - Whether a new lock was acquired (true) or existing record found (false)
   */
  public recordLockAcquire(acquired: boolean): void {
    if (acquired) {
      const attributes = {
        [Attributes.HA_NODE_ID]: this.nodeId,
      };
      this.lockAcquiredCount.add(1, attributes);
    }
  }

  /**
   * Record cleanup metrics.
   * @param type - Type of cleanup
   * @param count - Number of duties cleaned up
   */
  public recordCleanup(type: HACleanupType, count: number): void {
    const attributes = {
      [Attributes.HA_NODE_ID]: this.nodeId,
    };

    if (type === 'stuck') {
      this.cleanupStuckDutiesCount.add(count, attributes);
    } else if (type === 'old') {
      this.cleanupOldDutiesCount.add(count, attributes);
    } else if (type === 'outdated_rollup') {
      this.cleanupOutdatedRollupDutiesCount.add(count, attributes);
    }
  }
}
