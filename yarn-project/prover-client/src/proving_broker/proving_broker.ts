import {
  ProvingRequestType,
  type V2ProofOutputUri,
  type V2ProvingJob,
  type V2ProvingJobId,
  type V2ProvingJobResult,
  type V2ProvingJobStatus,
} from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import { PriorityMemoryQueue } from '@aztec/foundation/queue';

import assert from 'assert';

import type { ProvingJobConsumer, ProvingJobFilter, ProvingJobProducer } from './proving_broker_interface.js';
import { type ProvingJobDatabase } from './proving_job_database.js';

type InProgressMetadata = {
  id: V2ProvingJobId;
  startedAt: number;
  lastUpdatedAt: number;
};

type ProofRequestBrokerConfig = {
  timeoutIntervalSec?: number;
  jobTimeoutSec?: number;
  maxRetries?: number;
};

/**
 * A broker that manages proof requests and distributes them to workers based on their priority.
 * It takes a backend that is responsible for storing and retrieving proof requests and results.
 */
export class ProvingBroker implements ProvingJobProducer, ProvingJobConsumer {
  private queues: ProvingQueues = {
    [ProvingRequestType.PUBLIC_VM]: new PriorityMemoryQueue<V2ProvingJob>(provingJobComparator),
    [ProvingRequestType.TUBE_PROOF]: new PriorityMemoryQueue<V2ProvingJob>(provingJobComparator),
    [ProvingRequestType.PRIVATE_KERNEL_EMPTY]: new PriorityMemoryQueue<V2ProvingJob>(provingJobComparator),

    [ProvingRequestType.PRIVATE_BASE_ROLLUP]: new PriorityMemoryQueue<V2ProvingJob>(provingJobComparator),
    [ProvingRequestType.PUBLIC_BASE_ROLLUP]: new PriorityMemoryQueue<V2ProvingJob>(provingJobComparator),
    [ProvingRequestType.MERGE_ROLLUP]: new PriorityMemoryQueue<V2ProvingJob>(provingJobComparator),
    [ProvingRequestType.ROOT_ROLLUP]: new PriorityMemoryQueue<V2ProvingJob>(provingJobComparator),

    [ProvingRequestType.BLOCK_MERGE_ROLLUP]: new PriorityMemoryQueue<V2ProvingJob>(provingJobComparator),
    [ProvingRequestType.BLOCK_ROOT_ROLLUP]: new PriorityMemoryQueue<V2ProvingJob>(provingJobComparator),
    [ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP]: new PriorityMemoryQueue<V2ProvingJob>(provingJobComparator),

    [ProvingRequestType.BASE_PARITY]: new PriorityMemoryQueue<V2ProvingJob>(provingJobComparator),
    [ProvingRequestType.ROOT_PARITY]: new PriorityMemoryQueue<V2ProvingJob>(provingJobComparator),
  };

  // holds a copy of the database in memory in order to quickly fulfill requests
  // this is fine because this broker is the only one that can modify the database
  private jobsCache = new Map<V2ProvingJobId, V2ProvingJob>();
  // as above, but for results
  private resultsCache = new Map<V2ProvingJobId, V2ProvingJobResult>();

  // keeps track of which jobs are currently being processed
  // in the event of a crash this information is lost, but that's ok
  // the next time the broker starts it will recreate jobsCache and still
  // accept results from the workers
  private inProgress = new Map<V2ProvingJobId, InProgressMetadata>();

  // keep track of which proving job has been retried
  private retries = new Map<V2ProvingJobId, number>();

  private timeoutPromise: RunningPromise;
  private timeSource = () => Math.floor(Date.now() / 1000);
  private jobTimeoutSec: number;
  private maxRetries: number;

  public constructor(
    private database: ProvingJobDatabase,
    { jobTimeoutSec = 30, timeoutIntervalSec = 10, maxRetries = 3 }: ProofRequestBrokerConfig = {},
    private logger = createDebugLogger('aztec:prover-client:proving-broker'),
  ) {
    this.timeoutPromise = new RunningPromise(this.timeoutCheck, timeoutIntervalSec * 1000);
    this.jobTimeoutSec = jobTimeoutSec;
    this.maxRetries = maxRetries;
  }

  // eslint-disable-next-line require-await
  public async start(): Promise<void> {
    for (const [item, result] of this.database.allProvingJobs()) {
      this.logger.info(`Restoring proving job id=${item.id} settled=${!!result}`);

      this.jobsCache.set(item.id, item);
      if (result) {
        this.resultsCache.set(item.id, result);
      } else {
        this.logger.debug(`Re-enqueuing proving job id=${item.id}`);
        this.enqueueJobInternal(item);
      }
    }

    this.timeoutPromise.start();
  }

