import {
  Attributes,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

export class ExecutorMetrics {
  public readonly tracer: Tracer;
  private fnCount: UpDownCounter;
  private fnDuration: Histogram;
  private manaPerSecond: Histogram;
  private manaUsed: UpDownCounter;
  private totalInstructions: UpDownCounter;
  private privateEffectsInsertions: Histogram;

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
    });

    this.manaUsed = meter.createUpDownCounter(Metrics.PUBLIC_EXECUTOR_SIMULATION_MANA_USED, {
      description: 'Total mana used',
      unit: 'mana',
      valueType: ValueType.INT,
    });

    this.totalInstructions = meter.createUpDownCounter(Metrics.PUBLIC_EXECUTOR_SIMULATION_TOTAL_INSTRUCTIONS, {
      description: 'Total number of instructions executed',
      unit: 'instructions',
      valueType: ValueType.INT,
    });

    this.privateEffectsInsertions = meter.createHistogram(Metrics.PUBLIC_EXECUTION_PRIVATE_EFFECTS_INSERTION, {
      description: 'Private effects insertion time',
      unit: 'us',
      valueType: ValueType.INT,
    });
  }

  recordFunctionSimulation(durationMs: number, manaUsed: number, fnName: string, totalInstructions: number) {
    this.fnCount.add(1, {
      [Attributes.OK]: true,
      [Attributes.APP_CIRCUIT_NAME]: fnName,
      [Attributes.MANA_USED]: manaUsed,
      [Attributes.TOTAL_INSTRUCTIONS]: totalInstructions,
    });
    this.manaUsed.add(manaUsed, {
      [Attributes.APP_CIRCUIT_NAME]: fnName,
    });
    this.totalInstructions.add(totalInstructions, {
      [Attributes.APP_CIRCUIT_NAME]: fnName,
    });
    this.fnDuration.record(Math.ceil(durationMs), {
      [Attributes.APP_CIRCUIT_NAME]: fnName,
    });
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

  recordPrivateEffectsInsertion(durationUs: number, type: 'revertible' | 'non-revertible') {
    this.privateEffectsInsertions.record(Math.ceil(durationUs), {
      [Attributes.REVERTIBILITY]: type,
    });
  }
}
