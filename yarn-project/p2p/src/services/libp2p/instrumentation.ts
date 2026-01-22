import type { Timer } from '@aztec/foundation/timer';
import { TopicType } from '@aztec/stdlib/p2p';
import {
  Attributes,
  type BatchObservableResult,
  type Histogram,
  Metrics,
  type ObservableGauge,
  type TelemetryClient,
  type UpDownCounter,
} from '@aztec/telemetry-client';

import { type RecordableHistogram, createHistogram } from 'node:perf_hooks';

export class P2PInstrumentation {
  private messageValidationDuration: Histogram;
  private messagePrevalidationCount: UpDownCounter;
  private messageLatency: Histogram;
  private txReceivedCount: UpDownCounter;

  private aggLatencyHisto = new Map<TopicType, RecordableHistogram>();
  private aggValidationHisto = new Map<TopicType, RecordableHistogram>();

  private aggLatencyMetrics: Record<'min' | 'max' | 'p50' | 'p90' | 'avg', ObservableGauge>;
  private aggValidationMetrics: Record<'min' | 'max' | 'p50' | 'p90' | 'avg', ObservableGauge>;

  constructor(client: TelemetryClient, name: string) {
    const meter = client.getMeter(name);

    this.messageValidationDuration = meter.createHistogram(Metrics.P2P_GOSSIP_MESSAGE_VALIDATION_DURATION);

    this.messagePrevalidationCount = meter.createUpDownCounter(Metrics.P2P_GOSSIP_MESSAGE_PREVALIDATION_COUNT);

    this.messageLatency = meter.createHistogram(Metrics.P2P_GOSSIP_MESSAGE_LATENCY);

    this.txReceivedCount = meter.createUpDownCounter(Metrics.P2P_GOSSIP_TX_RECEIVED_COUNT);

    this.aggLatencyMetrics = {
      avg: meter.createObservableGauge(Metrics.P2P_GOSSIP_AGG_MESSAGE_LATENCY_AVG),
      max: meter.createObservableGauge(Metrics.P2P_GOSSIP_AGG_MESSAGE_LATENCY_MAX),
      min: meter.createObservableGauge(Metrics.P2P_GOSSIP_AGG_MESSAGE_LATENCY_MIN),
      p50: meter.createObservableGauge(Metrics.P2P_GOSSIP_AGG_MESSAGE_LATENCY_P50),
      p90: meter.createObservableGauge(Metrics.P2P_GOSSIP_AGG_MESSAGE_LATENCY_P90),
    };

    this.aggValidationMetrics = {
      avg: meter.createObservableGauge(Metrics.P2P_GOSSIP_AGG_MESSAGE_VALIDATION_DURATION_AVG),
      max: meter.createObservableGauge(Metrics.P2P_GOSSIP_AGG_MESSAGE_VALIDATION_DURATION_MAX),
      min: meter.createObservableGauge(Metrics.P2P_GOSSIP_AGG_MESSAGE_VALIDATION_DURATION_MIN),
      p50: meter.createObservableGauge(Metrics.P2P_GOSSIP_AGG_MESSAGE_VALIDATION_DURATION_P50),
      p90: meter.createObservableGauge(Metrics.P2P_GOSSIP_AGG_MESSAGE_VALIDATION_DURATION_P90),
    };

    meter.addBatchObservableCallback(this.aggregate, [
      ...Object.values(this.aggValidationMetrics),
      ...Object.values(this.aggLatencyMetrics),
    ]);
  }

  public recordMessageValidation(topicName: TopicType, timerOrMs: Timer | number) {
    const ms = Math.ceil(typeof timerOrMs === 'number' ? timerOrMs : timerOrMs.ms());
    this.messageValidationDuration.record(ms, { [Attributes.TOPIC_NAME]: topicName });

    let validationHistogram = this.aggValidationHisto.get(topicName);
    if (!validationHistogram) {
      validationHistogram = createHistogram({ min: 1, max: 5 * 60 * 1000 }); // 5 mins
      this.aggValidationHisto.set(topicName, validationHistogram);
    }

    validationHistogram.record(Math.max(ms, 1));
  }

  public incrementTxReceived(count: number) {
    this.txReceivedCount.add(count);
  }

  public incMessagePrevalidationStatus(passed: boolean, topicName: TopicType | undefined) {
    this.messagePrevalidationCount.add(1, { [Attributes.TOPIC_NAME]: topicName, [Attributes.OK]: passed });
  }

  public recordMessageLatency(topicName: TopicType, timerOrMs: Timer | number) {
    const ms = Math.ceil(typeof timerOrMs === 'number' ? timerOrMs : timerOrMs.ms());
    this.messageLatency.record(ms, { [Attributes.TOPIC_NAME]: topicName });

    let latencyHistogram = this.aggLatencyHisto.get(topicName);
    if (!latencyHistogram) {
      latencyHistogram = createHistogram({ min: 1, max: 60 * 1000 }); // Max: 1 minute
      this.aggLatencyHisto.set(topicName, latencyHistogram);
    }

    latencyHistogram.record(Math.max(ms, 1));
  }

  private aggregate = (res: BatchObservableResult) => {
    for (const [metrics, histograms] of [
      [this.aggLatencyMetrics, this.aggLatencyHisto],
      [this.aggValidationMetrics, this.aggValidationHisto],
    ] as const) {
      for (const topicName of Object.values(TopicType)) {
        const histogram = histograms.get(topicName);
        if (!histogram || histogram.count === 0) {
          continue;
        }

        res.observe(metrics.avg, Math.ceil(histogram.mean), { [Attributes.TOPIC_NAME]: topicName });
        res.observe(metrics.max, Math.ceil(histogram.max), { [Attributes.TOPIC_NAME]: topicName });
        res.observe(metrics.min, Math.ceil(histogram.min), { [Attributes.TOPIC_NAME]: topicName });
        res.observe(metrics.p50, Math.ceil(histogram.percentile(50)), { [Attributes.TOPIC_NAME]: topicName });
        res.observe(metrics.p90, Math.ceil(histogram.percentile(90)), { [Attributes.TOPIC_NAME]: topicName });
      }
    }
  };
}
