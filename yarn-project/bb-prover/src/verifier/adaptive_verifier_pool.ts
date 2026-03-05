import { type Logger, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { ClientProtocolCircuitVerifier, IVCProofVerificationResult } from '@aztec/stdlib/interfaces/server';
import type { Tx } from '@aztec/stdlib/tx';
import {
  Attributes,
  type BatchObservableResult,
  type Gauge,
  type Histogram,
  Metrics,
  type ObservableGauge,
  type TelemetryClient,
  type UpDownCounter,
  createUpDownCounterWithDefault,
  getTelemetryClient,
} from '@aztec/telemetry-client';

import { createHistogram } from 'node:perf_hooks';
import * as os from 'os';

import type { BBConfig } from '../config.js';

/**
 * Samples instantaneous system CPU utilization as a fraction 0..1.
 * Uses the delta between two os.cpus() snapshots taken `sampleMs` apart.
 */
async function sampleCpuUtilization(sampleMs = 100): Promise<number> {
  const snap = () => {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
    }
    return { idle, total };
  };

  const before = snap();
  await new Promise(resolve => setTimeout(resolve, sampleMs));
  const after = snap();

  const idleDelta = after.idle - before.idle;
  const totalDelta = after.total - before.total;
  return totalDelta === 0 ? 0 : 1 - idleDelta / totalDelta;
}

/** Configuration for adaptive thread allocation. */
export interface AdaptivePoolConfig {
  /** Total CPU cores available to the verifier pool. */
  totalCores: number;
  /** Max concurrent verification jobs. */
  maxConcurrentJobs: number;
  /** Max threads to give a single job when the system is idle. */
  maxCoresPerJob: number;
  /** How long (ms) the system must be idle before granting max cores. */
  quietThresholdMs: number;
}

/**
 * Snapshot of pool contention state reported when a verification job starts.
 * Emitted to logs and telemetry for diagnosing slow verifications.
 */
export interface ContentionSnapshot {
  /** Number of jobs waiting in the queue. */
  queueDepth: number;
  /** Number of jobs currently executing. */
  activeJobs: number;
  /** Threads allocated to this job. */
  allocatedThreads: number;
  /** System CPU utilization 0..1 at job start. */
  cpuUtilization: number;
  /** Milliseconds since last job completed (Infinity if none). */
  timeSinceLastCompletionMs: number;
}

class AdaptivePoolMetrics {
  private verificationHistogram: Histogram;
  private totalVerificationHistogram: Histogram;
  private failureCount: UpDownCounter;
  private localHistogramOk = createHistogram({ min: 1, max: 5 * 60 * 1000 });
  private localHistogramFails = createHistogram({ min: 1, max: 5 * 60 * 1000 });
  private aggDurationMetrics: Record<'min' | 'max' | 'p50' | 'p90' | 'avg', ObservableGauge>;
  private queueDepthGauge: Gauge;
  private activeJobsGauge: Gauge;
  private allocatedThreadsHistogram: Histogram;
  private cpuUtilizationGauge: Gauge;

