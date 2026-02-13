import type { Timer } from '@aztec/foundation/timer';
import type { CircuitName } from '@aztec/stdlib/stats';
import {
  Attributes,
  type Gauge,
  type Histogram,
  Metrics,
  type TelemetryClient,
  type Tracer,
} from '@aztec/telemetry-client';

/**
 * Instrumentation class for Prover implementations.
 */
export class ProverInstrumentation {
  private simulationDuration: Histogram;
  private witGenDuration: Histogram;
  private provingDuration: Histogram;

  private witGenInputSize: Gauge;
  private witGenOutputSize: Gauge;

  private proofSize: Gauge;
  private circuitSize: Gauge;
  private circuitPublicInputCount: Gauge;

  public readonly tracer: Tracer;

  constructor(telemetry: TelemetryClient, name: string) {
    this.tracer = telemetry.getTracer(name);
    const meter = telemetry.getMeter(name);

    this.simulationDuration = meter.createHistogram(Metrics.CIRCUIT_SIMULATION_DURATION);

    this.witGenDuration = meter.createHistogram(Metrics.CIRCUIT_WITNESS_GEN_DURATION);

    this.provingDuration = meter.createHistogram(Metrics.CIRCUIT_PROVING_DURATION);

    this.witGenInputSize = meter.createGauge(Metrics.CIRCUIT_WITNESS_GEN_INPUT_SIZE);

    this.witGenOutputSize = meter.createGauge(Metrics.CIRCUIT_WITNESS_GEN_OUTPUT_SIZE);

    this.proofSize = meter.createGauge(Metrics.CIRCUIT_PROVING_PROOF_SIZE);

    this.circuitPublicInputCount = meter.createGauge(Metrics.CIRCUIT_PUBLIC_INPUTS_COUNT);

    this.circuitSize = meter.createGauge(Metrics.CIRCUIT_SIZE);
  }

  /**
   * Records the duration of a circuit operation.
   * @param metric - The metric to record
   * @param circuitName - The name of the circuit
   * @param timerOrMS - The duration
   */
  recordDuration(
    metric: 'simulationDuration' | 'witGenDuration' | 'provingDuration',
    circuitName: CircuitName,
    timerOrMS: Timer | number,
  ) {
    // Simulation duration is stored in ms, while the others are stored in seconds
    if (metric === 'simulationDuration') {
      const ms = typeof timerOrMS === 'number' ? timerOrMS : timerOrMS.ms();
      this[metric].record(Math.trunc(ms), {
        [Attributes.PROTOCOL_CIRCUIT_NAME]: circuitName,
      });
    } else {
      const s = typeof timerOrMS === 'number' ? timerOrMS / 1000 : timerOrMS.s();
      this[metric].record(s, {
        [Attributes.PROTOCOL_CIRCUIT_NAME]: circuitName,
      });
    }
  }

  /**
   * Records the duration of an AVM circuit operation.
   * @param metric - The metric to record
   * @param appCircuitName - The name of the function circuit (should be a `contract:function` string)
   * @param timerOrMS - The duration
   */
  recordAvmDuration(metric: 'witGenDuration' | 'provingDuration', appCircuitName: string, timerOrMS: Timer | number) {
    const s = typeof timerOrMS === 'number' ? timerOrMS / 1000 : timerOrMS.s();
    this[metric].record(s, {
      [Attributes.APP_CIRCUIT_NAME]: appCircuitName,
    });
  }

  /**
   * Records the size of a circuit operation.
   * @param metric - Records the size of a circuit operation.
   * @param circuitName - The name of the circuit
   * @param size - The size
   */
  recordSize(
    metric: 'witGenInputSize' | 'witGenOutputSize' | 'proofSize' | 'circuitSize' | 'circuitPublicInputCount',
    circuitName: CircuitName,
    size: number,
  ) {
    this[metric].record(Math.ceil(size), {
      [Attributes.PROTOCOL_CIRCUIT_NAME]: circuitName,
    });
  }

  /**
   * Records the size of an AVM circuit operation.
   * @param metric - The metric to record
   * @param appCircuitName - The name of the function circuit (should be a `contract:function` string)
   * @param size - The size
   */
  recordAvmSize(
    metric: 'witGenInputSize' | 'witGenOutputSize' | 'proofSize' | 'circuitSize' | 'circuitPublicInputCount',
    appCircuitName: string,
    size: number,
  ) {
    this[metric].record(Math.ceil(size), {
      [Attributes.APP_CIRCUIT_NAME]: appCircuitName,
    });
  }
}
