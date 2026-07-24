import type { FeeHeader, RollupFeeRead, RollupFeeReadResult } from '@aztec/ethereum/contracts';
import type { L1SyncSnapshot, L1SyncSnapshotProvider } from '@aztec/ethereum/l1-types';
import { CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, RunningPromise, promiseWithResolvers } from '@aztec/foundation/promise';
import type { DateProvider } from '@aztec/foundation/timer';
import {
  type L1RollupConstants,
  getSlotAtNextL1Block,
  getSlotAtTimestamp,
  getTimestampForSlot,
} from '@aztec/stdlib/epoch-helpers';
import { FEE_ORACLE_LAG, GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';

import { buildFeeOracleState, computePredictions } from './fee_prediction.js';
import {
  type FeeQuoteCandidate,
  type FeeSnapshot,
  FeeSnapshotComputationStaleError,
  FeeSnapshotConfigError,
  FeeSnapshotCoverageError,
  FeeSnapshotError,
  FeeSnapshotFutureHeadError,
  FeeSnapshotL1HeadStaleError,
  type FeeSnapshotServiceConfig,
  FeeSnapshotStoppedError,
  FeeSnapshotUnavailableError,
} from './fee_snapshot.js';

/** The subset of {@link RollupContract} the fee snapshot service depends on: a batched pinned fee reader. */
export interface RollupFeeReader {
  readFeeInputs(
    reads: RollupFeeRead[],
    options: { blockNumber: bigint; allowMulticall?: boolean },
  ): Promise<RollupFeeReadResult[]>;
}

/** Cause of a refresh, recorded on metrics/logs for observability. */
type RefreshCause = 'poll-identity' | 'poll-coverage' | 'rpc-identity-mismatch' | 'coverage-miss' | 'rpc-first';

/** Counters exposed for benchmarking and observability. */
export type FeeSnapshotStats = {
  /** Total successful background/first refreshes that published a snapshot. */
  refreshes: number;
  /** Total refresh failures (kept last-good, retried with backoff). */
  refreshFailures: number;
  /** Reads that had to trigger a refresh because the warm snapshot did not serve them (identity or coverage). */
  readTriggeredRefreshes: number;
  /** Wave-2 tips-mismatch discards. */
  tipsMismatchDiscards: number;
  /** Targeted top-up waves fired during refresh. */
  topUpWaves: number;
};

const MAX_LOOKUP_ATTEMPTS = 4;
const MAX_REFRESH_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 250;
const BACKOFF_MAX_MS = 8_000;

class TimeoutError extends Error {}

/**
 * Serves current and predicted fee quotes from an in-memory snapshot refreshed in the background per L1 block,
 * so warm RPC calls issue zero L1 requests. Reads are served from a complete, immutable, atomically-swapped
 * {@link FeeSnapshot}; the refresh pins every read to the archiver's L1 block, labels it with the block hash,
 * and re-validates the archiver identity before publishing.
 */
export class FeeSnapshotService {
  private snapshot: FeeSnapshot | undefined;
  private firstSnapshot: PromiseWithResolvers<FeeSnapshot> = promiseWithResolvers<FeeSnapshot>();
  private firstResolved = false;

  private readonly runningPromise: RunningPromise;
  private stopped = false;
  private readonly stopSignal: PromiseWithResolvers<never> = promiseWithResolvers<never>();

  private inFlight: { key: string; promise: Promise<FeeSnapshot> } | undefined;
  private consecutiveFailures = 0;
  private nextRetryAtMs = 0;

  private readonly constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>;
  private readonly stats: FeeSnapshotStats = {
    refreshes: 0,
    refreshFailures: 0,
    readTriggeredRefreshes: 0,
    tipsMismatchDiscards: 0,
    topUpWaves: 0,
  };

  constructor(
    private readonly rollup: RollupFeeReader,
    private readonly identityProvider: L1SyncSnapshotProvider,
    private readonly dateProvider: DateProvider,
    private readonly config: FeeSnapshotServiceConfig,
    private readonly log: Logger = createLogger('sequencer:fee-snapshot'),
  ) {
    this.validateConfig();
    this.constants = {
      l1GenesisTime: config.l1GenesisTime,
      slotDuration: config.slotDuration,
      ethereumSlotDuration: config.ethereumSlotDuration,
    };
    this.runningPromise = new RunningPromise(() => this.tick(), this.log, config.pollIntervalMs);
    // Keep the stop signal and the first-snapshot promise from surfacing as unhandled rejections when nothing
    // is awaiting them (e.g. stop() rejects the first-snapshot promise before any read parked on it).
    this.stopSignal.promise.catch(() => {});
    this.firstSnapshot.promise.catch(() => {});
  }

  /** Rejects a configuration whose drift window would enumerate more candidates than the cap allows. */
  private validateConfig(): void {
    const { clockDriftAllowanceSeconds, slotDuration, maxClockCandidates } = this.config;
    // Distinct slots enumerated across a `2 * drift` interval is at most `ceil(2*drift/slotDuration) + 1`.
    const maxCandidates = Math.ceil((2 * clockDriftAllowanceSeconds) / slotDuration) + 1;
    if (maxCandidates > maxClockCandidates) {
      throw new FeeSnapshotConfigError(
        `clockDriftAllowanceSeconds ${clockDriftAllowanceSeconds} with slotDuration ${slotDuration} enumerates up to ` +
          `${maxCandidates} candidates, exceeding maxClockCandidates ${maxClockCandidates}`,
      );
    }
  }

  /** Starts the background refresh loop. */
  public start(): void {
    if (this.stopped) {
      throw new FeeSnapshotStoppedError('Cannot start a stopped fee snapshot service');
    }
    this.runningPromise.start();
    this.log.verbose('Fee snapshot service started', { pollIntervalMs: this.config.pollIntervalMs });
  }

  /** Stops the loop, awaits in-flight work, and rejects all pending waiters and the first-snapshot promise. */
  public async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.stopSignal.reject(new FeeSnapshotStoppedError());
    await this.runningPromise.stop();
    await this.inFlight?.promise.catch(() => undefined);
    if (!this.firstResolved) {
      this.firstSnapshot.reject(new FeeSnapshotStoppedError());
    }
    this.log.verbose('Fee snapshot service stopped');
  }

  /** Returns a snapshot of the service counters. */
  public getStats(): FeeSnapshotStats {
    return { ...this.stats };
  }

  /** Returns the currently published snapshot, if any. Exposed for testing. */
  public getSnapshot(): FeeSnapshot | undefined {
    return this.snapshot;
  }

  /** Returns the current minimum fees for inclusion in the next block. */
  public async getCurrentMinFees(): Promise<GasFees> {
    const { snapshot, currentSlots } = await this.resolveLookup();
    return maxGasFees(currentSlots.map(s => this.candidate(snapshot, s).currentMinFee));
  }

  /** Returns current min fees first, followed by predicted min fees for each slot in the prediction window. */
  public async getPredictedMinFees(manaUsage: ManaUsageEstimate): Promise<GasFees[]> {
    const { snapshot, currentSlots, predictionSlots } = await this.resolveLookup();
    const current = maxGasFees(currentSlots.map(s => this.candidate(snapshot, s).currentMinFee));
    const predictionArrays = predictionSlots.map(s => this.candidate(snapshot, s).predictions[manaUsage]);
    return [current, ...maxGasFeesElementWise(predictionArrays)];
  }

  // ---------------------------------------------------------------------------------------------------------
  // Read path (in-memory only; issues no L1 requests unless a refresh is required)
  // ---------------------------------------------------------------------------------------------------------

  private async resolveLookup(): Promise<{ snapshot: FeeSnapshot; currentSlots: number[]; predictionSlots: number[] }> {
    const deadline = this.dateProvider.now() + this.config.refreshTimeoutMs;

    if (this.snapshot === undefined) {
      await this.awaitFirstSnapshot(deadline);
    }

    for (let attempt = 0; attempt < MAX_LOOKUP_ATTEMPTS; attempt++) {
      if (this.stopped) {
        throw new FeeSnapshotStoppedError();
      }
      const snapshot = this.snapshot!;
      const nowMs = this.dateProvider.now();
      const nowSeconds = BigInt(this.dateProvider.nowInSeconds());
      this.assertFresh(snapshot, nowMs, nowSeconds);

      // Identity check: serve freshness parity with today's per-call latest-block check, at zero L1 cost.
      const identity = this.identityProvider.getL1SyncSnapshot();
      if (identity && !identity.blockHash.equals(snapshot.l1.blockHash)) {
        await this.readTriggeredRefresh(deadline, 'rpc-identity-mismatch');
        continue;
      }

      const { currentSlots, predictionSlots } = this.computeWantedSlots(snapshot, nowSeconds);
      const uncovered = [...currentSlots, ...predictionSlots].some(s => !snapshot.candidates.has(s));
      if (uncovered) {
        await this.readTriggeredRefresh(deadline, 'coverage-miss');
        continue;
      }

      return { snapshot, currentSlots, predictionSlots };
    }

    throw new FeeSnapshotCoverageError(
      `Fee snapshot did not cover the wanted slots within ${this.config.refreshTimeoutMs}ms`,
    );
  }

  private candidate(snapshot: FeeSnapshot, slot: number): FeeQuoteCandidate {
    const candidate = snapshot.candidates.get(slot);
    if (!candidate) {
      // Coverage is validated before we get here; a miss is a programming error, never a substituted answer.
      throw new FeeSnapshotCoverageError(`Fee snapshot has no candidate for slot ${slot}`);
    }
    return candidate;
  }

  /** Enumerates the current-rule and prediction-rule wanted slots across the drift window (inclusive). */
  private computeWantedSlots(
    snapshot: FeeSnapshot,
    nowSeconds: bigint,
  ): { currentSlots: number[]; predictionSlots: number[] } {
    const drift = BigInt(this.config.clockDriftAllowanceSeconds);
    const tLow = nowSeconds - drift;
    const tHigh = nowSeconds + drift;
    const currentSlots = this.enumerate(
      this.wantedCurrent(snapshot.pendingCheckpointSlot, tLow),
      this.wantedCurrent(snapshot.pendingCheckpointSlot, tHigh),
    );
    const predictionSlots = this.enumerate(
      this.wantedPrediction(snapshot.pinnedSlot, tLow),
      this.wantedPrediction(snapshot.pinnedSlot, tHigh),
    );
    return { currentSlots, predictionSlots };
  }

  private wantedCurrent(pendingCheckpointSlot: SlotNumber, t: bigint): number {
    return Math.max(pendingCheckpointSlot + 1, getSlotAtNextL1Block(t, this.constants));
  }

  private wantedPrediction(pinnedSlot: SlotNumber, t: bigint): number {
    return Math.max(pinnedSlot, getSlotAtNextL1Block(t, this.constants));
  }

  private enumerate(low: number, high: number): number[] {
    const result: number[] = [];
    for (let s = Math.min(low, high); s <= Math.max(low, high); s++) {
      result.push(s);
      if (result.length > this.config.maxClockCandidates) {
        throw new FeeSnapshotConfigError(
          `Drift window enumerated more than maxClockCandidates ${this.config.maxClockCandidates} slots`,
        );
      }
    }
    return result;
  }

  /** Three independent staleness checks, each failing closed with its own typed error. */
  private assertFresh(snapshot: FeeSnapshot, nowMs: number, nowSeconds: bigint): void {
    const { maxRefreshAgeMs, maxL1HeadAgeSeconds, futureHeadAllowanceSeconds } = this.config;

    if (maxRefreshAgeMs > 0) {
      const ageMs = nowMs - snapshot.refreshedAtMs;
      if (ageMs > maxRefreshAgeMs) {
        throw new FeeSnapshotComputationStaleError(ageMs, maxRefreshAgeMs);
      }
    }

    if (maxL1HeadAgeSeconds > 0) {
      const ageSeconds = Number(nowSeconds - snapshot.l1.blockTimestamp);
      if (ageSeconds > maxL1HeadAgeSeconds) {
        throw new FeeSnapshotL1HeadStaleError(ageSeconds, maxL1HeadAgeSeconds);
      }
    }

    if (futureHeadAllowanceSeconds > 0) {
      const aheadSeconds = Number(snapshot.l1.blockTimestamp - nowSeconds);
      if (aheadSeconds > futureHeadAllowanceSeconds) {
        throw new FeeSnapshotFutureHeadError(aheadSeconds, futureHeadAllowanceSeconds);
      }
    }
  }

  private async awaitFirstSnapshot(deadline: number): Promise<FeeSnapshot> {
    const identity = this.identityProvider.getL1SyncSnapshot();
    if (identity) {
      // Kick a refresh so the first snapshot does not wait for the next poll tick.
      void this.triggerRefresh('rpc-first').catch(() => undefined);
    }
    const remaining = deadline - this.dateProvider.now();
    try {
      return await this.race(this.firstSnapshot.promise, remaining);
    } catch (err) {
      if (this.stopped || err instanceof FeeSnapshotStoppedError) {
        throw new FeeSnapshotStoppedError();
      }
      if (err instanceof TimeoutError) {
        throw new FeeSnapshotUnavailableError();
      }
      throw err;
    }
  }

  private async readTriggeredRefresh(deadline: number, cause: RefreshCause): Promise<void> {
    this.stats.readTriggeredRefreshes++;
    const remaining = deadline - this.dateProvider.now();
    if (remaining <= 0) {
      throw new FeeSnapshotCoverageError(`Timed out waiting for fee snapshot refresh (${cause})`);
    }
    try {
      await this.race(this.triggerRefresh(cause), remaining);
    } catch (err) {
      if (this.stopped || err instanceof FeeSnapshotStoppedError) {
        throw new FeeSnapshotStoppedError();
      }
      if (err instanceof TimeoutError) {
        throw new FeeSnapshotCoverageError(`Timed out waiting for fee snapshot refresh (${cause})`);
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------------------------------------
  // Background poll loop and single-flight refresh
  // ---------------------------------------------------------------------------------------------------------

  private async tick(): Promise<void> {
    if (this.stopped) {
      return;
    }
    const now = this.dateProvider.now();
    if (now < this.nextRetryAtMs) {
      return;
    }
    const identity = this.identityProvider.getL1SyncSnapshot();
    if (!identity) {
      return;
    }
    const snapshot = this.snapshot;
    let cause: RefreshCause | undefined;
    if (snapshot === undefined || !identity.blockHash.equals(snapshot.l1.blockHash)) {
      cause = 'poll-identity';
    } else if (this.coverageDrifting(snapshot)) {
      cause = 'poll-coverage';
    }
    if (cause) {
      await this.triggerRefresh(cause).catch(() => undefined);
    }
  }

  /** Detects that the wanted slots are approaching or beyond the covered window, so the window must extend. */
  private coverageDrifting(snapshot: FeeSnapshot): boolean {
    const nowSeconds = BigInt(this.dateProvider.nowInSeconds());
    const { currentSlots, predictionSlots } = this.computeWantedSlots(snapshot, nowSeconds);
    const wanted = [...currentSlots, ...predictionSlots];
    if (wanted.some(s => !snapshot.candidates.has(s))) {
      return true;
    }
    const maxWanted = Math.max(...wanted);
    const minWanted = Math.min(...wanted);
    const headroomConsumed = maxWanted >= snapshot.topSlot - Math.max(0, this.config.coverageHeadroomSlots - 1);
    return headroomConsumed || minWanted < snapshot.baseSlot;
  }

  private refreshKey(identity: L1SyncSnapshot): string {
    const nowSeconds = BigInt(this.dateProvider.nowInSeconds());
    const { base, top } = this.computeProvisionalWindow(identity, nowSeconds);
    return `${identity.blockHash.toString()}:${base}:${top}`;
  }

  private triggerRefresh(cause: RefreshCause): Promise<FeeSnapshot> {
    if (this.stopped) {
      return Promise.reject(new FeeSnapshotStoppedError());
    }
    const identity = this.identityProvider.getL1SyncSnapshot();
    if (!identity) {
      return Promise.reject(new FeeSnapshotUnavailableError('No L1 identity available yet'));
    }
    const key = this.refreshKey(identity);
    if (this.inFlight && this.inFlight.key === key) {
      return this.inFlight.promise;
    }
    // Keep refreshes serial: chain after any in-flight refresh (ignoring its outcome), then run this one.
    const prior = this.inFlight?.promise.catch(() => undefined) ?? Promise.resolve();
    const promise = prior.then(() => this.runRefresh(identity, cause, 0));
    const entry = { key, promise };
    this.inFlight = entry;
    return promise.then(
      snapshot => {
        if (this.inFlight === entry) {
          this.inFlight = undefined;
        }
        return snapshot;
      },
      err => {
        if (this.inFlight === entry) {
          this.inFlight = undefined;
        }
        throw err;
      },
    );
  }

  private async runRefresh(identity: L1SyncSnapshot, cause: RefreshCause, attempt: number): Promise<FeeSnapshot> {
    if (attempt >= MAX_REFRESH_ATTEMPTS) {
      throw new FeeSnapshotRefreshError('Fee snapshot refresh exceeded max attempts (identity/tips instability)');
    }
    try {
      const snapshot = await this.buildSnapshot(identity, cause, attempt);
      this.consecutiveFailures = 0;
      this.nextRetryAtMs = 0;
      return snapshot;
    } catch (err) {
      if (err instanceof RestartRefresh) {
        return this.runRefresh(err.identity, cause, attempt + 1);
      }
      this.stats.refreshFailures++;
      this.consecutiveFailures++;
      this.nextRetryAtMs = this.dateProvider.now() + this.backoffMs();
      this.log.warn('Fee snapshot refresh failed; keeping last-good snapshot', {
        cause,
        attempt,
        consecutiveFailures: this.consecutiveFailures,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private backoffMs(): number {
    const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(this.consecutiveFailures, 10));
    return exp / 2 + Math.floor(Math.random() * (exp / 2));
  }

  private async buildSnapshot(identity: L1SyncSnapshot, cause: RefreshCause, attempt: number): Promise<FeeSnapshot> {
    const blockNumber = identity.blockNumber;
    const nowSeconds = BigInt(this.dateProvider.nowInSeconds());
    const { base, top, pinnedSlot } = this.computeProvisionalWindow(identity, nowSeconds);

    const windowSlots = rangeInclusive(base, top);
    const oracleSlots = rangeInclusive(base, top + FEE_ORACLE_LAG - 1);

    // Wave 1: globals + per-slot fee reads over the provisional window.
    const wave1Reads: RollupFeeRead[] = [
      { kind: 'tips' },
      { kind: 'manaTarget' },
      { kind: 'manaLimit' },
      { kind: 'provingCostPerManaEth' },
      ...windowSlots.map((s): RollupFeeRead => ({ kind: 'manaMinFeeAt', timestamp: this.tsForSlot(s) })),
      ...windowSlots.map((s): RollupFeeRead => ({ kind: 'canPruneAtTime', timestamp: this.tsForSlot(s) })),
      ...oracleSlots.map((s): RollupFeeRead => ({ kind: 'l1FeesAt', timestamp: this.tsForSlot(s) })),
    ];
    const wave1 = await this.rollup.readFeeInputs(wave1Reads, { blockNumber });
    const reads = new FeeReadResults(wave1);
    const tips1 = reads.tips();
    const manaTarget = reads.manaTarget();
    const manaLimit = reads.manaLimit();
    const provingCostPerManaEth = reads.provingCostPerManaEth();
    const manaMinFeeByTs = reads.manaMinFeeByTs();
    const canPruneByTs = reads.canPruneByTs();
    const l1FeesByTs = reads.l1FeesByTs();

    // Wave 2: pending + proven checkpoints and a re-read of tips for wave consistency. Checkpoint 0 is the
    // valid genesis checkpoint, so `pending`/`proven` of 0 are read normally; the proven read is skipped only
    // when it coincides with the pending one.
    const includeProven = tips1.proven !== tips1.pending;
    const wave2Reads: RollupFeeRead[] = [
      { kind: 'checkpoint', checkpointNumber: tips1.pending },
      ...(includeProven ? [{ kind: 'checkpoint' as const, checkpointNumber: tips1.proven }] : []),
      { kind: 'tips' },
    ];
    const wave2 = new FeeReadResults(await this.rollup.readFeeInputs(wave2Reads, { blockNumber }));
    const tips2 = wave2.tips();
    if (tips2.pending !== tips1.pending || tips2.proven !== tips1.proven) {
      // The two waves saw different states (fallback-transport fork mixing); discard and restart.
      this.stats.tipsMismatchDiscards++;
      this.log.debug('Fee snapshot wave-2 tips differ from wave-1; discarding refresh', { tips1, tips2 });
      throw this.restartWith(identity);
    }

    const pendingCheckpoint = wave2.checkpoint(tips1.pending);
    const provenCheckpoint = includeProven ? wave2.checkpoint(tips1.proven) : pendingCheckpoint;
    const pendingCheckpointSlot = pendingCheckpoint.slotNumber;

    const checkpoints = {
      pendingCheckpoint: { slotNumber: pendingCheckpoint.slotNumber, feeHeader: pendingCheckpoint.feeHeader },
      provenCheckpoint: { slotNumber: provenCheckpoint.slotNumber, feeHeader: provenCheckpoint.feeHeader },
    };

    // Step 4: exact coverage validation. With pendingCheckpointSlot now known, compute the exact wanted slots
    // and top up any candidate not materialized by the provisional window.
    const wantedSlots = this.exactWantedSlots(nowSeconds, pinnedSlot, pendingCheckpointSlot);
    const missingCandidateSlots = wantedSlots.filter(s => !manaMinFeeByTs.has(this.tsForSlot(s)));
    if (missingCandidateSlots.length > 0) {
      this.stats.topUpWaves++;
      const topUpReads: RollupFeeRead[] = missingCandidateSlots.flatMap((s): RollupFeeRead[] => [
        { kind: 'manaMinFeeAt', timestamp: this.tsForSlot(s) },
        { kind: 'canPruneAtTime', timestamp: this.tsForSlot(s) },
      ]);
      const topUp = new FeeReadResults(await this.rollup.readFeeInputs(topUpReads, { blockNumber }));
      topUp.mergeInto(manaMinFeeByTs, canPruneByTs, l1FeesByTs);
    }

    const candidateSlots = unique([...windowSlots, ...wantedSlots]);

    // Fetch any oracle L1 fees still missing for the resolved prediction windows.
    const neededOracleSlots = new Set<number>();
    for (const s of candidateSlots) {
      const canPrune = canPruneByTs.get(this.tsForSlot(s));
      if (canPrune === undefined) {
        throw new FeeSnapshotRefreshError(`Missing canPrune for candidate slot ${s}`);
      }
      const effectiveParentSlot = canPrune
        ? checkpoints.provenCheckpoint.slotNumber
        : checkpoints.pendingCheckpoint.slotNumber;
      const nextSlot = Math.max(effectiveParentSlot + 1, s);
      for (let i = 0; i < FEE_ORACLE_LAG; i++) {
        neededOracleSlots.add(nextSlot + i);
      }
    }
    const missingOracleSlots = [...neededOracleSlots].filter(s => !l1FeesByTs.has(this.tsForSlot(s)));
    if (missingOracleSlots.length > 0) {
      this.stats.topUpWaves++;
      const oracleReads: RollupFeeRead[] = missingOracleSlots.map(
        (s): RollupFeeRead => ({ kind: 'l1FeesAt', timestamp: this.tsForSlot(s) }),
      );
      new FeeReadResults(await this.rollup.readFeeInputs(oracleReads, { blockNumber })).mergeInto(
        manaMinFeeByTs,
        canPruneByTs,
        l1FeesByTs,
      );
    }

    // Build complete candidate entries.
    const candidates = new Map<number, FeeQuoteCandidate>();
    for (const s of candidateSlots) {
      candidates.set(
        s,
        this.buildCandidate(SlotNumber(s), {
          manaMinFeeByTs,
          canPruneByTs,
          l1FeesByTs,
          checkpoints,
          manaTarget,
          manaLimit,
          provingCostPerManaEth,
        }),
      );
    }

    // Archiver identity re-check before publish: if it changed during the reads, restart against the new one.
    const after = this.identityProvider.getL1SyncSnapshot();
    if (!after || !after.blockHash.equals(identity.blockHash)) {
      this.log.debug('Archiver identity changed during fee snapshot refresh; restarting', {
        built: identity.blockNumber,
        current: after?.blockNumber,
      });
      if (!after) {
        throw new FeeSnapshotUnavailableError('Archiver identity disappeared during refresh');
      }
      throw this.restartWith(after);
    }

    const snapshot: FeeSnapshot = {
      l1: identity,
      pendingCheckpointSlot,
      pinnedSlot,
      candidates,
      baseSlot: SlotNumber(base),
      topSlot: SlotNumber(top),
      refreshedAtMs: this.dateProvider.now(),
    };
    this.publish(snapshot, cause, attempt);
    return snapshot;
  }

  private restartWith(identity: L1SyncSnapshot): RestartRefresh {
    return new RestartRefresh(identity);
  }

  private buildCandidate(
    slot: SlotNumber,
    ctx: {
      manaMinFeeByTs: Map<bigint, bigint>;
      canPruneByTs: Map<bigint, boolean>;
      l1FeesByTs: Map<bigint, { baseFee: bigint; blobFee: bigint }>;
      checkpoints: {
        pendingCheckpoint: { slotNumber: SlotNumber; feeHeader: FeeHeader };
        provenCheckpoint: { slotNumber: SlotNumber; feeHeader: FeeHeader };
      };
      manaTarget: bigint;
      manaLimit: bigint;
      provingCostPerManaEth: bigint;
    },
  ): FeeQuoteCandidate {
    const timestamp = this.tsForSlot(slot);
    const manaMinFee = ctx.manaMinFeeByTs.get(timestamp);
    const canPrune = ctx.canPruneByTs.get(timestamp);
    if (manaMinFee === undefined || canPrune === undefined) {
      throw new FeeSnapshotRefreshError(`Missing fee reads for candidate slot ${slot}`);
    }

    const l1FeesForSlot = (s: SlotNumber) => {
      const fees = ctx.l1FeesByTs.get(this.tsForSlot(s));
      if (!fees) {
        throw new FeeSnapshotRefreshError(`Missing L1 fees for slot ${s}`);
      }
      return fees;
    };

    const predictions = {} as Record<ManaUsageEstimate, GasFees[]>;
    for (const estimate of [ManaUsageEstimate.None, ManaUsageEstimate.Target, ManaUsageEstimate.Limit]) {
      const state = buildFeeOracleState({
        anchorSlot: slot,
        canPrune,
        pendingCheckpoint: ctx.checkpoints.pendingCheckpoint,
        provenCheckpoint: ctx.checkpoints.provenCheckpoint,
        manaTarget: ctx.manaTarget,
        manaLimit: ctx.manaLimit,
        provingCostPerManaEth: ctx.provingCostPerManaEth,
        epochDuration: BigInt(this.config.epochDuration),
        l1FeesForSlot,
      });
      predictions[estimate] = computePredictions(state, estimate);
    }

    return { slot, timestamp, currentMinFee: new GasFees(0, manaMinFee), predictions };
  }

  private publish(snapshot: FeeSnapshot, cause: RefreshCause, attempt: number): void {
    const current = this.snapshot;
    if (current && current.l1.blockNumber > snapshot.l1.blockNumber) {
      // An older refresh finished after a newer one; never overwrite the newer snapshot.
      this.log.debug('Discarding stale fee snapshot refresh result', {
        built: snapshot.l1.blockNumber,
        current: current.l1.blockNumber,
      });
      return;
    }
    this.snapshot = snapshot;
    this.stats.refreshes++;
    if (!this.firstResolved) {
      this.firstResolved = true;
      this.firstSnapshot.resolve(snapshot);
    }
    this.log.debug('Published fee snapshot', {
      cause,
      attempt,
      blockNumber: snapshot.l1.blockNumber,
      baseSlot: snapshot.baseSlot,
      topSlot: snapshot.topSlot,
      pendingCheckpointSlot: snapshot.pendingCheckpointSlot,
      pinnedSlot: snapshot.pinnedSlot,
      candidateCount: snapshot.candidates.size,
    });
  }

  private computeProvisionalWindow(
    identity: L1SyncSnapshot,
    nowSeconds: bigint,
  ): { base: number; top: number; pinnedSlot: SlotNumber } {
    const drift = BigInt(this.config.clockDriftAllowanceSeconds);
    const pinnedSlot = getSlotAtTimestamp(identity.blockTimestamp, this.constants);
    const lowSlot = getSlotAtNextL1Block(nowSeconds - drift, this.constants);
    const highSlot = getSlotAtNextL1Block(nowSeconds + drift, this.constants);
    let base = Math.min(lowSlot, pinnedSlot);
    const top = Math.max(highSlot, pinnedSlot + 1) + this.config.coverageHeadroomSlots;
    if (top - base + 1 > this.config.maxCandidateWindowSlots) {
      // Host clock diverges wildly from the pinned L1 timestamp: materialize a capped window anchored at the
      // wall-clock end and rely on the exact-coverage top-up to add the pinned-slot floor candidates.
      base = Math.max(base, top - this.config.maxCandidateWindowSlots + 1);
    }
    return { base, top, pinnedSlot };
  }

  private exactWantedSlots(nowSeconds: bigint, pinnedSlot: SlotNumber, pendingCheckpointSlot: SlotNumber): number[] {
    // Enumerate every slot between the drift-window endpoints, exactly like the read path does: with a capped
    // provisional window, materializing only the endpoints would leave intermediate wanted slots uncovered and
    // reads would coverage-miss into an error no refresh can repair.
    const drift = BigInt(this.config.clockDriftAllowanceSeconds);
    const tLow = nowSeconds - drift;
    const tHigh = nowSeconds + drift;
    const current = this.enumerate(
      this.wantedCurrent(pendingCheckpointSlot, tLow),
      this.wantedCurrent(pendingCheckpointSlot, tHigh),
    );
    const prediction = this.enumerate(
      this.wantedPrediction(pinnedSlot, tLow),
      this.wantedPrediction(pinnedSlot, tHigh),
    );
    return unique([...current, ...prediction]);
  }

  private tsForSlot(slot: number): bigint {
    return getTimestampForSlot(SlotNumber(slot), this.constants);
  }

  private async race<T>(promise: Promise<T>, ms: number): Promise<T> {
    if (ms <= 0) {
      throw new TimeoutError();
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError()), ms);
    });
    try {
      return await Promise.race([promise, timeout, this.stopSignal.promise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}

/** Sentinel thrown internally to restart a refresh against a newer identity without failing the attempt. */
class RestartRefresh extends Error {
  constructor(public readonly identity: L1SyncSnapshot) {
    super('restart refresh');
    this.name = 'RestartRefresh';
  }
}

/** Internal error thrown for unexpected refresh-build failures. */
class FeeSnapshotRefreshError extends FeeSnapshotError {
  constructor(message: string) {
    super(message);
    this.name = 'FeeSnapshotRefreshError';
  }
}

/** Parses a `RollupFeeReadResult[]` into typed globals and timestamp-keyed maps. */
class FeeReadResults {
  private readonly minFee = new Map<bigint, bigint>();
  private readonly canPrune = new Map<bigint, boolean>();
  private readonly l1Fees = new Map<bigint, { baseFee: bigint; blobFee: bigint }>();
  private readonly checkpoints = new Map<number, { slotNumber: SlotNumber; feeHeader: FeeHeader }>();
  private tipsValue: { pending: CheckpointNumber; proven: CheckpointNumber } | undefined;
  private manaTargetValue: bigint | undefined;
  private manaLimitValue: bigint | undefined;
  private provingCostValue: bigint | undefined;

  constructor(results: RollupFeeReadResult[]) {
    for (const result of results) {
      switch (result.kind) {
        case 'tips':
          this.tipsValue = result.value;
          break;
        case 'manaTarget':
          this.manaTargetValue = result.value;
          break;
        case 'manaLimit':
          this.manaLimitValue = result.value;
          break;
        case 'provingCostPerManaEth':
          this.provingCostValue = result.value;
          break;
        case 'manaMinFeeAt':
          this.minFee.set(result.timestamp, result.value);
          break;
        case 'canPruneAtTime':
          this.canPrune.set(result.timestamp, result.value);
          break;
        case 'l1FeesAt':
          this.l1Fees.set(result.timestamp, result.value);
          break;
        case 'checkpoint':
          this.checkpoints.set(Number(result.checkpointNumber), {
            slotNumber: result.value.slotNumber,
            feeHeader: result.value.feeHeader,
          });
          break;
      }
    }
  }

  tips(): { pending: CheckpointNumber; proven: CheckpointNumber } {
    if (!this.tipsValue) {
      throw new FeeSnapshotRefreshError('Missing tips in fee reads');
    }
    return this.tipsValue;
  }

  manaTarget(): bigint {
    return required(this.manaTargetValue, 'manaTarget');
  }

  manaLimit(): bigint {
    return required(this.manaLimitValue, 'manaLimit');
  }

  provingCostPerManaEth(): bigint {
    return required(this.provingCostValue, 'provingCostPerManaEth');
  }

  checkpoint(checkpointNumber: CheckpointNumber): { slotNumber: SlotNumber; feeHeader: FeeHeader } {
    const value = this.checkpoints.get(Number(checkpointNumber));
    if (!value) {
      throw new FeeSnapshotRefreshError(`Missing checkpoint ${checkpointNumber} in fee reads`);
    }
    return value;
  }

  manaMinFeeByTs(): Map<bigint, bigint> {
    return this.minFee;
  }

  canPruneByTs(): Map<bigint, boolean> {
    return this.canPrune;
  }

  l1FeesByTs(): Map<bigint, { baseFee: bigint; blobFee: bigint }> {
    return this.l1Fees;
  }

  mergeInto(
    minFee: Map<bigint, bigint>,
    canPrune: Map<bigint, boolean>,
    l1Fees: Map<bigint, { baseFee: bigint; blobFee: bigint }>,
  ): void {
    for (const [k, v] of this.minFee) {
      minFee.set(k, v);
    }
    for (const [k, v] of this.canPrune) {
      canPrune.set(k, v);
    }
    for (const [k, v] of this.l1Fees) {
      l1Fees.set(k, v);
    }
  }
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new FeeSnapshotRefreshError(`Missing ${name} in fee reads`);
  }
  return value;
}

function rangeInclusive(low: number, high: number): number[] {
  const result: number[] = [];
  for (let s = low; s <= high; s++) {
    result.push(s);
  }
  return result;
}

function unique(values: number[]): number[] {
  return [...new Set(values)];
}

/** Element-wise max over a set of GasFees (per dimension). */
function maxGasFees(fees: GasFees[]): GasFees {
  return fees.reduce(
    (acc, f) =>
      new GasFees(
        acc.feePerDaGas > f.feePerDaGas ? acc.feePerDaGas : f.feePerDaGas,
        acc.feePerL2Gas > f.feePerL2Gas ? acc.feePerL2Gas : f.feePerL2Gas,
      ),
    new GasFees(0, 0),
  );
}

/** Element-wise max merge of several equal-length GasFees arrays. */
function maxGasFeesElementWise(arrays: GasFees[][]): GasFees[] {
  const length = arrays[0]?.length ?? 0;
  const result: GasFees[] = [];
  for (let i = 0; i < length; i++) {
    result.push(maxGasFees(arrays.map(a => a[i])));
  }
  return result;
}
