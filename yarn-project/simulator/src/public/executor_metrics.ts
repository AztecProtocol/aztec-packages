import {
  Attributes,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  ValueType,
  linearBuckets,
} from '@aztec/telemetry-client';

export class ExecutorMetrics {
  public readonly tracer: Tracer;
  private fnCount: UpDownCounter;
  private fnDuration: Histogram;
  private manaPerSecond: Histogram;

  constructor(client: TelemetryClient, name = 'PublicExecutor') {
    this.tracer = client.getTracer(name);
    const meter = client.getMeter(name);

    this.fnCount = meter.createUpDownCounter(Metrics.PUBLIC_EXECUTOR_SIMULATION_COUNT, {
      description: 'Number of functions executed',
    });

    this.fnDuration = meter.createHistogram(Metrics.PUBLIC_EXECUTOR_SIMULATION_DURATION, {
      description: 'How long it takes to execute a function',
      unit: 'ms',
      valueType: ValueType.INT,
    });

    this.manaPerSecond = meter.createHistogram(Metrics.PUBLIC_EXECUTOR_SIMULATION_MANA_PER_SECOND, {
      description: 'Mana used per second',
      unit: 'mana/s',
      valueType: ValueType.INT,
      advice: {
        explicitBucketBoundaries: linearBuckets(0, 10_000_000, 10),
      },
    });
  }

  recordFunctionSimulation(durationMs: number, manaUsed: number, fnName: string) {
    this.fnCount.add(1, {
      [Attributes.OK]: true,
      [Attributes.APP_CIRCUIT_NAME]: fnName,
      [Attributes.MANA_USED]: manaUsed,
    });
    this.fnDuration.record(Math.ceil(durationMs));
    if (durationMs > 0 && manaUsed > 0) {
      const manaPerSecond = Math.round((manaUsed * 1000) / durationMs);
      this.manaPerSecond.record(manaPerSecond, {
        [Attributes.APP_CIRCUIT_NAME]: fnName,
      });
    }
  }

  recordFunctionSimulationFailure() {
    this.fnCount.add(1, {
      [Attributes.OK]: false,
    });
  }
}
