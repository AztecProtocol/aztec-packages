import type { IVCProofVerificationResult } from '@aztec/stdlib/interfaces/server';
import {
  Attributes,
  type BatchObservableResult,
  type Histogram,
  Metrics,
  type ObservableGauge,
  type TelemetryClient,
  type UpDownCounter,
  createUpDownCounterWithDefault,
} from '@aztec/telemetry-client';

import { createHistogram } from 'node:perf_hooks';

/** Shared metrics for Chonk proof verification, used by both BatchChonkVerifier and QueuedIVCVerifier. */
export class ChonkVerifierMetrics {
  private ivcVerificationHistogram: Histogram;
  private ivcTotalVerificationHistogram: Histogram;
  private ivcFailureCount: UpDownCounter;
  private queueDepth: ObservableGauge;
  private localHistogramOk = createHistogram({ min: 1, max: 5 * 60 * 1000 });
  private localHistogramFails = createHistogram({ min: 1, max: 5 * 60 * 1000 });
  private aggDurationMetrics: Record<'min' | 'max' | 'p50' | 'p90' | 'avg', ObservableGauge>;
  private currentQueueDepth = 0;

  constructor(client: TelemetryClient, name: string) {
    const meter = client.getMeter(name);
    this.ivcVerificationHistogram = meter.createHistogram(Metrics.IVC_VERIFIER_TIME);
    this.ivcTotalVerificationHistogram = meter.createHistogram(Metrics.IVC_VERIFIER_TOTAL_TIME);
    this.ivcFailureCount = createUpDownCounterWithDefault(meter, Metrics.IVC_VERIFIER_FAILURE_COUNT);
    this.queueDepth = meter.createObservableGauge(Metrics.IVC_VERIFIER_QUEUE_DEPTH);
    this.queueDepth.addCallback(res => res.observe(this.currentQueueDepth));
    this.aggDurationMetrics = {
      avg: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_AVG),
      max: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_MAX),
      min: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_MIN),
      p50: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_P50),
      p90: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_P90),
    };
    meter.addBatchObservableCallback(this.aggregate, Object.values(this.aggDurationMetrics));
  }

  updateQueueDepth(depth: number) {
    this.currentQueueDepth = depth;
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
