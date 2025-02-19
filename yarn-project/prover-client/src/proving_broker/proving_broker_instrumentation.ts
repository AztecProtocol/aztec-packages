import { ProvingRequestType } from '@aztec/circuit-types';
import { type Timer } from '@aztec/foundation/timer';
import {
  Attributes,
  type Histogram,
  Metrics,
  type ObservableGauge,
  type ObservableResult,
  type TelemetryClient,
  type UpDownCounter,
  ValueType,
} from '@aztec/telemetry-client';

export type MonitorCallback = (proofType: ProvingRequestType) => number;

export class ProvingBrokerInstrumentation {
  private queueSize: ObservableGauge;
  private activeJobs: ObservableGauge;
  private resolvedJobs: UpDownCounter;
  private rejectedJobs: UpDownCounter;
  private timedOutJobs: UpDownCounter;
  private jobWait: Histogram;
  private jobDuration: Histogram;
  private retriedJobs: UpDownCounter;

  constructor(client: TelemetryClient, name = 'ProvingBroker') {
    const meter = client.getMeter(name);

    this.queueSize = meter.createObservableGauge(Metrics.PROVING_QUEUE_SIZE, {
      valueType: ValueType.INT,
    });

    this.activeJobs = meter.createObservableGauge(Metrics.PROVING_QUEUE_ACTIVE_JOBS, {
      valueType: ValueType.INT,
    });

    this.resolvedJobs = meter.createUpDownCounter(Metrics.PROVING_QUEUE_RESOLVED_JOBS, {
      valueType: ValueType.INT,
    });

    this.rejectedJobs = meter.createUpDownCounter(Metrics.PROVING_QUEUE_REJECTED_JOBS, {
      valueType: ValueType.INT,
    });

    this.retriedJobs = meter.createUpDownCounter(Metrics.PROVING_QUEUE_RETRIED_JOBS, {
      valueType: ValueType.INT,
    });

    this.timedOutJobs = meter.createUpDownCounter(Metrics.PROVING_QUEUE_TIMED_OUT_JOBS, {
      valueType: ValueType.INT,
    });

    this.jobWait = meter.createHistogram(Metrics.PROVING_QUEUE_JOB_WAIT, {
      description: 'Records how long a job sits in the queue',
      unit: 'ms',
      valueType: ValueType.INT,
    });

    this.jobDuration = meter.createHistogram(Metrics.PROVING_QUEUE_JOB_DURATION, {
      description: 'Records how long a job takes to complete',
      unit: 'ms',
      valueType: ValueType.INT,
    });
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
