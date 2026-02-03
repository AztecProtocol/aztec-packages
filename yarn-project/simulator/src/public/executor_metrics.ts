import type { RevertCode } from '@aztec/stdlib/avm';
import type { GasUsed } from '@aztec/stdlib/gas';
import {
  Attributes,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  createUpDownCounterWithDefault,
} from '@aztec/telemetry-client';

import type { ExecutorMetricsInterface } from './executor_metrics_interface.js';

export class ExecutorMetrics implements ExecutorMetricsInterface {
  public readonly tracer: Tracer;
  private fnCount: UpDownCounter;
  private fnDuration: Histogram;
  private manaPerSecond: Histogram;
  private manaUsed: Histogram;
  private totalInstructionsExecuted: Histogram;
  private txHashing: Histogram;
  private privateEffectsInsertions: Histogram;

  constructor(client: TelemetryClient, name = 'PublicExecutor') {
    this.tracer = client.getTracer(name);
    const meter = client.getMeter(name);

    this.fnCount = createUpDownCounterWithDefault(meter, Metrics.PUBLIC_EXECUTOR_SIMULATION_COUNT, {
      [Attributes.OK]: [true, false],
    });

    this.fnDuration = meter.createHistogram(Metrics.PUBLIC_EXECUTOR_SIMULATION_DURATION);

    this.manaPerSecond = meter.createHistogram(Metrics.PUBLIC_EXECUTOR_SIMULATION_MANA_PER_SECOND);

    this.manaUsed = meter.createHistogram(Metrics.PUBLIC_EXECUTOR_SIMULATION_MANA_USED);

    this.totalInstructionsExecuted = meter.createHistogram(Metrics.PUBLIC_EXECUTOR_SIMULATION_TOTAL_INSTRUCTIONS);

    this.txHashing = meter.createHistogram(Metrics.PUBLIC_EXECUTOR_TX_HASHING);

    this.privateEffectsInsertions = meter.createHistogram(Metrics.PUBLIC_EXECUTOR_PRIVATE_EFFECTS_INSERTION);
  }

  startRecordingTxSimulation(_txLabel: string) {
    // do nothing (unimplemented)
  }

  stopRecordingTxSimulation(_txLabel: string, _gasUsed?: GasUsed, _revertedCode?: RevertCode) {
    // do nothing (unimplemented)
  }

  recordEnqueuedCallSimulation(
    fnName: string,
    durationMs: number,
    manaUsed: number,
    totalInstructionsExecuted: number,
  ) {
    this.fnCount.add(1, {
      [Attributes.OK]: true,
      [Attributes.APP_CIRCUIT_NAME]: fnName,
    });
    this.manaUsed.record(Math.ceil(manaUsed), {
      [Attributes.APP_CIRCUIT_NAME]: fnName,
    });
    this.totalInstructionsExecuted.record(Math.ceil(totalInstructionsExecuted), {
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

  recordEnqueuedCallSimulationFailure(
    _fnName: string,
    _durationMs: number,
    _manaUsed: number,
    _totalInstructionsExecuted: number,
  ) {
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
