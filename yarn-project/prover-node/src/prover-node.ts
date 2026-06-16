import type { Archiver } from '@aztec/archiver';
import type { RollupContract } from '@aztec/ethereum/contracts';
import type { Delayer } from '@aztec/ethereum/l1-tx-utils';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { assertRequired, compact, pick } from '@aztec/foundation/collection';
import { memoize } from '@aztec/foundation/decorators';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider, executeTimeout } from '@aztec/foundation/timer';
import type { EpochProverFactory } from '@aztec/prover-client';
import { getLastSiblingPath } from '@aztec/prover-client/helpers';
import { ChonkCache } from '@aztec/prover-client/orchestrator';
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
import { type L1RollupConstants, getEpochAtSlot, getProofSubmissionDeadlineEpoch } from '@aztec/stdlib/epoch-helpers';
import {
  type EpochProverManager,
  type EpochProvingJobState,
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
import { MerkleTreeId } from '@aztec/stdlib/trees';
import {
  L1Metrics,
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
} from '@aztec/telemetry-client';

import { uploadEpochProofFailure } from './actions/upload-epoch-proof-failure.js';
import { CheckpointStore, type RegisterCheckpointData } from './checkpoint-store.js';
import type { SpecificProverNodeConfig } from './config.js';
import type { EpochSession, EpochSessionHooks } from './job/epoch-session.js';
import { ProverNodeJobMetrics, ProverNodeRewardsMetrics } from './metrics.js';
import { ProofPublishingService } from './proof-publishing-service.js';
import type { ProverPublisherFactory } from './prover-publisher-factory.js';
import { SessionManager } from './session-manager.js';

type ProverNodeOptions = SpecificProverNodeConfig & Partial<DataStoreOptions>;
type DataStoreOptions = Pick<DataStoreConfig, 'dataDirectory'> & Pick<ChainConfig, 'l1ChainId' | 'rollupVersion'>;

/**
 * Grace period for the proof-publishing service to settle during shutdown. The service waits for
 * any in-flight L1 proof-submission tx to finish; that tx can take a long time to mine, so we cap
 * the wait rather than letting `stop()` hang indefinitely.
 */
const PUBLISHING_SERVICE_STOP_TIMEOUT_MS = 30_000;

/**
 * An Aztec Prover Node is a standalone process that monitors the chain for new checkpoints,
 * starts proving them optimistically as they arrive, and submits epoch proofs to L1 once
 * complete.
 *
 * The class is intentionally thin: it owns the long-lived collections (`CheckpointStore`,
 * `ChonkCache`, `SessionManager`), the L2BlockStream, and a periodic ticker that nudges the
 * manager to pick up newly-complete epochs. Every session lifecycle decision is delegated to
 * the `SessionManager`. Each chain event is translated here into a single method call on it.
 */
export class ProverNode implements L2BlockStreamEventHandler, ProverNodeApi, Traceable {
  private log = createLogger('prover-node');

  protected readonly checkpointStore: CheckpointStore;
  protected readonly chonkCache: ChonkCache;
  protected sessionManager: SessionManager | undefined;

  private readonly config: ProverNodeOptions;
  private readonly jobMetrics: ProverNodeJobMetrics;
  private readonly rewardsMetrics: ProverNodeRewardsMetrics;

  /** In-memory store for the L2BlockStream's local data provider. */
  private tipsStore: L2TipsMemoryStore;
  /** Block stream for checkpoint and reorg detection. */
  private blockStream: L2BlockStream | undefined;
  /**
   * Highest epoch whose proof-submission window has passed. Monotonic high-water mark.
   * Seeded from the last fully-proven epoch at start(); advanced on every block-stream
   * event by comparing the archiver's latest synced L2 slot against each epoch's
   * submission deadline. Protected so tests can verify the start() seeding.
   */
  protected lastExpiredEpoch: EpochNumber | undefined;

  public readonly tracer: Tracer;

  protected publishingService: ProofPublishingService | undefined;

  constructor(
    protected readonly prover: EpochProverManager & EpochProverFactory,
    protected readonly publisherFactory: ProverPublisherFactory,
    protected readonly l2BlockSource: L2BlockSource & Partial<Service>,
    protected readonly l1ToL2MessageSource: L1ToL2MessageSource,
    protected readonly contractDataSource: ContractDataSource,
    protected readonly worldState: WorldStateSynchronizer,
    protected readonly p2pClient: { getTxProvider(): ITxProvider } & Partial<Service>,
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

    this.tipsStore = new L2TipsMemoryStore(this.l2BlockSource.getGenesisBlockHash());

    this.chonkCache = new ChonkCache(this.log.getBindings());
    this.checkpointStore = new CheckpointStore(
      this.l2BlockSource,
      {
        proverFactory: this.prover,
        chonkCache: this.chonkCache,
        publicProcessorFactory: new PublicProcessorFactory(
          this.contractDataSource,
          this.dateProvider,
          this.telemetryClient,
          this.log.getBindings(),
        ),
        dbProvider: this.worldState,
        txProvider: this.p2pClient.getTxProvider(),
        dateProvider: this.dateProvider,
        proverId: this.prover.getProverId(),
        metrics: this.jobMetrics,
        txGatheringTimeoutMs: this.config.txGatheringTimeoutMs,
        deadline: undefined,
      },
      { slotWatcherPollIntervalMs: this.config.proverNodePollingIntervalMs },
      this.log.getBindings(),
    );
  }

  public getProverId() {
    return this.prover.getProverId();
  }

  public getP2P() {
    return this.p2pClient;
  }

  /** Test-only: the shared L1 tx delayer, if enabled. */
  public getDelayer(): Delayer | undefined {
    return this.delayer;
  }

  /** Observability summary for the ProverNodeApi. */
  public getJobs(): Promise<{ uuid: string; status: EpochProvingJobState; epochNumber: EpochNumber }[]> {
    return Promise.resolve(this.sessionManager?.getJobs() ?? []);
  }

  /** Tests inspect this when validating reconcile behaviour. */
  public getCheckpointStore(): CheckpointStore {
    return this.checkpointStore;
  }

  /** Tests inspect this to verify chonk-cache release semantics. */
  public getChonkCache(): ChonkCache {
    return this.chonkCache;
  }

  /** Tests inspect this when looking up live sessions. */
  public getSessionManager(): SessionManager {
    if (!this.sessionManager) {
      throw new Error('SessionManager not yet constructed — start() must be called first.');
    }
    return this.sessionManager;
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

  /** Returns the underlying prover instance. */
  public getProver() {
    return this.prover;
  }

  // ---------------- L2BlockStream handler ----------------

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    switch (event.type) {
      case 'chain-checkpointed':
        await this.handleCheckpointEvent(event.checkpoint);
        break;
      case 'chain-pruned':
        await this.handlePruneEvent(event.checkpointed.checkpoint);
        break;
      case 'chain-proven':
        this.publishingService?.onChainProven(BlockNumber(event.block.number));
        break;
      case 'chain-finalized':
      case 'blocks-added':
        break;
    }
    // Expiry is driven by the archiver's latest synced L2 slot
    await this.checkEpochExpiry();
    // Advance the local tips store only after the proving-side handling has succeeded. Any
    // failure above propagates to the L2BlockStream (which logs and stops this poll pass) and
    // skips this update, so the event is re-emitted on the next poll rather than skipped (A-1041).
    await this.tipsStore.handleBlockStreamEvent(event);
  }

  /** Register a new checkpoint with the store and notify the session manager. */
  private async handleCheckpointEvent(publishedCheckpoint: PublishedCheckpoint) {
    const checkpoint = publishedCheckpoint.checkpoint;
    const slotNumber = checkpoint.header.slotNumber;
    const l1Constants = await this.getL1Constants();
    const epochNumber = getEpochAtSlot(slotNumber, l1Constants);

    if (await this.isEpochFullyProven(epochNumber, l1Constants)) {
      this.log.debug(`Skipping checkpoint ${checkpoint.number} for already-proven epoch ${epochNumber}`);
      return;
    }

    if (await this.isEpochPastProofSubmissionWindow(epochNumber, l1Constants)) {
      this.log.debug(
        `Skipping checkpoint ${checkpoint.number} for epoch ${epochNumber} past its proof-submission window`,
      );
      return;
    }

    this.log.info(`New checkpoint ${checkpoint.number} for epoch ${epochNumber}`, {
      checkpointNumber: checkpoint.number,
      epochNumber,
      slotNumber,
    });

    const registerData = await this.collectRegisterData(checkpoint, publishedCheckpoint.attestations);
    await this.checkpointStore.addOrUpdate(checkpoint, registerData);
    await this.sessionManager?.onCheckpointAdded(epochNumber);
  }

  /**
   * Gathers register-time data for a checkpoint: previous block header, L1-to-L2 messages,
   * and the archive sibling path.
   */
  private async collectRegisterData(
    checkpoint: Checkpoint,
    attestations: PublishedCheckpoint['attestations'],
  ): Promise<RegisterCheckpointData> {
    const previousBlockNumber = BlockNumber(checkpoint.blocks[0].number - 1);
    const previousBlockHeader = await this.gatherPreviousBlockHeader(previousBlockNumber);
    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(checkpoint.number);
    const lastBlock = checkpoint.blocks.at(-1)!;
    const lastBlockHash = await lastBlock.header.hash();
    await this.worldState.syncImmediate(lastBlock.number, lastBlockHash);
    const previousArchiveSiblingPath = await getLastSiblingPath(
      MerkleTreeId.ARCHIVE,
      this.worldState.getSnapshot(previousBlockNumber),
    );
    return {
      attestations,
      previousBlockHeader,
      l1ToL2Messages,
      previousArchiveSiblingPath,
    };
  }

  /** Mark every prover above the prune threshold as pruned and notify the session manager. */
  private async handlePruneEvent(prunedCheckpoint: { number: CheckpointNumber; hash: string }) {
    this.log.warn(`Chain pruned to checkpoint ${prunedCheckpoint.number}`, { prunedCheckpoint });
    const affected = this.checkpointStore.markPrunedAfter(prunedCheckpoint.number);
    if (affected.length === 0) {
      return;
    }
    const l1Constants = await this.getL1Constants();
    const affectedEpochs = Array.from(
      new Set(affected.map(p => Number(getEpochAtSlot(p.slotNumber, l1Constants)))),
    ).map(n => EpochNumber(n));
    // The session manager cancels every affected session, which in turn calls
    // publishingService.withdraw(uuid) for each candidate; no separate notification to the
    // publishing service is needed.
    await this.sessionManager?.onPrune(affectedEpochs);
  }

  /**
   * Returns true once the chain has advanced past the given epoch's proof-submission window.
   * Used to ignore checkpoints whose epoch can no longer be proven in time — chiefly while the
   * archiver replays old blocks after a restart. Compares the archiver's latest synced L2 slot
   * against the epoch's submission-deadline epoch; conservatively returns false if the slot can't
   * be read yet.
   */
  private async isEpochPastProofSubmissionWindow(
    epochNumber: EpochNumber,
    l1Constants: L1RollupConstants,
  ): Promise<boolean> {
    const latestSlot = await this.l2BlockSource.getSyncedL2SlotNumber();
    if (latestSlot === undefined) {
      return false;
    }
    const latestEpoch = getEpochAtSlot(latestSlot, l1Constants);
    return latestEpoch >= getProofSubmissionDeadlineEpoch(epochNumber, l1Constants);
  }

  /**
   * Compares the archiver's latest synced L2 slot against `lastExpiredEpoch` and, for each
   * newly-expired epoch, releases the chonk-cache entries for its blocks and reaps any
   * CheckpointProvers in the store. An epoch E is expired once the chain reaches the start
   * of epoch `E + proofSubmissionEpochs + 1`. Silently no-ops if nothing has expired since
   * the last check or the archiver's slot can't be read.
   */
  private async checkEpochExpiry(): Promise<void> {
    const latestSlot = await this.l2BlockSource.getSyncedL2SlotNumber();
    if (latestSlot === undefined) {
      return;
    }
    const l1Constants = await this.getL1Constants();
    const latestEpoch = getEpochAtSlot(latestSlot, l1Constants);
    const offset = l1Constants.proofSubmissionEpochs + 1;
    if (latestEpoch < offset) {
      return;
    }
    const newlyExpiredUpTo = EpochNumber(latestEpoch - offset);
    const from = this.lastExpiredEpoch === undefined ? EpochNumber(0) : EpochNumber(this.lastExpiredEpoch + 1);
    if (newlyExpiredUpTo < from) {
      return;
    }
    for (let e = from; e <= newlyExpiredUpTo; e = EpochNumber(e + 1)) {
      await this.expireEpoch(e);
    }
    this.lastExpiredEpoch = newlyExpiredUpTo;
  }

  /**
   * Releases chonk-cache entries for every block in the supplied epoch (best-effort) and
   * reaps every CheckpointProver in the store whose epoch number matches.
   */
  private async expireEpoch(epoch: EpochNumber): Promise<void> {
    try {
      const blocks = await this.l2BlockSource.getBlocks({ epoch, onlyCheckpointed: true });
      if (blocks.length > 0) {
        this.chonkCache.releaseForBlocks(blocks);
      }
    } catch (err) {
      this.log.warn(`Could not release chonk-cache entries for expired epoch ${epoch}`, err);
    }
    this.checkpointStore.reapExpired(epoch);
  }

  // ---------------- public API ----------------

  /**
   * Schedules proving for the given epoch and returns the job id without waiting for completion.
   */
  public async startProof(epochNumber: EpochNumber): Promise<string> {
    if (!this.sessionManager) {
      throw new Error('ProverNode not started');
    }
    return await this.sessionManager.startProof(epochNumber);
  }

  // ---------------- Service lifecycle ----------------

  async start() {
    await this.checkpointStore.start();

    await this.publisherFactory.start();
    this.publishingService = new ProofPublishingService({
      publisherFactory: this.publisherFactory,
      l2BlockSource: this.l2BlockSource,
      dateProvider: this.dateProvider,
      config: { skipSubmitProof: !!this.config.proverNodeDisableProofPublish },
      bindings: this.log.getBindings(),
    });
    this.sessionManager = this.createSessionManager(this.publishingService);
    // SessionManager owns its own periodic tick; start it here so it begins picking up
    // epochs that become complete by time (no fresh checkpoint event) and advances once
    // the previous epoch is proven on L1.
    this.sessionManager.start();
    // Now that the store + manager exist, arm the live-state observable gauges.
    this.jobMetrics.observeState(this.checkpointStore, this.sessionManager);

    const { startingBlock, lastFullyProvenEpoch } = await this.computeStartupState();
    this.lastExpiredEpoch = lastFullyProvenEpoch;
    this.blockStream = new L2BlockStream(this.l2BlockSource, this.tipsStore, this, this.log, {
      pollIntervalMS: this.config.proverNodePollingIntervalMs,
      startingBlock,
    });
    this.blockStream.start();

    await this.rewardsMetrics.start();
    this.l1Metrics.start();
    this.log.info(`Started Prover Node with prover id ${this.prover.getProverId().toString()}`, this.config);
  }

  async stop() {
    this.log.info('Stopping ProverNode');
    this.jobMetrics.stopObservingState();
    await this.blockStream?.stop();
    if (this.sessionManager) {
      await this.sessionManager.stop();
    }
    if (this.publishingService) {
      // Bound the wait: the publishing service blocks until any in-flight L1 proof-submission tx
      // settles, which can outlast a reasonable shutdown window. On timeout we log and move on —
      // the tx may still mine, but shutdown must not hang on it.
      const publishingService = this.publishingService;
      await executeTimeout(
        () => publishingService.stop(),
        PUBLISHING_SERVICE_STOP_TIMEOUT_MS,
        'prover-node publishing-service stop',
      ).catch(err => this.log.warn(`Timed out stopping proof publishing service`, err));
    }
    await this.checkpointStore.stop();
    this.chonkCache.stop();
    await this.prover.stop();
    await tryStop(this.publisherFactory);
    this.rewardsMetrics.stop();
    this.l1Metrics.stop();
    await this.telemetryClient.stop();
    this.log.info('Stopped ProverNode');
  }

  /**
   * Constructs the session manager. Extracted so subclasses (test harness) can swap
   * the implementation. Wired to `tryUploadSessionFailure` so failed sessions get
   * their proving data uploaded.
   */
  protected createSessionManager(publishingService: ProofPublishingService): SessionManager {
    return new SessionManager({
      checkpointStore: this.checkpointStore,
      l2BlockSource: this.l2BlockSource,
      proverFactory: this.prover,
      proverId: this.prover.getProverId(),
      publishingService,
      metrics: this.jobMetrics,
      dateProvider: this.dateProvider,
      config: {
        maxPendingJobs: this.config.proverNodeMaxPendingJobs,
        tickIntervalMs: this.config.proverNodePollingIntervalMs,
        finalizationDelayMs: this.config.proverNodeEpochProvingDelayMs,
      },
      onSessionFailed: async session => {
        await this.tryUploadSessionFailure(session);
      },
      bindings: this.log.getBindings(),
    });
  }

  /**
   * Installs session hooks for the e2e harness to interpose around top-tree proving
   * (gate, override, or observe it) without monkey-patching the orchestrator factory.
   * Applies to every session constructed after this call.
   */
  public setSessionHooks(hooks: EpochSessionHooks): void {
    if (!this.sessionManager) {
      throw new Error('ProverNode not started; call start() before setting session hooks.');
    }
    this.sessionManager.setSessionHooks(hooks);
  }

  /** Uploads failure snapshots when sessions exit with `failed`. Exposed as a method so tests can spy on it. */
  public async tryUploadSessionFailure(session: EpochSession): Promise<string | undefined> {
    if (!this.config.proverNodeFailedEpochStore) {
      return undefined;
    }
    const data = SessionManager.buildSessionProvingData(session);
    return await uploadEpochProofFailure(
      this.config.proverNodeFailedEpochStore,
      session.getId(),
      data,
      this.l2BlockSource as Archiver,
      this.worldState,
      assertRequired(pick(this.config, 'l1ChainId', 'rollupVersion', 'dataDirectory')),
      this.log,
    );
  }

  // ---------------- helpers ----------------

  @memoize
  private getL1Constants(): Promise<L1RollupConstants> {
    return this.l2BlockSource.getL1Constants();
  }

  /**
   * Returns true if every block in the given epoch is proven on L1. An epoch is only
   * fully proven when its *last* block is proven. Protected for direct unit-test access.
   */
  protected async isEpochFullyProven(
    epochNumber: EpochNumber,
    l1Constants: Pick<L1RollupConstants, 'epochDuration'>,
  ): Promise<boolean> {
    const provenBlockNumber = await this.l2BlockSource.getBlockNumber({ tag: 'proven' });
    if (!provenBlockNumber || provenBlockNumber <= 0) {
      return false;
    }
    const provenHeader = (await this.l2BlockSource.getBlockData({ number: BlockNumber(provenBlockNumber) }))?.header;
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
    return this.isProvenBlockLastOfItsEpoch(BlockNumber(provenBlockNumber), provenEpoch, l1Constants);
  }

  /** Protected for direct unit-test access. */
  protected async isProvenBlockLastOfItsEpoch(
    provenBlockNumber: BlockNumber,
    provenEpoch: EpochNumber,
    l1Constants: Pick<L1RollupConstants, 'epochDuration'>,
  ): Promise<boolean> {
    const nextHeader = (await this.l2BlockSource.getBlockData({ number: BlockNumber(provenBlockNumber + 1) }))?.header;
    if (nextHeader) {
      return getEpochAtSlot(nextHeader.getSlot(), l1Constants) > provenEpoch;
    }
    return this.l2BlockSource.isEpochComplete(provenEpoch);
  }

  /**
   * Resolves the L2BlockStream's starting block and the last fully-proven epoch in one
   * pass. The starting block is the first block of the next unproven epoch (or the start
   * of the partially-proven epoch if the proven tip falls mid-epoch). The fully-proven
   * epoch is `provenEpoch` when the proven tip is the last block of its epoch, otherwise
   * `provenEpoch - 1`, or `undefined` if no block is proven yet.
   */
  protected async computeStartupState(): Promise<{
    startingBlock: BlockNumber;
    lastFullyProvenEpoch: EpochNumber | undefined;
  }> {
    const provenBlockNumber = await this.l2BlockSource.getBlockNumber({ tag: 'proven' });
    if (!provenBlockNumber || provenBlockNumber <= 0) {
      return { startingBlock: BlockNumber(1), lastFullyProvenEpoch: undefined };
    }
    const l1Constants = await this.getL1Constants();
    const provenHeader = (await this.l2BlockSource.getBlockData({ number: BlockNumber(provenBlockNumber) }))?.header;
    if (!provenHeader) {
      return { startingBlock: BlockNumber(provenBlockNumber + 1), lastFullyProvenEpoch: undefined };
    }
    const provenEpoch = getEpochAtSlot(provenHeader.getSlot(), l1Constants);
    if (await this.isProvenBlockLastOfItsEpoch(BlockNumber(provenBlockNumber), provenEpoch, l1Constants)) {
      return { startingBlock: BlockNumber(provenBlockNumber + 1), lastFullyProvenEpoch: provenEpoch };
    }
    const epochCheckpoints = await this.l2BlockSource.getCheckpointsData({ epoch: provenEpoch });
    const firstBlockOfEpoch =
      epochCheckpoints.length > 0 ? epochCheckpoints[0].startBlock : BlockNumber(provenBlockNumber);
    this.log.info(
      `Starting L2BlockStream at block ${firstBlockOfEpoch} (start of partially-proven epoch ${provenEpoch})`,
      { provenBlockNumber, provenEpoch, firstBlockOfEpoch },
    );
    const lastFullyProvenEpoch = provenEpoch > 0 ? EpochNumber(provenEpoch - 1) : undefined;
    return { startingBlock: firstBlockOfEpoch, lastFullyProvenEpoch };
  }

  private async gatherPreviousBlockHeader(previousBlockNumber: number) {
    const data = await this.l2BlockSource.getBlockData({ number: BlockNumber(previousBlockNumber) });
    if (!data?.header) {
      throw new Error(`Previous block header ${previousBlockNumber} not found`);
    }
    return data.header;
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

// Re-export so handlers can compare states externally.
export { EpochProvingJobTerminalState };
