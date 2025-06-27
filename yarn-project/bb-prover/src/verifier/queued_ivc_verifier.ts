import { createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import type { ClientProtocolCircuitVerifier, IVCProofVerificationResult } from '@aztec/stdlib/interfaces/server';
import type { Tx } from '@aztec/stdlib/tx';
import {
  Attributes,
  type BatchObservableResult,
  type Histogram,
  Metrics,
  type ObservableGauge,
  type TelemetryClient,
  type UpDownCounter,
  ValueType,
  getTelemetryClient,
} from '@aztec/telemetry-client';

import { createHistogram } from 'node:perf_hooks';

import type { BBConfig } from '../config.js';

class IVCVerifierMetrics {
  private ivcVerificationHistogram: Histogram;
  private ivcTotalVerificationHistogram: Histogram;
  private ivcFailureCount: UpDownCounter;
  private localHistogramOk = createHistogram({
    min: 1,
    max: 5 * 60 * 1000, // 5 min
  });
  private localHistogramFails = createHistogram({
    min: 1,
    max: 5 * 60 * 1000, // 5 min
  });

  private aggDurationMetrics: Record<'min' | 'max' | 'p50' | 'p90' | 'avg', ObservableGauge>;

  constructor(client: TelemetryClient, name = 'QueuedIVCVerifier') {
    const meter = client.getMeter(name);

    this.ivcVerificationHistogram = meter.createHistogram(Metrics.IVC_VERIFIER_TIME, {
      unit: 'ms',
      description: 'Duration to verify client IVC proofs',
      valueType: ValueType.INT,
    });

    this.ivcTotalVerificationHistogram = meter.createHistogram(Metrics.IVC_VERIFIER_TOTAL_TIME, {
      unit: 'ms',
      description: 'Total duration to verify client IVC proofs, including serde',
      valueType: ValueType.INT,
    });

    this.ivcFailureCount = meter.createUpDownCounter(Metrics.IVC_VERIFIER_FAILURE_COUNT, {
      description: 'Count of failed IVC proof verifications',
      valueType: ValueType.INT,
    });

    this.aggDurationMetrics = {
      avg: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_AVG, {
        valueType: ValueType.DOUBLE,
        description: 'AVG ivc verification',
        unit: 'ms',
      }),
      max: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_MAX, {
        valueType: ValueType.DOUBLE,
        description: 'MAX ivc verification',
        unit: 'ms',
      }),
      min: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_MIN, {
        valueType: ValueType.DOUBLE,
        description: 'MIN ivc verification',
        unit: 'ms',
      }),
      p50: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_P50, {
        valueType: ValueType.DOUBLE,
        description: 'P50 ivc verification',
        unit: 'ms',
      }),
      p90: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_P90, {
        valueType: ValueType.DOUBLE,
        description: 'P90 ivc verification',
        unit: 'ms',
      }),
    };

    meter.addBatchObservableCallback(this.aggregate, Object.values(this.aggDurationMetrics));
  }

  recordIVCVerification(result: IVCProofVerificationResult) {
    this.ivcVerificationHistogram.record(Math.ceil(result.durationMs), { [Attributes.OK]: result.valid });
    this.ivcTotalVerificationHistogram.record(Math.ceil(result.totalDurationMs), { [Attributes.OK]: result.valid });
    if (!result.valid) {
      this.ivcFailureCount.add(1);
      this.localHistogramFails.record(result.durationMs);
    } else {
      this.localHistogramOk.record(result.durationMs);
    }
  }

  private aggregate = (res: BatchObservableResult) => {
    for (const [histogram, ok] of [
      [this.localHistogramOk, true],
      [this.localHistogramFails, false],
    ] as const) {
      res.observe(this.aggDurationMetrics.avg, histogram.mean, { [Attributes.OK]: ok });
      res.observe(this.aggDurationMetrics.max, histogram.max, { [Attributes.OK]: ok });
      res.observe(this.aggDurationMetrics.min, histogram.min, { [Attributes.OK]: ok });
      res.observe(this.aggDurationMetrics.p50, histogram.percentile(50), { [Attributes.OK]: ok });
      res.observe(this.aggDurationMetrics.p90, histogram.percentile(90), { [Attributes.OK]: ok });
    }
  };
}

export class QueuedIVCVerifier implements ClientProtocolCircuitVerifier {
  private queue: SerialQueue;
  private metrics: IVCVerifierMetrics;

  public constructor(
    config: BBConfig,
    private verifier: ClientProtocolCircuitVerifier,
    private telemetry: TelemetryClient = getTelemetryClient(),
    private logger = createLogger('bb-prover:queued_ivc_verifier'),
  ) {
    this.metrics = new IVCVerifierMetrics(this.telemetry, 'QueuedIVCVerifier');
    this.queue = new SerialQueue();
    this.logger.info(`Starting QueuedIVCVerifier with ${config.numConcurrentIVCVerifiers} concurrent verifiers`);
    this.queue.start(config.numConcurrentIVCVerifiers);
  }

  public async verifyProof(tx: Tx): Promise<IVCProofVerificationResult> {
    const result = await this.queue.put(() => this.verifier.verifyProof(tx));
    this.metrics.recordIVCVerification(result);
    return result;
  }

  stop(): Promise<void> {
    return this.queue.end();
  }
}
