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
import { createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, RunningPromise, promiseWithResolvers } from '@aztec/foundation/promise';
import { PriorityMemoryQueue } from '@aztec/foundation/queue';
import { Timer } from '@aztec/foundation/timer';
import { type TelemetryClient } from '@aztec/telemetry-client';

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
};

/**
 * A broker that manages proof requests and distributes them to workers based on their priority.
 * It takes a backend that is responsible for storing and retrieving proof requests and results.
 */
export class ProvingBroker implements ProvingJobProducer, ProvingJobConsumer {
  private queues: ProvingQueues = {
    [ProvingRequestType.PUBLIC_VM]: new PriorityMemoryQueue<ProvingJob>(provingJobComparator),
    [ProvingRequestType.TUBE_PROOF]: new PriorityMemoryQueue<ProvingJob>(provingJobComparator),
    [ProvingRequestType.PRIVATE_KERNEL_EMPTY]: new PriorityMemoryQueue<ProvingJob>(provingJobComparator),

    [ProvingRequestType.PRIVATE_BASE_ROLLUP]: new PriorityMemoryQueue<ProvingJob>(provingJobComparator),
    [ProvingRequestType.PUBLIC_BASE_ROLLUP]: new PriorityMemoryQueue<ProvingJob>(provingJobComparator),
    [ProvingRequestType.MERGE_ROLLUP]: new PriorityMemoryQueue<ProvingJob>(provingJobComparator),
    [ProvingRequestType.ROOT_ROLLUP]: new PriorityMemoryQueue<ProvingJob>(provingJobComparator),

    [ProvingRequestType.BLOCK_MERGE_ROLLUP]: new PriorityMemoryQueue<ProvingJob>(provingJobComparator),
    [ProvingRequestType.BLOCK_ROOT_ROLLUP]: new PriorityMemoryQueue<ProvingJob>(provingJobComparator),
    [ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP]: new PriorityMemoryQueue<ProvingJob>(provingJobComparator),

    [ProvingRequestType.BASE_PARITY]: new PriorityMemoryQueue<ProvingJob>(provingJobComparator),
    [ProvingRequestType.ROOT_PARITY]: new PriorityMemoryQueue<ProvingJob>(provingJobComparator),
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

  private timeoutPromise: RunningPromise;
  private timeSource = () => Math.floor(Date.now() / 1000);
  private jobTimeoutMs: number;
  private maxRetries: number;

  private instrumentation: ProvingBrokerInstrumentation;

  public constructor(
    private database: ProvingBrokerDatabase,
    client: TelemetryClient,
    { jobTimeoutMs = 30_000, timeoutIntervalMs = 10_000, maxRetries = 3 }: ProofRequestBrokerConfig = {},
    private logger = createLogger('prover-client:proving-broker'),
  ) {
    this.instrumentation = new ProvingBrokerInstrumentation(client);
    this.timeoutPromise = new RunningPromise(this.timeoutCheck, timeoutIntervalMs);
    this.jobTimeoutMs = jobTimeoutMs;
    this.maxRetries = maxRetries;
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
      this.logger.info(`Restoring proving job id=${item.id} settled=${!!result}`);

      this.jobsCache.set(item.id, item);
      this.promises.set(item.id, promiseWithResolvers());

      if (result) {
        this.promises.get(item.id)!.resolve(result);
        this.resultsCache.set(item.id, result);
      } else {
        this.logger.debug(`Re-enqueuing proving job id=${item.id}`);
        this.enqueueJobInternal(item);
      }
    }

    this.timeoutPromise.start();

    this.instrumentation.monitorQueueDepth(this.measureQueueDepth);
    this.instrumentation.monitorActiveJobs(this.countActiveJobs);

    return Promise.resolve();
  }

  public stop(): Promise<void> {
    return this.timeoutPromise.stop();
  }

  public async enqueueProvingJob(job: ProvingJob): Promise<void> {
    if (this.jobsCache.has(job.id)) {
      const existing = this.jobsCache.get(job.id);
      assert.deepStrictEqual(job, existing, 'Duplicate proving job ID');
      return;
    }

    await this.database.addProvingJob(job);
    this.jobsCache.set(job.id, job);
    this.enqueueJobInternal(job);
  }

  public waitForJobToSettle(id: ProvingJobId): Promise<ProvingJobSettledResult> {
    const promiseWithResolvers = this.promises.get(id);
    if (!promiseWithResolvers) {
      return Promise.resolve({ status: 'rejected', reason: `Job ${id} not found` });
    }
    return promiseWithResolvers.promise;
  }

