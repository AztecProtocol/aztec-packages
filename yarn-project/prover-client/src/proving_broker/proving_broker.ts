import { EpochNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, RunningPromise, promiseWithResolvers } from '@aztec/foundation/promise';
import { PriorityMemoryQueue } from '@aztec/foundation/queue';
import { Timer } from '@aztec/foundation/timer';
import {
  type GetProvingJobResponse,
  type ProofUri,
  type ProvingJob,
  type ProvingJobBrokerDebug,
  type ProvingJobConsumer,
  type ProvingJobFilter,
  type ProvingJobId,
  type ProvingJobProducer,
  type ProvingJobSettledResult,
  type ProvingJobStatus,
  tryStop,
} from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import { type TelemetryClient, type Traceable, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import assert from 'assert';

import { type ProverBrokerConfig, defaultProverBrokerConfig } from './config.js';
import type { ProvingBrokerDatabase } from './proving_broker_database.js';
import { type MonitorCallback, ProvingBrokerInstrumentation } from './proving_broker_instrumentation.js';

type InProgressMetadata = {
  id: ProvingJobId;
  startedAt: number;
  lastUpdatedAt: number;
};

type EnqueuedProvingJob = Pick<ProvingJob, 'id' | 'epochNumber'>;

/** In-memory scheduling metadata for a job. The large `inputsUri` is deliberately excluded — it lives
 * in the database and is read on demand when dispatching to an agent. */
type ProvingJobMetadata = Pick<ProvingJob, 'id' | 'type' | 'epochNumber'>;

/** Settled state kept in memory: the status plus the small payloads (rejected reason, aborted). The
 * large fulfilled proof `value` is NOT kept here — it lives in the database (read on demand) and,
 * transiently, in `pendingResults` while its database write is in flight. */
type SettledRecord = { status: 'fulfilled' } | { status: 'rejected'; reason: string } | { status: 'aborted' };

function toJobMetadata(job: ProvingJob): ProvingJobMetadata {
  return { id: job.id, type: job.type, epochNumber: job.epochNumber };
}

function toSettledRecord(result: ProvingJobSettledResult): SettledRecord {
  return result.status === 'fulfilled' ? { status: 'fulfilled' } : result;
}

/**
 * A broker that manages proof requests and distributes them to workers based on their priority.
 * It takes a backend that is responsible for storing and retrieving proof requests and results.
 */
export class ProvingBroker implements ProvingJobProducer, ProvingJobConsumer, ProvingJobBrokerDebug, Traceable {
  private queues: ProvingQueues = {
    [ProvingRequestType.PUBLIC_VM]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.PUBLIC_CHONK_VERIFIER]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),

    [ProvingRequestType.PRIVATE_TX_BASE_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.PUBLIC_TX_BASE_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.TX_MERGE_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.ROOT_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),

    [ProvingRequestType.BLOCK_MERGE_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(
      provingJobComparator,
    ),
    [ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(
      provingJobComparator,
    ),
    [ProvingRequestType.BLOCK_ROOT_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),

    [ProvingRequestType.CHECKPOINT_ROOT_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(
      provingJobComparator,
    ),
    [ProvingRequestType.CHECKPOINT_MERGE_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.CHECKPOINT_PADDING_ROLLUP]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),

    [ProvingRequestType.PARITY_BASE]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
    [ProvingRequestType.PARITY_ROOT]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
  };

  // Scheduling metadata for every known job (id, type, epochNumber). The large `inputsUri` is NOT held
  // here — it lives in the database and is read on demand when a job is dispatched to an agent.
  private jobsCache = new Map<ProvingJobId, ProvingJobMetadata>();
  // Settled status for every settled job. The large fulfilled proof `value` is NOT held here — it lives
  // in the database (read on demand in getProvingJobStatus) and, transiently, in `pendingResults` while
  // its database write is in flight. Small payloads (rejected reason, aborted) are kept inline.
  private resultsCache = new Map<ProvingJobId, SettledRecord>();
  // Transient hold of a fulfilled result's full value, from the moment it settles until its database
  // write commits, so status reads are read-your-writes without retaining every proof. Evicted once the
  // value is durable in the database; kept only if that write failed (preserving the result in memory).
  private pendingResults = new Map<ProvingJobId, ProvingJobSettledResult>();

  // tracks when each job was enqueued
  private enqueuedAt = new Map<ProvingJobId, Timer>();

  // keeps track of which jobs are currently being processed
  // in the event of a crash this information is lost, but that's ok
  // the next time the broker starts it will recreate jobsCache and still
  // accept results from the workers
  private inProgress = new Map<ProvingJobId, InProgressMetadata>();

  // keep track of which proving job has been retried
  private retries = new Map<ProvingJobId, number>();

  // a map of promises that are resolved when a job settles. Carries no payload (settled status/results
  // are read from resultsCache/pendingResults/DB) so it never pins a proof value in memory.
  private promises = new Map<ProvingJobId, PromiseWithResolvers<void>>();

  private cleanupPromise: RunningPromise;
  private msTimeSource = () => Date.now();
  private jobTimeoutMs: number;
  private maxRetries: number;

  private instrumentation: ProvingBrokerInstrumentation;
  public readonly tracer: Tracer;

  private completedJobNotifications: ProvingJobId[] = [];

  /**
   * The broker keeps track of the highest epoch its seen.
   * This information is used for garbage collection: once it reaches the next epoch, it can start pruning the database of old state.
   * It is important that this value is initialized to zero. This ensures that we don't delete any old jobs until the current
   * process instance receives a job request informing it of the actual current highest epoch
   * Example:
   * proving epoch 11 - the broker will wipe all jobs for epochs 9 and lower
   * finished proving epoch 11 and got first job for epoch 12 -> the broker will wipe all settled jobs for epochs 10 and lower
   * reorged back to end of epoch 10 -> epoch 11 is skipped and epoch 12 starts -> the broker will wipe all settled jobs for epochs 10 and lower
   */
  private epochHeight = 0;
  private maxEpochsToKeepResultsFor = 1;

  private started = false;

  private debugReplayEnabled: boolean;

  public constructor(
    private database: ProvingBrokerDatabase,
    {
      proverBrokerJobTimeoutMs,
      proverBrokerPollIntervalMs,
      proverBrokerJobMaxRetries,
      proverBrokerMaxEpochsToKeepResultsFor,
      proverBrokerDebugReplayEnabled,
    }: Required<
      Pick<
        ProverBrokerConfig,
        | 'proverBrokerJobTimeoutMs'
        | 'proverBrokerPollIntervalMs'
        | 'proverBrokerJobMaxRetries'
        | 'proverBrokerMaxEpochsToKeepResultsFor'
        | 'proverBrokerDebugReplayEnabled'
      >
    > = defaultProverBrokerConfig,
    client: TelemetryClient = getTelemetryClient(),
    private logger = createLogger('prover-client:proving-broker'),
  ) {
    this.tracer = client.getTracer('ProvingBroker');
    this.instrumentation = new ProvingBrokerInstrumentation(client);
    this.cleanupPromise = new RunningPromise(this.cleanupPass.bind(this), this.logger, proverBrokerPollIntervalMs);
    this.jobTimeoutMs = proverBrokerJobTimeoutMs!;
    this.maxRetries = proverBrokerJobMaxRetries!;
    this.maxEpochsToKeepResultsFor = proverBrokerMaxEpochsToKeepResultsFor!;
    this.debugReplayEnabled = proverBrokerDebugReplayEnabled ?? false;
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

  public async start(): Promise<void> {
    if (this.started) {
      this.logger.info('Proving Broker already started');
      return Promise.resolve();
    }
    this.logger.info('Proving Broker started');
    for await (const [item, result] of this.database.allProvingJobs()) {
      this.logger.info(`Restoring proving job id=${item.id} settled=${!!result}`, {
        provingJobId: item.id,
        status: result ? result.status : 'pending',
      });

      this.jobsCache.set(item.id, toJobMetadata(item));
      this.promises.set(item.id, promiseWithResolvers());

      if (result) {
        this.promises.get(item.id)!.resolve();
        this.resultsCache.set(item.id, toSettledRecord(result));
      } else {
        this.enqueueJobInternal(item);
      }
    }

    this.cleanupPromise.start();

    this.instrumentation.monitorQueueDepth(this.measureQueueDepth);
    this.instrumentation.monitorActiveJobs(this.countActiveJobs);

    this.started = true;
  }

  public async stop(): Promise<void> {
    if (!this.started) {
      this.logger.warn('ProvingBroker not started');
      return Promise.resolve();
    }
    await tryStop(this.cleanupPromise);
  }

  public enqueueProvingJob(job: ProvingJob): Promise<ProvingJobStatus> {
    return this.#enqueueProvingJob(job);
  }

  public cancelProvingJob(id: ProvingJobId): Promise<void> {
    return this.#cancelProvingJob(id);
  }

  public getProvingJobStatus(id: ProvingJobId): Promise<ProvingJobStatus> {
    return this.#getProvingJobStatus(id);
  }

  public getCompletedJobs(ids: ProvingJobId[]): Promise<ProvingJobId[]> {
    return this.#getCompletedJobs(ids);
  }

  public getProvingJob(filter?: ProvingJobFilter): Promise<GetProvingJobResponse | undefined> {
    return this.#getProvingJob(filter);
  }

  public reportProvingJobSuccess(
    id: ProvingJobId,
    value: ProofUri,
    filter?: ProvingJobFilter,
  ): Promise<GetProvingJobResponse | undefined> {
    return this.#reportProvingJobSuccess(id, value, filter);
  }

  public reportProvingJobError(
    id: ProvingJobId,
    err: string,
    retry = false,
    filter?: ProvingJobFilter,
  ): Promise<GetProvingJobResponse | undefined> {
    return this.#reportProvingJobError(id, err, retry, filter);
  }

  public reportProvingJobProgress(
    id: ProvingJobId,
    startedAt: number,
    filter?: ProvingJobFilter,
  ): Promise<{ job: ProvingJob; time: number } | undefined> {
    return this.#reportProvingJobProgress(id, startedAt, filter);
  }

  public async replayProvingJob(
    jobId: ProvingJobId,
    type: ProvingRequestType,
    epochNumber: EpochNumber,
    inputsUri: ProofUri,
  ): Promise<ProvingJobStatus> {
    if (!this.debugReplayEnabled) {
      throw new Error('Debug replay not enabled. Set PROVER_BROKER_DEBUG_REPLAY_ENABLED=true');
    }

    this.logger.info(`Replaying proving job`, { provingJobId: jobId, epochNumber, inputsUri });

    // Clear existing state and enqueue
    this.cleanUpProvingJobState([jobId]);

    const job: ProvingJob = { id: jobId, type, epochNumber, inputsUri };
    this.jobsCache.set(jobId, toJobMetadata(job));
    await this.database.addProvingJob(job);
    this.enqueueJobInternal(job);

    return { status: 'in-queue' };
  }

  async #enqueueProvingJob(job: ProvingJob): Promise<ProvingJobStatus> {
    // The status returned to the caller reflects the job's state at the start of this call: `not-found`
    // for a brand-new job (it did not exist yet), or the cached status for one already known. Crucially
    // this must NOT `await` before the synchronous `jobsCache`/`resultsCache` gate below, or the
    // enqueue/revive lock would no longer hold. So the not-found default is set synchronously here and
    // the cached branch computes the real status (which may read the DB) only when it returns.
    let jobStatus: ProvingJobStatus = { status: 'not-found' };
    if (this.jobsCache.has(job.id)) {
      const existing = this.jobsCache.get(job.id);
      // Identity check is metadata-only: `inputsUri` now lives in the database, not memory, and job ids
      // are content-addressed (same id ⇒ same inputs), so a mismatch shows up in id/type/epochNumber.
      assert.deepStrictEqual(toJobMetadata(job), existing, 'Duplicate proving job ID');

      if (this.resultsCache.get(job.id)?.status === 'aborted') {
        // The producer is re-requesting a job it previously cancelled: revive it rather than
        // returning the cached abort, clearing the aborted state in memory and in the database so the
        // revival survives a restart.
        //
        // Concurrency model: `jobsCache` is the enqueue lock. Every path that puts a job on the queue
        // populates `jobsCache` *synchronously, before its first await* (see the "New proving job"
        // block below), so a second concurrent enqueue of the same id observes the entry at the top
        // of this method and takes a cached, no-op branch instead of enqueuing a duplicate. The revive
        // must keep holding that lock: we tear down the settled state and re-set `jobsCache` in a
        // single synchronous span (no await in between), and only then await the database. Because a
        // concurrent re-request can only interleave at that await — by which point `jobsCache` is
        // populated again and the aborted result is gone — it falls into the cached branch and no-ops,
        // so the job is enqueued exactly once. (`cleanUpProvingJobState` also drops the promise, so
        // `enqueueJobInternal` below mints a fresh one for the retry.) This holds unchanged with the
        // slimmer caches: `jobsCache` (now metadata) and `resultsCache` (now settled status) are still
        // synchronous in-memory maps, so the tear-down + re-set span still contains no await.
        this.logger.info(`Reviving aborted proving job id=${job.id} epochNumber=${job.epochNumber}`, {
          provingJobId: job.id,
        });
        this.cleanUpProvingJobState([job.id]);
        this.jobsCache.set(job.id, toJobMetadata(job));
        await this.database.deleteProvingJobResult(job.id);
        // The job is re-set in the cache and about to be re-enqueued below: its start status is in-queue.
        jobStatus = { status: 'in-queue' };
      } else {
        this.logger.warn(`Cached proving job id=${job.id} epochNumber=${job.epochNumber}. Not enqueuing again`, {
          provingJobId: job.id,
        });
        this.instrumentation.incCachedJobs(job.type);
        // Return the job's current status. This reads the fulfilled proof value from the DB when needed;
        // the await is fine here because this branch does not enqueue, so it is outside the lock span.
        return await this.#getProvingJobStatus(job.id);
      }
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
      this.jobsCache.set(job.id, toJobMetadata(job));
      await this.database.addProvingJob(job);
      this.enqueueJobInternal(job);
      this.instrumentation.incTotalJobs(job.type);
    } catch (err) {
      this.logger.error(`Failed to save proving job id=${job.id}: ${err}`, err, { provingJobId: job.id });
      this.jobsCache.delete(job.id);
      throw err;
    }
    return jobStatus;
  }

  async #cancelProvingJob(id: ProvingJobId): Promise<void> {
    const job = this.jobsCache.get(id);
    if (!job) {
      this.logger.warn(`Can't cancel a job that doesn't exist id=${id}`, { provingJobId: id });
      return;
    }

    // Leave jobs that have already settled (completed or failed) alone: those results are terminal.
    if (this.resultsCache.has(id)) {
      return;
    }

    this.logger.info(`Cancelling job id=${id}`, { provingJobId: id });
    this.inProgress.delete(id);

    // Record the cancellation as its own settled state and persist it, so it survives a restart and
    // notifies the current waiter. Unlike a completion or failure this is not terminal: re-enqueuing
    // the same job id revives it (see #enqueueProvingJob), so the abort never permanently blocks the
    // proof.
    this.resultsCache.set(id, { status: 'aborted' });
    this.promises.get(id)?.resolve();
    this.completedJobNotifications.push(id);
    this.instrumentation.incAbortedJobs(job.type);

    try {
      await this.database.setProvingJobAborted(id);
    } catch (saveErr) {
      this.logger.error(`Failed to save proving job aborted status id=${id}`, saveErr, { provingJobId: id });
      throw saveErr;
    }
  }

  private cleanUpProvingJobState(ids: ProvingJobId[]) {
    const idsToClean = new Set(ids);
    for (const id of ids) {
      this.jobsCache.delete(id);
      const deferred = this.promises.get(id);
      if (deferred) {
        deferred.resolve();
      }
      this.promises.delete(id);
      this.resultsCache.delete(id);
      this.pendingResults.delete(id);
      this.inProgress.delete(id);
      this.retries.delete(id);
      this.enqueuedAt.delete(id);
    }
    this.completedJobNotifications = this.completedJobNotifications.filter(id => !idsToClean.has(id));
  }

  async #getProvingJobStatus(id: ProvingJobId): Promise<ProvingJobStatus> {
    const settled = this.resultsCache.get(id);
    if (settled) {
      if (settled.status !== 'fulfilled') {
        // rejected/aborted carry their (small) payload inline.
        return settled;
      }
      // A fulfilled job's proof value is not held in memory: serve it from the transient hold if its
      // database write is still in flight, otherwise read it back from the database.
      const full = this.pendingResults.get(id) ?? (await this.database.getProvingJobResult(id));
      if (full?.status === 'fulfilled') {
        return full;
      }
      // Settled as fulfilled but the value is nowhere to be found — should not happen (it is held in
      // pendingResults until its DB write commits). Report not-found rather than a torn result.
      this.logger.error(`Fulfilled proving job id=${id} has no retrievable result value`, { provingJobId: id });
      return { status: 'not-found' };
    }

    // no result yet, check if we know the item
    const item = this.jobsCache.get(id);
    if (!item) {
      return { status: 'not-found' };
    }
    return { status: this.inProgress.has(id) ? 'in-progress' : 'in-queue' };
  }

  #getCompletedJobs(ids: ProvingJobId[]): Promise<ProvingJobId[]> {
    const completedJobs = ids.filter(id => this.resultsCache.has(id));
    const notifications = this.completedJobNotifications;
    this.completedJobNotifications = [];
    return Promise.resolve(notifications.concat(completedJobs));
  }

  async #getProvingJob(
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
        const meta = this.jobsCache.get(enqueuedJob.id);
        if (meta && !this.inProgress.has(enqueuedJob.id) && !this.resultsCache.has(enqueuedJob.id)) {
          const time = this.msTimeSource();
          // Claim the job synchronously (before the await below) so a concurrent dispatch can't re-pick it.
          this.inProgress.set(meta.id, {
            id: meta.id,
            startedAt: time,
            lastUpdatedAt: time,
          });
          const enqueuedAt = this.enqueuedAt.get(meta.id);
          if (enqueuedAt) {
            this.instrumentation.recordJobWait(meta.type, enqueuedAt);
            // we can clear this flag now.
            this.enqueuedAt.delete(meta.id);
          }

          // The large inputs are not kept in memory; read them from the database. They were durably
          // persisted (addProvingJob's write commits) before the job became dispatchable, so this hits.
          const inputsUri = await this.database.getProvingJobInputs(meta.id);
          if (!inputsUri) {
            // The job was cleaned up (or its inputs lost) after we claimed it — release the claim and
            // keep draining the queue for another candidate.
            this.inProgress.delete(meta.id);
            this.logger.warn(`No inputs found for proving job id=${meta.id}; skipping dispatch`, {
              provingJobId: meta.id,
            });
            continue;
          }
          const job: ProvingJob = { id: meta.id, type: meta.type, epochNumber: meta.epochNumber, inputsUri };
          return { job, time };
        }
      }
    }

    return undefined;
  }

  async #reportProvingJobError(
    id: ProvingJobId,
    err: string,
    retry = false,
    filter?: ProvingJobFilter,
  ): Promise<GetProvingJobResponse | undefined> {
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
      return this.#getProvingJob(filter);
    }

    if (retry && retries + 1 < this.maxRetries && !this.isJobStale(item)) {
      this.logger.info(
        `Retrying proving job id=${id} type=${ProvingRequestType[item.type]} retry=${retries + 1} err=${err}`,
        {
          provingJobId: id,
        },
      );

      // assign another job to this agent
      // do this first, before we put the failed job back in the queue
      const maybeAnotherJob = this.#getProvingJob(filter);

      this.retries.set(id, retries + 1);
      this.enqueueJobInternal(item);
      this.instrumentation.incRetriedJobs(item.type);

      return maybeAnotherJob;
    }

    this.logger.info(
      `Marking proving job as failed id=${id} type=${ProvingRequestType[item.type]} totalAttempts=${
        retries + 1
      } err=${err}`,
      {
        provingJobId: id,
      },
    );

    // save the (small) rejection reason to the cache and notify clients of the job status. The reason
    // is kept in memory, so status reads work even if the database write below fails.
    this.resultsCache.set(id, { status: 'rejected', reason: String(err) });
    this.promises.get(id)!.resolve();
    this.completedJobNotifications.push(id);

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

    return this.#getProvingJob(filter);
  }

  async #reportProvingJobProgress(
    id: ProvingJobId,
    startedAt: number,
    filter?: ProvingJobFilter,
  ): Promise<{ job: ProvingJob; time: number } | undefined> {
    const job = this.jobsCache.get(id);
    if (!job) {
      this.logger.warn(`Proving job id=${id} does not exist`, { provingJobId: id });
      return await this.#getProvingJob(filter);
    }

    if (this.resultsCache.has(id)) {
      this.logger.warn(`Proving job id=${id} has already been completed`, { provingJobId: id });
      return await this.#getProvingJob(filter);
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
      return undefined;
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
      return undefined;
    }

    this.logger.warn(
      `Proving job id=${id} type=${
        ProvingRequestType[job.type]
      } already being worked on by another agent. Sending new one`,
      { provingJobId: id },
    );

    return await this.#getProvingJob(filter);
  }

  async #reportProvingJobSuccess(
    id: ProvingJobId,
    value: ProofUri,
    filter?: ProvingJobFilter,
  ): Promise<GetProvingJobResponse | undefined> {
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

    // Mark settled synchronously (the gate that makes concurrent settles no-op, unchanged from before),
    // holding only the status in resultsCache. The large proof value is kept transiently in
    // pendingResults so status reads are read-your-writes until the database write below commits.
    this.resultsCache.set(id, { status: 'fulfilled' });
    this.pendingResults.set(id, { status: 'fulfilled', value });
    this.promises.get(id)!.resolve();
    this.completedJobNotifications.push(id);

    this.instrumentation.incResolvedJobs(item.type);
    if (info) {
      const duration = this.msTimeSource() - info.startedAt;
      this.instrumentation.recordJobDuration(item.type, duration);
    }

    try {
      await this.database.setProvingJobResult(id, value);
      // The value is durable in the database now; drop the transient in-memory copy.
      this.pendingResults.delete(id);
    } catch (saveErr) {
      // Keep the value in pendingResults so status/result reads still succeed despite the failed write —
      // this preserves the previous "works even if the database breaks" behaviour for this edge.
      this.logger.error(`Failed to save proving job result id=${id}`, saveErr, {
        provingJobId: id,
      });

      throw saveErr;
    }

    return this.#getProvingJob(filter);
  }

  private async cleanupPass() {
    this.reEnqueueExpiredJobs();
    const oldestEpochToKeep = this.oldestEpochToKeep();
    if (oldestEpochToKeep > 0) {
      this.cleanupJobsOlderThanEpoch(EpochNumber(oldestEpochToKeep));
      await this.database.deleteAllProvingJobsOlderThanEpoch(EpochNumber(oldestEpochToKeep));
      this.logger.trace(`Deleted all epochs older than ${oldestEpochToKeep}`);
    }
  }

  private cleanupJobsOlderThanEpoch(epochNumber: EpochNumber) {
    const jobIds = Array.from(this.jobsCache.keys());
    const jobsToClean: ProvingJobId[] = [];
    for (const id of jobIds) {
      const job = this.jobsCache.get(id)!;
      if (job.epochNumber < epochNumber) {
        jobsToClean.push(id);
      }
    }

    if (jobsToClean.length > 0) {
      this.cleanUpProvingJobState(jobsToClean);
      this.logger.verbose(`Cleaned up proving jobs=${jobsToClean.length}`);
    }
  }

  private reEnqueueExpiredJobs() {
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
        this.inProgress.delete(id);
        this.instrumentation.incTimedOutJobs(item.type);

        const retries = this.retries.get(id) ?? 0;
        if (retries + 1 < this.maxRetries && !this.isJobStale(item)) {
          this.logger.warn(`Proving job id=${id} timed out. Re-enqueueing (retry ${retries + 1}/${this.maxRetries}).`, {
            provingJobId: id,
          });
          this.retries.set(id, retries + 1);
          this.enqueueJobInternal(item);
        } else {
          this.logger.error(`Proving job id=${id} timed out after ${retries + 1} attempts. Marking as failed.`, {
            provingJobId: id,
          });
          this.resultsCache.set(id, { status: 'rejected', reason: 'Timed out' });
          this.promises.get(id)?.resolve();
          this.completedJobNotifications.push(id);
          this.instrumentation.incRejectedJobs(item.type);
        }
      }
    }
  }

  private enqueueJobInternal(job: ProvingJobMetadata): void {
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

  private isJobStale(job: ProvingJobMetadata) {
    return job.epochNumber < this.oldestEpochToKeep();
  }

  private oldestEpochToKeep() {
    return this.epochHeight - this.maxEpochsToKeepResultsFor;
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
export const PROOF_TYPES_IN_PRIORITY_ORDER: ProvingRequestType[] = [
  ProvingRequestType.ROOT_ROLLUP,
  ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP,
  ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP,
  ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP,
  ProvingRequestType.BLOCK_ROOT_ROLLUP,
  ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP,
  ProvingRequestType.BLOCK_MERGE_ROLLUP,
  ProvingRequestType.CHECKPOINT_ROOT_ROLLUP,
  ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP,
  ProvingRequestType.CHECKPOINT_MERGE_ROLLUP,
  ProvingRequestType.CHECKPOINT_PADDING_ROLLUP,
  ProvingRequestType.TX_MERGE_ROLLUP,
  ProvingRequestType.PUBLIC_TX_BASE_ROLLUP,
  ProvingRequestType.PRIVATE_TX_BASE_ROLLUP,
  ProvingRequestType.PUBLIC_VM,
  ProvingRequestType.PUBLIC_CHONK_VERIFIER,
  ProvingRequestType.PARITY_ROOT,
  ProvingRequestType.PARITY_BASE,
];
