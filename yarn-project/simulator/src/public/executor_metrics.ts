import {
  Attributes,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

export class ExecutorMetrics {
  private fnCount: UpDownCounter;
  private fnDuration: Histogram;

  constructor(client: TelemetryClient, name = 'PublicExecutor') {
    const meter = client.getMeter(name);

    this.fnCount = meter.createUpDownCounter(Metrics.PUBLIC_EXECUTOR_SIMULATION_COUNT, {
      description: 'Number of functions executed',
    });

    this.fnDuration = meter.createHistogram(Metrics.PUBLIC_EXECUTOR_SIMULATION_DURATION, {
      description: 'How long it takes to execute a function',
      unit: 'ms',
      valueType: ValueType.INT,
    });
  }

  recordFunctionSimulation(durationMs: number) {
    this.fnCount.add(1, {
      [Attributes.OK]: true,
    });
    this.fnDuration.record(Math.ceil(durationMs));
  }

  recordFunctionSimulationFailure() {
    this.fnCount.add(1, {
      [Attributes.OK]: false,
    });
  }
}
