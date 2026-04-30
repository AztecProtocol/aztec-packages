import type { Archiver } from '@aztec/archiver';
import type { RollupContract } from '@aztec/ethereum/contracts';
import type { Delayer } from '@aztec/ethereum/l1-tx-utils';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { assertRequired, compact, pick, sum } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { memoize } from '@aztec/foundation/decorators';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { PublicProcessorFactory } from '@aztec/simulator/server';
import {
  type L2BlockSource,
  L2BlockStream,
  type L2BlockStreamEvent,
  type L2BlockStreamEventHandler,
  L2TipsMemoryStore,
} from '@aztec/stdlib/block';
import type { Checkpoint, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { ChainConfig } from '@aztec/stdlib/config';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import {
  type L1RollupConstants,
  getEpochAtSlot,
  getProofSubmissionDeadlineTimestamp,
} from '@aztec/stdlib/epoch-helpers';
import {
  type EpochProverManager,
  EpochProvingJobTerminalState,
  type ITxProvider,
  type ProverNodeApi,
  type Service,
  type WorldStateSyncStatus,
  type WorldStateSynchronizer,
  tryStop,
} from '@aztec/stdlib/interfaces/server';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { Tx } from '@aztec/stdlib/tx';
import {
  L1Metrics,
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
} from '@aztec/telemetry-client';

import { uploadEpochProofFailure } from './actions/upload-epoch-proof-failure.js';
import type { SpecificProverNodeConfig } from './config.js';
import { EpochProvingJob, type EpochProvingJobState } from './job/epoch-proving-job.js';
import { ProverNodeJobMetrics, ProverNodeRewardsMetrics } from './metrics.js';
import type { EpochMonitor, EpochMonitorHandler } from './monitors/epoch-monitor.js';
import type { ProverNodePublisher } from './prover-node-publisher.js';
import type { ProverPublisherFactory } from './prover-publisher-factory.js';

type ProverNodeOptions = SpecificProverNodeConfig & Partial<DataStoreOptions>;
type DataStoreOptions = Pick<DataStoreConfig, 'dataDirectory'> & Pick<ChainConfig, 'l1ChainId' | 'rollupVersion'>;

/**
 * An Aztec Prover Node is a standalone process that monitors the chain for new checkpoints,
 * starts proving them optimistically as they arrive, and submits epoch proofs to L1 once
 * complete. Uses L2BlockStream for checkpoint and reorg detection.
 */
export class ProverNode implements EpochMonitorHandler, L2BlockStreamEventHandler, ProverNodeApi, Traceable {
  private log = createLogger('prover-node');

  private jobs: Map<string, EpochProvingJob> = new Map();
  /** Maps epoch number to the active proving job for that epoch. */
  private epochJobs: Map<number, EpochProvingJob> = new Map();
  /**
   * Epochs the prover node has determined are complete on L1 (no more checkpoints will
   * be produced). Used to gate the call to `job.completeEpoch` — only fires once we've
   * also seen all expected checkpoints from the archiver.
   */
  private epochsCompleteOnL1: Set<number> = new Set();
  private config: ProverNodeOptions;
  private jobMetrics: ProverNodeJobMetrics;
  private rewardsMetrics: ProverNodeRewardsMetrics;

  /** In-memory store for the L2BlockStream's local data provider. */
  private tipsStore = new L2TipsMemoryStore();
  /** Block stream for checkpoint and reorg detection. */
  private blockStream: L2BlockStream | undefined;
  /** In-flight detached gathering tasks (one per pending checkpoint), keyed by an incrementing id. */
  private pendingGatherTasks: Map<string, Promise<void>> = new Map();

  public readonly tracer: Tracer;

  protected publisher: ProverNodePublisher | undefined;

  constructor(
    protected readonly prover: EpochProverManager,
    protected readonly publisherFactory: ProverPublisherFactory,
    protected readonly l2BlockSource: L2BlockSource & Partial<Service>,
    protected readonly l1ToL2MessageSource: L1ToL2MessageSource,
    protected readonly contractDataSource: ContractDataSource,
    protected readonly worldState: WorldStateSynchronizer,
    protected readonly p2pClient: { getTxProvider(): ITxProvider } & Partial<Service>,
    protected readonly epochsMonitor: EpochMonitor,
    protected readonly rollupContract: RollupContract,
    protected readonly l1Metrics: L1Metrics,
    config: Partial<ProverNodeOptions> = {},
    protected readonly telemetryClient: TelemetryClient = getTelemetryClient(),
    private delayer?: Delayer,
    private readonly dateProvider: DateProvider = new DateProvider(),
  ) {
    this.config = {
      proverNodePollingIntervalMs: 1_000,
      proverNodeMaxPendingJobs: 100,
      proverNodeMaxParallelBlocksPerEpoch: 0,
      txGatheringIntervalMs: 1_000,
      txGatheringBatchSize: 10,
      txGatheringMaxParallelRequestsPerNode: 100,
      txGatheringTimeoutMs: 120_000,
      proverNodeFailedEpochStore: undefined,
      proverNodeEpochProvingDelayMs: undefined,
      ...compact(config),
    };

    this.validateConfig();

    const meter = telemetryClient.getMeter('ProverNode');
    this.tracer = telemetryClient.getTracer('ProverNode');

    this.jobMetrics = new ProverNodeJobMetrics(meter, telemetryClient.getTracer('EpochProvingJob'));

    this.rewardsMetrics = new ProverNodeRewardsMetrics(meter, this.prover.getProverId(), rollupContract);
  }

  public getProverId() {
    return this.prover.getProverId();
  }

  public getP2P() {
    return this.p2pClient;
  }

  /** Returns the shared tx delayer for prover L1 txs, if enabled. Test-only. */
  public getDelayer(): Delayer | undefined {
    return this.delayer;
  }

  /**
   * Called by EpochMonitor when an epoch is complete on L1. Records the signal and
   * tries to hand the epoch off to the job for finalization. If checkpoints are still
   * being delivered by the L2BlockStream, the handoff happens later when the last one
   * arrives.
   */
  async handleEpochReadyToProve(epochNumber: EpochNumber): Promise<boolean> {
    try {
      this.epochsCompleteOnL1.add(Number(epochNumber));
      this.log.info(`Epoch ${epochNumber} is complete on L1, checking if ready to complete`);
      await this.tryCompleteEpoch(epochNumber);
      return true;
    } catch (err) {
      this.log.error(`Error handling epoch ready to prove`, err);
      return false;
    }
  }

  /**
   * Handles events from the L2BlockStream. This is the new checkpoint-driven flow.
   */
  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    // First, update the local tips store so the stream can track our state.
    await this.tipsStore.handleBlockStreamEvent(event);

    // Clean up any dead jobs (timed out, stopped, failed).
    this.cleanupTerminalJobs();

    // Then react to the events for proving.
    switch (event.type) {
      case 'chain-checkpointed':
        await this.handleCheckpointEvent(event.checkpoint);
        break;
      case 'chain-pruned':
        await this.handlePruneEvent(event.checkpoint);
        break;
      case 'chain-proven':
        // Track proven state — used for epoch prune detection.
        break;
      case 'blocks-added':
      case 'chain-finalized':
        // Not relevant for proving.
        break;
    }
  }

  /**
   * Handles a new checkpoint being published to L1.
   * Creates or reuses an EpochProvingJob for the checkpoint's epoch, registers the
   * checkpoint as pending, and spawns a detached task to gather txs and add it to the job.
   * Returns promptly so the L2BlockStream is not blocked by tx gathering.
   */
  private async handleCheckpointEvent(publishedCheckpoint: PublishedCheckpoint) {
    const checkpoint = publishedCheckpoint.checkpoint;
    const slotNumber = checkpoint.header.slotNumber;
    const l1Constants = await this.getL1Constants();
    const epochNumber = getEpochAtSlot(slotNumber, l1Constants);

    // Skip checkpoints whose epoch is *fully* proven on L1. An epoch is fully proven
    // only when its last block is proven — having *some* proven block in an epoch
    // (e.g. an early proof submission landed for an earlier epoch that ends mid-way
    // through this epoch's slot range) does not prove the entire epoch. We need every
    // checkpoint of a partially-proven epoch to feed the orchestrator.
    if (await this.isEpochFullyProven(epochNumber, l1Constants)) {
      this.log.debug(`Skipping checkpoint ${checkpoint.number} for already-proven epoch ${epochNumber}`);
      return;
    }

    this.log.info(`New checkpoint ${checkpoint.number} for epoch ${epochNumber}`, {
      checkpointNumber: checkpoint.number,
      epochNumber,
      slotNumber,
    });

    // Skip checkpoints for epochs whose job has already had completeEpoch called —
    // adding more checkpoints would conflict with the orchestrator's checkpoint count.
    const existingJob = this.epochJobs.get(Number(epochNumber));
    if (existingJob?.isEpochComplete()) {
      this.log.debug(
        `Skipping checkpoint ${checkpoint.number} for epoch ${epochNumber}: epoch already marked complete`,
      );
      return;
    }

    // Add to an existing job, or create a new one if allowed.
    let job = existingJob;
    if (!job) {
      const { proverNodeMaxPendingJobs: maxPendingJobs } = this.config;
      if (maxPendingJobs > 0 && this.jobs.size >= maxPendingJobs) {
        this.log.debug(
          `Skipping checkpoint ${checkpoint.number} for epoch ${epochNumber}: max pending jobs ${maxPendingJobs} reached`,
        );
        return;
      }
      job = await this.createEpochJob(epochNumber);
    }

    // Tertiary epoch-end signal: a checkpoint for epoch N implies all in-flight epochs
    // M < N have ended (their last slot has passed). Mark them complete-on-L1 and try
    // to hand them off to the job.
    for (const olderEpochNum of this.epochJobs.keys()) {
      if (olderEpochNum < Number(epochNumber)) {
        this.epochsCompleteOnL1.add(olderEpochNum);
        await this.tryCompleteEpoch(EpochNumber(olderEpochNum));
      }
    }

    // Compute the orchestrator index from the archiver — the source of truth for the
    // first checkpoint of this epoch. Checkpoints can register and add out of order, so
    // we cannot derive the index from local state.
    const checkpointIndex = await this.getCheckpointIndexInEpoch(checkpoint, epochNumber);

    // Register the checkpoint as pending and spawn a detached task to gather data.
    let abortSignal: AbortSignal;
    try {
      abortSignal = job.registerPendingCheckpoint(checkpoint, checkpointIndex, publishedCheckpoint.attestations);
    } catch (err) {
      this.log.warn(`Could not register checkpoint ${checkpoint.number} for epoch ${epochNumber}`, err);
      return;
    }

    const taskId = `${checkpoint.number} - ${checkpoint.slot}`;
    const task = this.gatherAndAddCheckpoint(job, checkpoint, epochNumber, abortSignal);
    this.pendingGatherTasks.set(taskId, task);
    void task.finally(() => this.pendingGatherTasks.delete(taskId));
  }

  /** Await all in-flight checkpoint tx-gathering tasks. Used internally by stop() and by tests. */
  public async waitForPendingCheckpointTasks(): Promise<void> {
    while (this.pendingGatherTasks.size > 0) {
      await Promise.allSettled(Array.from(this.pendingGatherTasks.values()));
    }
  }

  /**
   * Detached task: gathers transactions and other per-checkpoint data, then adds the
   * checkpoint to the job and re-checks epoch completion. Bails out if the abort signal
   * fires (e.g. via prune or job stop).
   */
  private async gatherAndAddCheckpoint(
    job: EpochProvingJob,
    checkpoint: Checkpoint,
    epochNumber: EpochNumber,
    abortSignal: AbortSignal,
  ): Promise<void> {
    try {
      const txs = await this.gatherTxsForCheckpoint(checkpoint);
      if (abortSignal.aborted) {
        return;
      }
      const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(checkpoint.number);
      if (abortSignal.aborted) {
        return;
      }
      const previousBlockHeader = await this.gatherPreviousBlockHeader(epochNumber, checkpoint.blocks[0].number - 1);
      if (abortSignal.aborted) {
        return;
      }

      // Sync world state to the last block of this checkpoint.
      const lastBlock = checkpoint.blocks.at(-1)!;
      const lastBlockHash = await lastBlock.header.hash();
      await this.worldState.syncImmediate(lastBlock.number, lastBlockHash);
      if (abortSignal.aborted) {
        return;
      }

      await job.addCheckpoint(checkpoint, txs, l1ToL2Messages, previousBlockHeader);

      // Catch-up path: if the EpochMonitor hasn't yet flagged this epoch as complete,
      // ask the archiver directly. Needed during L2BlockStream catch-up where the
      // EpochMonitor only fires for the live epoch.
      if (!this.epochsCompleteOnL1.has(Number(epochNumber))) {
        const isComplete = await this.l2BlockSource.isEpochComplete(epochNumber);
        if (isComplete) {
          this.epochsCompleteOnL1.add(Number(epochNumber));
        }
      }
      await this.tryCompleteEpoch(epochNumber);
    } catch (err) {
      if (abortSignal.aborted) {
        this.log.debug(`Checkpoint ${checkpoint.number} for epoch ${epochNumber} aborted during gathering`);
        return;
      }
      this.log.error(`Error handling checkpoint ${checkpoint.number} for epoch ${epochNumber}`, err);
    }
  }

  /**
   * Handles a chain prune event. Identifies the range of removed checkpoints (everything
   * with number > prunedCheckpoint.number) and tells each affected job to remove them.
   * The job handles whatever state each checkpoint is in (pending tx-gathering or
   * already added to the orchestrator).
   */
  private async handlePruneEvent(prunedCheckpoint: { number: CheckpointNumber; hash: string }) {
    this.log.warn(`Chain pruned to checkpoint ${prunedCheckpoint.number}`, { prunedCheckpoint });

    for (const [epochNum, job] of Array.from(this.epochJobs.entries())) {
      const trackedToRemove = job
        .getTrackedCheckpoints()
        .filter(tc => tc.checkpoint.number > prunedCheckpoint.number)
        .map(tc => tc.checkpoint.number);
      const pendingToRemove = job.getPendingCheckpointNumbers().filter(n => n > prunedCheckpoint.number);

      const toRemove = [...trackedToRemove, ...pendingToRemove];
      if (toRemove.length === 0) {
        continue;
      }

      let removed = 0;
      for (const checkpointNumber of toRemove) {
        if (await job.removeCheckpoint(checkpointNumber)) {
          removed++;
        }
      }

      this.log.info(`Removed ${removed} checkpoints from epoch ${epochNum} job due to prune`);

      // If the job has no remaining checkpoints (pending or tracked), cancel it.
      if (job.getTrackedCheckpoints().length === 0 && job.getPendingCheckpointNumbers().length === 0) {
        this.log.info(`Cancelling epoch ${epochNum} job — all checkpoints pruned`);
        await this.cancelAndCleanupJob(epochNum, job);
      }
    }
  }

  private async cancelAndCleanupJob(epochNum: number, job: EpochProvingJob): Promise<void> {
    await job.cancel();
    this.epochJobs.delete(epochNum);
    this.epochsCompleteOnL1.delete(epochNum);
    this.jobs.delete(job.getId());
  }

  /**
   * Creates a new EpochProvingJob for the given epoch.
   * Does not check the maximum pending jobs limit — the checkpoint-driven flow is bounded
   * by the number of active epochs, not a job count. Legacy flow checks the limit separately.
   */
  private async createEpochJob(epochNumber: EpochNumber): Promise<EpochProvingJob> {
    this.checkMaximumPendingJobs();
    this.publisher = await this.publisherFactory.create();

    const publicProcessorFactory = new PublicProcessorFactory(
      this.contractDataSource,
      this.dateProvider,
      this.telemetryClient,
      this.log.getBindings(),
    );

    const deadlineTs = getProofSubmissionDeadlineTimestamp(epochNumber, await this.getL1Constants());
    const deadline = new Date(Number(deadlineTs) * 1000);
    const job = this.doCreateEpochProvingJob(epochNumber, deadline, publicProcessorFactory, this.publisher);
    this.jobs.set(job.getId(), job);
    this.epochJobs.set(Number(epochNumber), job);
    return job;
  }

  /**
   * Hands the epoch off to the job once we've determined it's complete on L1 AND every
   * expected checkpoint has been delivered (as pending or tracked). The job itself is
   * then responsible for waiting for any pending entries to settle and running the
   * full finalization. Idempotent — if the job has already been completed, returns.
   */
  private async tryCompleteEpoch(epochNumber: EpochNumber) {
    if (!this.epochsCompleteOnL1.has(Number(epochNumber))) {
      return;
    }

    const job = this.epochJobs.get(Number(epochNumber));
    if (!job || job.isEpochComplete()) {
      return;
    }

    const archiverCheckpoints = await this.l2BlockSource.getCheckpointsForEpoch(epochNumber);
    const known = job.getTrackedCheckpoints().length + job.getPendingCheckpointNumbers().length;
    if (known < archiverCheckpoints.length) {
      this.log.debug(
        `Epoch ${epochNumber} complete on L1 but only ${known}/${archiverCheckpoints.length} checkpoints known to job`,
      );
      return;
    }

    this.log.info(`Handing epoch ${epochNumber} off to job for finalization (${known} checkpoints known)`);
    job.completeEpoch();
    void job.whenComplete().then(state => this.cleanupCompletedJob(Number(epochNumber), job, state));
  }

  /** Called once the job's whenComplete() resolves. Uploads failure data if needed and clears prover-node state. */
  private async cleanupCompletedJob(epochNum: number, job: EpochProvingJob, state: EpochProvingJobState) {
    this.log.verbose(`Job for epoch ${epochNum} exited with state ${state}`);
    if (state === 'failed') {
      try {
        await this.tryUploadEpochFailure(job);
      } catch (err) {
        this.log.error(`Error uploading epoch failure for epoch ${epochNum}`, err);
      }
    }
    this.epochJobs.delete(epochNum);
    this.epochsCompleteOnL1.delete(epochNum);
    this.jobs.delete(job.getId());
  }

  /**
   * Starts the prover node so it periodically checks for unproven epochs in the unfinalized chain from L1 and
   * starts proving jobs for them.
   */
  async start() {
    // Start the epoch monitor (legacy flow, still used for epoch completion detection).
    this.epochsMonitor.start(this);

    // Create and start the L2BlockStream for checkpoint-driven proving.
    // Start from the first block of the first not-fully-proven epoch — this picks up any
    // partially-proven epoch from the previous run and re-runs it from scratch.
    const startingBlock = await this.computeStartingBlock();
    this.blockStream = new L2BlockStream(this.l2BlockSource, this.tipsStore, this, this.log, {
      pollIntervalMS: this.config.proverNodePollingIntervalMs,
      startingBlock,
    });
    this.blockStream.start();

    await this.publisherFactory.start();
    this.publisher = await this.publisherFactory.create();
    await this.rewardsMetrics.start();
    this.l1Metrics.start();
    this.log.info(`Started Prover Node with prover id ${this.prover.getProverId().toString()}`, this.config);
  }

  /**
   * Stops the prover node and all its dependencies.
   */
  async stop() {
    this.log.info('Stopping ProverNode');
    await this.epochsMonitor.stop();
    await this.blockStream?.stop();
    // Stop the jobs first so that any in-flight gather tasks see their abort signal.
    await Promise.all(Array.from(this.jobs.values()).map(job => job.stop()));
    await this.waitForPendingCheckpointTasks();
    await this.prover.stop();
    await tryStop(this.publisherFactory);
    this.publisher?.interrupt();
    this.rewardsMetrics.stop();
    this.l1Metrics.stop();
    await this.telemetryClient.stop();
    this.log.info('Stopped ProverNode');
  }

  /** Removes epoch jobs that are in a terminal state (timed out, stopped, failed). */
  private cleanupTerminalJobs() {
    for (const [epochNum, job] of this.epochJobs) {
      if (EpochProvingJobTerminalState.includes(job.getState())) {
        this.log.info(`Cleaning up terminal job for epoch ${epochNum} in state ${job.getState()}`);
        this.epochJobs.delete(epochNum);
        this.epochsCompleteOnL1.delete(epochNum);
        this.jobs.delete(job.getId());
      }
    }
  }

  /** Returns world state status. */
  public async getWorldStateSyncStatus(): Promise<WorldStateSyncStatus> {
    const { syncSummary } = await this.worldState.status();
    return syncSummary;
  }

  /** Returns archiver status. */
  public getL2Tips() {
    return this.l2BlockSource.getL2Tips();
  }

  /**
   * Starts a proving process for a complete epoch. Gathers all checkpoints and processes them
   * through the checkpoint-driven flow, then immediately finalizes.
   */
  public async startProof(epochNumber: EpochNumber) {
    const checkpoints = await this.l2BlockSource.getCheckpointsForEpoch(epochNumber);
    if (checkpoints.length === 0) {
      throw new EmptyEpochError(epochNumber);
    }

    // If the L2BlockStream already created a job with checkpoints, finalize it as-is.
    // Otherwise create a fresh job and add all checkpoints from the archiver.
    let job = this.epochJobs.get(Number(epochNumber));
    if (!job) {
      job = await this.createEpochJob(epochNumber);
      const firstCheckpointNumber = checkpoints[0].number;
      // Fetch attestations alongside the checkpoint set so the job has them per-entry.
      const publishedCheckpoints = await this.l2BlockSource.getCheckpoints(firstCheckpointNumber, checkpoints.length);
      for (const checkpoint of checkpoints) {
        const checkpointIndex = checkpoint.number - firstCheckpointNumber;
        const attestations = publishedCheckpoints[checkpointIndex]?.attestations ?? [];
        job.registerPendingCheckpoint(checkpoint, checkpointIndex, attestations);
        const txs = await this.gatherTxsForCheckpoint(checkpoint);
        const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(checkpoint.number);
        const previousBlockHeader = await this.gatherPreviousBlockHeader(epochNumber, checkpoint.blocks[0].number - 1);
        const lastBlock = checkpoint.blocks.at(-1)!;
        await this.worldState.syncImmediate(lastBlock.number, await lastBlock.header.hash());
        await job.addCheckpoint(checkpoint, txs, l1ToL2Messages, previousBlockHeader);
      }
    }

    // Cancel any pending checkpoints that haven't been added yet — once startProof has decided
    // what to finalize with, we don't want any in-flight gather tasks to extend the epoch.
    for (const pendingNumber of job.getPendingCheckpointNumbers()) {
      await job.removeCheckpoint(pendingNumber);
    }

    // Hand the epoch off to the job for finalization. The job will run finalizeAndProve
    // immediately since pending=0 by this point.
    job.completeEpoch();
    void job.whenComplete().then(state => this.cleanupCompletedJob(Number(epochNumber), job!, state));
  }

  /** Uploads epoch failure data to the configured file store. */
  public async tryUploadEpochFailure(job: EpochProvingJob) {
    if (this.config.proverNodeFailedEpochStore) {
      return await uploadEpochProofFailure(
        this.config.proverNodeFailedEpochStore,
        job.getId(),
        job.getProvingData(),
        this.l2BlockSource as Archiver,
        this.worldState,
        assertRequired(pick(this.config, 'l1ChainId', 'rollupVersion', 'dataDirectory')),
        this.log,
      );
    }
  }

  /**
   * Returns the prover instance.
   */
  public getProver() {
    return this.prover;
  }

  /**
   * Returns an array of jobs being processed.
   */
  public getJobs(): Promise<{ uuid: string; status: EpochProvingJobState; epochNumber: EpochNumber }[]> {
    return Promise.resolve(
      Array.from(this.jobs.entries()).map(([uuid, job]) => ({
        uuid,
        status: job.getState(),
        epochNumber: job.getEpochNumber(),
      })),
    );
  }

  protected async getActiveJobsForEpoch(
    epochNumber: EpochNumber,
  ): Promise<{ uuid: string; status: EpochProvingJobState }[]> {
    const jobs = await this.getJobs();
    return jobs.filter(job => job.epochNumber === epochNumber && !EpochProvingJobTerminalState.includes(job.status));
  }

  private checkMaximumPendingJobs() {
    const { proverNodeMaxPendingJobs: maxPendingJobs } = this.config;
    if (maxPendingJobs > 0 && this.jobs.size >= maxPendingJobs) {
      throw new Error(`Maximum pending proving jobs ${maxPendingJobs} reached. Cannot create new job.`);
    }
  }

  @memoize
  private getL1Constants() {
    return this.l2BlockSource.getL1Constants();
  }

  /**
   * Returns true if every block in the given epoch is proven on L1. An epoch is only
   * fully proven when its *last* block is proven — having a proven block somewhere in
   * the middle (e.g. the trailing edge of an earlier proof submission) does not make
   * the whole epoch proven, because subsequent blocks in the same slot range may still
   * need to be proved.
   */
  private async isEpochFullyProven(
    epochNumber: EpochNumber,
    l1Constants: Pick<L1RollupConstants, 'epochDuration'>,
  ): Promise<boolean> {
    const provenBlockNumber = await this.l2BlockSource.getProvenBlockNumber();
    if (!provenBlockNumber || provenBlockNumber <= 0) {
      return false;
    }
    const provenHeader = await this.l2BlockSource.getBlockHeader(BlockNumber(provenBlockNumber));
    if (!provenHeader) {
      return false;
    }
    const provenEpoch = getEpochAtSlot(provenHeader.getSlot(), l1Constants);
    if (epochNumber < provenEpoch) {
      return true;
    }
    if (epochNumber > provenEpoch) {
      return false;
    }
    // Same epoch as the proven block: fully proven iff the proven block is the last
    // of its epoch (next block in a later epoch, or no next block and the epoch is
    // over on L1).
    const nextHeader = await this.l2BlockSource.getBlockHeader(BlockNumber(provenBlockNumber + 1));
    if (nextHeader) {
      return getEpochAtSlot(nextHeader.getSlot(), l1Constants) > provenEpoch;
    }
    return this.l2BlockSource.isEpochComplete(provenEpoch);
  }

  /**
   * Computes the starting block number for the L2BlockStream. This is the first block of the
   * first epoch that has not been fully proven.
   *
   * An epoch is "fully proven" when its last *block* is proven, regardless of whether the
   * epoch's last *slot* contained a block — slots can be empty. So we determine fullness
   * by checking whether any unproven block exists within the proven block's epoch:
   *  - If there is a next block and it sits in a later epoch, the proven block is the
   *    last of its epoch → fully proven, start at the next block.
   *  - If there is no next block, the proven block is the last only when the epoch is
   *    over on L1 (no more blocks can be produced for it).
   *  - Otherwise (next block in same epoch, or epoch still active and no next block),
   *    the epoch is partially proven and we rewind to its first block to re-prove from
   *    scratch.
   */
  protected async computeStartingBlock(): Promise<BlockNumber> {
    const provenBlockNumber = await this.l2BlockSource.getProvenBlockNumber();
    if (provenBlockNumber <= 0) {
      return BlockNumber(1);
    }

    const l1Constants = await this.getL1Constants();
    const provenHeader = await this.l2BlockSource.getBlockHeader(BlockNumber(provenBlockNumber));
    if (!provenHeader) {
      return BlockNumber(provenBlockNumber + 1);
    }
    const provenEpoch = getEpochAtSlot(provenHeader.getSlot(), l1Constants);

    // Decide whether the proven block is the last block of its epoch.
    const nextHeader = await this.l2BlockSource.getBlockHeader(BlockNumber(provenBlockNumber + 1));
    let provenEpochFullyProven: boolean;
    if (nextHeader) {
      const nextEpoch = getEpochAtSlot(nextHeader.getSlot(), l1Constants);
      provenEpochFullyProven = nextEpoch > provenEpoch;
    } else {
      // No later block exists. The proven block is the last of its epoch only if the
      // epoch is over on L1 — otherwise more blocks could still be produced for it.
      provenEpochFullyProven = await this.l2BlockSource.isEpochComplete(provenEpoch);
    }

    if (provenEpochFullyProven) {
      return BlockNumber(provenBlockNumber + 1);
    }

    // Otherwise the proven block sits mid-epoch; rewind to the first block of this epoch.
    let firstBlockOfEpoch = provenBlockNumber;
    while (firstBlockOfEpoch > 1) {
      const prevHeader = await this.l2BlockSource.getBlockHeader(BlockNumber(firstBlockOfEpoch - 1));
      if (!prevHeader) {
        break;
      }
      if (getEpochAtSlot(prevHeader.getSlot(), l1Constants) < provenEpoch) {
        break;
      }
      firstBlockOfEpoch--;
    }
    this.log.info(
      `Starting L2BlockStream at block ${firstBlockOfEpoch} (start of partially-proven epoch ${provenEpoch})`,
      { provenBlockNumber, provenEpoch, firstBlockOfEpoch },
    );
    return firstBlockOfEpoch;
  }

  /**
   * Computes a checkpoint's orchestrator index within its epoch by consulting the
   * archiver — the source of truth for the first checkpoint of the epoch. Falls back
   * to 0 if the archiver hasn't yet indexed any checkpoints for this epoch (which
   * shouldn't happen in practice since the L2BlockStream reads from the same archiver).
   */
  private async getCheckpointIndexInEpoch(checkpoint: Checkpoint, epochNumber: EpochNumber): Promise<number> {
    const archiverCheckpoints = await this.l2BlockSource.getCheckpointsForEpoch(epochNumber);
    if (archiverCheckpoints.length === 0) {
      return 0;
    }
    return checkpoint.number - archiverCheckpoints[0].number;
  }

  private async gatherTxsForCheckpoint(checkpoint: Checkpoint): Promise<Map<string, Tx>> {
    const deadline = new Date(this.dateProvider.now() + this.config.txGatheringTimeoutMs);
    const txProvider = this.p2pClient.getTxProvider();
    const txsByBlock = await Promise.all(
      checkpoint.blocks.map(block => txProvider.getTxsForBlock(block, { deadline })),
    );
    const txs = txsByBlock.map(({ txs }) => txs).flat();
    const missingTxs = txsByBlock.map(({ missingTxs }) => missingTxs).flat();

    if (missingTxs.length > 0) {
      throw new Error(
        `Txs not found for checkpoint ${checkpoint.number}: ${missingTxs.map(hash => hash.toString()).join(', ')}`,
      );
    }

    return new Map<string, Tx>(txs.map(tx => [tx.getTxHash().toString(), tx]));
  }

  private async gatherMessages(epochNumber: EpochNumber, checkpoints: Checkpoint[]) {
    const messages = await Promise.all(checkpoints.map(c => this.l1ToL2MessageSource.getL1ToL2Messages(c.number)));
    const messageCount = sum(messages.map(m => m.length));
    this.log.verbose(`Gathered all ${messageCount} messages for epoch ${epochNumber}`, { epochNumber });
    const messagesByCheckpoint: Record<CheckpointNumber, Fr[]> = {};
    for (let i = 0; i < checkpoints.length; i++) {
      messagesByCheckpoint[checkpoints[i].number] = messages[i];
    }
    return messagesByCheckpoint;
  }

  private async gatherPreviousBlockHeader(epochNumber: EpochNumber, previousBlockNumber: number) {
    const header = await (previousBlockNumber === 0
      ? this.worldState.getCommitted().getInitialHeader()
      : this.l2BlockSource.getBlockHeader(BlockNumber(previousBlockNumber)));

    if (!header) {
      throw new Error(`Previous block header ${previousBlockNumber} not found for proving epoch ${epochNumber}`);
    }

    this.log.verbose(`Gathered previous block header ${header.getBlockNumber()} for epoch ${epochNumber}`);
    return header;
  }

  /** Extracted for testing purposes. */
  protected doCreateEpochProvingJob(
    epochNumber: EpochNumber,
    deadline: Date | undefined,
    publicProcessorFactory: PublicProcessorFactory,
    publisher: ProverNodePublisher,
  ) {
    const { proverNodeDisableProofPublish, proverNodeEpochProvingDelayMs } = this.config;
    return new EpochProvingJob(
      epochNumber,
      this.worldState,
      this.prover.createEpochProver(),
      publicProcessorFactory,
      publisher,
      this.jobMetrics,
      deadline,
      {
        skipSubmitProof: proverNodeDisableProofPublish,
        finalizationDelayMs: proverNodeEpochProvingDelayMs,
      },
      this.log.getBindings(),
    );
  }

  /** Extracted for testing purposes. */
  protected async triggerMonitors() {
    await this.epochsMonitor.work();
  }

  private validateConfig() {
    if (
      this.config.proverNodeFailedEpochStore &&
      (!this.config.dataDirectory || !this.config.l1ChainId || this.config.rollupVersion === undefined)
    ) {
      this.log.warn(
        `Invalid prover-node config (missing dataDirectory, l1ChainId, or rollupVersion)`,
        pick(this.config, 'proverNodeFailedEpochStore', 'dataDirectory', 'l1ChainId', 'rollupVersion'),
      );
      throw new Error(
        'All of dataDirectory, l1ChainId, and rollupVersion are required if proverNodeFailedEpochStore is set.',
      );
    }
  }
}

class EmptyEpochError extends Error {
  constructor(epochNumber: EpochNumber) {
    super(`No blocks found for epoch ${epochNumber}`);
    this.name = 'EmptyEpochError';
  }
}
