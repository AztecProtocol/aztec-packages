import {
  type ProofUri,
  type ProvingJob,
  type ProvingJobConsumer,
  type ProvingJobFilter,
  type ProvingJobId,
  type ProvingJobProducer,
  type ProvingJobSettledResult,
  type ProvingJobStatus,
  ProvingRequestType,
} from '@aztec/circuit-types';
import { asyncPool } from '@aztec/foundation/async-pool';
import { createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, RunningPromise, promiseWithResolvers } from '@aztec/foundation/promise';
import { PriorityMemoryQueue } from '@aztec/foundation/queue';
import { Timer } from '@aztec/foundation/timer';
import { type TelemetryClient, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import assert from 'assert';

import { type ProvingBrokerDatabase } from './proving_broker_database.js';
import { type MonitorCallback, ProvingBrokerInstrumentation } from './proving_broker_instrumentation.js';

type InProgressMetadata = {
  id: ProvingJobId;
  startedAt: number;
  lastUpdatedAt: number;
};

type ProofRequestBrokerConfig = {
  timeoutIntervalMs?: number;
  jobTimeoutMs?: number;
  maxRetries?: number;
  maxEpochsToKeepResultsFor?: number;
  maxParallelCleanUps?: number;
};

type EnqueuedProvingJob = Pick<ProvingJob, 'id' | 'epochNumber'>;

/**
 * A broker that manages proof requests and distributes them to workers based on their priority.
 * It takes a backend that is responsible for storing and retrieving proof requests and results.
 */
export class ProvingBroker implements ProvingJobProducer, ProvingJobConsumer, Traceable {
  private queues: ProvingQueues = {
    [ProvingRequestType.PUBLIC_VM]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.TUBE_PROOF]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.PRIVATE_KERNEL_EMPTY]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),

    [ProvingRequestType.PRIVATE_BASE_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.PUBLIC_BASE_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.MERGE_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.ROOT_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),

    [ProvingRequestType.BLOCK_MERGE_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.BLOCK_ROOT_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),

    [ProvingRequestType.BASE_PARITY]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.ROOT_PARITY]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
  };

  // holds a copy of the database in memory in order to quickly fulfill requests
  // this is fine because this broker is the only one that can modify the database
  private jobsCache = new Map<ProvingJobId, ProvingJob>();
  // as above, but for results
  private resultsCache = new Map<ProvingJobId, ProvingJobSettledResult>();

  // tracks when each job was enqueued
  private enqueuedAt = new Map<ProvingJobId, Timer>();

  // keeps track of which jobs are currently being processed
  // in the event of a crash this information is lost, but that's ok
  // the next time the broker starts it will recreate jobsCache and still
  // accept results from the workers
  private inProgress = new Map<ProvingJobId, InProgressMetadata>();

  // keep track of which proving job has been retried
  private retries = new Map<ProvingJobId, number>();

  // a map of promises that will be resolved when a job is settled
  private promises = new Map<ProvingJobId, PromiseWithResolvers<ProvingJobSettledResult>>();

  private cleanupPromise: RunningPromise;
  private msTimeSource = () => Date.now();
  private jobTimeoutMs: number;
  private maxRetries: number;

  private instrumentation: ProvingBrokerInstrumentation;
  public readonly tracer: Tracer;

  private maxParallelCleanUps: number;

  /**
   * The broker keeps track of the highest epoch its seen.
   * This information is used for garbage collection: once it reaches the next epoch, it can start pruning the database of old state.
   * This clean up pass is only done against _settled_ jobs. This pass will not cancel jobs that are in-progress or in-queue.
   * It is a client responsibility to cancel jobs if they are no longer necessary.
   * Example:
   * proving epoch 11 - the broker will wipe all setlled jobs for epochs 9 and lower
   * finished proving epoch 11 and got first job for epoch 12 -> the broker will wipe all setlled jobs for epochs 10 and lower
   * reorged back to end of epoch 10 -> epoch 11 is skipped and epoch 12 starts -> the broker will wipe all setlled jobs for epochs 10 and lower
   */
  private epochHeight = 0;
  private maxEpochsToKeepResultsFor = 1;

  public constructor(
    private database: ProvingBrokerDatabase,
    client: TelemetryClient,
    {
      jobTimeoutMs = 30_000,
      timeoutIntervalMs = 10_000,
      maxRetries = 3,
      maxEpochsToKeepResultsFor = 1,
      maxParallelCleanUps = 20,
    }: ProofRequestBrokerConfig = {},
    private logger = createLogger('prover-client:proving-broker'),
  ) {
    this.tracer = client.getTracer('ProvingBroker');
    this.instrumentation = new ProvingBrokerInstrumentation(client);
    this.cleanupPromise = new RunningPromise(this.cleanupPass.bind(this), this.logger, timeoutIntervalMs);
    this.jobTimeoutMs = jobTimeoutMs;
    this.maxRetries = maxRetries;
    this.maxEpochsToKeepResultsFor = maxEpochsToKeepResultsFor;
    this.maxParallelCleanUps = maxParallelCleanUps;
  }

  private measureQueueDepth: MonitorCallback = (type: ProvingRequestType) => {
    return this.queues[type].length();
  };

  private countActiveJobs: MonitorCallback = (type: ProvingRequestType) => {
    let count = 0;
    for (const { id } of this.inProgress.values()) {
      const job = this.jobsCache.get(id);
      if (job?.type === type) {
        count++;
      }
    }

    return count;
  };

  public start(): Promise<void> {
    for (const [item, result] of this.database.allProvingJobs()) {
      this.logger.info(`Restoring proving job id=${item.id} settled=${!!result}`, {
        provingJobId: item.id,
        status: result ? result.status : 'pending',
      });

      this.jobsCache.set(item.id, item);
      this.promises.set(item.id, promiseWithResolvers());

      if (result) {
        this.promises.get(item.id)!.resolve(result);
        this.resultsCache.set(item.id, result);
      } else {
        this.enqueueJobInternal(item);
      }
    }

    this.cleanupPromise.start();

    this.instrumentation.monitorQueueDepth(this.measureQueueDepth);
    this.instrumentation.monitorActiveJobs(this.countActiveJobs);

    return Promise.resolve();
  }

  public async stop(): Promise<void> {
    await this.cleanupPromise.stop();
  }

  public async enqueueProvingJob(job: ProvingJob): Promise<void> {
    if (this.jobsCache.has(job.id)) {
      const existing = this.jobsCache.get(job.id);
      assert.deepStrictEqual(job, existing, 'Duplicate proving job ID');
      this.logger.debug(`Duplicate proving job id=${job.id} epochNumber=${job.epochNumber}. Ignoring`, {
        provingJobId: job.id,
      });
      return;
    }

    if (this.isJobStale(job)) {
      this.logger.warn(`Tried enqueueing stale proving job id=${job.id} epochNumber=${job.epochNumber}`, {
        provingJobId: job.id,
      });
      throw new Error(`Epoch too old: job epoch ${job.epochNumber}, current epoch: ${this.epochHeight}`);
    }

    this.logger.info(`New proving job id=${job.id} epochNumber=${job.epochNumber}`, { provingJobId: job.id });
    try {
      // do this first so it acts as a "lock". If this job is enqueued again while we're saving it the if at the top will catch it.
      this.jobsCache.set(job.id, job);
      await this.database.addProvingJob(job);
      this.enqueueJobInternal(job);
    } catch (err) {
      this.logger.error(`Failed to save proving job id=${job.id}: ${err}`, err, { provingJobId: job.id });
      this.jobsCache.delete(job.id);
      throw err;
    }
  }

  public waitForJobToSettle(id: ProvingJobId): Promise<ProvingJobSettledResult> {
    const promiseWithResolvers = this.promises.get(id);
    if (!promiseWithResolvers) {
      this.logger.warn(`Job id=${id} not found`, { provingJobId: id });
      return Promise.resolve({ status: 'rejected', reason: `Job ${id} not found` });
    }
    return promiseWithResolvers.promise;
  }

  public async cancelProvingJob(id: ProvingJobId): Promise<void> {
    if (!this.jobsCache.has(id)) {
      this.logger.warn(`Can't cancel a job that doesn't exist id=${id}`, { provingJobId: id });
      return;
    }

    // notify listeners of the cancellation
    if (!this.resultsCache.has(id)) {
      this.logger.info(`Cancelling job id=${id}`, { provingJobId: id });
      await this.reportProvingJobError(id, 'Aborted', false);
    }
  }

  private async cleanUpProvingJobState(id: ProvingJobId): Promise<void> {
    if (!this.jobsCache.has(id)) {
      this.logger.warn(`Can't clean up a job that doesn't exist id=${id}`, { provingJobId: id });
      return;
    }

    if (!this.resultsCache.has(id)) {
      this.logger.warn(`Can't cleanup busy proving job: id=${id}`, { provingJobId: id });
      return;
    }

    this.logger.debug(`Cleaning up state for job id=${id}`, { provingJobId: id });
    await this.database.deleteProvingJobAndResult(id);
    this.jobsCache.delete(id);
    this.promises.delete(id);
    this.resultsCache.delete(id);
    this.inProgress.delete(id);
    this.retries.delete(id);
  }

  public getProvingJobStatus(id: ProvingJobId): Promise<ProvingJobStatus> {
    const result = this.resultsCache.get(id);
    if (result) {
      return Promise.resolve(result);
    } else {
      // no result yet, check if we know the item
      const item = this.jobsCache.get(id);

      if (!item) {
        this.logger.warn(`Proving job id=${id} not found`, { provingJobId: id });
        return Promise.resolve({ status: 'not-found' });
      }

      return Promise.resolve({ status: this.inProgress.has(id) ? 'in-progress' : 'in-queue' });
    }
  }

  // eslint-disable-next-line require-await
  async getProvingJob(
    filter: ProvingJobFilter = { allowList: [] },
  ): Promise<{ job: ProvingJob; time: number } | undefined> {
    const allowedProofs: ProvingRequestType[] =
      Array.isArray(filter.allowList) && filter.allowList.length > 0
        ? [...filter.allowList]
        : Object.values(ProvingRequestType).filter((x): x is ProvingRequestType => typeof x === 'number');
    allowedProofs.sort(proofTypeComparator);

    for (const proofType of allowedProofs) {
      const queue = this.queues[proofType];
      let enqueuedJob: EnqueuedProvingJob | undefined;
      // exhaust the queue and make sure we're not sending a job that's already in progress
      // or has already been completed
      // this can happen if the broker crashes and restarts
      // it's possible agents will report progress or results for jobs that are in the queue (after the restart)
      while ((enqueuedJob = queue.getImmediate())) {
        const job = this.jobsCache.get(enqueuedJob.id);
        if (job && !this.inProgress.has(enqueuedJob.id) && !this.resultsCache.has(enqueuedJob.id)) {
          const time = this.msTimeSource();
          this.inProgress.set(job.id, {
            id: job.id,
            startedAt: time,
            lastUpdatedAt: time,
          });
          const enqueuedAt = this.enqueuedAt.get(job.id);
          if (enqueuedAt) {
            this.instrumentation.recordJobWait(job.type, enqueuedAt);
          }

          return { job, time };
        }
      }
    }

    return undefined;
  }

  async reportProvingJobError(id: ProvingJobId, err: string, retry = false): Promise<void> {
    const info = this.inProgress.get(id);
    const item = this.jobsCache.get(id);
    const retries = this.retries.get(id) ?? 0;

    if (!item) {
      this.logger.warn(`Can't set error on unknown proving job id=${id} err=${err}`, { provingJoId: id });
      return;
    }

    if (!info) {
      this.logger.warn(`Proving job id=${id} type=${ProvingRequestType[item.type]} not in the in-progress set`, {
        provingJobId: id,
      });
    } else {
      this.inProgress.delete(id);
    }

    if (this.resultsCache.has(id)) {
      this.logger.warn(`Proving job id=${id} is already settled, ignoring err=${err}`, {
        provingJobId: id,
      });
      return;
    }

    if (retry && retries + 1 < this.maxRetries && !this.isJobStale(item)) {
      this.logger.info(
        `Retrying proving job id=${id} type=${ProvingRequestType[item.type]} retry=${retries + 1} err=${err}`,
        {
          provingJobId: id,
        },
      );
      this.retries.set(id, retries + 1);
      this.enqueueJobInternal(item);
      this.instrumentation.incRetriedJobs(item.type);
      return;
    }

    this.logger.info(
      `Marking proving job as failed id=${id} type=${ProvingRequestType[item.type]} totalAttempts=${
        retries + 1
      } err=${err}`,
      {
        provingJobId: id,
      },
    );

    // save the result to the cache and notify clients of the job status
    // this should work even if our database breaks because the result is cached in memory
    const result: ProvingJobSettledResult = { status: 'rejected', reason: String(err) };
    this.resultsCache.set(id, result);
    this.promises.get(id)!.resolve(result);

    this.instrumentation.incRejectedJobs(item.type);
    if (info) {
      const duration = this.msTimeSource() - info.startedAt;
      this.instrumentation.recordJobDuration(item.type, duration);
    }

    try {
      await this.database.setProvingJobError(id, err);
    } catch (saveErr) {
      this.logger.error(`Failed to save proving job error status id=${id} jobErr=${err}`, saveErr, {
        provingJobId: id,
      });

      throw saveErr;
    }
  }

  reportProvingJobProgress(
    id: ProvingJobId,
    startedAt: number,
    filter?: ProvingJobFilter,
  ): Promise<{ job: ProvingJob; time: number } | undefined> {
    const job = this.jobsCache.get(id);
    if (!job) {
      this.logger.warn(`Proving job id=${id} does not exist`, { provingJobId: id });
      return filter ? this.getProvingJob(filter) : Promise.resolve(undefined);
    }

    if (this.resultsCache.has(id)) {
      this.logger.warn(`Proving job id=${id} has already been completed`, { provingJobId: id });
      return filter ? this.getProvingJob(filter) : Promise.resolve(undefined);
    }

    const metadata = this.inProgress.get(id);
    const now = this.msTimeSource();
    if (!metadata) {
      this.logger.warn(
        `Proving job id=${id} type=${ProvingRequestType[job.type]} not found in the in-progress cache, adding it`,
        { provingJobId: id },
      );
      // the queue will still contain the item at this point!
      // we need to be careful when popping off the queue to make sure we're not sending
      // a job that's already in progress
      this.inProgress.set(id, {
        id,
        startedAt,
        lastUpdatedAt: this.msTimeSource(),
      });
      return Promise.resolve(undefined);
    } else if (startedAt <= metadata.startedAt) {
      if (startedAt < metadata.startedAt) {
        this.logger.info(
          `Proving job id=${id} type=${ProvingRequestType[job.type]} startedAt=${startedAt} older agent has taken job`,
          { provingJobId: id },
        );
      } else {
        this.logger.debug(`Proving job id=${id} type=${ProvingRequestType[job.type]} heartbeat`, { provingJobId: id });
      }
      metadata.startedAt = startedAt;
      metadata.lastUpdatedAt = now;
      return Promise.resolve(undefined);
    } else if (filter) {
      this.logger.warn(
        `Proving job id=${id} type=${
          ProvingRequestType[job.type]
        } already being worked on by another agent. Sending new one`,
        { provingJobId: id },
      );
      return this.getProvingJob(filter);
    } else {
      return Promise.resolve(undefined);
    }
  }

  async reportProvingJobSuccess(id: ProvingJobId, value: ProofUri): Promise<void> {
    const info = this.inProgress.get(id);
    const item = this.jobsCache.get(id);
    const retries = this.retries.get(id) ?? 0;
    if (!item) {
      this.logger.warn(`Proving job id=${id} not found`, { provingJobId: id });
      return;
    }

    if (!info) {
      this.logger.warn(`Proving job id=${id} type=${ProvingRequestType[item.type]} not in the in-progress set`, {
        provingJobId: id,
      });
    } else {
      this.inProgress.delete(id);
    }

    if (this.resultsCache.has(id)) {
      this.logger.warn(`Proving job id=${id} already settled, ignoring result`, { provingJobId: id });
      return;
    }

    this.logger.info(
      `Proving job complete id=${id} type=${ProvingRequestType[item.type]} totalAttempts=${retries + 1}`,
      { provingJobId: id },
    );

    // save result to our local cache and notify clients
    // if save to database fails, that's ok because we have the result in memory
    // if the broker crashes and needs the result again, we're covered because we can just recompute it
    const result: ProvingJobSettledResult = { status: 'fulfilled', value };
    this.resultsCache.set(id, result);
    this.promises.get(id)!.resolve(result);

    this.instrumentation.incResolvedJobs(item.type);
    if (info) {
      const duration = this.msTimeSource() - info.startedAt;
      this.instrumentation.recordJobDuration(item.type, duration);
    }

    try {
      await this.database.setProvingJobResult(id, value);
    } catch (saveErr) {
      this.logger.error(`Failed to save proving job result id=${id}`, saveErr, {
        provingJobId: id,
      });

      throw saveErr;
    }
  }

  @trackSpan('ProvingBroker.cleanupPass')
  private async cleanupPass() {
    await this.cleanupStaleJobs();
    await this.reEnqueueExpiredJobs();
  }

  private async cleanupStaleJobs() {
    const jobIds = Array.from(this.jobsCache.keys());
    const jobsToClean: ProvingJobId[] = [];
    for (const id of jobIds) {
      const job = this.jobsCache.get(id)!;
      const isComplete = this.resultsCache.has(id);
      if (isComplete && this.isJobStale(job)) {
        jobsToClean.push(id);
      }
    }

    if (jobsToClean.length > 0) {
      this.logger.info(`Cleaning up jobs=${jobsToClean.length}`);
      await asyncPool(this.maxParallelCleanUps, jobsToClean, async jobId => {
        await this.cleanUpProvingJobState(jobId);
      });
    }
  }

  private async reEnqueueExpiredJobs() {
    const inProgressEntries = Array.from(this.inProgress.entries());
    for (const [id, metadata] of inProgressEntries) {
      const item = this.jobsCache.get(id);
      if (!item) {
        this.logger.warn(`Proving job id=${id} not found. Removing it from the queue.`, { provingJobId: id });
        this.inProgress.delete(id);
        continue;
      }

      const now = this.msTimeSource();
      const msSinceLastUpdate = now - metadata.lastUpdatedAt;
      if (msSinceLastUpdate >= this.jobTimeoutMs) {
        if (this.isJobStale(item)) {
          // the job has timed out and it's also old, just cancel and move on
          await this.cancelProvingJob(item.id);
        } else {
          this.logger.warn(`Proving job id=${id} timed out. Adding it back to the queue.`, { provingJobId: id });
          this.inProgress.delete(id);
          this.enqueueJobInternal(item);
          this.instrumentation.incTimedOutJobs(item.type);
        }
      }
    }
  }

  private enqueueJobInternal(job: ProvingJob): void {
    if (!this.promises.has(job.id)) {
      this.promises.set(job.id, promiseWithResolvers());
    }
    this.queues[job.type].put({
      epochNumber: job.epochNumber,
      id: job.id,
    });
    this.enqueuedAt.set(job.id, new Timer());
    this.epochHeight = Math.max(this.epochHeight, job.epochNumber);
  }

  private isJobStale(job: ProvingJob) {
    return job.epochNumber < this.epochHeight - this.maxEpochsToKeepResultsFor;
  }
}

