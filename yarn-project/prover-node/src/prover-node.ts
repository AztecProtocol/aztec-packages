import type { Archiver } from '@aztec/archiver';
import type { RollupContract } from '@aztec/ethereum/contracts';
import type { Delayer } from '@aztec/ethereum/l1-tx-utils';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { assertRequired, compact, pick } from '@aztec/foundation/collection';
import { memoize } from '@aztec/foundation/decorators';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { DateProvider, executeTimeout } from '@aztec/foundation/timer';
import type { EpochProverFactory } from '@aztec/prover-client';
import { getLastSiblingPath } from '@aztec/prover-client/helpers';
import { ChonkCache } from '@aztec/prover-client/orchestrator';
import { PublicProcessorFactory } from '@aztec/simulator/server';
import {
  EventDrivenL2BlockStream,
  type L2BlockId,
  type L2BlockSource,
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
import type { CheckpointProver } from './job/checkpoint-prover.js';
import type { EpochSessionHooks } from './job/epoch-session.js';
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
  private blockStream: EventDrivenL2BlockStream | undefined;
  /**
   * Highest epoch whose proof-submission window has passed. Monotonic high-water mark.
   * Seeded from the last fully-proven epoch at start(); advanced on every block-stream
   * event by comparing the archiver's latest synced L2 slot against each epoch's
   * submission deadline. Protected so tests can verify the start() seeding.
   */
  protected lastExpiredEpoch: EpochNumber | undefined;

  /**
   * Highest checkpoint number whose proving-side handling has completed (or that was legitimately skipped).
   * The catch-up loop walks from here to each `chain-checkpointed` tip event. Seeded at start() from the last
   * checkpoint of the last fully-proven epoch (or 0), so a restart reprocesses the partially-proven epoch rather
   * than trusting a checkpointed tip that may sit ahead of unproven checkpoints. Clamped down on a prune.
   */
  protected lastProcessedCheckpoint: CheckpointNumber = CheckpointNumber.ZERO;

  /** Periodic tick that runs the epoch-expiry sweep during idle periods when no block-stream events arrive. */
  private expiryTicker: RunningPromise | undefined;

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

  /** Returns the underlying prover instance. */
  public getProver() {
    return this.prover;
  }

  // ---------------- L2BlockStream handler ----------------

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    switch (event.type) {
      case 'chain-checkpointed':
        await this.processCheckpointJump(event.checkpoint.number);
        break;
      case 'chain-pruned':
        await this.handlePruneEvent(event.block);
        break;
      case 'chain-proven':
        this.publishingService?.onChainProven(BlockNumber(event.block.number));
        break;
      // The proposed tip drives only the tips store's walk-back history (recorded below); the prover-node
      // tracks checkpoints, not proposed blocks. `blocks-added` is never emitted in tips-only mode, and
      // `chain-finalized` carries nothing the prover-node acts on.
      case 'chain-proposed':
      case 'chain-finalized':
      case 'blocks-added':
        break;
      default: {
        const _: never = event;
        break;
      }
    }
    // Advance the local tips store only after the proving-side handling (registration / prune) has
    // succeeded. Any failure above propagates to the L2BlockStream (which logs and stops this poll
    // pass) and skips this update, so the event is re-emitted on the next poll rather than skipped
    await this.tipsStore.handleBlockStreamEvent(event);
  }

  /**
   * Walks every checkpoint between the local cursor and the newly-reported checkpointed tip, registering
   * each one that belongs to an epoch that can still be proven. The block stream now delivers a single thin
   * `chain-checkpointed` tip event per pass rather than one fat event per checkpoint, so this drives the
   * catch-up itself: light metadata first (`getCheckpointsData`) to decide relevance per epoch, then a heavy
   * `getCheckpoints` fetch only for checkpoints in provable epochs.
   *
   * The cursor advances one checkpoint at a time and only after that checkpoint's proving-side handling has
   * fully succeeded, preserving the A-1041 at-least-once semantics: a mid-jump failure leaves the cursor
   * behind so the next pass retries from the first checkpoint that did not complete.
   */
  private async processCheckpointJump(targetCheckpoint: CheckpointNumber): Promise<void> {
    if (targetCheckpoint <= this.lastProcessedCheckpoint) {
      return;
    }
    const l1Constants = await this.getL1Constants();

    // Cap the catch-up at the `(proofSubmissionEpochs + 1) * epochDuration` most recent checkpoints.
    // When the cursor is much further behind (e.g. resyncing after a long time offline), fetching the whole gap could
    // load thousands of checkpoints we cannot act on: anything older than the last two epochs is already past
    // its proof-submission window, so we skip it and jump the cursor forward to the start of the capped range.
    const maxCheckpoints = (l1Constants.proofSubmissionEpochs + 1) * l1Constants.epochDuration;
    let from = CheckpointNumber(this.lastProcessedCheckpoint + 1);
    if (Number(targetCheckpoint - from) + 1 > maxCheckpoints) {
      const cappedFrom = CheckpointNumber(targetCheckpoint - maxCheckpoints + 1);
      this.log.warn(`Skipping unprovable checkpoints during catch-up; the prover node is far behind`, {
        from,
        cappedFrom,
        targetCheckpoint,
        maxCheckpoints,
      });
      // Advance the cursor past the skipped checkpoints so they are never retried.
      this.lastProcessedCheckpoint = CheckpointNumber(cappedFrom - 1);
      from = cappedFrom;
    }
    const limit = Number(targetCheckpoint - from) + 1;
    const metadatas = await this.l2BlockSource.getCheckpointsData({ from, limit });

    // Per-epoch relevance is cached so a multi-checkpoint epoch resolves it once. Skipping is whole-epoch
    // only: the SessionManager requires an epoch's checkpoints fully covered before it opens a session, so we
    // never drop an individual checkpoint inside an epoch we will prove.
    const epochSkippable = new Map<EpochNumber, boolean>();
    for (const metadata of metadatas) {
      const epochNumber = getEpochAtSlot(metadata.header.slotNumber, l1Constants);
      let skippable = epochSkippable.get(epochNumber);
      if (skippable === undefined) {
        skippable =
          (await this.isEpochFullyProven(epochNumber, l1Constants)) ||
          (await this.isEpochPastProofSubmissionWindow(epochNumber, l1Constants));
        epochSkippable.set(epochNumber, skippable);
      }
      if (skippable) {
        this.log.debug(`Skipping checkpoint ${metadata.checkpointNumber} for unprovable epoch ${epochNumber}`);
      } else {
        await this.registerCheckpoint(metadata.checkpointNumber, epochNumber);
      }
      // Advance only after the checkpoint's handling succeeded (or it was legitimately skipped). registerCheckpoint
      // throws on failure, which leaves the cursor here for the next pass to retry (A-1041).
      this.lastProcessedCheckpoint = metadata.checkpointNumber;
    }
  }

  /** Heavy-fetch a single checkpoint, register it with the store, and notify the session manager. */
  private async registerCheckpoint(checkpointNumber: CheckpointNumber, epochNumber: EpochNumber): Promise<void> {
    const published = await this.l2BlockSource.getCheckpoint({ number: checkpointNumber });
    if (!published) {
      throw new Error(`Checkpoint ${checkpointNumber} not found in block source during catch-up`);
    }
    const checkpoint = published.checkpoint;
    this.log.info(`New checkpoint ${checkpoint.number} for epoch ${epochNumber}`, {
      checkpointNumber: checkpoint.number,
      epochNumber,
      slotNumber: checkpoint.header.slotNumber,
    });

    const registerData = await this.collectRegisterData(checkpoint, published.attestations);
    await this.checkpointStore.addOrUpdate(checkpoint, registerData);
    await this.sessionManager?.onCheckpointAdded(epochNumber);

    // Tips-only mode delivers no blocks, so record one witness per checkpointed block: a reorg into the checkpoint's
    // range then prunes at the true divergence instead of the nearest sparse tip anchor.
    await this.tipsStore.recordBlockHashes(
      await Promise.all(
        checkpoint.blocks.map(async block => ({ number: block.number, hash: (await block.header.hash()).toString() })),
      ),
    );
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

  /**
   * Marks every prover orphaned by the prune as pruned, clamps the catch-up cursor below the prune target's
   * checkpoint, and notifies the session manager. Keyed off the prune target block (the highest surviving block)
   * rather than the source's checkpointed tip, which can sit above the target after a re-checkpoint and would leave
   * orphaned provers canonical. Throws (rather than warning) if the cursor floor cannot be resolved, so the pass
   * fails and the prune is retried next iteration.
   */
  private async handlePruneEvent(prunedToBlock: L2BlockId) {
    this.log.warn(`Chain pruned to block ${prunedToBlock.number}`, { prunedToBlock });

    // Resolve the cursor floor BEFORE removing provers: cancelAndRemoveAboveBlock returns only the provers it removed,
    // so a throw after removing would leave a retry pass with nothing to act on. Resolving first means a throw leaves
    // everything untouched and the next pass retries the whole handler (the tips cursor only advances on success).
    let cursorFloor: CheckpointNumber;
    if (prunedToBlock.number === 0) {
      cursorFloor = CheckpointNumber.ZERO;
    } else {
      const targetData = await this.l2BlockSource.getBlockData({ number: prunedToBlock.number });
      if (targetData === undefined) {
        throw new Error(
          `No block data found for prune target block ${prunedToBlock.number}; cannot clamp checkpoint cursor`,
        );
      }
      // Clamp to `cpAtTarget - 1`: a mid-checkpoint target leaves that checkpoint partially orphaned and it must be
      // reprocessed. Over-clamping merely re-registers a checkpoint (at-least-once by design — A-1041); under-clamping
      // would permanently skip a rebuilt same-number checkpoint.
      cursorFloor = CheckpointNumber(Math.max(0, Number(targetData.checkpointNumber) - 1));
    }

    const affected = this.checkpointStore.cancelAndRemoveAboveBlock(prunedToBlock.number);

    if (this.lastProcessedCheckpoint > cursorFloor) {
      this.lastProcessedCheckpoint = cursorFloor;
    }

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
   * Releases chonk-cache entries for every block in the supplied epoch (best-effort) and reaps every
   * CheckpointProver in the store whose epoch is at or below it. The post-mortem upload for a failed
   * epoch does NOT happen here — a missed-window epoch's provers may already be pruned by the time it
   * expires, so it would have nothing to upload. The upload fires earlier and race-free, when a full
   * session ends in its own genuine failure (see `createSessionManager`'s `onSessionFailed`).
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

    const { lastFullyProvenEpoch } = await this.resolveLastFullyProvenEpoch();
    this.lastExpiredEpoch = lastFullyProvenEpoch;
    this.lastProcessedCheckpoint = await this.computeStartingCheckpoint(lastFullyProvenEpoch);
    this.blockStream = new EventDrivenL2BlockStream(this.l2BlockSource, this.tipsStore, this, this.log, {
      pollIntervalMS: this.config.proverNodePollingIntervalMs,
      tipsOnly: true,
    });
    this.blockStream.start();

    // The periodic ticker is the sole driver of the expiry sweep: it fires every poll interval whether
    // or not block-stream events arrive, and RunningPromise never overlaps its own runs, so the sweep's
    // `lastExpiredEpoch` high-water mark advances — and each epoch's post-mortem uploads — exactly once.
    this.expiryTicker = new RunningPromise(
      () => this.checkEpochExpiry(),
      this.log,
      this.config.proverNodePollingIntervalMs,
    );
    this.expiryTicker.start();

    await this.rewardsMetrics.start();
    this.l1Metrics.start();
    this.log.info(`Started Prover Node with prover id ${this.prover.getProverId().toString()}`, this.config);
  }

  async stop() {
    this.log.info('Stopping ProverNode');
    this.jobMetrics.stopObservingState();
    await this.blockStream?.stop();
    await this.expiryTicker?.stop();
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
   * Constructs the session manager. Extracted so subclasses (test harness) can swap the
   * implementation. Wired to upload a post-mortem when a full session ends in its own genuine failure
   * (`EpochSession.hasFailed()` — top-tree/submit failed with every prover healthy, so definitively not
   * a prune). A `stopped` session (a prover under it failed) is not uploaded; it recovers on re-add.
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
        await this.tryUploadEpochFailure(session.getEpochNumber(), session.getCheckpoints());
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

  /**
   * Uploads a post-mortem snapshot for an epoch whose full session failed to prove, built from that
   * session's checkpoint provers. Fired from the session manager's `onSessionFailed` callback (a
   * genuine, race-free failure). Exposed as a method so tests can spy on it. No-ops if no failed-epoch
   * store is configured or the checkpoint set is empty.
   */
  public async tryUploadEpochFailure(
    epoch: EpochNumber,
    checkpoints: readonly CheckpointProver[],
  ): Promise<string | undefined> {
    if (!this.config.proverNodeFailedEpochStore || checkpoints.length === 0) {
      return undefined;
    }
    const data = SessionManager.buildProvingData(checkpoints);
    return await uploadEpochProofFailure(
      this.config.proverNodeFailedEpochStore,
      `failed-epoch-${epoch}`,
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
   * Resolves the last fully-proven epoch from L1 proven state, used to seed the catch-up cursor (via
   * `computeStartingCheckpoint`) and `lastExpiredEpoch`. The fully-proven epoch is `provenEpoch` when the
   * proven tip is the last block of its epoch, otherwise `provenEpoch - 1`, or `undefined` if no block is
   * proven yet (so a restart reprocesses the partially-proven epoch rather than trusting a stale tip).
   */
  protected async resolveLastFullyProvenEpoch(): Promise<{ lastFullyProvenEpoch: EpochNumber | undefined }> {
    const provenBlockNumber = await this.l2BlockSource.getBlockNumber({ tag: 'proven' });
    if (!provenBlockNumber || provenBlockNumber <= 0) {
      return { lastFullyProvenEpoch: undefined };
    }
    const l1Constants = await this.getL1Constants();
    const provenHeader = (await this.l2BlockSource.getBlockData({ number: BlockNumber(provenBlockNumber) }))?.header;
    if (!provenHeader) {
      return { lastFullyProvenEpoch: undefined };
    }
    const provenEpoch = getEpochAtSlot(provenHeader.getSlot(), l1Constants);
    if (await this.isProvenBlockLastOfItsEpoch(BlockNumber(provenBlockNumber), provenEpoch, l1Constants)) {
      return { lastFullyProvenEpoch: provenEpoch };
    }
    const lastFullyProvenEpoch = provenEpoch > 0 ? EpochNumber(provenEpoch - 1) : undefined;
    return { lastFullyProvenEpoch };
  }

  /**
   * Resolves the catch-up cursor seed: the last checkpoint of the last fully-proven epoch, or 0 if none. Seeding
   * from a checkpoint (rather than a checkpointed tip) guarantees a restart reprocesses every checkpoint of the
   * partially-proven epoch, since the checkpointed tip can sit ahead of the last fully-proven checkpoint.
   */
  protected async computeStartingCheckpoint(lastFullyProvenEpoch: EpochNumber | undefined): Promise<CheckpointNumber> {
    if (lastFullyProvenEpoch === undefined) {
      return CheckpointNumber.ZERO;
    }
    const checkpoints = await this.l2BlockSource.getCheckpointsData({ epoch: lastFullyProvenEpoch });
    return checkpoints.at(-1)?.checkpointNumber ?? CheckpointNumber.ZERO;
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