  public stop(): Promise<void> {
    return this.timeoutPromise.stop();
  }

  public async enqueueProvingJob(job: V2ProvingJob): Promise<void> {
    if (this.jobsCache.has(job.id)) {
      const existing = this.jobsCache.get(job.id);
      assert.deepStrictEqual(job, existing, 'Duplicate proving job ID');
      return;
    }

    await this.database.addProvingJob(job);
    this.jobsCache.set(job.id, job);
    this.enqueueJobInternal(job);
  }

  public async removeAndCancelProvingJob(id: V2ProvingJobId): Promise<void> {
    this.logger.info(`Cancelling job id=${id}`);
    await this.database.deleteProvingJobAndResult(id);

    this.jobsCache.delete(id);
    this.resultsCache.delete(id);
    this.inProgress.delete(id);
    this.retries.delete(id);
  }

  // eslint-disable-next-line require-await
  public async getProvingJobStatus(id: V2ProvingJobId): Promise<V2ProvingJobStatus> {
    const result = this.resultsCache.get(id);
    if (!result) {
      // no result yet, check if we know the item
      const item = this.jobsCache.get(id);

      if (!item) {
        this.logger.warn(`Proving job id=${id} not found`);
        return Promise.resolve({ status: 'not-found' });
      }

      return Promise.resolve({ status: this.inProgress.has(id) ? 'in-progress' : 'in-queue' });
    } else if ('value' in result) {
      return Promise.resolve({ status: 'resolved', value: result.value });
    } else {
      return Promise.resolve({ status: 'rejected', error: result.error });
    }
  }

  // eslint-disable-next-line require-await
  async getProvingJob<T extends ProvingRequestType[]>(
    filter: ProvingJobFilter<T> = {},
  ): Promise<{ job: V2ProvingJob; time: number } | undefined> {
    const allowedProofs: ProvingRequestType[] =
      Array.isArray(filter.allowList) && filter.allowList.length > 0
        ? [...filter.allowList]
        : Object.values(ProvingRequestType).filter((x): x is ProvingRequestType => typeof x === 'number');
    allowedProofs.sort(proofTypeComparator);

    for (const proofType of allowedProofs) {
      const queue = this.queues[proofType];
      let job: V2ProvingJob | undefined;
      // exhaust the queue and make sure we're not sending a job that's already in progress
      // or has already been completed
      // this can happen if the broker crashes and restarts
      // it's possible agents will report progress or results for jobs that are no longer in the queue
      while ((job = queue.getImmediate())) {
        if (!this.inProgress.has(job.id) && !this.resultsCache.has(job.id)) {
          const time = this.timeSource();
          this.inProgress.set(job.id, {
            id: job.id,
            startedAt: time,
            lastUpdatedAt: time,
          });

          return { job, time };
        }
      }
    }

    return undefined;
  }

  async reportProvingJobError(id: V2ProvingJobId, err: Error, retry = false): Promise<void> {
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
      return;
    }

    this.logger.debug(
      `Marking proving job id=${id} type=${ProvingRequestType[item.type]} totalAttempts=${retries + 1} as failed`,
    );
    await this.database.setProvingJobError(id, err);
    this.resultsCache.set(id, { error: String(err) });
  }

  reportProvingJobProgress<F extends ProvingRequestType[]>(
    id: V2ProvingJobId,
    startedAt: number,
    filter?: ProvingJobFilter<F>,
  ): Promise<{ job: V2ProvingJob; time: number } | undefined> {
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

  async reportProvingJobSuccess(id: V2ProvingJobId, value: V2ProofOutputUri): Promise<void> {
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
    this.resultsCache.set(id, { value });
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

      const secondsSinceLastUpdate = this.timeSource() - metadata.lastUpdatedAt;
      if (secondsSinceLastUpdate >= this.jobTimeoutSec) {
        this.logger.warn(`Proving job id=${id} timed out. Adding it back to the queue.`);
        this.inProgress.delete(id);
        this.enqueueJobInternal(item);
      }
    }
  };

  private enqueueJobInternal(job: V2ProvingJob): void {
    this.queues[job.type].put(job);
    this.logger.debug(`Enqueued new proving job id=${job.id}`);
  }
}

type ProvingQueues = {
  [K in ProvingRequestType]: PriorityMemoryQueue<V2ProvingJob>;
};

/**
 * Compares two proving jobs and selects which one's more important
 * @param a - A proving job
 * @param b - Another proving job
 * @returns A number indicating the relative priority of the two proving jobs
 */
function provingJobComparator(a: V2ProvingJob, b: V2ProvingJob): -1 | 0 | 1 {
  if (a.blockNumber < b.blockNumber) {
    return -1;
  } else if (a.blockNumber > b.blockNumber) {
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
