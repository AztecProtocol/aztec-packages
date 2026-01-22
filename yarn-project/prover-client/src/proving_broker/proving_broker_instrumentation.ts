import type { Timer } from '@aztec/foundation/timer';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import {
  Attributes,
  type Histogram,
  Metrics,
  type ObservableGauge,
  type ObservableResult,
  type TelemetryClient,
  type UpDownCounter,
} from '@aztec/telemetry-client';

export type MonitorCallback = (proofType: ProvingRequestType) => number;

export class ProvingBrokerInstrumentation {
  private queueSize: ObservableGauge;
  private activeJobs: ObservableGauge;
  private resolvedJobs: UpDownCounter;
  private rejectedJobs: UpDownCounter;
  private timedOutJobs: UpDownCounter;
  private cachedJobs: UpDownCounter;
  private totalJobs: UpDownCounter;
  private jobWait: Histogram;
  private jobDuration: Histogram;
  private retriedJobs: UpDownCounter;

  constructor(client: TelemetryClient, name = 'ProvingBroker') {
    const meter = client.getMeter(name);

    this.queueSize = meter.createObservableGauge(Metrics.PROVING_QUEUE_SIZE);

    this.activeJobs = meter.createObservableGauge(Metrics.PROVING_QUEUE_ACTIVE_JOBS);

    this.resolvedJobs = meter.createUpDownCounter(Metrics.PROVING_QUEUE_RESOLVED_JOBS);

    this.rejectedJobs = meter.createUpDownCounter(Metrics.PROVING_QUEUE_REJECTED_JOBS);

    this.retriedJobs = meter.createUpDownCounter(Metrics.PROVING_QUEUE_RETRIED_JOBS);

    this.timedOutJobs = meter.createUpDownCounter(Metrics.PROVING_QUEUE_TIMED_OUT_JOBS);

    this.cachedJobs = meter.createUpDownCounter(Metrics.PROVING_QUEUE_CACHED_JOBS);

    this.totalJobs = meter.createUpDownCounter(Metrics.PROVING_QUEUE_TOTAL_JOBS);

    this.jobWait = meter.createHistogram(Metrics.PROVING_QUEUE_JOB_WAIT);

    this.jobDuration = meter.createHistogram(Metrics.PROVING_QUEUE_JOB_DURATION);
  }

  monitorQueueDepth(fn: MonitorCallback) {
    this.queueSize.addCallback(obs => this.observe(obs, fn));
  }

  monitorActiveJobs(fn: MonitorCallback) {
    this.activeJobs.addCallback(obs => this.observe(obs, fn));
  }

  incResolvedJobs(proofType: ProvingRequestType) {
    this.resolvedJobs.add(1, {
      [Attributes.PROVING_JOB_TYPE]: ProvingRequestType[proofType],
    });
  }

  incRejectedJobs(proofType: ProvingRequestType) {
    this.rejectedJobs.add(1, {
      [Attributes.PROVING_JOB_TYPE]: ProvingRequestType[proofType],
    });
  }

  incRetriedJobs(proofType: ProvingRequestType) {
    this.retriedJobs.add(1, {
      [Attributes.PROVING_JOB_TYPE]: ProvingRequestType[proofType],
    });
  }

  incTimedOutJobs(proofType: ProvingRequestType) {
    this.timedOutJobs.add(1, {
      [Attributes.PROVING_JOB_TYPE]: ProvingRequestType[proofType],
    });
  }

  incCachedJobs(proofType: ProvingRequestType) {
    this.cachedJobs.add(1, {
      [Attributes.PROVING_JOB_TYPE]: ProvingRequestType[proofType],
    });
  }

  incTotalJobs(proofType: ProvingRequestType) {
    this.totalJobs.add(1, {
      [Attributes.PROVING_JOB_TYPE]: ProvingRequestType[proofType],
    });
  }

  recordJobWait(proofType: ProvingRequestType, msOrTimer: Timer | number) {
    const duration = typeof msOrTimer === 'number' ? msOrTimer : Math.floor(msOrTimer.ms());
    this.jobWait.record(duration, {
      [Attributes.PROVING_JOB_TYPE]: ProvingRequestType[proofType],
    });
  }

  recordJobDuration(proofType: ProvingRequestType, msOrTimer: Timer | number) {
    const duration = typeof msOrTimer === 'number' ? msOrTimer : Math.floor(msOrTimer.ms());
    this.jobDuration.record(duration, {
      [Attributes.PROVING_JOB_TYPE]: ProvingRequestType[proofType],
    });
  }

  private observe(obs: ObservableResult, fn: MonitorCallback) {
    for (const proofType of Object.values(ProvingRequestType)) {
      // a type predicate for TypeScript to recognize that we're only iterating over enum values
      if (typeof proofType !== 'number') {
        continue;
      }
      obs.observe(fn(proofType), {
        [Attributes.PROVING_JOB_TYPE]: ProvingRequestType[proofType],
      });
    }
  }
}
