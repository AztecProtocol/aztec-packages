import type { Archiver } from '@aztec/archiver';
import type { ViemPublicClient } from '@aztec/ethereum';
import { assertRequired, compact, pick, sum } from '@aztec/foundation/collection';
import { memoize } from '@aztec/foundation/decorators';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { DateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { PublicProcessorFactory } from '@aztec/simulator/server';
import type { L2Block, L2BlockSource } from '@aztec/stdlib/block';
import type { ChainConfig } from '@aztec/stdlib/config';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { getProofSubmissionDeadlineTimestamp } from '@aztec/stdlib/epoch-helpers';
import {
  type EpochProverManager,
  EpochProvingJobTerminalState,
  type ProverCoordination,
  type ProverNodeApi,
  type Service,
  type WorldStateSyncStatus,
  type WorldStateSynchronizer,
  tryStop,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { TxHash } from '@aztec/stdlib/tx';
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
import type { EpochMonitor, EpochMonitorHandler } from './monitors/epoch-monitor.js';
import type { ProverNodePublisher } from './prover-node-publisher.js';

type ProverNodeOptions = SpecificProverNodeConfig & Partial<DataStoreOptions>;
type DataStoreOptions = Pick<DataStoreConfig, 'dataDirectory'> & Pick<ChainConfig, 'l1ChainId' | 'rollupVersion'>;

/**
 * An Aztec Prover Node is a standalone process that monitors the unfinalised chain on L1 for unproven epochs,
 * fetches their txs from the p2p network or external nodes, re-executes their public functions, creates a rollup
 * proof for the epoch, and submits it to L1.
 */
export class ProverNode implements EpochMonitorHandler, ProverNodeApi, Traceable {
  private log = createLogger('prover-node');
  private dateProvider = new DateProvider();

  private jobs: Map<string, EpochProvingJob> = new Map();
  private config: ProverNodeOptions;
  private jobMetrics: ProverNodeJobMetrics;
  private rewardsMetrics: ProverNodeRewardsMetrics;
  private l1Metrics: L1Metrics;

  private txFetcher: RunningPromise;
  private lastBlockNumber: number | undefined;

  public readonly tracer: Tracer;

  constructor(
    protected readonly prover: EpochProverManager,
    protected readonly publisher: ProverNodePublisher,
    protected readonly l2BlockSource: L2BlockSource & Partial<Service>,
    protected readonly l1ToL2MessageSource: L1ToL2MessageSource,
    protected readonly contractDataSource: ContractDataSource,
    protected readonly worldState: WorldStateSynchronizer,
    protected readonly coordination: ProverCoordination & Partial<Service>,
    protected readonly epochsMonitor: EpochMonitor,
    config: Partial<ProverNodeOptions> = {},
    protected readonly telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {
    this.l1Metrics = new L1Metrics(
      telemetryClient.getMeter('ProverNodeL1Metrics'),
      publisher.l1TxUtils.client as unknown as ViemPublicClient,
      [publisher.getSenderAddress()],
    );

    this.config = {
      proverNodePollingIntervalMs: 1_000,
      proverNodeMaxPendingJobs: 100,
      proverNodeMaxParallelBlocksPerEpoch: 32,
      txGatheringIntervalMs: 1_000,
      txGatheringBatchSize: 10,
      txGatheringMaxParallelRequestsPerNode: 100,
      proverNodeFailedEpochStore: undefined,
      ...compact(config),
    };

    this.validateConfig();

    const meter = telemetryClient.getMeter('ProverNode');
    this.tracer = telemetryClient.getTracer('ProverNode');

    this.jobMetrics = new ProverNodeJobMetrics(meter, telemetryClient.getTracer('EpochProvingJob'));

    this.rewardsMetrics = new ProverNodeRewardsMetrics(
      meter,
      EthAddress.fromField(this.prover.getProverId()),
      this.publisher.getRollupContract(),
    );

    this.txFetcher = new RunningPromise(() => this.checkForTxs(), this.log, this.config.txGatheringIntervalMs);
  }

  public getProverId() {
    return this.prover.getProverId();
  }

  public getP2P() {
    return this.coordination.getP2PClient();
  }

  /**
   * Handles an epoch being completed by starting a proof for it if there are no active jobs for it.
   * @param epochNumber - The epoch number that was just completed.
   * @returns false if there is an error, true otherwise
   */
  async handleEpochReadyToProve(epochNumber: bigint): Promise<boolean> {
    try {
      this.log.debug(`Running jobs as ${epochNumber} is ready to prove`, {
        jobs: Array.from(this.jobs.values()).map(job => `${job.getEpochNumber()}:${job.getId()}`),
      });
      const activeJobs = await this.getActiveJobsForEpoch(epochNumber);
      if (activeJobs.length > 0) {
        this.log.warn(`Not starting proof for ${epochNumber} since there are active jobs for the epoch`, {
          activeJobs: activeJobs.map(job => job.uuid),
        });
        return true;
      }
      await this.startProof(epochNumber);
      return true;
    } catch (err) {
      if (err instanceof EmptyEpochError) {
        this.log.info(`Not starting proof for ${epochNumber} since no blocks were found`);
      } else {
        this.log.error(`Error handling epoch completed`, err);
      }
      return false;
    }
  }

  /**
   * Starts the prover node so it periodically checks for unproven epochs in the unfinalised chain from L1 and
   * starts proving jobs for them.
   */
  async start() {
    this.txFetcher.start();
    this.epochsMonitor.start(this);
    this.l1Metrics.start();
    await this.rewardsMetrics.start();
    this.log.info(`Started Prover Node with prover id ${this.prover.getProverId().toString()}`, this.config);
  }

  /**
   * Stops the prover node and all its dependencies.
   */
  async stop() {
    this.log.info('Stopping ProverNode');
    await this.txFetcher.stop();
    await this.epochsMonitor.stop();
    await this.prover.stop();
    await tryStop(this.l2BlockSource);
    this.publisher.interrupt();
    await Promise.all(Array.from(this.jobs.values()).map(job => job.stop()));
    await this.worldState.stop();
    await tryStop(this.coordination);
    this.l1Metrics.stop();
    this.rewardsMetrics.stop();
    await this.telemetryClient.stop();
    this.log.info('Stopped ProverNode');
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
   */
  public async startProof(epochNumber: number | bigint) {
    const job = await this.createProvingJob(BigInt(epochNumber), { skipEpochCheck: true });
    void this.runJob(job);
  }

  private async runJob(job: EpochProvingJob) {
    const epochNumber = job.getEpochNumber();
    const ctx = { id: job.getId(), epochNumber, state: undefined as EpochProvingJobState | undefined };

    try {
      await job.run();
      const state = job.getState();
      ctx.state = state;

      if (state === 'reorg') {
        this.log.warn(`Running new job for epoch ${epochNumber} due to reorg`, ctx);
        await this.createProvingJob(epochNumber);
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
  public getJobs(): Promise<{ uuid: string; status: EpochProvingJobState; epochNumber: number }[]> {
    return Promise.resolve(
      Array.from(this.jobs.entries()).map(([uuid, job]) => ({
        uuid,
        status: job.getState(),
        epochNumber: Number(job.getEpochNumber()),
      })),
    );
  }

  protected async getActiveJobsForEpoch(
    epochBigInt: bigint,
  ): Promise<{ uuid: string; status: EpochProvingJobState }[]> {
    const jobs = await this.getJobs();
    const epochNumber = Number(epochBigInt);
    return jobs.filter(job => job.epochNumber === epochNumber && !EpochProvingJobTerminalState.includes(job.status));
  }

  private checkMaximumPendingJobs() {
    const { proverNodeMaxPendingJobs: maxPendingJobs } = this.config;
    if (maxPendingJobs > 0 && this.jobs.size >= maxPendingJobs) {
      throw new Error(`Maximum pending proving jobs ${maxPendingJobs} reached. Cannot create new job.`);
    }
  }

  @trackSpan('ProverNode.createProvingJob', epochNumber => ({ [Attributes.EPOCH_NUMBER]: Number(epochNumber) }))
  private async createProvingJob(epochNumber: bigint, opts: { skipEpochCheck?: boolean } = {}) {
    this.checkMaximumPendingJobs();

    // Gather all data for this epoch
    const epochData = await this.gatherEpochData(epochNumber);

    const fromBlock = epochData.blocks[0].number;
    const toBlock = epochData.blocks.at(-1)!.number;
    this.log.verbose(`Creating proving job for epoch ${epochNumber} for block range ${fromBlock} to ${toBlock}`);

    // Fast forward world state to right before the target block and get a fork
    await this.worldState.syncImmediate(toBlock);

    // Create a processor factory
    const publicProcessorFactory = new PublicProcessorFactory(
      this.contractDataSource,
      this.dateProvider,
      this.telemetryClient,
    );

    // Set deadline for this job to run. It will abort if it takes too long.
    const deadlineTs = getProofSubmissionDeadlineTimestamp(epochNumber, await this.getL1Constants());
    const deadline = new Date(Number(deadlineTs) * 1000);

    const job = this.doCreateEpochProvingJob(epochData, deadline, publicProcessorFactory, opts);
    this.jobs.set(job.getId(), job);
    return job;
  }

  @memoize
  private getL1Constants() {
    return this.l2BlockSource.getL1Constants();
  }

  /** Monitors for new blocks and requests their txs from the p2p layer to ensure they are available for proving. */
  @trackSpan('ProverNode.checkForTxs')
  private async checkForTxs() {
    const blockNumber = await this.l2BlockSource.getBlockNumber();
    if (this.lastBlockNumber === undefined || blockNumber > this.lastBlockNumber) {
      const block = await this.l2BlockSource.getBlock(blockNumber);
      if (!block) {
        return;
      }
      const txHashes = block.body.txEffects.map(tx => tx.txHash);
      this.log.verbose(`Fetching ${txHashes.length} tx hashes for block number ${blockNumber} from coordination`);
      await this.coordination.gatherTxs(txHashes); // This stores the txs in the tx pool, no need to persist them here
      this.lastBlockNumber = blockNumber;
    }
  }

  @trackSpan('ProverNode.gatherEpochData', epochNumber => ({ [Attributes.EPOCH_NUMBER]: Number(epochNumber) }))
  private async gatherEpochData(epochNumber: bigint): Promise<EpochProvingJobData> {
    const blocks = await this.gatherBlocks(epochNumber);
    const txs = await this.gatherTxs(epochNumber, blocks);
    const l1ToL2Messages = await this.gatherMessages(epochNumber, blocks);
    const previousBlockHeader = await this.gatherPreviousBlockHeader(epochNumber, blocks[0]);

    return { blocks, txs, l1ToL2Messages, epochNumber, previousBlockHeader };
  }

  private async gatherBlocks(epochNumber: bigint) {
    const blocks = await this.l2BlockSource.getBlocksForEpoch(epochNumber);
    if (blocks.length === 0) {
      throw new EmptyEpochError(epochNumber);
    }
    return blocks;
  }

  private async gatherTxs(epochNumber: bigint, blocks: L2Block[]) {
    const txsToFind: TxHash[] = blocks.flatMap(block => block.body.txEffects.map(tx => tx.txHash));
    const txs = await this.coordination.getTxsByHash(txsToFind);

    if (txs.length === txsToFind.length) {
      this.log.verbose(`Gathered all ${txs.length} txs for epoch ${epochNumber}`, { epochNumber });
      return txs;
    }

    const txHashesFound = await Promise.all(txs.map(tx => tx.getTxHash()));
    const missingTxHashes = txsToFind
      .filter(txHashToFind => !txHashesFound.some(txHashFound => txHashToFind.equals(txHashFound)))
      .join(', ');

    throw new Error(`Txs not found for epoch ${epochNumber}: ${missingTxHashes}`);
  }

  private async gatherMessages(epochNumber: bigint, blocks: L2Block[]) {
    const messages = await Promise.all(blocks.map(b => this.l1ToL2MessageSource.getL1ToL2Messages(BigInt(b.number))));
    const messageCount = sum(messages.map(m => m.length));
    this.log.verbose(`Gathered all ${messageCount} messages for epoch ${epochNumber}`, { epochNumber });
    const messagesByBlock: Record<number, Fr[]> = {};
    for (let i = 0; i < blocks.length; i++) {
      messagesByBlock[blocks[i].number] = messages[i];
    }
    return messagesByBlock;
  }

  private async gatherPreviousBlockHeader(epochNumber: bigint, initialBlock: L2Block) {
    const previousBlockNumber = initialBlock.number - 1;
    const header = await (previousBlockNumber === 0
      ? this.worldState.getCommitted().getInitialHeader()
      : this.l2BlockSource.getBlockHeader(previousBlockNumber));

    if (!header) {
      throw new Error(`Previous block header ${initialBlock.number} not found for proving epoch ${epochNumber}`);
    }

    this.log.verbose(`Gathered previous block header ${header.getBlockNumber()} for epoch ${epochNumber}`);
    return header;
  }

  /** Extracted for testing purposes. */
  protected doCreateEpochProvingJob(
    data: EpochProvingJobData,
    deadline: Date | undefined,
    publicProcessorFactory: PublicProcessorFactory,
    opts: { skipEpochCheck?: boolean } = {},
  ) {
    const { proverNodeMaxParallelBlocksPerEpoch: parallelBlockLimit } = this.config;
    return new EpochProvingJob(
      data,
      this.worldState,
      this.prover.createEpochProver(),
      publicProcessorFactory,
      this.publisher,
      this.l2BlockSource,
      this.jobMetrics,
      deadline,
      { parallelBlockLimit, ...opts },
    );
  }

  /** Extracted for testing purposes. */
  protected async triggerMonitors() {
    await this.epochsMonitor.work();
  }

  private validateConfig() {
    if (
      this.config.proverNodeFailedEpochStore &&
      (!this.config.dataDirectory || !this.config.l1ChainId || !this.config.rollupVersion)
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
  constructor(epochNumber: bigint) {
    super(`No blocks found for epoch ${epochNumber}`);
    this.name = 'EmptyEpochError';
  }
}
