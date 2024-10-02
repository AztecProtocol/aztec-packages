import {
  type EpochProofClaim,
  type EpochProofQuote,
  EpochProofQuotePayload,
  type EpochProverManager,
  type L1ToL2MessageSource,
  type L2Block,
  type L2BlockSource,
  type MerkleTreeOperations,
  type ProverCoordination,
  type WorldStateSynchronizer,
} from '@aztec/circuit-types';
import { compact } from '@aztec/foundation/collection';
import { createDebugLogger } from '@aztec/foundation/log';
import { type L1Publisher } from '@aztec/sequencer-client';
import { PublicProcessorFactory, type SimulationProvider } from '@aztec/simulator';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { type ContractDataSource } from '@aztec/types/contracts';

import { EpochProvingJob, type EpochProvingJobState } from './job/epoch-proving-job.js';
import { ProverNodeMetrics } from './metrics.js';
import { type ClaimsMonitor, type ClaimsMonitorHandler } from './monitors/claims-monitor.js';
import { type EpochMonitor, type EpochMonitorHandler } from './monitors/epoch-monitor.js';
import { type QuoteProvider } from './quote-provider/index.js';
import { type QuoteSigner } from './quote-signer.js';

export type ProverNodeOptions = {
  pollingIntervalMs: number;
  maxPendingJobs: number;
};

/**
 * An Aztec Prover Node is a standalone process that monitors the unfinalised chain on L1 for unproven blocks,
 * submits bids for proving them, and monitors if they are accepted. If so, the prover node fetches the txs
 * from a tx source in the p2p network or an external node, re-executes their public functions, creates a rollup
 * proof for the epoch, and submits it to L1.
 */
export class ProverNode implements ClaimsMonitorHandler, EpochMonitorHandler {
  private log = createDebugLogger('aztec:prover-node');

  private latestEpochWeAreProving: bigint | undefined;
  private jobs: Map<string, EpochProvingJob> = new Map();
  private options: ProverNodeOptions;
  private metrics: ProverNodeMetrics;

  constructor(
    private readonly prover: EpochProverManager,
    private readonly publisher: L1Publisher,
    private readonly l2BlockSource: L2BlockSource,
    private readonly l1ToL2MessageSource: L1ToL2MessageSource,
    private readonly contractDataSource: ContractDataSource,
    private readonly worldState: WorldStateSynchronizer,
    private readonly coordination: ProverCoordination,
    private readonly simulator: SimulationProvider,
    private readonly quoteProvider: QuoteProvider,
    private readonly quoteSigner: QuoteSigner,
    private readonly claimsMonitor: ClaimsMonitor,
    private readonly epochsMonitor: EpochMonitor,
    private readonly telemetryClient: TelemetryClient,
    options: Partial<ProverNodeOptions> = {},
  ) {
    this.options = {
      pollingIntervalMs: 1_000,
      maxPendingJobs: 100,
      ...compact(options),
    };

    this.metrics = new ProverNodeMetrics(telemetryClient, 'ProverNode');
  }

  async ensureBond() {
    // Ensure the prover has enough bond to submit proofs
    // Can we just run this at the beginning and forget about it?
    // Or do we need to check periodically? Or only when we get slashed? How do we know we got slashed?
  }

  async handleClaim(proofClaim: EpochProofClaim): Promise<void> {
    if (proofClaim.epochToProve === this.latestEpochWeAreProving) {
      this.log.verbose(`Already proving claim for epoch ${proofClaim.epochToProve}`);
      return;
    }

    try {
      await this.startProof(proofClaim.epochToProve);
      this.latestEpochWeAreProving = proofClaim.epochToProve;
    } catch (err) {
      this.log.error(`Error handling claim for epoch ${proofClaim.epochToProve}`, err);
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
        await this.handleEpochCompleted(epochNumber);
      } else if (claim && claim.bondProvider.equals(this.publisher.getSenderAddress())) {
        const lastEpochProven = await this.l2BlockSource.getProvenL2EpochNumber();
        if (!lastEpochProven || lastEpochProven < claim.epochToProve) {
          await this.handleClaim(claim);
        }
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
      const blocks = await this.l2BlockSource.getBlocksForEpoch(epochNumber);
      const partialQuote = await this.quoteProvider.getQuote(Number(epochNumber), blocks);
      if (!partialQuote) {
        this.log.verbose(`No quote produced for epoch ${epochNumber}`);
        return;
      }

      const quote = EpochProofQuotePayload.from({
        ...partialQuote,
        epochToProve: BigInt(epochNumber),
        prover: this.publisher.getSenderAddress(),
        validUntilSlot: partialQuote.validUntilSlot ?? BigInt(Number.MAX_SAFE_INTEGER), // Should we constrain this?
      });
      const signed = await this.quoteSigner.sign(quote);
      await this.sendEpochProofQuote(signed);
    } catch (err) {
      this.log.error(`Error handling epoch completed`, err);
    }
  }

