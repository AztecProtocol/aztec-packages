import type { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
import type { Gas } from '@aztec/stdlib/gas';
import { TxExecutionPhase } from '@aztec/stdlib/tx';
import {
  Attributes,
  type Gauge,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  createUpDownCounterWithDefault,
} from '@aztec/telemetry-client';

export class PublicProcessorMetrics {
  public readonly tracer: Tracer;

  private txDuration: Histogram;
  private txCount: UpDownCounter;
  private txPhaseCount: UpDownCounter;

  private phaseDuration: Histogram;
  private phaseCount: UpDownCounter;

  private bytecodeDeployed: Histogram;
  private totalGas: Gauge;
  private totalGasHistogram: Histogram;
  private gasRate: Histogram;
  private txGas: Histogram;

  private treeInsertionDuration: Histogram;

  constructor(client: TelemetryClient, name = 'PublicProcessor') {
    this.tracer = client.getTracer(name);
    const meter = client.getMeter(name);

    this.txDuration = meter.createHistogram(Metrics.PUBLIC_PROCESSOR_TX_DURATION);

    this.txCount = createUpDownCounterWithDefault(meter, Metrics.PUBLIC_PROCESSOR_TX_COUNT, {
      [Attributes.OK]: [true, false],
    });

    this.txPhaseCount = createUpDownCounterWithDefault(meter, Metrics.PUBLIC_PROCESSOR_TX_PHASE_COUNT);

    this.phaseDuration = meter.createHistogram(Metrics.PUBLIC_PROCESSOR_PHASE_DURATION);

    this.phaseCount = createUpDownCounterWithDefault(meter, Metrics.PUBLIC_PROCESSOR_PHASE_COUNT, {
      [Attributes.TX_PHASE_NAME]: [TxExecutionPhase.SETUP, TxExecutionPhase.APP_LOGIC, TxExecutionPhase.TEARDOWN],
      [Attributes.OK]: [true, false],
    });

    this.bytecodeDeployed = meter.createHistogram(Metrics.PUBLIC_PROCESSOR_DEPLOY_BYTECODE_SIZE);

    this.totalGas = meter.createGauge(Metrics.PUBLIC_PROCESSOR_TOTAL_GAS);

    this.totalGasHistogram = meter.createHistogram(Metrics.PUBLIC_PROCESSOR_TOTAL_GAS_HISTOGRAM);

    this.txGas = meter.createHistogram(Metrics.PUBLIC_PROCESSOR_TX_GAS);

    this.gasRate = meter.createHistogram(Metrics.PUBLIC_PROCESSOR_GAS_RATE);

    this.treeInsertionDuration = meter.createHistogram(Metrics.PUBLIC_PROCESSOR_TREE_INSERTION);
  }

  recordPhaseDuration(phaseName: TxExecutionPhase, durationMs: number) {
    this.phaseCount.add(1, { [Attributes.TX_PHASE_NAME]: phaseName, [Attributes.OK]: true });
    this.phaseDuration.record(Math.ceil(durationMs), { [Attributes.TX_PHASE_NAME]: phaseName });
  }

  recordTx(phaseCount: number, durationMs: number, gasUsed: Gas) {
    this.txPhaseCount.add(phaseCount);
    this.txDuration.record(Math.ceil(durationMs));
    this.txCount.add(1, {
      [Attributes.OK]: true,
    });
    this.txGas.record(gasUsed.daGas, {
      [Attributes.GAS_DIMENSION]: 'DA',
    });
    this.txGas.record(gasUsed.l2Gas, {
      [Attributes.GAS_DIMENSION]: 'L2',
    });
  }

  recordAllTxs(totalGas: Gas, gasRate: number) {
    this.totalGas.record(totalGas.daGas, {
      [Attributes.GAS_DIMENSION]: 'DA',
    });
    this.totalGas.record(totalGas.l2Gas, {
      [Attributes.GAS_DIMENSION]: 'L2',
    });
    this.gasRate.record(gasRate, {
      [Attributes.GAS_DIMENSION]: 'L2',
    });
    this.totalGasHistogram.record(totalGas.daGas, {
      [Attributes.GAS_DIMENSION]: 'DA',
    });
    this.totalGasHistogram.record(totalGas.l2Gas, {
      [Attributes.GAS_DIMENSION]: 'L2',
    });
  }

  recordFailedTx() {
    this.txCount.add(1, {
      [Attributes.OK]: false,
    });
  }

  recordRevertedPhase(phaseName: TxExecutionPhase) {
    this.phaseCount.add(1, { [Attributes.TX_PHASE_NAME]: phaseName, [Attributes.OK]: false });
  }

  recordClassPublication(...events: ContractClassPublishedEvent[]) {
    let totalBytecode = 0;
    for (const event of events) {
      totalBytecode += event.packedPublicBytecode.length;
    }

    if (totalBytecode > 0) {
      this.bytecodeDeployed.record(totalBytecode);
    }
  }

  recordTreeInsertions(durationUs: number) {
    this.treeInsertionDuration.record(Math.ceil(durationUs));
  }
}