  public async removeAndCancelProvingJob(id: ProvingJobId): Promise<void> {
    this.logger.info(`Cancelling job id=${id}`);
    await this.database.deleteProvingJobAndResult(id);

    // notify listeners of the cancellation
    if (!this.resultsCache.has(id)) {
      this.promises.get(id)?.resolve({ status: 'rejected', reason: 'Aborted' });
    }

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
        this.logger.warn(`Proving job id=${id} not found`);
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
      let job: ProvingJob | undefined;
      // exhaust the queue and make sure we're not sending a job that's already in progress
      // or has already been completed
      // this can happen if the broker crashes and restarts
      // it's possible agents will report progress or results for jobs that are in the queue (after the restart)
      while ((job = queue.getImmediate())) {
        if (!this.inProgress.has(job.id) && !this.resultsCache.has(job.id)) {
          const time = this.timeSource();
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
      this.logger.warn(`Proving job id=${id} not found`);
      return;
    }

    if (!info) {
      this.logger.warn(`Proving job id=${id} type=${ProvingRequestType[item.type]} not in the in-progress set`);
    } else {
      this.inProgress.delete(id);
    }

    if (retry && retries + 1 < this.maxRetries) {
      this.logger.info(`Retrying proving job id=${id} type=${ProvingRequestType[item.type]} retry=${retries + 1}`);
      this.retries.set(id, retries + 1);
      this.enqueueJobInternal(item);
      this.instrumentation.incRetriedJobs(item.type);
      return;
    }

    this.logger.debug(
      `Marking proving job id=${id} type=${ProvingRequestType[item.type]} totalAttempts=${retries + 1} as failed`,
    );

    await this.database.setProvingJobError(id, err);

    const result: ProvingJobSettledResult = { status: 'rejected', reason: String(err) };
    this.resultsCache.set(id, result);
    this.promises.get(id)!.resolve(result);
    this.instrumentation.incRejectedJobs(item.type);
    if (info) {
      const duration = this.timeSource() - info.startedAt;
      this.instrumentation.recordJobDuration(item.type, duration * 1000);
    }
  }

  reportProvingJobProgress(
    id: ProvingJobId,
    startedAt: number,
    filter?: ProvingJobFilter,
  ): Promise<{ job: ProvingJob; time: number } | undefined> {
    const job = this.jobsCache.get(id);
    if (!job) {
      this.logger.warn(`Proving job id=${id} does not exist`);
      return filter ? this.getProvingJob(filter) : Promise.resolve(undefined);
    }

    const metadata = this.inProgress.get(id);
    const now = this.timeSource();
    if (!metadata) {
      this.logger.warn(
        `Proving job id=${id} type=${ProvingRequestType[job.type]} not found in the in-progress cache, adding it`,
      );
      // the queue will still contain the item at this point!
      // we need to be careful when popping off the queue to make sure we're not sending
      // a job that's already in progress
      this.inProgress.set(id, {
        id,
        startedAt,
        lastUpdatedAt: this.timeSource(),
      });
      return Promise.resolve(undefined);
    } else if (startedAt <= metadata.startedAt) {
      if (startedAt < metadata.startedAt) {
        this.logger.debug(
          `Proving job id=${id} type=${ProvingRequestType[job.type]} startedAt=${startedAt} older agent has taken job`,
        );
      } else {
        this.logger.debug(`Proving job id=${id} type=${ProvingRequestType[job.type]} heartbeat`);
      }
      metadata.startedAt = startedAt;
      metadata.lastUpdatedAt = now;
      return Promise.resolve(undefined);
    } else if (filter) {
      this.logger.warn(
        `Proving job id=${id} type=${
          ProvingRequestType[job.type]
        } already being worked on by another agent. Sending new one`,
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
      this.logger.warn(`Proving job id=${id} not found`);
      return;
    }

    if (!info) {
      this.logger.warn(`Proving job id=${id} type=${ProvingRequestType[item.type]} not in the in-progress set`);
    } else {
      this.inProgress.delete(id);
    }

    this.logger.debug(
      `Proving job complete id=${id} type=${ProvingRequestType[item.type]} totalAttempts=${retries + 1}`,
    );

    await this.database.setProvingJobResult(id, value);

    const result: ProvingJobSettledResult = { status: 'fulfilled', value };
    this.resultsCache.set(id, result);
    this.promises.get(id)!.resolve(result);
    this.instrumentation.incResolvedJobs(item.type);
  }

  private timeoutCheck = () => {
    const inProgressEntries = Array.from(this.inProgress.entries());
    for (const [id, metadata] of inProgressEntries) {
      const item = this.jobsCache.get(id);
      if (!item) {
        this.logger.warn(`Proving job id=${id} not found. Removing it from the queue.`);
        this.inProgress.delete(id);
        continue;
      }

      const msSinceLastUpdate = (this.timeSource() - metadata.lastUpdatedAt) * 1000;
      if (msSinceLastUpdate >= this.jobTimeoutMs) {
        this.logger.warn(`Proving job id=${id} timed out. Adding it back to the queue.`);
        this.inProgress.delete(id);
        this.enqueueJobInternal(item);
        this.instrumentation.incTimedOutJobs(item.type);
      }
    }
  };

  private enqueueJobInternal(job: ProvingJob): void {
    if (!this.promises.has(job.id)) {
      this.promises.set(job.id, promiseWithResolvers());
    }
    this.queues[job.type].put(job);
    this.enqueuedAt.set(job.id, new Timer());
    this.logger.debug(`Enqueued new proving job id=${job.id}`);
  }
}

type ProvingQueues = {
  [K in ProvingRequestType]: PriorityMemoryQueue<ProvingJob>;
};

/**
 * Compares two proving jobs and selects which one's more important
 * @param a - A proving job
 * @param b - Another proving job
 * @returns A number indicating the relative priority of the two proving jobs
 */
function provingJobComparator(a: ProvingJob, b: ProvingJob): -1 | 0 | 1 {
  const aBlockNumber = a.blockNumber ?? 0;
  const bBlockNumber = b.blockNumber ?? 0;
  if (aBlockNumber < bBlockNumber) {
    return -1;
  } else if (aBlockNumber > bBlockNumber) {
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
