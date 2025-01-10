import {
  type EpochProofClaim,
  type EpochProofQuote,
  EpochProofQuotePayload,
  type EpochProverManager,
  type L1ToL2MessageSource,
  type L2Block,
  type L2BlockSource,
  type P2PClientType,
  type ProverCoordination,
  type ProverNodeApi,
  type Service,
  type Tx,
  type TxHash,
  type WorldStateSynchronizer,
  getTimestampRangeForEpoch,
  tryStop,
} from '@aztec/circuit-types';
import { type ContractDataSource } from '@aztec/circuits.js';
import { asyncPool } from '@aztec/foundation/async-pool';
import { compact } from '@aztec/foundation/collection';
import { memoize } from '@aztec/foundation/decorators';
import { TimeoutError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { DateProvider } from '@aztec/foundation/timer';
import { type Maybe } from '@aztec/foundation/types';
import { type P2P } from '@aztec/p2p';
import { type L1Publisher } from '@aztec/sequencer-client';
import { PublicProcessorFactory } from '@aztec/simulator';
import { Attributes, type TelemetryClient, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';

import { type BondManager } from './bond/bond-manager.js';
import { EpochProvingJob, type EpochProvingJobState } from './job/epoch-proving-job.js';
import { ProverNodeMetrics } from './metrics.js';
import { type ClaimsMonitor, type ClaimsMonitorHandler } from './monitors/claims-monitor.js';
import { type EpochMonitor, type EpochMonitorHandler } from './monitors/epoch-monitor.js';
import { type QuoteProvider } from './quote-provider/index.js';
import { type QuoteSigner } from './quote-signer.js';

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
export class ProverNode implements ClaimsMonitorHandler, EpochMonitorHandler, ProverNodeApi, Traceable {
  private log = createLogger('prover-node');
  private dateProvider = new DateProvider();

  private latestEpochWeAreProving: bigint | undefined;
  private jobs: Map<string, EpochProvingJob> = new Map();
  private cachedEpochData: { epochNumber: bigint; blocks: L2Block[]; txs: Tx[] } | undefined = undefined;
  private options: ProverNodeOptions;
  private metrics: ProverNodeMetrics;

  public readonly tracer: Tracer;

  constructor(
    protected readonly prover: EpochProverManager,
    protected readonly publisher: L1Publisher,
    protected readonly l2BlockSource: L2BlockSource & Maybe<Service>,
    protected readonly l1ToL2MessageSource: L1ToL2MessageSource,
    protected readonly contractDataSource: ContractDataSource,
    protected readonly worldState: WorldStateSynchronizer,
    protected readonly coordination: ProverCoordination & Maybe<Service>,
    protected readonly quoteProvider: QuoteProvider,
    protected readonly quoteSigner: QuoteSigner,
    protected readonly claimsMonitor: ClaimsMonitor,
    protected readonly epochsMonitor: EpochMonitor,
    protected readonly bondManager: BondManager,
    protected readonly telemetryClient: TelemetryClient,
    options: Partial<ProverNodeOptions> = {},
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
  }

  public getP2P() {
    const asP2PClient = this.coordination as P2P<P2PClientType.Prover>;
    if (typeof asP2PClient.isP2PClient === 'function' && asP2PClient.isP2PClient()) {
      return asP2PClient;
    }
    return undefined;
  }

  async handleClaim(proofClaim: EpochProofClaim): Promise<void> {
    if (proofClaim.epochToProve === this.latestEpochWeAreProving) {
      this.log.verbose(`Already proving claim for epoch ${proofClaim.epochToProve}`);
      return;
    }

    const provenEpoch = await this.l2BlockSource.getProvenL2EpochNumber();
    if (provenEpoch !== undefined && proofClaim.epochToProve <= provenEpoch) {
      this.log.verbose(`Claim for epoch ${proofClaim.epochToProve} is already proven`);
      return;
    }

    try {
      await this.startProof(proofClaim.epochToProve);
      this.latestEpochWeAreProving = proofClaim.epochToProve;
    } catch (err) {
      this.log.error(`Error handling claim for epoch ${proofClaim.epochToProve}`, err);
    }

    try {
      // Staked amounts are lowered after a claim, so this is a good time for doing a top-up if needed
      await this.bondManager.ensureBond();
    } catch (err) {
      this.log.error(`Error ensuring prover bond after handling claim for epoch ${proofClaim.epochToProve}`, err);
    }
  }

  /**
   * Handles the epoch number to prove when the prover node starts by checking if there
   * is an existing claim for it. If not, it creates and sends a quote for it.
   * @param epochNumber - The epoch immediately before the current one when the prover node starts.
   */
  async handleInitialEpochSync(epochNumber: bigint): Promise<void> {
    try {
      const claim = await this.publisher.getProofClaim();
      if (!claim || claim.epochToProve < epochNumber) {
        this.log.verbose(`Handling epoch ${epochNumber} completed as initial sync`);
        await this.handleEpochCompleted(epochNumber);
      }
    } catch (err) {
      this.log.error(`Error handling initial epoch sync`, err);
    }
  }

  /**
   * Handles an epoch being completed by sending a quote for proving it.
   * @param epochNumber - The epoch number that was just completed.
   */
  async handleEpochCompleted(epochNumber: bigint): Promise<void> {
    try {
      // Gather data for the epoch
      const epochData = await this.gatherEpochData(epochNumber);
      const { blocks } = epochData;
      this.cachedEpochData = { epochNumber, ...epochData };

      // Construct a quote for the epoch
      const partialQuote = await this.quoteProvider.getQuote(Number(epochNumber), blocks);
      if (!partialQuote) {
        this.log.info(`No quote produced for epoch ${epochNumber}`);
        return;
      }

      // Ensure we have deposited enough funds for sending this quote
      await this.bondManager.ensureBond(partialQuote.bondAmount);

      // Assemble and sign full quote
      const quote = EpochProofQuotePayload.from({
        ...partialQuote,
        epochToProve: BigInt(epochNumber),
        prover: this.publisher.getSenderAddress(),
        validUntilSlot: partialQuote.validUntilSlot ?? BigInt(Number.MAX_SAFE_INTEGER), // Should we constrain this?
      });
      const signed = await this.quoteSigner.sign(quote);

      // Send it to the coordinator
      this.log.info(
        `Sending quote for epoch ${epochNumber} with blocks ${blocks[0].number} to ${blocks.at(-1)!.number}`,
        quote.toViemArgs(),
      );
      await this.doSendEpochProofQuote(signed);
    } catch (err) {
      this.log.error(`Error handling epoch completed`, err);
    }
  }

  /**
   * Starts the prover node so it periodically checks for unproven epochs in the unfinalised chain from L1 and sends
   * quotes for them, as well as monitors the claims for the epochs it has sent quotes for and starts proving jobs.
   * This method returns once the prover node has deposited an initial bond into the escrow contract.
   */
  async start() {
    await this.bondManager.ensureBond();
    this.epochsMonitor.start(this);
    this.claimsMonitor.start(this);
    this.log.info('Started ProverNode', this.options);
  }

  /**
   * Stops the prover node and all its dependencies.
   */
  async stop() {
    this.log.info('Stopping ProverNode');
    await this.epochsMonitor.stop();
    await this.claimsMonitor.stop();
    await this.prover.stop();
    await tryStop(this.l2BlockSource);
    this.publisher.interrupt();
    await Promise.all(Array.from(this.jobs.values()).map(job => job.stop()));
    await this.worldState.stop();
    await tryStop(this.coordination);
    await this.telemetryClient.stop();
    this.log.info('Stopped ProverNode');
  }

  /** Sends an epoch proof quote to the coordinator. */
  public sendEpochProofQuote(quote: EpochProofQuote): Promise<void> {
    this.log.info(`Sending quote for epoch`, quote.toViemArgs().quote);
    return this.doSendEpochProofQuote(quote);
  }

  private doSendEpochProofQuote(quote: EpochProofQuote) {
    return this.coordination.addEpochProofQuote(quote);
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
  public getJobs(): Promise<{ uuid: string; status: EpochProvingJobState }[]> {
    return Promise.resolve(Array.from(this.jobs.entries()).map(([uuid, job]) => ({ uuid, status: job.getState() })));
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
    await this.worldState.syncImmediate(fromBlock - 1);

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
      throw new Error(`No blocks found for epoch ${epochNumber}`);
    }
    return blocks;
  }

  private async gatherTxs(epochNumber: bigint, blocks: L2Block[]) {
    let txsToFind: TxHash[] = [];
    const txHashToBlock = new Map<string, number>();
    const results = new Map<string, Tx>();

    for (const block of blocks) {
      for (const tx of block.body.txEffects) {
        txsToFind.push(tx.txHash);
        txHashToBlock.set(tx.txHash.toString(), block.number);
      }
    }

    const totalTxsRequired = txsToFind.length;
    this.log.info(
      `Gathering a total of ${totalTxsRequired} txs for epoch=${epochNumber} made up of ${blocks.length} blocks`,
      { epochNumber },
    );

    let iteration = 0;
    try {
      await retryUntil(
        async () => {
          const batch = [...txsToFind];
          txsToFind = [];
          const batchResults = await asyncPool(this.options.txGatheringMaxParallelRequests, batch, async txHash => {
            const tx = await this.coordination.getTxByHash(txHash);
            return [txHash, tx] as const;
          });
          let found = 0;
          for (const [txHash, maybeTx] of batchResults) {
            if (maybeTx) {
              found++;
              results.set(txHash.toString(), maybeTx);
            } else {
              txsToFind.push(txHash);
            }
          }

          this.log.verbose(
            `Gathered ${found}/${batch.length} txs in iteration ${iteration} for epoch ${epochNumber}. In total ${results.size}/${totalTxsRequired} have been retrieved.`,
            { epochNumber },
          );
          iteration++;

          // stop when we found all transactions
          return txsToFind.length === 0;
        },
        'Gather txs',
        this.options.txGatheringTimeoutMs / 1_000,
        this.options.txGatheringIntervalMs / 1_000,
      );
    } catch (err) {
      if (err && err instanceof TimeoutError) {
        const notFoundList = txsToFind
          .map(txHash => `${txHash.toString()} (block ${txHashToBlock.get(txHash.toString())})`)
          .join(', ');
        throw new Error(`Txs not found for epoch ${epochNumber}: ${notFoundList}`);
      } else {
        throw err;
      }
    }

    return Array.from(results.values());
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
    await this.claimsMonitor.work();
  }
}
