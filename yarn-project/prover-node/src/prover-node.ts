import type { Archiver } from '@aztec/archiver';
import type { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { assertRequired, compact, pick, sum } from '@aztec/foundation/collection';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { memoize } from '@aztec/foundation/decorators';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import type { P2PClient } from '@aztec/p2p';
import { PublicProcessorFactory } from '@aztec/simulator/server';
import type { L2BlockSource, L2BlockStreamEvent, L2BlockStreamEventHandler } from '@aztec/stdlib/block';
import { L2BlockStream, L2TipsMemoryStore } from '@aztec/stdlib/block';
import type { Checkpoint, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { ChainConfig } from '@aztec/stdlib/config';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { getEpochAtSlot, getProofSubmissionDeadlineTimestamp } from '@aztec/stdlib/epoch-helpers';
import {
  type EpochProverManager,
  EpochProvingJobTerminalState,
  type ProverNodeApi,
  type Service,
  type WorldStateSyncStatus,
  type WorldStateSynchronizer,
  tryStop,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { P2PClientType } from '@aztec/stdlib/p2p';
import type { BlockHeader, Tx } from '@aztec/stdlib/tx';
import {
  Attributes,
  L1Metrics,
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';

import { uploadEpochProofFailure } from './actions/upload-epoch-proof-failure.js';
import type { SpecificProverNodeConfig } from './config.js';
import type { EpochProvingJobData } from './job/epoch-proving-job-data.js';
import { EpochProvingJob, type EpochProvingJobState } from './job/epoch-proving-job.js';
import { ProverNodeJobMetrics, ProverNodeRewardsMetrics } from './metrics.js';
import type { ProverNodePublisher } from './prover-node-publisher.js';
import type { ProverPublisherFactory } from './prover-publisher-factory.js';

type ProverNodeOptions = SpecificProverNodeConfig & Partial<DataStoreOptions>;
type DataStoreOptions = Pick<DataStoreConfig, 'dataDirectory'> & Pick<ChainConfig, 'l1ChainId' | 'rollupVersion'>;

/**
 * An Aztec Prover Node is a standalone process that monitors the unfinalized chain on L1 for unproven epochs,
 * fetches their txs from the p2p network or external nodes, re-executes their public functions, creates a rollup
 * proof for the epoch, and submits it to L1.
 */
export class ProverNode implements L2BlockStreamEventHandler, ProverNodeApi, Traceable {
  private log = createLogger('prover-node');
  private dateProvider = new DateProvider();

  protected jobs: Map<string, EpochProvingJob> = new Map();
  /** Active jobs indexed by epoch number. */
  protected activeJobsByEpoch: Map<number, EpochProvingJob> = new Map();
  /** Tracks epochs that have been marked as complete. */
  private completedEpochs: Set<number> = new Set();
  /** Pending checkpoints per epoch, for non-optimistic mode. */
  private pendingCheckpoints: Map<number, { checkpoint: Checkpoint; published: PublishedCheckpoint }[]> = new Map();
  /** Previous block headers per epoch, for linking checkpoints. */
  private previousBlockHeaders: Map<number, BlockHeader> = new Map();

  private config: ProverNodeOptions;
  private jobMetrics: ProverNodeJobMetrics;
  private rewardsMetrics: ProverNodeRewardsMetrics;

  private blockStream: L2BlockStream | undefined;
  private l2TipsStore: L2TipsMemoryStore | undefined;

  public readonly tracer: Tracer;

  protected publisher: ProverNodePublisher | undefined;

  constructor(
    protected readonly prover: EpochProverManager,
    protected readonly publisherFactory: ProverPublisherFactory,
    protected readonly l2BlockSource: L2BlockSource & Partial<Service>,
    protected readonly l1ToL2MessageSource: L1ToL2MessageSource,
    protected readonly contractDataSource: ContractDataSource,
    protected readonly worldState: WorldStateSynchronizer,
    protected readonly p2pClient: Pick<P2PClient<P2PClientType.Prover>, 'getTxProvider'> & Partial<Service>,
    protected readonly rollupContract: RollupContract,
    protected readonly l1Metrics: L1Metrics,
    config: Partial<ProverNodeOptions> = {},
    protected readonly telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {
    this.config = {
      proverNodePollingIntervalMs: 1_000,
      proverNodeMaxPendingJobs: 100,
      proverNodeMaxParallelBlocksPerEpoch: 32,
      proverNodeOptimisticProcessing: true,
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

  /**
   * Starts the prover node so it periodically checks for unproven epochs in the unfinalized chain from L1 and
   * starts proving jobs for them.
   */
  async start() {
    await this.publisherFactory.start();
    this.publisher = await this.publisherFactory.create();

    // Set up the L2BlockStream to receive checkpoint events.
    this.l2TipsStore = new L2TipsMemoryStore();
    this.blockStream = new L2BlockStream(this.l2BlockSource, this.l2TipsStore, this, this.log, {
      pollIntervalMS: this.config.proverNodePollingIntervalMs,
    });
    this.blockStream.start();

    await this.rewardsMetrics.start();
    this.l1Metrics.start();
    this.log.info(`Started Prover Node with prover id ${this.prover.getProverId().toString()}`, this.config);
  }

  /**
   * Stops the prover node and all its dependencies.
   */
  async stop() {
    this.log.info('Stopping ProverNode');
    await this.blockStream?.stop();
    await this.prover.stop();
    await tryStop(this.p2pClient);
    await tryStop(this.l2BlockSource);
    await tryStop(this.publisherFactory);
    this.publisher?.interrupt();
    await Promise.all(Array.from(this.jobs.values()).map(job => job.stop()));
    await this.worldState.stop();
    this.rewardsMetrics.stop();
    this.l1Metrics.stop();
    await this.telemetryClient.stop();
    this.log.info('Stopped ProverNode');
  }

  /** Handles events from the L2BlockStream. */
  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    switch (event.type) {
      case 'chain-checkpointed':
        await this.onCheckpointAvailable(event.checkpoint);
        break;
      case 'chain-pruned':
        await this.onChainPruned(event);
        break;
      default:
        // We only care about checkpointed and pruned events.
        break;
    }
  }

  @trackSpan('ProverNode.onCheckpointAvailable', _pub => ({
    [Attributes.EPOCH_NUMBER]: _pub.checkpoint.header.slotNumber,
  }))
  private async onCheckpointAvailable(publishedCheckpoint: PublishedCheckpoint) {
    const checkpoint = publishedCheckpoint.checkpoint;
    const l1Constants = await this.getL1Constants();
    const epoch = getEpochAtSlot(checkpoint.header.slotNumber, l1Constants);

    // Skip already proven epochs.
    const lastProvenBlock = await this.l2BlockSource.getProvenBlockNumber();
    const lastBlockInCheckpoint = checkpoint.blocks.at(-1)!.number;
    if (lastBlockInCheckpoint <= lastProvenBlock) {
      return;
    }

    this.log.debug(`Checkpoint ${checkpoint.number} received for epoch ${epoch}`, {
      checkpointNumber: checkpoint.number,
      epoch,
      lastBlockInCheckpoint,
    });

    // Track checkpoint per epoch.
    if (!this.pendingCheckpoints.has(epoch)) {
      this.pendingCheckpoints.set(epoch, []);
    }
    this.pendingCheckpoints.get(epoch)!.push({ checkpoint, published: publishedCheckpoint });

    if (this.config.proverNodeOptimisticProcessing) {
      // Optimistic mode: find or create job, push checkpoint immediately.
      let job = this.activeJobsByEpoch.get(epoch);
      if (!job) {
        job = await this.createJobForEpoch(epoch);
        void this.runJob(job);
      }
      await this.pushCheckpointToJob(job, epoch, checkpoint, publishedCheckpoint);
    }

    // Check if epoch is now complete.
    if (!this.completedEpochs.has(epoch)) {
      const isComplete = await this.l2BlockSource.isEpochComplete(epoch);
      if (isComplete) {
        this.completedEpochs.add(epoch);
        const attestations = publishedCheckpoint.attestations ?? [];

        let job = this.activeJobsByEpoch.get(epoch);
        if (!job) {
          // Non-optimistic: create job now, push all checkpoints at once.
          job = await this.createJobForEpoch(epoch);
          for (const entry of this.pendingCheckpoints.get(epoch)!) {
            await this.pushCheckpointToJob(job, epoch, entry.checkpoint, entry.published);
          }
          void this.runJob(job);
        }
        job.setEpochComplete(attestations);
      }
    }
  }

  private async onChainPruned(event: {
    block: { number: BlockNumber; hash: string };
    checkpoint: { number: CheckpointNumber; hash: string };
  }) {
    const prunedBlockNumber = event.block.number;
    this.log.warn(`Chain pruned to block ${prunedBlockNumber}`, event);

    // Stop jobs for epochs affected by the reorg.
    for (const [epoch, job] of this.activeJobsByEpoch) {
      // If any of the job's processed checkpoints have blocks past the pruned block, stop the job.
      await job.stop('reorg');
      this.activeJobsByEpoch.delete(epoch);
      this.completedEpochs.delete(epoch);
      this.pendingCheckpoints.delete(epoch);
      this.previousBlockHeaders.delete(epoch);
      this.jobs.delete(job.getId());
    }
  }

  /** Pushes a checkpoint to a job with all required data. */
  private async pushCheckpointToJob(
    job: EpochProvingJob,
    epoch: number,
    checkpoint: Checkpoint,
    _publishedCheckpoint: PublishedCheckpoint,
  ) {
    // Gather L1 to L2 messages.
    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(checkpoint.number);

    // Gather txs.
    const deadline = new Date(this.dateProvider.now() + this.config.txGatheringTimeoutMs);
    const txProvider = this.p2pClient.getTxProvider();
    const blocks = checkpoint.blocks;
    const txsByBlock = await Promise.all(blocks.map(block => txProvider.getTxsForBlock(block, { deadline })));
    const txs = new Map<string, Tx>();
    for (const { txs: blockTxs, missingTxs } of txsByBlock) {
      if (missingTxs.length > 0) {
        throw new Error(
          `Txs not found for checkpoint ${checkpoint.number}: ${missingTxs.map(h => h.toString()).join(', ')}`,
        );
      }
      for (const tx of blockTxs) {
        txs.set(tx.getTxHash().toString(), tx);
      }
    }

    // Determine previous block header.
    let previousBlockHeader = this.previousBlockHeaders.get(epoch);
    if (!previousBlockHeader) {
      const firstBlockNumber = checkpoint.blocks[0].number;
      previousBlockHeader = await this.gatherPreviousBlockHeader(EpochNumber(epoch), firstBlockNumber - 1);
    }

    // Sync world state up to the last block in the checkpoint.
    const lastBlockNumber = checkpoint.blocks.at(-1)!.number;
    await this.worldState.syncImmediate(lastBlockNumber);

    job.addCheckpoint(checkpoint, l1ToL2Messages, previousBlockHeader, txs);

    // Update the previous block header for the next checkpoint.
    this.previousBlockHeaders.set(epoch, checkpoint.blocks.at(-1)!.header);
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
   * Starts a proving process and returns immediately.
   * Skips if there's already an active job for this epoch.
   */
  public async startProof(epochNumber: EpochNumber) {
    const activeJobs = await this.getActiveJobsForEpoch(epochNumber);
    if (activeJobs.length > 0) {
      this.log.debug(`Skipping proof for epoch ${epochNumber}, already has active job`, { epochNumber });
      return;
    }

    try {
      const job = await this.createProvingJob(epochNumber);
      void this.runJob(job);
    } catch (err) {
      this.log.error(`Error creating proving job for epoch ${epochNumber}`, err, { epochNumber });
    }
  }

  private async runJob(job: EpochProvingJob) {
    const epochNumber = job.getEpochNumber();
    const ctx = { id: job.getId(), epochNumber, state: undefined as EpochProvingJobState | undefined };

    try {
      await job.run();
      const state = job.getState();
      ctx.state = state;

      if (state === 'reorg') {
        this.log.warn(`Job for epoch ${epochNumber} stopped due to reorg, will retry`, ctx);
      } else if (state === 'failed') {
        this.log.error(`Job for ${epochNumber} exited with state ${state}`, ctx);
        await this.tryUploadEpochFailure(job);
      } else {
        this.log.verbose(`Job for ${epochNumber} exited with state ${state}`, ctx);
      }
    } catch (err) {
      this.log.error(`Error proving epoch ${epochNumber}`, err, ctx);
    } finally {
      this.jobs.delete(job.getId());
      this.activeJobsByEpoch.delete(epochNumber);
      this.completedEpochs.delete(epochNumber);
      this.pendingCheckpoints.delete(epochNumber);
      this.previousBlockHeaders.delete(epochNumber);

      // Retry on reorg: the epoch data may have changed.
      if (job.getState() === 'reorg') {
        void this.startProof(epochNumber);
      }
    }
  }

  protected async tryUploadEpochFailure(job: EpochProvingJob) {
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

  /** Creates a new EpochProvingJob for the given epoch. Does NOT gather data or push checkpoints. */
  protected async createJobForEpoch(epochNumber: EpochNumber): Promise<EpochProvingJob> {
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

    const { proverNodeMaxParallelBlocksPerEpoch: parallelBlockLimit, proverNodeDisableProofPublish } = this.config;
    const job = new EpochProvingJob(
      epochNumber,
      this.worldState,
      this.prover.createEpochProver(),
      publicProcessorFactory,
      this.publisher,
      this.jobMetrics,
      deadline,
      { parallelBlockLimit, skipSubmitProof: proverNodeDisableProofPublish },
      this.log.getBindings(),
    );

    this.jobs.set(job.getId(), job);
    this.activeJobsByEpoch.set(epochNumber, job);
    return job;
  }

  /**
   * Creates a proving job with all data gathered upfront (legacy/non-optimistic path).
   * Used by startProof() which is called externally.
   */
  @trackSpan('ProverNode.createProvingJob', epochNumber => ({ [Attributes.EPOCH_NUMBER]: epochNumber }))
  private async createProvingJob(epochNumber: EpochNumber) {
    const job = await this.createJobForEpoch(epochNumber);

    try {
      // Gather all data for this epoch.
      const epochData = await this.gatherEpochData(epochNumber);
      const fromCheckpoint = epochData.checkpoints[0].number;
      const toCheckpoint = epochData.checkpoints.at(-1)!.number;
      const fromBlock = epochData.checkpoints[0].blocks[0].number;
      const toBlock = epochData.checkpoints.at(-1)!.blocks.at(-1)!.number;
      this.log.verbose(
        `Creating proving job for epoch ${epochNumber} for checkpoint range ${fromCheckpoint} to ${toCheckpoint} and block range ${fromBlock} to ${toBlock}`,
      );

      // Fast forward world state.
      await this.worldState.syncImmediate(toBlock);

      // Push all checkpoints to the job.
      const previousBlockHeaders = this.gatherPreviousBlockHeaders(epochData);
      for (let i = 0; i < epochData.checkpoints.length; i++) {
        const checkpoint = epochData.checkpoints[i];
        job.addCheckpoint(
          checkpoint,
          epochData.l1ToL2Messages[checkpoint.number],
          previousBlockHeaders[i],
          epochData.txs,
        );
      }

      // Mark epoch complete.
      job.setEpochComplete(epochData.attestations);

      return job;
    } catch (err) {
      // Clean up the registered job so the epoch is not permanently blocked.
      this.jobs.delete(job.getId());
      this.activeJobsByEpoch.delete(epochNumber);
      throw err;
    }
  }

  @memoize
  private getL1Constants() {
    return this.l2BlockSource.getL1Constants();
  }

  @trackSpan('ProverNode.gatherEpochData', epochNumber => ({ [Attributes.EPOCH_NUMBER]: epochNumber }))
  private async gatherEpochData(epochNumber: EpochNumber): Promise<EpochProvingJobData> {
    const checkpoints = await this.gatherCheckpoints(epochNumber);
    const txArray = await this.gatherTxs(epochNumber, checkpoints);
    const txs = new Map<string, Tx>(txArray.map(tx => [tx.getTxHash().toString(), tx]));
    const l1ToL2Messages = await this.gatherMessages(epochNumber, checkpoints);
    const [firstBlock] = checkpoints[0].blocks;
    const previousBlockHeader = await this.gatherPreviousBlockHeader(epochNumber, firstBlock.number - 1);
    const [lastPublishedCheckpoint] = await this.l2BlockSource.getCheckpoints(checkpoints.at(-1)!.number, 1);
    const attestations = lastPublishedCheckpoint?.attestations ?? [];

    return { checkpoints, txs, l1ToL2Messages, epochNumber, previousBlockHeader, attestations };
  }

  private async gatherCheckpoints(epochNumber: EpochNumber) {
    const checkpoints = await this.l2BlockSource.getCheckpointsForEpoch(epochNumber);
    if (checkpoints.length === 0) {
      throw new EmptyEpochError(epochNumber);
    }
    return checkpoints;
  }

  private async gatherTxs(epochNumber: EpochNumber, checkpoints: Checkpoint[]) {
    const deadline = new Date(this.dateProvider.now() + this.config.txGatheringTimeoutMs);
    const txProvider = this.p2pClient.getTxProvider();
    const blocks = checkpoints.flatMap(checkpoint => checkpoint.blocks);
    const txsByBlock = await Promise.all(blocks.map(block => txProvider.getTxsForBlock(block, { deadline })));
    const txs = txsByBlock.map(({ txs }) => txs).flat();
    const missingTxs = txsByBlock.map(({ missingTxs }) => missingTxs).flat();

    if (missingTxs.length === 0) {
      this.log.verbose(`Gathered all ${txs.length} txs for epoch ${epochNumber}`, { epochNumber });
      return txs;
    }

    throw new Error(`Txs not found for epoch ${epochNumber}: ${missingTxs.map(hash => hash.toString()).join(', ')}`);
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

  /** Returns the last block header in the previous checkpoint for all checkpoints in the epoch. */
  private gatherPreviousBlockHeaders(epochData: EpochProvingJobData) {
    const lastBlocks = epochData.checkpoints.map(checkpoint => checkpoint.blocks.at(-1)!);
    return [epochData.previousBlockHeader, ...lastBlocks.map(block => block.header).slice(0, -1)];
  }

  /** Extracted for testing purposes. */
  protected async triggerBlockStream() {
    if (this.blockStream) {
      await this.blockStream.sync();
    }
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
