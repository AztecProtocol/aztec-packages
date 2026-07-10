import { BlockNumber, type EpochNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { RunningPromise } from '@aztec/foundation/running-promise';
import type { DateProvider } from '@aztec/foundation/timer';
import type { EpochProverFactory } from '@aztec/prover-client';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import {
  type L1RollupConstants,
  getEpochAtSlot,
  getProofSubmissionDeadlineTimestamp,
  getSlotRangeForEpoch,
} from '@aztec/stdlib/epoch-helpers';
import type { EpochProvingJobState } from '@aztec/stdlib/interfaces/server';

import type { CheckpointStore } from './checkpoint-store.js';
import { CheckpointProver } from './job/checkpoint-prover.js';
import type { EpochProvingJobData } from './job/epoch-proving-job-data.js';
import {
  EpochSession,
  type EpochSessionDeps,
  type EpochSessionHooks,
  type EpochSessionOptions,
  type SessionSpec,
  specKey,
} from './job/epoch-session.js';
import type { ProverNodeJobMetrics } from './metrics.js';
import type { ProofPublishingService } from './proof-publishing-service.js';

/** Trigger payload for `reconcile`. */
export type ReconcileTrigger =
  | { kind: 'checkpoint'; epoch: EpochNumber }
  | { kind: 'prune'; affectedEpochs: EpochNumber[] }
  | { kind: 'tick' }
  | { kind: 'start-proof'; spec: SessionSpec };

/** Config bag for session lifecycle decisions. */
export type SessionManagerConfig = {
  /** Cap on the number of non-terminal sessions (full + partial). 0 disables. */
  maxPendingJobs: number;
  /** Interval at which the internal periodic tick fires `reconcile({ kind: 'tick' })`. */
  tickIntervalMs: number;
  /** Forwarded to every session: delay before top-tree proving, letting late reorgs settle. */
  finalizationDelayMs: number | undefined;
};

export type SessionManagerDeps = {
  checkpointStore: CheckpointStore;
  l2BlockSource: Pick<
    L2BlockSource,
    'isEpochComplete' | 'getCheckpoints' | 'getL1Constants' | 'getBlockNumber' | 'getBlockData'
  >;
  proverFactory: EpochProverFactory;
  proverId: EthAddress;
  publishingService: ProofPublishingService;
  metrics: ProverNodeJobMetrics;
  dateProvider: DateProvider;
  config: SessionManagerConfig;
  /**
   * Optional callback fired when a session terminates with `failed`. The session manager
   * doesn't own the failure-upload action; it just notifies the owner.
   */
  onSessionFailed?: (session: EpochSession) => Promise<void>;
  bindings?: LoggerBindings;
};

/**
 * Owns the lifecycle of every `EpochSession`. Each L2BlockStream event and periodic tick
 * arrives via a dedicated entry point (`onCheckpointAdded`, `onPrune`, `onTick`, etc.) which
 * schedules a `reconcile(trigger)` on a serial queue. Reconcile walks both session
 * maps, cancels any session whose canonical content has shifted, re-creates it with
 * the same spec but new content, and opens fresh full sessions for any epoch implicated
 * by the trigger.
 */
export class SessionManager {
  private readonly log: Logger;
  private readonly fullSessions: Map<EpochNumber, EpochSession> = new Map();
  private readonly partialSessions: Map<string, EpochSession> = new Map();
  /**
   * Serialises every reconcile call. The trigger sources (L2BlockStream events, the
   * periodic tick, JSON-RPC `startProof`) run independently, so without this queue two
   * reconciles could interleave on the `await session.cancel(...)` step and orphan a
   * freshly-constructed session.
   */
  private readonly reconcileQueue = new SerialQueue();
  /** Cached L1 constants, populated on first read. */
  private cachedL1Constants: L1RollupConstants | undefined;
  /**
   * Highest epoch for which the periodic tick has successfully created a full session.
   * Monotonic high-water mark: once the tick observes a session for epoch X, it stops
   * trying to open one — even if that session subsequently fails (only a new checkpoint
   * event reopens it). Crucially, the mark only advances when a session actually exists
   * post-open, so transient blockers (atMaxSessionLimit, archiver still indexing) leave
   * the mark in place and the next tick retries.
   */
  private lastTickEpoch: EpochNumber | undefined;
  /** Test-only hooks applied to every session this manager constructs. */
  private sessionHooks: EpochSessionHooks | undefined;
  /** Periodic tick that nudges reconcile to pick up newly-complete epochs. Started by `start()`. */
  private epochTicker: RunningPromise | undefined;

  constructor(private readonly deps: SessionManagerDeps) {
    this.log = createLogger('prover-node:session-manager', deps.bindings);
    this.reconcileQueue.start();
  }

  /**
   * Starts the periodic tick. Separated from the constructor so tests can drive `onTick()`
   * manually without the background ticker interleaving. Idempotent.
   */
  public start(): void {
    if (this.epochTicker) {
      return;
    }
    this.epochTicker = new RunningPromise(() => this.onTick(), this.log, this.deps.config.tickIntervalMs);
    this.epochTicker.start();
  }

  /**
   * Installs hooks applied to every session constructed from now on. Used by the e2e
   * harness to interpose around top-tree proving (gate it, override it, observe it)
   * without monkey-patching the orchestrator factory.
   */
  public setSessionHooks(hooks: EpochSessionHooks): void {
    this.sessionHooks = hooks;
  }

  // ---------------- read-only views ----------------

  /** Every live (non-terminal) session. */
  public allSessions(): EpochSession[] {
    return [...this.fullSessions.values(), ...this.partialSessions.values()];
  }

  /** Returns the full session for `epoch`, if any. */
  public getFullSession(epoch: EpochNumber): EpochSession | undefined {
    return this.fullSessions.get(epoch);
  }

  /** Returns the partial session for `spec`, if any. */
  public getPartialSession(spec: SessionSpec): EpochSession | undefined {
    return this.partialSessions.get(specKey(spec));
  }

  /** Observability summary used by the prover-node API. */
  public getJobs(): { uuid: string; status: EpochProvingJobState; epochNumber: EpochNumber }[] {
    return this.allSessions().map(s => ({
      uuid: s.getId(),
      status: s.getState(),
      epochNumber: s.getEpochNumber(),
    }));
  }

  // ---------------- event entry points ----------------

  /** Called by ProverNode after a chain-checkpointed event has been added to the store. */
  public onCheckpointAdded(epoch: EpochNumber): Promise<void> {
    return this.scheduleReconcile({ kind: 'checkpoint', epoch });
  }

  /** Called by ProverNode after a chain-pruned event has flipped store provers to pruned. */
  public onPrune(affectedEpochs: EpochNumber[]): Promise<void> {
    return this.scheduleReconcile({ kind: 'prune', affectedEpochs });
  }

  /**
   * Called periodically by ProverNode's ticker. Picks up epochs that have become complete
   * by time without a fresh checkpoint event (e.g. the epoch's last slots are empty), and
   * advances to the next epoch once the previous one is proven on L1.
   */
  public onTick(): Promise<void> {
    return this.scheduleReconcile({ kind: 'tick' });
  }

  // ---------------- public API ----------------

  /**
   * Schedules a proof attempt for the supplied epoch and returns the job id without waiting for
   * the proof to complete — proving can far outlast an HTTP request, so callers poll `getJobs()`
   * for the outcome. Every session — full or partial — begins at the epoch's first slot; the
   * partial's spec stops at the last canonical slot, while the full's stops at the epoch's last
   * slot. Dedupes against any existing session covering the same range, returning its id.
   */
  public async startProof(epoch: EpochNumber): Promise<string> {
    const canonical = await this.deps.checkpointStore.listForEpoch(epoch);
    if (canonical.length === 0) {
      throw new EmptyEpochError(epoch);
    }
    // Don't re-prove an epoch the L1 proven chain already encompasses — it was already proven
    // (possibly by another prover node), so a fresh proof would be wasted work.
    if (await this.isProvenChainEncompassing(canonical)) {
      throw new EpochAlreadyProvenError(epoch);
    }
    const l1Constants = await this.getL1Constants();
    const [fromSlot] = getSlotRangeForEpoch(epoch, l1Constants);
    const toSlot = canonical[canonical.length - 1].slotNumber;
    const spec: SessionSpec = { kind: 'partial', epochNumber: epoch, fromSlot, toSlot };

    // Reuse a session already covering this exact range rather than scheduling a duplicate.
    const existingFull = this.getFullSession(epoch);
    if (
      existingFull &&
      !existingFull.isTerminal() &&
      existingFull.getSpec().fromSlot === fromSlot &&
      existingFull.getSpec().toSlot === toSlot
    ) {
      return existingFull.getId();
    }
    const existingPartial = this.getPartialSession(spec);
    if (existingPartial && !existingPartial.isTerminal()) {
      return existingPartial.getId();
    }

    await this.scheduleReconcile({ kind: 'start-proof', spec });
    const created = this.getPartialSession(spec);
    if (!created) {
      throw new Error(`Failed to schedule partial proof for epoch ${epoch}`);
    }
    return created.getId();
  }

  /** Stops the tick, drains the reconcile queue, and cancels every live session. */
  public async stop(): Promise<void> {
    await this.epochTicker?.stop();
    await this.reconcileQueue.cancel();
    const sessions = this.allSessions();
    await Promise.allSettled(sessions.map(s => s.cancel('prover-node stopping')));
  }

  // ---------------- reconcile ----------------

  private scheduleReconcile(trigger: ReconcileTrigger): Promise<void> {
    return this.reconcileQueue.put(() => this.reconcile(trigger));
  }

  private async reconcile(trigger: ReconcileTrigger): Promise<void> {
    this.log.debug(`Reconciling`, { trigger });

    this.recreateInvalidSessions();

    const implicatedEpochs = await this.epochsForTrigger(trigger);
    for (const epoch of implicatedEpochs) {
      await this.openFullSessionIfReady(epoch);
    }

    // Advance the tick high-water mark only once a session actually exists for the epoch.
    // `openFullSessionIfReady` can early-return without creating one (atMaxSessionLimit,
    // archiver still indexing, etc.); in those cases we want the next tick to try again
    // rather than skip the epoch forever.
    if (trigger.kind === 'tick' && implicatedEpochs.length === 1) {
      const epoch = implicatedEpochs[0];
      if (this.fullSessions.has(epoch)) {
        this.lastTickEpoch = epoch;
      }
    }

    if (trigger.kind === 'start-proof') {
      this.openPartialSession(trigger.spec);
    }
  }

  private recreateInvalidSessions(): void {
    for (const [key, session] of Array.from(this.fullSessions.entries())) {
      if (session.isTerminal()) {
        this.fullSessions.delete(key);
        continue;
      }
      const canonical = this.checkpointsForSpec(session.getSpec());
      if (!this.checkpointsMatch(session.getCheckpoints(), canonical)) {
        this.fireAndForgetCancel(session, 'canonical content changed');
        this.fullSessions.delete(key);
        if (canonical.length > 0) {
          const newSession = this.constructSession(session.getSpec(), canonical);
          this.fullSessions.set(key, newSession);
          void this.runSession(newSession);
        }
      }
    }
    for (const [key, session] of Array.from(this.partialSessions.entries())) {
      if (session.isTerminal()) {
        this.partialSessions.delete(key);
        continue;
      }
      const canonical = this.checkpointsForSpec(session.getSpec());
      if (!this.checkpointsMatch(session.getCheckpoints(), canonical)) {
        this.fireAndForgetCancel(session, 'canonical content changed');
        this.partialSessions.delete(key);
        if (canonical.length > 0) {
          const newSession = this.constructSession(session.getSpec(), canonical);
          this.partialSessions.set(key, newSession);
          void this.runSession(newSession);
        }
      }
    }
  }

  private async openFullSessionIfReady(epoch: EpochNumber): Promise<void> {
    // `recreateInvalidSessions` runs at the top of every reconcile and deletes terminal sessions
    // before this is called, so a session present here is live and already covers the epoch.
    if (this.fullSessions.has(epoch)) {
      return;
    }
    if (this.atMaxSessionLimit()) {
      this.log.debug(`Skipping full-session open for epoch ${epoch}: max pending jobs reached`);
      return;
    }
    if (!(await this.deps.l2BlockSource.isEpochComplete(epoch))) {
      return;
    }
    const l1Constants = await this.getL1Constants();
    const archiverCps = await this.deps.l2BlockSource.getCheckpoints({ epoch });
    if (archiverCps.length === 0) {
      return;
    }
    const [fromSlot, toSlot] = getSlotRangeForEpoch(epoch, l1Constants);
    const canonical = this.deps.checkpointStore.listInSlotRange(fromSlot, toSlot);
    if (!this.archiverFullyCovered(archiverCps, canonical)) {
      this.log.debug(`Skipping full-session open for epoch ${epoch}: archiver checkpoints not all in store`, {
        archiverCount: archiverCps.length,
        storeCount: canonical.length,
      });
      return;
    }
    const spec: SessionSpec = { kind: 'full', epochNumber: epoch, fromSlot, toSlot };
    const session = this.constructSession(spec, canonical);
    this.fullSessions.set(epoch, session);
    void this.runSession(session);
  }

  private openPartialSession(spec: SessionSpec): void {
    const canonical = this.deps.checkpointStore.listInSlotRange(spec.fromSlot, spec.toSlot);
    if (canonical.length === 0) {
      return;
    }
    // Reuse a live partial session for this epoch whose checkpoint set already matches the
    // canonical content — e.g. a repeated `startProof` with no new checkpoints mined since the
    // last one. Reconstructing would re-prove identical content and burn a pending-job slot.
    const existing = Array.from(this.partialSessions.values()).find(
      s =>
        s.getSpec().epochNumber === spec.epochNumber &&
        !s.isTerminal() &&
        this.checkpointsMatch(s.getCheckpoints(), canonical),
    );
    if (existing) {
      return;
    }
    if (this.atMaxSessionLimit()) {
      throw new Error(`Maximum pending proving jobs ${this.deps.config.maxPendingJobs} reached.`);
    }
    const session = this.constructSession(spec, canonical);
    this.partialSessions.set(specKey(spec), session);
    void this.runSession(session);
  }

  // ---------------- session construction ----------------

  protected constructSession(spec: SessionSpec, checkpoints: readonly CheckpointProver[]): EpochSession {
    return this.doConstructSession(spec, checkpoints, this.buildSessionDeps(spec.epochNumber), this.sessionHooks);
  }

  /** Extracted for test override. */
  protected doConstructSession(
    spec: SessionSpec,
    checkpoints: readonly CheckpointProver[],
    sessionDeps: EpochSessionDeps,
    hooks?: EpochSessionHooks,
  ): EpochSession {
    return new EpochSession(spec, checkpoints, { ...sessionDeps, hooks });
  }

  private buildSessionDeps(epochNumber: EpochNumber): EpochSessionDeps {
    const config: EpochSessionOptions = {
      finalizationDelayMs: this.deps.config.finalizationDelayMs,
    };
    return {
      proverFactory: this.deps.proverFactory,
      proverId: this.deps.proverId,
      publishingService: this.deps.publishingService,
      metrics: this.deps.metrics,
      dateProvider: this.deps.dateProvider,
      deadline: this.computeDeadline(epochNumber),
      config,
      bindings: this.deps.bindings,
    };
  }

  private computeDeadline(epochNumber: EpochNumber): Date | undefined {
    if (!this.cachedL1Constants) {
      return undefined;
    }
    const ts = getProofSubmissionDeadlineTimestamp(epochNumber, this.cachedL1Constants);
    return new Date(Number(ts) * 1000);
  }

  private async runSession(session: EpochSession): Promise<void> {
    // A reconcile may have cancelled this session before it starts (content-change
    // recreation). Don't proceed — start() would build a TopTreeJob that should never run.
    if (session.isTerminal()) {
      this.log.debug(`Skipping start for ${session.getId()}: already terminal (${session.getState()})`);
      return;
    }
    const state = await session.start();
    this.log.info(`Session ${session.getId()} exited with state ${state}`);
    if (state === 'failed' && this.deps.onSessionFailed) {
      // Best-effort suppression of the spurious post-mortem upload a prune produces: if the session's
      // checkpoints no longer match the store's current set, the failure was caused by the content
      // changing under it, not a genuine proving fault, so skip the upload. This is inherently racy —
      // the store lags the world-state unwind, so a fault observed before the prune is reconciled here
      // still uploads. The epoch is recovered regardless by recreating the session on re-add.
      if (!this.checkpointsMatch(session.getCheckpoints(), this.checkpointsForSpec(session.getSpec()))) {
        this.log.info(`Skipping failure upload for session ${session.getId()}: canonical content changed`, {
          ...session.getSpec(),
        });
        return;
      }
      try {
        await this.deps.onSessionFailed(session);
      } catch (err) {
        this.log.error(`Error in onSessionFailed callback for ${session.getSpec().epochNumber}`, err);
      }
    }
  }

  /**
   * Builds the EpochProvingJobData snapshot for failure upload. Includes every checkpoint
   * referenced by the session, regardless of whether sub-tree proving completed —
   * partial state is still useful for post-mortem analysis.
   */
  public static buildSessionProvingData(session: EpochSession): EpochProvingJobData {
    const checkpoints = session.getCheckpoints();
    const txs = new Map();
    const l1ToL2Messages: Record<number, Fr[]> = {};
    for (const c of checkpoints) {
      for (const [hash, tx] of c.txs) {
        txs.set(hash, tx);
      }
      l1ToL2Messages[c.checkpoint.number] = c.l1ToL2Messages;
    }
    return {
      epochNumber: session.getSpec().epochNumber,
      checkpoints: checkpoints.map(c => c.checkpoint),
      txs,
      l1ToL2Messages,
      previousBlockHeader: checkpoints[0].previousBlockHeader,
      attestations: [],
    };
  }

  // ---------------- reconcile helpers ----------------

  private atMaxSessionLimit(): boolean {
    const { maxPendingJobs: max } = this.deps.config;
    if (!max || max <= 0) {
      return false;
    }
    const live = this.allSessions().filter(s => !s.isTerminal()).length;
    return live >= max;
  }

  /**
   * Maps a reconcile trigger to the epochs whose full session should be (re)opened.
   *
   * This is where the "don't retry a genuinely-failed epoch, but do recover a pruned one" invariant
   * lives — enforced by which triggers are gated by `lastTickEpoch`:
   *
   * - The periodic `tick` IS gated: once a tick has opened a session for an epoch, `lastTickEpoch`
   *   advances to it and later ticks skip it (`epoch <= lastTickEpoch`). So a failed attempt is never
   *   resubmitted on a loop by the tick.
   * - `checkpoint` and `prune` are deliberately NOT gated. They only fire when the epoch's canonical
   *   content actually changes — a checkpoint arrives, or a reorg prunes/replaces one — which is
   *   exactly when re-attempting is correct.
   *
   * A genuine proving failure produces no content change, hence no checkpoint/prune event, so only
   * the gated tick could reopen it — and it won't. A prune + re-add fires ungated events, so the
   * epoch is reopened through this path (and `openFullSessionIfReady` rebuilds over the fresh
   * provers). See the "onTick does not retry ... but recovers ... re-added" test.
   */
  private async epochsForTrigger(trigger: ReconcileTrigger): Promise<EpochNumber[]> {
    switch (trigger.kind) {
      case 'checkpoint':
        return [trigger.epoch];
      case 'prune':
        return trigger.affectedEpochs;
      case 'tick': {
        const epoch = await this.nextUnprovenEpoch();
        if (epoch === undefined || (this.lastTickEpoch !== undefined && epoch <= this.lastTickEpoch)) {
          return [];
        }
        return [epoch];
      }
      case 'start-proof':
        return [];
    }
  }

  /**
   * The next epoch to prove: the epoch containing the first block after the proven tip.
   * Returns undefined when that block has not been mined yet (e.g. nothing new to prove).
   * Subsequent ticks advance only once the chain's proven height moves forward, so epochs
   * are proven in order rather than all at once.
   */
  private async nextUnprovenEpoch(): Promise<EpochNumber | undefined> {
    const lastProven = (await this.deps.l2BlockSource.getBlockNumber({ tag: 'proven' })) ?? BlockNumber.ZERO;
    const firstToProve = BlockNumber(lastProven + 1);
    const header = (await this.deps.l2BlockSource.getBlockData({ number: firstToProve }))?.header;
    if (!header) {
      return undefined;
    }
    return getEpochAtSlot(header.getSlot(), await this.getL1Constants());
  }

  private checkpointsForSpec(spec: SessionSpec): CheckpointProver[] {
    return this.deps.checkpointStore.listInSlotRange(spec.fromSlot, spec.toSlot);
  }

  private fireAndForgetCancel(session: EpochSession, reason: string): void {
    void session.cancel(reason).catch(err => this.log.warn(`Error cancelling session ${session.getId()}`, err));
  }

  private checkpointsMatch(a: readonly CheckpointProver[], b: readonly CheckpointProver[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i].id !== b[i].id || a[i].isCancelled()) {
        return false;
      }
    }
    return true;
  }

  private archiverFullyCovered(
    archiverCps: readonly PublishedCheckpoint[],
    storeCps: readonly CheckpointProver[],
  ): boolean {
    if (storeCps.length < archiverCps.length) {
      return false;
    }
    // Compare by content-addressed id (number, slot, archive root) rather than checkpoint number:
    // a reorg can keep the number while changing the checkpoint's post-state archive root.
    const storeIds = new Set(storeCps.map(p => p.id));
    return archiverCps.every(cp => storeIds.has(CheckpointProver.idFor(cp.checkpoint)));
  }

  /**
   * Returns true if the L1 proven tip already covers every canonical checkpoint in the set — i.e.
   * the epoch has already been fully proven, so there is no point starting a new proof for it.
   * Conservatively returns false when nothing is proven yet.
   */
  private async isProvenChainEncompassing(canonical: readonly CheckpointProver[]): Promise<boolean> {
    const provenBlock = await this.deps.l2BlockSource.getBlockNumber({ tag: 'proven' });
    if (!provenBlock || provenBlock <= 0) {
      return false;
    }
    const lastCheckpoint = canonical[canonical.length - 1].checkpoint;
    const lastBlock = lastCheckpoint.blocks[lastCheckpoint.blocks.length - 1].number;
    return provenBlock >= lastBlock;
  }

  private async getL1Constants(): Promise<L1RollupConstants> {
    if (!this.cachedL1Constants) {
      this.cachedL1Constants = await this.deps.l2BlockSource.getL1Constants();
    }
    return this.cachedL1Constants;
  }
}

class EmptyEpochError extends Error {
  constructor(epochNumber: EpochNumber) {
    super(`No blocks found for epoch ${epochNumber}`);
    this.name = 'EmptyEpochError';
  }
}

class EpochAlreadyProvenError extends Error {
  constructor(epochNumber: EpochNumber) {
    super(`Epoch ${epochNumber} is already proven on L1`);
    this.name = 'EpochAlreadyProvenError';
  }
}