  constructor(client: TelemetryClient) {
    const meter = client.getMeter('AdaptiveVerifierPool');

    this.verificationHistogram = meter.createHistogram(Metrics.IVC_VERIFIER_TIME);
    this.totalVerificationHistogram = meter.createHistogram(Metrics.IVC_VERIFIER_TOTAL_TIME);
    this.failureCount = createUpDownCounterWithDefault(meter, Metrics.IVC_VERIFIER_FAILURE_COUNT);

    this.aggDurationMetrics = {
      avg: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_AVG),
      max: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_MAX),
      min: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_MIN),
      p50: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_P50),
      p90: meter.createObservableGauge(Metrics.IVC_VERIFIER_AGG_DURATION_P90),
    };
    meter.addBatchObservableCallback(this.aggregate, Object.values(this.aggDurationMetrics));

    this.queueDepthGauge = meter.createGauge(Metrics.IVC_VERIFIER_QUEUE_DEPTH);
    this.activeJobsGauge = meter.createGauge(Metrics.IVC_VERIFIER_ACTIVE_JOBS);
    this.allocatedThreadsHistogram = meter.createHistogram(Metrics.IVC_VERIFIER_ALLOCATED_THREADS);
    this.cpuUtilizationGauge = meter.createGauge(Metrics.IVC_VERIFIER_CPU_UTILIZATION);
  }

  recordContention(snap: ContentionSnapshot) {
    this.queueDepthGauge.record(snap.queueDepth);
    this.activeJobsGauge.record(snap.activeJobs);
    this.allocatedThreadsHistogram.record(snap.allocatedThreads);
    this.cpuUtilizationGauge.record(Math.round(snap.cpuUtilization * 100));
  }

  recordVerification(result: IVCProofVerificationResult) {
    this.verificationHistogram.record(Math.ceil(result.durationMs), { [Attributes.OK]: result.valid });
    this.totalVerificationHistogram.record(Math.ceil(result.totalDurationMs), { [Attributes.OK]: result.valid });
    if (!result.valid) {
      this.failureCount.add(1);
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

/**
 * Adaptive verifier pool that dynamically allocates CPU threads per verification job
 * based on queue depth and system load. Replaces the fixed-concurrency QueuedIVCVerifier.
 *
 * Strategy:
 * - Deep queue: 1 thread per job (maximize throughput, minimize contention)
 * - Empty queue + quiet system: up to maxCoresPerJob threads (minimize latency)
 * - In between: threads = floor(totalCores / totalLoad)
 */
export class AdaptiveVerifierPool implements ClientProtocolCircuitVerifier {
  private activeJobs = 0;
  private pendingJobs = 0;
  private lastCompletionTime = 0;
  private readonly metrics: AdaptivePoolMetrics;
  private readonly poolConfig: AdaptivePoolConfig;
  private readonly semaphore: Array<() => void> = [];
  private running = 0;
  private stopped = false;

  constructor(
    bbConfig: BBConfig,
    private readonly verifier: ClientProtocolCircuitVerifier,
    telemetry: TelemetryClient = getTelemetryClient(),
    private readonly logger: Logger = createLogger('bb-prover:adaptive_verifier_pool'),
  ) {
    const totalCores = os.cpus().length;
    this.poolConfig = {
      totalCores,
      maxConcurrentJobs: bbConfig.numConcurrentIVCVerifiers,
      maxCoresPerJob: Math.min(bbConfig.bbIVCConcurrency > 1 ? bbConfig.bbIVCConcurrency : 8, totalCores),
      quietThresholdMs: 2000,
    };
    this.metrics = new AdaptivePoolMetrics(telemetry);
    this.logger.info('Starting AdaptiveVerifierPool', {
      totalCores: this.poolConfig.totalCores,
      maxConcurrentJobs: this.poolConfig.maxConcurrentJobs,
      maxCoresPerJob: this.poolConfig.maxCoresPerJob,
      quietThresholdMs: this.poolConfig.quietThresholdMs,
    });
  }

  /**
   * Determine how many threads to allocate for a job starting now.
   * Called while holding the scheduling lock (after acquiring a semaphore slot).
   */
  private computeThreadAllocation(): number {
    const { totalCores, maxCoresPerJob } = this.poolConfig;
    const totalLoad = this.activeJobs + this.pendingJobs;

    if (totalLoad <= 1) {
      // Only this job: check if system has been quiet
      const quietMs = this.lastCompletionTime > 0 ? Date.now() - this.lastCompletionTime : Infinity;
      if (quietMs >= this.poolConfig.quietThresholdMs || this.lastCompletionTime === 0) {
        return maxCoresPerJob;
      }
      // Recently active — use moderate allocation
      return Math.min(Math.max(Math.floor(totalCores / 2), 1), maxCoresPerJob);
    }

    if (this.pendingJobs > this.activeJobs) {
      // Deep queue — maximize throughput with 1 thread each
      return 1;
    }

    // Moderate load — share cores across active + pending jobs
    const threadsPerJob = Math.max(Math.floor(totalCores / totalLoad), 1);
    return Math.min(threadsPerJob, maxCoresPerJob);
  }

  /** Acquire a slot from the concurrency semaphore, waiting if at max capacity. */
  private async acquireSlot(): Promise<void> {
    if (this.running < this.poolConfig.maxConcurrentJobs) {
      this.running++;
      return;
    }
    return new Promise(resolve => {
      this.semaphore.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  private releaseSlot() {
    this.running--;
    const next = this.semaphore.shift();
    if (next) {
      next();
    }
  }

  public async verifyProof(tx: Tx): Promise<IVCProofVerificationResult> {
    if (this.stopped) {
      return { valid: false, durationMs: 0, totalDurationMs: 0 };
    }

    this.pendingJobs++;

    // Wait for a concurrency slot
    await this.acquireSlot();

    this.pendingJobs--;
    this.activeJobs++;

    const threads = this.computeThreadAllocation();

    const contention: ContentionSnapshot = {
      queueDepth: this.pendingJobs,
      activeJobs: this.activeJobs,
      allocatedThreads: threads,
      cpuUtilization: -1, // filled asynchronously below
      timeSinceLastCompletionMs: this.lastCompletionTime > 0 ? Date.now() - this.lastCompletionTime : -1,
    };

    this.logger.verbose('Starting verification job', {
      queueDepth: contention.queueDepth,
      activeJobs: contention.activeJobs,
      allocatedThreads: contention.allocatedThreads,
      quietMs: contention.timeSinceLastCompletionMs,
    });

    // Sample CPU utilization in the background — don't block verification start
    void sampleCpuUtilization(50)
      .then(cpu => {
        contention.cpuUtilization = cpu;
        this.metrics.recordContention(contention);
        this.logger.verbose('CPU sample for verification job', {
          cpuPercent: Math.round(cpu * 100),
          allocatedThreads: threads,
        });
      })
      .catch(() => {
        this.metrics.recordContention(contention);
      });

    const totalTimer = new Timer();
    try {
      const result = await this.verifyWithThreads(tx, threads);
      this.metrics.recordVerification(result);

      if (result.totalDurationMs > 1000) {
        this.logger.warn('Slow verification detected', {
          totalDurationMs: result.totalDurationMs,
          durationMs: result.durationMs,
          allocatedThreads: threads,
          activeJobs: contention.activeJobs,
          queueDepth: contention.queueDepth,
          cpuPercent: Math.round(contention.cpuUtilization * 100),
        });
      }

      return result;
    } catch (err) {
      this.logger.error(`Verification failed: ${String(err)}`);
      return { valid: false, durationMs: 0, totalDurationMs: totalTimer.ms() };
    } finally {
      this.activeJobs--;
      this.lastCompletionTime = Date.now();
      this.releaseSlot();
    }
  }

  /**
   * Run verification with the specified thread count.
   * We temporarily override the verifier's config to use the adaptive thread count.
   */
  private async verifyWithThreads(tx: Tx, threads: number): Promise<IVCProofVerificationResult> {
    // The underlying BBCircuitVerifier reads bbIVCConcurrency from its config.
    // We need to inject the thread count. Since the verifier creates a new bb process
    // per call and passes config.bbIVCConcurrency as HARDWARE_CONCURRENCY,
    // we use the AdaptiveBBCircuitVerifier wrapper that intercepts this.
    const verifier = this.verifier as AdaptiveThreadAware;
    if (verifier.verifyProofWithThreads) {
      return verifier.verifyProofWithThreads(tx, threads);
    }
    // Fallback: use default verification
    return this.verifier.verifyProof(tx);
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    // Drain pending jobs
    for (const waiter of this.semaphore) {
      waiter();
    }
    this.semaphore.length = 0;
    return this.verifier.stop();
  }
}

/** Interface for verifiers that support dynamic thread allocation. */
export interface AdaptiveThreadAware {
  verifyProofWithThreads?(tx: Tx, threads: number): Promise<IVCProofVerificationResult>;
}
