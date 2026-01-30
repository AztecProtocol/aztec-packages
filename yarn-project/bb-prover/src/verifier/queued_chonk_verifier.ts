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
  createUpDownCounterWithDefault,
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

    this.ivcVerificationHistogram = meter.createHistogram(Metrics.IVC_VERIFIER_TIME);

    this.ivcTotalVerificationHistogram = meter.createHistogram(Metrics.IVC_VERIFIER_TOTAL_TIME);

    this.ivcFailureCount = createUpDownCounterWithDefault(meter, Metrics.IVC_VERIFIER_FAILURE_COUNT);

    this.aggDurationMetrics = {
      avg: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_AVG),
      max: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_MAX),
      min: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_MIN),
      p50: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_P50),
      p90: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_P90),
    };

    meter.addBatchObservableCallback(this.aggregate, Object.values(this.aggDurationMetrics));
  }

  recordIVCVerification(result: IVCProofVerificationResult) {
    this.ivcVerificationHistogram.record(Math.ceil(result.durationMs), { [Attributes.OK]: result.valid });
    this.ivcTotalVerificationHistogram.record(Math.ceil(result.totalDurationMs), { [Attributes.OK]: result.valid });
    if (!result.valid) {
      this.ivcFailureCount.add(1);
      this.localHistogramFails.record(Math.max(Math.ceil(result.durationMs), 1));
    } else {
      this.localHistogramOk.record(Math.max(Math.ceil(result.durationMs), 1));
    }
  }

  private aggregate = (res: BatchObservableResult) => {
    for (const [histogram, ok] of [
      [this.localHistogramOk, true],
      [this.localHistogramFails, false],
    ] as const) {
      if (histogram.count === 0) {
        continue;
      }
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
    private logger = createLogger('bb-prover:queued_chonk_verifier'),
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
