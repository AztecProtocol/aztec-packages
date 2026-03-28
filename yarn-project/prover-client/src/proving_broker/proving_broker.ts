import { EpochNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, RunningPromise, promiseWithResolvers } from '@aztec/foundation/promise';
import { PriorityMemoryQueue } from '@aztec/foundation/queue';
import { Timer } from '@aztec/foundation/timer';
import {
  type Claim,
  type ClaimResult,
  type ClaimStatus,
  type ClaimToken,
  type GetProvingJobResponse,
  type ProofUri,
  type ProvingJob,
  type ProvingJobBrokerDebug,
  type ProvingJobClaimManager,
  type ProvingJobConsumer,
  type ProvingJobFilter,
  type ProvingJobId,
  type ProvingJobProducer,
  type ProvingJobSettledResult,
  type ProvingJobStatus,
  type WorkItemId,
  tryStop,
} from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import { type TelemetryClient, type Traceable, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import assert from 'assert';
import { randomUUID } from 'node:crypto';

import { type ProverBrokerConfig, defaultProverBrokerConfig } from './config.js';
import type { ProvingBrokerDatabase } from './proving_broker_database.js';
import { type MonitorCallback, ProvingBrokerInstrumentation } from './proving_broker_instrumentation.js';

type InProgressMetadata = {
  id: ProvingJobId;
  startedAt: number;
  lastUpdatedAt: number;
};

type EnqueuedProvingJob = Pick<ProvingJob, 'id' | 'epochNumber'>;

/**
 * A broker that manages proof requests and distributes them to workers based on their priority.
 * It takes a backend that is responsible for storing and retrieving proof requests and results.
 */
export class ProvingBroker
  implements ProvingJobProducer, ProvingJobConsumer, ProvingJobBrokerDebug, ProvingJobClaimManager, Traceable
{
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

    [ProvingRequestType.CHECKPOINT_SUB_TREE_COMPLETE]: new PriorityMemoryQueue<EnqueuedProvingJob>(
      provingJobComparator,
    ),
    [ProvingRequestType.TOP_TREE_COMPLETE]: new PriorityMemoryQueue<EnqueuedProvingJob>(provingJobComparator),
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

  /** In-memory cache of work item claims for the split-proving coordination system. */
  private claimsCache = new Map<WorkItemId, Claim>();

  private cleanupPromise: RunningPromise;
  private msTimeSource = () => Date.now();
  private jobTimeoutMs: number;
  private claimTimeoutMs: number;
  private maxRetries: number;

  private instrumentation: ProvingBrokerInstrumentation;
  public readonly tracer: Tracer;

  /** Per-consumer notification queues. When a job completes, its ID is pushed to ALL registered consumers. */
  private consumerNotifications = new Map<string, ProvingJobId[]>();
  /** Tracks when each consumer last polled, for expiring stale consumers. */
  private consumerLastPoll = new Map<string, number>();
  /** Default consumer ID for backward compatibility (legacy single-facade mode). */
  private static readonly DEFAULT_CONSUMER = '__default__';
  /** Consumers that haven't polled in this many ms are considered stale and removed. */
  private static readonly CONSUMER_EXPIRY_MS = 60_000;

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
      proverBrokerClaimTimeoutMs,
    }: Required<
      Pick<
        ProverBrokerConfig,
        | 'proverBrokerJobTimeoutMs'
        | 'proverBrokerPollIntervalMs'
        | 'proverBrokerJobMaxRetries'
        | 'proverBrokerMaxEpochsToKeepResultsFor'
        | 'proverBrokerDebugReplayEnabled'
        | 'proverBrokerClaimTimeoutMs'
      >
    > = defaultProverBrokerConfig,
    client: TelemetryClient = getTelemetryClient(),
    private logger = createLogger('prover-client:proving-broker'),
  ) {
    this.tracer = client.getTracer('ProvingBroker');
    this.instrumentation = new ProvingBrokerInstrumentation(client);
    this.cleanupPromise = new RunningPromise(this.cleanupPass.bind(this), this.logger, proverBrokerPollIntervalMs);
    this.jobTimeoutMs = proverBrokerJobTimeoutMs!;
    this.claimTimeoutMs = proverBrokerClaimTimeoutMs!;
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

      this.jobsCache.set(item.id, item);
      this.promises.set(item.id, promiseWithResolvers());

      if (result) {
        this.promises.get(item.id)!.resolve(result);
        this.resultsCache.set(item.id, result);
      } else {
        this.enqueueJobInternal(item);
      }
    }

    // Restore claims from database
    for await (const claim of this.database.allClaims()) {
      this.claimsCache.set(claim.workItemId, claim);
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
    return Promise.resolve(this.#getProvingJobStatus(id));
  }

  public getCompletedJobs(ids: ProvingJobId[], consumerId?: string): Promise<ProvingJobId[]> {
    return this.#getCompletedJobs(ids, consumerId);
  }

  public getProvingJob(filter?: ProvingJobFilter): Promise<GetProvingJobResponse | undefined> {
    return Promise.resolve(this.#getProvingJob(filter));
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
    return Promise.resolve(this.#reportProvingJobProgress(id, startedAt, filter));
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
    this.jobsCache.set(jobId, job);
    await this.database.addProvingJob(job);
    this.enqueueJobInternal(job);

    return { status: 'in-queue' };
  }

  // ProvingJobClaimManager implementation

  public async claimN(workItemIds: WorkItemId[], maxClaims: number, nodeId: string): Promise<ClaimResult[]> {
    // Prioritize reclaiming this node's own existing claims before claiming new work.
    // This ensures that after a restart, the node gets back its in-flight work first.
    const ownExisting = workItemIds.filter(id => {
      const claim = this.claimsCache.get(id);
      return claim && claim.nodeId === nodeId && !this.isClaimExpired(claim);
    });
    const others = workItemIds.filter(id => !ownExisting.includes(id));
    const ordered = [...ownExisting, ...others];

    const results: ClaimResult[] = [];
    for (const workItemId of ordered) {
      if (results.length >= maxClaims) {
        break;
      }
      const claimToken = await this.claimWork(workItemId, nodeId);
      if (claimToken) {
        results.push({ workItemId, claimToken });
      }
    }
    return results;
  }

  public async claimWork(workItemId: WorkItemId, nodeId: string): Promise<ClaimToken | undefined> {
    const existing = this.claimsCache.get(workItemId);
    if (existing && !this.isClaimExpired(existing)) {
      if (existing.nodeId === nodeId) {
        // Same node reclaiming (e.g. after restart) — return the existing token
        // and refresh the activity timestamp.
        existing.lastActivity = this.msTimeSource();
        await this.database.addClaim(existing);
        this.logger.verbose(`Claim reclaimed for ${workItemId} by node ${nodeId}`);
        return existing.claimToken;
      }
      return undefined; // Actively claimed by a different node
    }

    const claim: Claim = {
      workItemId,
      nodeId,
      claimToken: randomUUID(),
      epochNumber: this.currentEpoch(),
      claimedAt: this.msTimeSource(),
      lastActivity: this.msTimeSource(),
    };

    this.claimsCache.set(workItemId, claim);
    await this.database.addClaim(claim);
    this.logger.verbose(`Claim granted for ${workItemId} to node ${nodeId}`);
    return claim.claimToken;
  }

  public async heartbeatClaim(workItemId: WorkItemId, claimToken: ClaimToken): Promise<boolean> {
    const claim = this.claimsCache.get(workItemId);
    if (!claim || claim.claimToken !== claimToken) {
      return false;
    }
    claim.lastActivity = this.msTimeSource();
    await this.database.updateClaimActivity(workItemId, claim.lastActivity);
    return true;
  }

  public getClaimStatus(workItemId: WorkItemId): Promise<ClaimStatus> {
    const claim = this.claimsCache.get(workItemId);
    if (!claim) {
      return Promise.resolve({ status: 'unclaimed' });
    }
    if (this.isClaimExpired(claim)) {
      return Promise.resolve({ status: 'expired' });
    }
    return Promise.resolve({ status: 'active', nodeId: claim.nodeId });
  }

  public async getClaimStatuses(workItemIds: WorkItemId[]): Promise<ClaimStatus[]> {
    const results: ClaimStatus[] = [];
    for (const id of workItemIds) {
      results.push(await this.getClaimStatus(id));
    }
    return results;
  }

  public async releaseClaim(workItemId: WorkItemId, claimToken: ClaimToken): Promise<void> {
    const claim = this.claimsCache.get(workItemId);
    if (!claim || claim.claimToken !== claimToken) {
      return;
    }
    this.claimsCache.delete(workItemId);
    await this.database.deleteClaim(workItemId);
    this.logger.verbose(`Claim released for ${workItemId}`);
  }

  private isClaimExpired(claim: Claim): boolean {
    return this.msTimeSource() - claim.lastActivity > this.claimTimeoutMs;
  }

  private currentEpoch(): EpochNumber {
    return EpochNumber(this.epochHeight);
  }

  async #enqueueProvingJob(job: ProvingJob): Promise<ProvingJobStatus> {
    // Completion markers are auto-completed immediately — they are never queued for agents
    if (
      job.type === ProvingRequestType.CHECKPOINT_SUB_TREE_COMPLETE ||
      job.type === ProvingRequestType.TOP_TREE_COMPLETE
    ) {
      return this.#autoCompleteMarker(job);
    }

    // We return the job status at the start of this call
    const jobStatus = this.#getProvingJobStatus(job.id);
    if (this.jobsCache.has(job.id)) {
      const existing = this.jobsCache.get(job.id);
      assert.deepStrictEqual(job, existing, 'Duplicate proving job ID');
      this.logger.warn(`Cached proving job id=${job.id} epochNumber=${job.epochNumber}. Not enqueuing again`, {
        provingJobId: job.id,
      });
      this.instrumentation.incCachedJobs(job.type);
      return jobStatus;
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
      this.instrumentation.incTotalJobs(job.type);
    } catch (err) {
      this.logger.error(`Failed to save proving job id=${job.id}: ${err}`, err, { provingJobId: job.id });
      this.jobsCache.delete(job.id);
      throw err;
    }
    return jobStatus;
  }

  async #autoCompleteMarker(job: ProvingJob): Promise<ProvingJobStatus> {
    // If already fulfilled, return existing status (dedup)
    const existing = this.resultsCache.get(job.id);
    if (existing && existing.status === 'fulfilled') {
      return existing;
    }

    // Store as fulfilled immediately — the inputsUri IS the payload
    const result: ProvingJobSettledResult = { status: 'fulfilled', value: job.inputsUri };
    this.jobsCache.set(job.id, job);
    this.resultsCache.set(job.id, result);
    this.notifyAllConsumers(job.id);

    await this.database.addProvingJob(job);
    await this.database.setProvingJobResult(job.id, job.inputsUri);

    this.logger.info(`Auto-completed marker id=${job.id} type=${ProvingRequestType[job.type]}`, {
      provingJobId: job.id,
    });

    return result;
  }

  async #cancelProvingJob(id: ProvingJobId): Promise<void> {
    if (!this.jobsCache.has(id)) {
      this.logger.warn(`Can't cancel a job that doesn't exist id=${id}`, { provingJobId: id });
      return;
    }

    // notify listeners of the cancellation
    if (!this.resultsCache.has(id)) {
      this.logger.info(`Cancelling job id=${id}`, { provingJobId: id });
      await this.#reportProvingJobError(id, 'Aborted', false, undefined, true);
    }
  }

  private cleanUpProvingJobState(ids: ProvingJobId[]) {
    for (const id of ids) {
      this.jobsCache.delete(id);
      this.promises.delete(id);
      this.resultsCache.delete(id);
      this.inProgress.delete(id);
      this.retries.delete(id);
      this.enqueuedAt.delete(id);
    }
  }

  #getProvingJobStatus(id: ProvingJobId): ProvingJobStatus {
    const result = this.resultsCache.get(id);
    if (result) {
      return result;
    } else {
      // no result yet, check if we know the item
      const item = this.jobsCache.get(id);

      if (!item) {
        return { status: 'not-found' };
      }

      return { status: this.inProgress.has(id) ? 'in-progress' : 'in-queue' };
    }
  }

  #getCompletedJobs(ids: ProvingJobId[], consumerId?: string): Promise<ProvingJobId[]> {
    const completedJobs = ids.filter(id => this.resultsCache.has(id));
    const cid = consumerId ?? ProvingBroker.DEFAULT_CONSUMER;
    // Ensure consumer queue exists (registers the consumer for future notifications)
    if (!this.consumerNotifications.has(cid)) {
      this.consumerNotifications.set(cid, []);
    }
    this.consumerLastPoll.set(cid, this.msTimeSource());
    const notifications = this.consumerNotifications.get(cid)!;
    this.consumerNotifications.set(cid, []);
    return Promise.resolve(notifications.concat(completedJobs));
  }

  /** Push a job completion notification to all registered consumer queues. */
  private notifyAllConsumers(jobId: ProvingJobId): void {
    if (this.consumerNotifications.size === 0) {
      // No consumers registered yet — push to default queue
      this.consumerNotifications.set(ProvingBroker.DEFAULT_CONSUMER, [jobId]);
    } else {
      for (const [_cid, queue] of this.consumerNotifications) {
        queue.push(jobId);
      }
    }
  }

  #getProvingJob(filter: ProvingJobFilter = { allowList: [] }): { job: ProvingJob; time: number } | undefined {
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
            // we can clear this flag now.
            this.enqueuedAt.delete(job.id);
          }

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
    aborted = false,
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

    // save the result to the cache and notify clients of the job status
    // this should work even if our database breaks because the result is cached in memory
    const result: ProvingJobSettledResult = { status: 'rejected', reason: String(err) };
    this.resultsCache.set(id, result);
    this.promises.get(id)!.resolve(result);
    this.notifyAllConsumers(id);

    if (aborted) {
      this.instrumentation.incAbortedJobs(item.type);
    } else {
      this.instrumentation.incRejectedJobs(item.type);
    }
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

  #reportProvingJobProgress(
    id: ProvingJobId,
    startedAt: number,
    filter?: ProvingJobFilter,
  ): { job: ProvingJob; time: number } | undefined {
    const job = this.jobsCache.get(id);
    if (!job) {
      this.logger.warn(`Proving job id=${id} does not exist`, { provingJobId: id });
      return this.#getProvingJob(filter);
    }

    if (this.resultsCache.has(id)) {
      this.logger.warn(`Proving job id=${id} has already been completed`, { provingJobId: id });
      return this.#getProvingJob(filter);
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

    return this.#getProvingJob(filter);
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

    // save result to our local cache and notify clients
    // if save to database fails, that's ok because we have the result in memory
    // if the broker crashes and needs the result again, we're covered because we can just recompute it
    const result: ProvingJobSettledResult = { status: 'fulfilled', value };
    this.resultsCache.set(id, result);
    this.promises.get(id)!.resolve(result);
    this.notifyAllConsumers(id);

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

    return this.#getProvingJob(filter);
  }

  private async cleanupPass() {
    this.cleanupStaleJobs();
    this.reEnqueueExpiredJobs();
    this.cleanupStaleClaims();
    this.cleanupStaleConsumers();
    const oldestEpochToKeep = this.oldestEpochToKeep();
    if (oldestEpochToKeep > 0) {
      await this.database.deleteAllProvingJobsOlderThanEpoch(EpochNumber(oldestEpochToKeep));
      await this.database.deleteClaimsOlderThanEpoch(EpochNumber(oldestEpochToKeep));
      this.logger.trace(`Deleted all epochs older than ${oldestEpochToKeep}`);
    }
  }

  private cleanupStaleJobs() {
    const jobIds = Array.from(this.jobsCache.keys());
    const jobsToClean: ProvingJobId[] = [];
    for (const id of jobIds) {
      const job = this.jobsCache.get(id)!;
      if (this.isJobStale(job)) {
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
        this.logger.warn(`Proving job id=${id} timed out. Adding it back to the queue.`, { provingJobId: id });
        this.inProgress.delete(id);
        this.enqueueJobInternal(item);
        this.instrumentation.incTimedOutJobs(item.type);
      }
    }
  }

  private cleanupStaleClaims() {
    const oldestEpoch = this.oldestEpochToKeep();
    for (const [workItemId, claim] of this.claimsCache) {
      if (claim.epochNumber < oldestEpoch) {
        this.claimsCache.delete(workItemId);
      }
    }
  }

  /** Remove consumer queues that haven't been polled recently. Covers crashed/stopped facades. */
  private cleanupStaleConsumers() {
    const now = this.msTimeSource();
    for (const [cid, lastPoll] of this.consumerLastPoll) {
      if (cid !== ProvingBroker.DEFAULT_CONSUMER && now - lastPoll > ProvingBroker.CONSUMER_EXPIRY_MS) {
        this.consumerNotifications.delete(cid);
        this.consumerLastPoll.delete(cid);
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
  ProvingRequestType.CHECKPOINT_SUB_TREE_COMPLETE,
  ProvingRequestType.TOP_TREE_COMPLETE,
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