  /**
   * Starts the prover node so it periodically checks for unproven blocks in the unfinalised chain from L1 and proves them.
   * This may change once we implement a prover coordination mechanism.
   */
  async start() {
    await this.ensureBond();
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
    await this.l2BlockSource.stop();
    this.publisher.interrupt();
    this.jobs.forEach(job => job.stop());
    await this.worldState.stop();
    this.log.info('Stopped ProverNode');
  }

  /**
   * Sends an epoch proof quote to the coordinator.
   */
  public sendEpochProofQuote(quote: EpochProofQuote): Promise<void> {
    this.log.info(`Sending quote for epoch`, quote.toViemArgs().quote);
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
  public getJobs(): { uuid: string; status: EpochProvingJobState }[] {
    return Array.from(this.jobs.entries()).map(([uuid, job]) => ({ uuid, status: job.getState() }));
  }

  private checkMaximumPendingJobs() {
    const { maxPendingJobs } = this.options;
    return maxPendingJobs === 0 || this.jobs.size < maxPendingJobs;
  }

  private async createProvingJob(epochNumber: bigint) {
    if (!this.checkMaximumPendingJobs()) {
      throw new Error(`Maximum pending proving jobs ${this.options.maxPendingJobs} reached. Cannot create new job.`);
    }

    // Gather blocks for this epoch
    const blocks = await this.l2BlockSource.getBlocksForEpoch(epochNumber);
    if (blocks.length === 0) {
      throw new Error(`No blocks found for epoch ${epochNumber}`);
    }
    const fromBlock = blocks[0].number;
    const toBlock = blocks.at(-1)!.number;

    if ((await this.worldState.status()).syncedToL2Block >= fromBlock) {
      throw new Error(`Cannot create proving job for block ${fromBlock} as it is behind the current world state`);
    }

    // Fast forward world state to right before the target block and get a fork
    this.log.verbose(`Creating proving job for epoch ${epochNumber} for block range ${fromBlock} to ${toBlock}`);
    const db = await this.worldState.syncImmediateAndFork(fromBlock - 1, true);

    // Create a processor using the forked world state
    const publicProcessorFactory = new PublicProcessorFactory(
      db,
      this.contractDataSource,
      this.simulator,
      this.telemetryClient,
    );

    const cleanUp = async () => {
      await db.delete();
      this.jobs.delete(job.getId());
    };

    const job = this.doCreateEpochProvingJob(epochNumber, blocks, db, publicProcessorFactory, cleanUp);
    this.jobs.set(job.getId(), job);
    return job;
  }

  /** Extracted for testing purposes. */
  protected doCreateEpochProvingJob(
    epochNumber: bigint,
    blocks: L2Block[],
    db: MerkleTreeOperations,
    publicProcessorFactory: PublicProcessorFactory,
    cleanUp: () => Promise<void>,
  ) {
    return new EpochProvingJob(
      epochNumber,
      blocks,
      this.prover.createEpochProver(db),
      publicProcessorFactory,
      this.publisher,
      this.l2BlockSource,
      this.l1ToL2MessageSource,
      this.coordination,
      this.metrics,
      cleanUp,
    );
  }

  /** Extracted for testing purposes. */
  protected async triggerMonitors() {
    await this.epochsMonitor.work();
    await this.claimsMonitor.work();
  }
}
