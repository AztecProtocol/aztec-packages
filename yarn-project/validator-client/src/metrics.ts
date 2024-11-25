import { type BlockProposal } from '@aztec/circuit-types';
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
      [Attributes.BLOCK_NUMBER]: proposal.payload.header.globalVariables.blockNumber.toString(),
      [Attributes.BLOCK_PROPOSER]: proposal.getSender()?.toString(),
    });
  }
}
