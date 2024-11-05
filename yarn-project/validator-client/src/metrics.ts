import { type Gauge, Metrics, type TelemetryClient, ValueType } from '@aztec/telemetry-client';

export class ValidatorMetrics {
  private reExecutionTime: Gauge;

  constructor(private telemetryClient: TelemetryClient) {
    const meter = telemetryClient.getMeter('Validator');

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
}