type ProvingQueues = {
  [K in ProvingRequestType]: PriorityMemoryQueue<EnqueuedProvingJob>;
};

/**
 * Compares two proving jobs and selects which one's more important
 * @param a - A proving job
 * @param b - Another proving job
 * @returns A number indicating the relative priority of the two proving jobs
 */
function provingJobComparator(a: EnqueuedProvingJob, b: EnqueuedProvingJob): -1 | 0 | 1 {
  if (a.epochNumber < b.epochNumber) {
    return -1;
  } else if (a.epochNumber > b.epochNumber) {
    return 1;
  } else {
    return 0;
  }
}

/**
 * Compares two proofs and selects which one's more important.
 * If some proofs does not exist in the priority array then it's considered the least important.
 *
 * @param a - A proof type
 * @param b - Another proof type
 * @returns A number indicating the relative priority of the two proof types
 */
function proofTypeComparator(a: ProvingRequestType, b: ProvingRequestType): -1 | 0 | 1 {
  const indexOfA = PROOF_TYPES_IN_PRIORITY_ORDER.indexOf(a);
  const indexOfB = PROOF_TYPES_IN_PRIORITY_ORDER.indexOf(b);
  if (indexOfA === indexOfB) {
    return 0;
  } else if (indexOfA === -1) {
    // a is some new proof that didn't get added to the array
    // b is more important because we know about it
    return 1;
  } else if (indexOfB === -1) {
    // the opposite of the previous if branch
    return -1;
  } else if (indexOfA < indexOfB) {
    return -1;
  } else {
    return 1;
  }
}

/**
 * Relative priority of each proof type. Proofs higher up on the list are more important and should be prioritized
 * over proofs lower on the list.
 *
 * The aim is that this will speed up block proving as the closer we get to a block's root proof the more likely it
 * is to get picked up by agents
 */
const PROOF_TYPES_IN_PRIORITY_ORDER: ProvingRequestType[] = [
  ProvingRequestType.BLOCK_ROOT_ROLLUP,
  ProvingRequestType.BLOCK_MERGE_ROLLUP,
  ProvingRequestType.ROOT_ROLLUP,
  ProvingRequestType.MERGE_ROLLUP,
  ProvingRequestType.PUBLIC_BASE_ROLLUP,
  ProvingRequestType.PRIVATE_BASE_ROLLUP,
  ProvingRequestType.PUBLIC_VM,
  ProvingRequestType.TUBE_PROOF,
  ProvingRequestType.ROOT_PARITY,
  ProvingRequestType.BASE_PARITY,
  ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP,
  ProvingRequestType.PRIVATE_KERNEL_EMPTY,
];
