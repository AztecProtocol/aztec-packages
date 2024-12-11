import { type TxExecutionPhase } from '@aztec/circuit-types';
import { type ContractClassRegisteredEvent } from '@aztec/protocol-contracts';
import {
  Attributes,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type Tracer,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

export class PublicProcessorMetrics {
  public readonly tracer: Tracer;

  private txDuration: Histogram;
  private txCount: UpDownCounter;
  private txPhaseCount: UpDownCounter;

  private phaseDuration: Histogram;
  private phaseCount: UpDownCounter;

  private bytecodeDeployed: Histogram;

  constructor(client: TelemetryClient, name = 'PublicProcessor') {
    this.tracer = client.getTracer(name);
    const meter = client.getMeter(name);

    this.txDuration = meter.createHistogram(Metrics.PUBLIC_PROCESSOR_TX_DURATION, {
      description: 'How long it takes to process a transaction',
      unit: 'ms',
      valueType: ValueType.INT,
    });

    this.txCount = meter.createUpDownCounter(Metrics.PUBLIC_PROCESSOR_TX_COUNT, {
      description: 'Number of transactions processed',
    });

    this.txPhaseCount = meter.createUpDownCounter(Metrics.PUBLIC_PROCESSOR_TX_PHASE_COUNT, {
      description: 'Number of phases processed',
    });

    this.phaseDuration = meter.createHistogram(Metrics.PUBLIC_PROCESSOR_PHASE_DURATION, {
      description: 'How long it takes to process a phase',
      unit: 'ms',
      valueType: ValueType.INT,
    });

    this.phaseCount = meter.createUpDownCounter(Metrics.PUBLIC_PROCESSOR_PHASE_COUNT, {
      description: 'Number of failed phases',
    });

    this.bytecodeDeployed = meter.createHistogram(Metrics.PUBLIC_PROCESSOR_DEPLOY_BYTECODE_SIZE, {
      description: 'Size of deployed bytecode',
      unit: 'By',
      advice: {
        // from 0.5KB to 1.8MB. One ETH block can have at most 2MB of blobs
        explicitBucketBoundaries: [
          512, 768, 896, 1024, 1536, 1792, 2048, 3072, 3584, 4096, 6144, 7168, 8192, 12288, 14336, 16384, 24576, 28672,
          32768, 49152, 57344, 65536, 98304, 114688, 131072, 196608, 229376, 262144, 393216, 458752, 524288, 786432,
          917504, 1048576, 1572864, 1835008,
        ],
      },
    });
  }

  recordPhaseDuration(phaseName: TxExecutionPhase, durationMs: number) {
    this.phaseCount.add(1, { [Attributes.TX_PHASE_NAME]: phaseName, [Attributes.OK]: true });
    this.phaseDuration.record(Math.ceil(durationMs), { [Attributes.TX_PHASE_NAME]: phaseName });
  }

  recordTx(phaseCount: number, durationMs: number) {
    this.txPhaseCount.add(phaseCount);
    this.txDuration.record(Math.ceil(durationMs));
    this.txCount.add(1, {
      [Attributes.OK]: true,
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

  recordClassRegistration(...events: ContractClassRegisteredEvent[]) {
    let totalBytecode = 0;
    for (const event of events) {
      totalBytecode += event.packedPublicBytecode.length;
    }

    if (totalBytecode > 0) {
      this.bytecodeDeployed.record(totalBytecode);
    }
  }
}
