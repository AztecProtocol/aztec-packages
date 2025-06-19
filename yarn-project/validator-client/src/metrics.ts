import type { BlockProposal } from '@aztec/stdlib/p2p';
import {
  Attributes,
  type Gauge,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

export class ValidatorMetrics {
  private reExecutionTime: Gauge;
  private failedReexecutionCounter: UpDownCounter;
  private attestationsCount: UpDownCounter;
  private failedAttestationsCount: UpDownCounter;

  constructor(telemetryClient: TelemetryClient) {
    const meter = telemetryClient.getMeter('Validator');

    this.failedReexecutionCounter = meter.createUpDownCounter(Metrics.VALIDATOR_FAILED_REEXECUTION_COUNT, {
      description: 'The number of failed re-executions',
      unit: 'count',
      valueType: ValueType.INT,
    });

    this.reExecutionTime = meter.createGauge(Metrics.VALIDATOR_RE_EXECUTION_TIME, {
      description: 'The time taken to re-execute a transaction',
      unit: 'ms',
      valueType: ValueType.DOUBLE,
    });

    this.attestationsCount = meter.createUpDownCounter(Metrics.VALIDATOR_ATTESTATION_COUNT, {
      description: 'The number of attestations',
      valueType: ValueType.INT,
    });

    this.failedAttestationsCount = meter.createUpDownCounter(Metrics.VALIDATOR_FAILED_ATTESTATION_COUNT, {
      description: 'The number of failed attestations',
      valueType: ValueType.INT,
    });
  }

  public reExecutionTimer(): () => void {
    const start = performance.now();
    return () => {
      const end = performance.now();
      this.recordReExecutionTime(end - start);
    };
  }

  public recordReExecutionTime(time: number) {
    this.reExecutionTime.record(time);
  }

  public recordFailedReexecution(proposal: BlockProposal) {
    this.failedReexecutionCounter.add(1, {
      [Attributes.STATUS]: 'failed',
      [Attributes.BLOCK_PROPOSER]: proposal.getSender().toString(),
    });
  }

  public incAttestations(num: number) {
    this.attestationsCount.add(num);
  }

  public incFailedAttestations(num: number, reason: string) {
    this.failedAttestationsCount.add(num, {
      [Attributes.ERROR_TYPE]: reason,
    });
  }
}
