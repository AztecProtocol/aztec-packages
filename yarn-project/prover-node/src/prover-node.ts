import {
  type L1ToL2MessageSource,
  type L2Block,
  type L2BlockSource,
  type P2PClientType,
  type Tx,
  type TxHash,
  getTimestampRangeForEpoch,
} from '@aztec/circuit-types';
import {
  type EpochProverManager,
  EpochProvingJobTerminalState,
  type ProverCoordination,
  type ProverNodeApi,
  type Service,
  type WorldStateSynchronizer,
  tryStop,
} from '@aztec/circuit-types/interfaces/server';
import { type ContractDataSource } from '@aztec/circuits.js';
import { compact } from '@aztec/foundation/collection';
import { memoize } from '@aztec/foundation/decorators';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { DateProvider } from '@aztec/foundation/timer';
import { type Maybe } from '@aztec/foundation/types';
import { type P2P } from '@aztec/p2p';
import { PublicProcessorFactory } from '@aztec/simulator/server';
import {
  Attributes,
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';

import { EpochProvingJob, type EpochProvingJobState } from './job/epoch-proving-job.js';
import { ProverNodeMetrics } from './metrics.js';
import { type EpochMonitor, type EpochMonitorHandler } from './monitors/epoch-monitor.js';
import { type ProverNodePublisher } from './prover-node-publisher.js';

export type ProverNodeOptions = {
  pollingIntervalMs: number;
  maxPendingJobs: number;
  maxParallelBlocksPerEpoch: number;
  txGatheringTimeoutMs: number;
  txGatheringIntervalMs: number;
  txGatheringMaxParallelRequests: number;
};

/**
 * An Aztec Prover Node is a standalone process that monitors the unfinalised chain on L1 for unproven blocks,
 * submits bids for proving them, and monitors if they are accepted. If so, the prover node fetches the txs
 * from a tx source in the p2p network or an external node, re-executes their public functions, creates a rollup
 * proof for the epoch, and submits it to L1.
 */
export class ProverNode implements EpochMonitorHandler, ProverNodeApi, Traceable {
  private log = createLogger('prover-node');
  private dateProvider = new DateProvider();

  private latestEpochWeAreProving: bigint | undefined;
  private jobs: Map<string, EpochProvingJob> = new Map();
  private cachedEpochData: { epochNumber: bigint; blocks: L2Block[]; txs: Tx[] } | undefined = undefined;
  private options: ProverNodeOptions;
  private metrics: ProverNodeMetrics;

  private txFetcher: RunningPromise;
  private lastBlockNumber: number | undefined;

  public readonly tracer: Tracer;

  constructor(
    protected readonly prover: EpochProverManager,
    protected readonly publisher: ProverNodePublisher,
    protected readonly l2BlockSource: L2BlockSource & Maybe<Service>,
    protected readonly l1ToL2MessageSource: L1ToL2MessageSource,
    protected readonly contractDataSource: ContractDataSource,
    protected readonly worldState: WorldStateSynchronizer,
    protected readonly coordination: ProverCoordination & Maybe<Service>,
    protected readonly epochsMonitor: EpochMonitor,
    options: Partial<ProverNodeOptions> = {},
    protected readonly telemetryClient: TelemetryClient = getTelemetryClient(),
  ) {
    this.options = {
      pollingIntervalMs: 1_000,
      maxPendingJobs: 100,
      maxParallelBlocksPerEpoch: 32,
      txGatheringTimeoutMs: 60_000,
      txGatheringIntervalMs: 1_000,
      txGatheringMaxParallelRequests: 100,
      ...compact(options),
    };

    this.metrics = new ProverNodeMetrics(telemetryClient, 'ProverNode');
    this.tracer = telemetryClient.getTracer('ProverNode');
    this.txFetcher = new RunningPromise(() => this.checkForTxs(), this.log, this.options.txGatheringIntervalMs);
  }

  public getP2P() {
    const asP2PClient = this.coordination as P2P<P2PClientType.Prover>;
    if (typeof asP2PClient.isP2PClient === 'function' && asP2PClient.isP2PClient()) {
      return asP2PClient;
    }
    return undefined;
  }

  /**
   * Handles an epoch being completed by starting a proof for it if there are no active jobs for it.
   * @param epochNumber - The epoch number that was just completed.
   */
  async handleEpochReadyToProve(epochNumber: bigint): Promise<void> {
    try {
      this.log.debug('jobs', JSON.stringify(this.jobs, null, 2));
      const activeJobs = await this.getActiveJobsForEpoch(epochNumber);
      if (activeJobs.length > 0) {
        this.log.info(`Not starting proof for ${epochNumber} since there are active jobs`);
        return;
      }
      // TODO: we probably want to skip starting a proof if we are too far into the current epoch
      await this.startProof(epochNumber);
    } catch (err) {
      if (err instanceof EmptyEpochError) {
        this.log.info(`Not starting proof for ${epochNumber} since no blocks were found`);
      } else {
        this.log.error(`Error handling epoch completed`, err);
      }
    }
  }

  /**
   * Starts the prover node so it periodically checks for unproven epochs in the unfinalised chain from L1 and
   * starts proving jobs for them.
   */
  start() {
    this.txFetcher.start();
    this.epochsMonitor.start(this);
    this.log.info('Started ProverNode', this.options);
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
    await this.telemetryClient.stop();
    this.log.info('Stopped ProverNode');
  }

  /**
   * Creates a proof for a block range. Returns once the proof has been submitted to L1.
   */
  public async prove(epochNumber: number | bigint) {
    const job = await this.createProvingJob(BigInt(epochNumber));
    return job.run();
  }

  /**
   * Starts a proving process and returns immediately.
   */
  public async startProof(epochNumber: number | bigint) {
    const job = await this.createProvingJob(BigInt(epochNumber));
    void job.run().catch(err => this.log.error(`Error proving epoch ${epochNumber}`, err));
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
    const { maxPendingJobs } = this.options;
    return maxPendingJobs === 0 || this.jobs.size < maxPendingJobs;
  }

  @trackSpan('ProverNode.createProvingJob', epochNumber => ({ [Attributes.EPOCH_NUMBER]: Number(epochNumber) }))
  private async createProvingJob(epochNumber: bigint) {
    if (!this.checkMaximumPendingJobs()) {
      throw new Error(`Maximum pending proving jobs ${this.options.maxPendingJobs} reached. Cannot create new job.`);
    }

    // Gather blocks for this epoch
    const cachedEpochData = this.cachedEpochData?.epochNumber === epochNumber ? this.cachedEpochData : undefined;
    const { blocks, txs } = cachedEpochData ?? (await this.gatherEpochData(epochNumber));

    const fromBlock = blocks[0].number;
    const toBlock = blocks.at(-1)!.number;

    // Fast forward world state to right before the target block and get a fork
    this.log.verbose(`Creating proving job for epoch ${epochNumber} for block range ${fromBlock} to ${toBlock}`);
    await this.worldState.syncImmediate(toBlock);

    // Create a processor using the forked world state
    const publicProcessorFactory = new PublicProcessorFactory(
      this.contractDataSource,
      this.dateProvider,
      this.telemetryClient,
    );

    const cleanUp = () => {
      this.jobs.delete(job.getId());
      return Promise.resolve();
    };

    const [_, endTimestamp] = getTimestampRangeForEpoch(epochNumber + 1n, await this.getL1Constants());
    const deadline = new Date(Number(endTimestamp) * 1000);

    const job = this.doCreateEpochProvingJob(epochNumber, deadline, blocks, txs, publicProcessorFactory, cleanUp);
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
      this.log.verbose(`Fetching ${txHashes.length} for block number ${blockNumber} from coordination`);
      await this.coordination.getTxsByHash(txHashes); // This stores the txs in the tx pool, no need to persist them here
      this.lastBlockNumber = blockNumber;
    }
  }

  @trackSpan('ProverNode.gatherEpochData', epochNumber => ({ [Attributes.EPOCH_NUMBER]: Number(epochNumber) }))
  private async gatherEpochData(epochNumber: bigint) {
    // Gather blocks for this epoch and their txs
    const blocks = await this.gatherBlocks(epochNumber);
    const txs = await this.gatherTxs(epochNumber, blocks);

    return { blocks, txs };
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

  /** Extracted for testing purposes. */
  protected doCreateEpochProvingJob(
    epochNumber: bigint,
    deadline: Date | undefined,
    blocks: L2Block[],
    txs: Tx[],
    publicProcessorFactory: PublicProcessorFactory,
    cleanUp: () => Promise<void>,
  ) {
    return new EpochProvingJob(
      this.worldState,
      epochNumber,
      blocks,
      txs,
      this.prover.createEpochProver(),
      publicProcessorFactory,
      this.publisher,
      this.l2BlockSource,
      this.l1ToL2MessageSource,
      this.metrics,
      deadline,
      { parallelBlockLimit: this.options.maxParallelBlocksPerEpoch },
      cleanUp,
    );
  }

  /** Extracted for testing purposes. */
  protected async triggerMonitors() {
    await this.epochsMonitor.work();
  }
}

class EmptyEpochError extends Error {
  constructor(epochNumber: bigint) {
    super(`No blocks found for epoch ${epochNumber}`);
    this.name = 'EmptyEpochError';
  }
}
