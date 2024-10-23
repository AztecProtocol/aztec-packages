import { createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import { PriorityMemoryQueue } from '@aztec/foundation/queue';

import assert from 'assert';

import { type ProvingBrokerDatabase } from './proving_broker_database.js';
import type { ProvingJobConsumer, ProvingJobFilter, ProvingJobProducer } from './proving_broker_interface.js';
import {
  type ProofOutputs,
  ProofType,
  type ProvingJob,
  type ProvingJobId,
  type ProvingJobStatus,
  getProofTypeFromId,
} from './proving_job.js';

type InProgressMetadata<T extends ProofType = ProofType> = {
  id: ProvingJobId<T>;
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
  // Each proof type gets its own queue so that agents can request specific types of proofs
  // Manually create the queues to get type checking
  private queues: ProvingQueues = {
    [ProofType.AvmProof]: new PriorityMemoryQueue<ProvingJob<ProofType.AvmProof>>(provingJobComparator),

    [ProofType.TubeProof]: new PriorityMemoryQueue<ProvingJob<ProofType.TubeProof>>(provingJobComparator),
    [ProofType.EmptyTubeProof]: new PriorityMemoryQueue<ProvingJob<ProofType.EmptyTubeProof>>(provingJobComparator),

    [ProofType.PublicKernelSetupProof]: new PriorityMemoryQueue<ProvingJob<ProofType.PublicKernelSetupProof>>(
      provingJobComparator,
    ),
    [ProofType.PublicKernelAppLogicProof]: new PriorityMemoryQueue<ProvingJob<ProofType.PublicKernelAppLogicProof>>(
      provingJobComparator,
    ),
    [ProofType.PublicKernelTeardownProof]: new PriorityMemoryQueue<ProvingJob<ProofType.PublicKernelTeardownProof>>(
      provingJobComparator,
    ),
    [ProofType.PublicKernelTailProof]: new PriorityMemoryQueue<ProvingJob<ProofType.PublicKernelTailProof>>(
      provingJobComparator,
    ),

    [ProofType.BaseRollupProof]: new PriorityMemoryQueue<ProvingJob<ProofType.BaseRollupProof>>(provingJobComparator),
    [ProofType.MergeRollupProof]: new PriorityMemoryQueue<ProvingJob<ProofType.MergeRollupProof>>(provingJobComparator),
    [ProofType.RootRollupProof]: new PriorityMemoryQueue<ProvingJob<ProofType.RootRollupProof>>(provingJobComparator),

    [ProofType.BlockMergeRollupProof]: new PriorityMemoryQueue<ProvingJob<ProofType.BlockMergeRollupProof>>(
      provingJobComparator,
    ),
    [ProofType.BlockRootRollupProof]: new PriorityMemoryQueue<ProvingJob<ProofType.BlockRootRollupProof>>(
      provingJobComparator,
    ),

    [ProofType.BaseParityProof]: new PriorityMemoryQueue<ProvingJob<ProofType.BaseParityProof>>(provingJobComparator),
    [ProofType.RootParityProof]: new PriorityMemoryQueue<ProvingJob<ProofType.RootParityProof>>(provingJobComparator),
  };

  // holds a copy of the database in memory in order to quickly fulfill requests
  // this is fine because this broker is the only one that can modify the database
  private jobsCache = new Map<ProvingJobId, ProvingJob>();
  // as above, but for results
  private resultsCache = new Map<ProvingJobId, { value: ProofOutputs[ProofType] } | { error: Error }>();

  // keeps track of which jobs are currently being processed
  // in the event of a crash this information is lost, but that's ok
  // the next time the broker starts it will recreate jobsCache and still
  // accept results from the workers
  private inProgress = new Map<ProvingJobId, InProgressMetadata>();

  // keep track of which proving job has been retried
  private retries = new Map<ProvingJobId, number>();

  private timeoutPromise: RunningPromise;
  private timeSource = Date.now;
  private proofRequestTimeoutMs: number;
  private maxRetries: number;

  public constructor(
    private database: ProvingBrokerDatabase,
    {
      jobTimeoutMs: proofRequestTimeoutMs = 30_000,
      timeoutIntervalMs = 10_000,
      maxRetries = 3,
    }: ProofRequestBrokerConfig = {},
    private logger = createDebugLogger('aztec:prover-client:proof-request-broker'),
  ) {
    this.timeoutPromise = new RunningPromise(this.timeoutCheck, timeoutIntervalMs);
    this.proofRequestTimeoutMs = proofRequestTimeoutMs;
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

  public async enqueueProvingJob<T extends ProofType>(job: ProvingJob<T>): Promise<void> {
    if (this.jobsCache.has(job.id)) {
      const existing = this.jobsCache.get(job.id);
      assert.deepStrictEqual(job, existing, 'Duplicate proving job ID');
      return;
    }

    await this.database.addProvingJob(job);
    this.jobsCache.set(job.id, job);
    this.enqueueJobInternal(job);
  }

  public async removeAndCancelProvingJob<T extends ProofType>(id: ProvingJobId<T>): Promise<void> {
    this.logger.info(`Cancelling job id=${id}`);
    await this.database.deleteProvingJobAndResult(id);

    this.jobsCache.delete(id);
    this.resultsCache.delete(id);
    this.inProgress.delete(id);
    this.retries.delete(id);
  }

  // eslint-disable-next-line require-await
  public async getProvingJobStatus<T extends ProofType>(id: ProvingJobId<T>): Promise<ProvingJobStatus<T>> {
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
      return Promise.resolve({ status: 'resolved', value: result.value as ProofOutputs[T] });
    } else {
      return Promise.resolve({ status: 'rejected', error: result.error });
    }
  }

  // eslint-disable-next-line require-await
  async getProvingJob<T extends ProofType[]>(
    filter: ProvingJobFilter<T> = {},
  ): Promise<ProvingJob<T[number]> | undefined> {
    const allowedProofs = filter.allowList ? [...filter.allowList] : Object.values(ProofType);
    allowedProofs.sort(proofTypeComparator);

    for (const proofType of allowedProofs) {
      const queue = this.queues[proofType];
      const item = queue.getImmediate();
      if (item) {
        this.inProgress.set(item.id, {
          id: item.id,
          startedAt: this.timeSource(),
          lastUpdatedAt: this.timeSource(),
        });

        return item;
      }
    }

    return undefined;
  }

  async reportProvingJobError<T extends ProofType>(id: ProvingJobId<T>, err: Error, retry = false): Promise<void> {
    const info = this.inProgress.get(id);
    const item = this.jobsCache.get(id);
    const retries = this.retries.get(id) ?? 0;

    if (!item) {
      this.logger.warn(`Proving job id=${id} not found`);
      return;
    }

    if (!info) {
      this.logger.warn(`Proving job id=${id} not in the in-progress set`);
    } else {
      this.inProgress.delete(id);
    }

    if (retry && retries + 1 < this.maxRetries) {
      this.logger.info(`Retrying proving job id=${id} retry=${retries + 1}`);
      this.retries.set(id, retries + 1);
      this.enqueueJobInternal(item);
      return;
    }

    this.logger.debug(`Marking proving job id=${id} totalAttempts=${retries + 1} as failed`);
    await this.database.setProvingJobError(id, err);
    this.resultsCache.set(id, { error: err });
  }

  reportProvingJobProgress<T extends ProofType, F extends ProofType[]>(
    id: ProvingJobId<T>,
    filter?: ProvingJobFilter<F>,
  ): Promise<ProvingJob<F[number]> | undefined> {
    const metadata = this.inProgress.get(id);
    if (metadata) {
      metadata.lastUpdatedAt = this.timeSource();
      return Promise.resolve(undefined);
    } else if (filter) {
      this.logger.warn(`Proving job id=${id} not found in the in-progress set. Sending new one`);
      return this.getProvingJob(filter);
    } else {
      this.logger.warn(`Proving job id=${id} not found in the in-progress set`);
      return Promise.resolve(undefined);
    }
  }

  async reportProvingJobSuccess<T extends ProofType>(id: ProvingJobId<T>, value: ProofOutputs[T]): Promise<void> {
    const info = this.inProgress.get(id);
    const item = this.jobsCache.get(id);
    const retries = this.retries.get(id) ?? 0;
    if (!item) {
      this.logger.warn(`Proving job id=${id} not found`);
      return;
    }

    if (!info) {
      this.logger.warn(`Proving job id=${id} not in the in-progress set`);
    } else {
      this.inProgress.delete(id);
    }

    this.logger.debug(`Proving job complete id=${id} totalAttempts=${retries + 1}`);
    await this.database.setProvingJobResult(id, value);
    this.resultsCache.set(id, { value });
  }

  private timeoutCheck = () => {
    for (const [id, metadata] of this.inProgress.entries()) {
      const item = this.jobsCache.get(id);
      if (!item) {
        this.logger.warn(`Proving job id=${id} not found. Removing it from the queue.`);
        this.inProgress.delete(id);
        continue;
      }

      const elapsedSinceLastUpdate = this.timeSource() - metadata.lastUpdatedAt;
      if (elapsedSinceLastUpdate >= this.proofRequestTimeoutMs) {
        this.logger.warn(`Proving job id=${id} timed out. Adding it back to the queue.`);
        this.inProgress.delete(id);
        this.enqueueJobInternal(item);
      }
    }
  };

  private enqueueJobInternal<T extends ProofType>(job: ProvingJob<T>): void {
    const proofType = getProofTypeFromId(job.id);
    this.queues[proofType].put(job);
    this.logger.debug(`Enqueued new proving job id=${job.id}`);
  }
}

type ProvingQueues = {
  [K in ProofType]: PriorityMemoryQueue<ProvingJob<K>>;
};

/**
 * Compares two proving jobs and selects which one's more important
 * @param a - A proving job
 * @param b - Another proving job
 * @returns A number indicating the relative priority of the two proving jobs
 */
function provingJobComparator<T extends ProofType>(a: ProvingJob<T>, b: ProvingJob<T>): -1 | 0 | 1 {
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
function proofTypeComparator(a: ProofType, b: ProofType): -1 | 0 | 1 {
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
const PROOF_TYPES_IN_PRIORITY_ORDER: ProofType[] = [
  ProofType.BlockRootRollupProof,
  ProofType.BlockMergeRollupProof,
  ProofType.RootRollupProof,
  ProofType.MergeRollupProof,
  ProofType.BaseRollupProof,
  ProofType.PublicKernelSetupProof,
  ProofType.PublicKernelAppLogicProof,
  ProofType.PublicKernelTeardownProof,
  ProofType.PublicKernelTailProof,
  ProofType.AvmProof,
  ProofType.TubeProof,
  ProofType.EmptyTubeProof,
  ProofType.RootParityProof,
  ProofType.BaseParityProof,
];
