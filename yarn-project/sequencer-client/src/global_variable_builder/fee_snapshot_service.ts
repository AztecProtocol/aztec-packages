import type {
  CheckpointLog,
  FeeHeader,
  L1FeeData,
  RollupChainTips,
  RollupFeeGlobals,
  RollupSlotFeeInputs,
} from '@aztec/ethereum/contracts';
import type { L1SyncSnapshot, L1SyncSnapshotProvider } from '@aztec/ethereum/l1-types';
import { type CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times, unique } from '@aztec/foundation/collection';
import { TimeoutError } from '@aztec/foundation/error';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import { type DateProvider, executeTimeout } from '@aztec/foundation/timer';
import {
  type L1RollupConstants,
  getSlotAtNextL1Block,
  getSlotAtTimestamp,
  getTimestampForSlot,
} from '@aztec/stdlib/epoch-helpers';
import { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';

import { buildFeeOracleState, computePredictions, getPredictionWindowSlots } from './fee_prediction.js';

/** The subset of {@link RollupContract} the fee snapshot service depends on: one batched pinned read per stage. */
export interface RollupFeeReader {
  /** Chain tips plus the governance-settable fee parameters. */
  getFeeGlobals(options: { blockNumber: bigint }): Promise<RollupFeeGlobals>;
  /** Checkpoint logs for the given checkpoint numbers, in order. */
  getCheckpoints(checkpointNumbers: CheckpointNumber[], options: { blockNumber: bigint }): Promise<CheckpointLog[]>;
  /** Current min fee and prune-ability at each given timestamp, in order. */
  getSlotFeeInputs(timestamps: bigint[], options: { blockNumber: bigint }): Promise<RollupSlotFeeInputs[]>;
  /** L1 fee oracle values at each given timestamp plus a trailing re-read of the chain tips. */
  getL1FeesAndTips(
    timestamps: bigint[],
    options: { blockNumber: bigint },
  ): Promise<{ l1Fees: L1FeeData[]; tips: RollupChainTips }>;
}

/**
 * One complete, finished fee quote for a single candidate slot. Entries are outputs, never partially derived
 * state: both the current fee and all three prediction arrays are precomputed at refresh time so the read path
 * issues zero L1 requests.
 */
export type FeeQuoteCandidate = {
  /** The candidate L2 slot this quote is for. */
  slot: SlotNumber;
  /** Slot-start timestamp used for the pinned reads. */
  timestamp: bigint;
  /** Canonical current fee: Solidity `getManaMinFeeAt(timestamp)` at the pinned block. */
  currentMinFee: GasFees;
  /** Precomputed `FEE_ORACLE_LAG`-length prediction array per mana-usage estimate. */
  predictions: Record<ManaUsageEstimate, GasFees[]>;
};

/**
 * Immutable, atomically-swapped view of the fee model at a single pinned L1 block. Selection floors come only
 * from the snapshot-level fields; coverage is map membership, so a wanted slot is either served exactly or
 * triggers a refresh.
 */
export type FeeSnapshot = {
  /** L1 identity this snapshot was built at (block number + hash + timestamp). */
  l1: L1SyncSnapshot;
  /** Raw pending checkpoint slot at the pinned block — floor for the current-fee anchor rule. */
  pendingCheckpointSlot: SlotNumber;
  /** Slot of the pinned block timestamp (TS arithmetic) — floor for the prediction anchor rule. */
  pinnedSlot: SlotNumber;
  /** One complete entry per materialized candidate slot, keyed by the primitive slot number. */
  candidates: ReadonlyMap<number, FeeQuoteCandidate>;
};

/** Tuning and staleness configuration for the fee snapshot service. All durations use their stated units. */
export type FeeSnapshotServiceConfig = {
  slotDuration: number;
  l1GenesisTime: bigint;
  ethereumSlotDuration: number;
  epochDuration: number;
  /** Background poll interval (ms) for the refresh loop; only in-memory comparisons run per tick. */
  pollIntervalMs: number;
  /** Max age (seconds) of the pinned L1 head before reads fail closed. `0` disables. */
  maxL1HeadAgeSeconds: number;
  /** Bound (ms) a read waits for refreshes before failing closed with a typed error. */
  refreshTimeoutMs: number;
};

/** Derives the default fee snapshot service config from the L1 timing constants. */
export function getDefaultFeeSnapshotServiceConfig(base: {
  slotDuration: number;
  l1GenesisTime: bigint;
  ethereumSlotDuration: number;
  epochDuration: number;
}): FeeSnapshotServiceConfig {
  return {
    ...base,
    pollIntervalMs: 500,
    maxL1HeadAgeSeconds: 300,
    refreshTimeoutMs: 5_000,
  };
}

/** Base class for all fee snapshot errors, so callers can catch the whole family. */
export class FeeSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeeSnapshotError';
  }
}

/** No fee quote can be produced right now: no identity, no snapshot, refresh failure backoff, or stopped. */
export class FeeQuoteUnavailableError extends FeeSnapshotError {
  constructor(reason: string) {
    super(`Fee quote is unavailable: ${reason}`);
    this.name = 'FeeQuoteUnavailableError';
  }
}

/** The pinned L1 head is older than the configured bound, so quotes fail closed instead of going stale. */
export class FeeQuoteStaleError extends FeeSnapshotError {
  constructor(
    public readonly ageSeconds: number,
    public readonly maxAgeSeconds: number,
  ) {
    super(`Fee quote is stale: pinned L1 head age ${ageSeconds}s exceeds max ${maxAgeSeconds}s`);
    this.name = 'FeeQuoteStaleError';
  }
}

/** Counters exposed for benchmarking and observability. */
export type FeeSnapshotStats = {
  /** Total refreshes that published a snapshot. */
  refreshes: number;
  /** Total refresh failures (kept last-good, retried with backoff). */
  refreshFailures: number;
  /** Reads that had to trigger a refresh because the warm snapshot did not serve them (identity or coverage). */
  readTriggeredRefreshes: number;
};

/** Cause of a refresh, recorded on logs for observability. */
type RefreshCause = 'poll-identity' | 'poll-coverage' | 'read';

/**
 * Extra slots materialized above each anchor so quotes survive a run of empty Ethereum slots or a short L1
 * stall without a refresh. Two suffices only because the Aztec slot duration is a positive multiple of the
 * Ethereum slot duration, so one L1 block advances the wanted slot by at most one; together with the poll
 * tick's one-slot lookahead that leaves a full slot of margin to refresh in.
 */
const CANDIDATE_HEADROOM_SLOTS = 2;

/**
 * Attempts a read makes before giving up: one stale in-flight publication, one corrective refresh, and one
 * successful lookup. Identity churn beyond that inside a single call's deadline is reported as unavailable.
 */
const MAX_LOOKUP_ATTEMPTS = 3;

const BACKOFF_BASE_MS = 250;
const BACKOFF_MAX_MS = 8_000;

/**
 * Serves current and predicted fee quotes from an in-memory snapshot refreshed in the background per L1 block,
 * so warm RPC calls issue zero L1 requests. Reads are served from a complete, immutable, atomically-swapped
 * {@link FeeSnapshot} whose every value was read at the archiver's synced L1 block.
 */
export class FeeSnapshotService {
  private snapshot: FeeSnapshot | undefined;
  private inFlight: Promise<FeeSnapshot> | undefined;

  private readonly runningPromise: RunningPromise;
  private stopped = false;

  private consecutiveFailures = 0;
  private nextRetryAtMs = 0;

  private readonly constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>;
  private readonly stats: FeeSnapshotStats = {
    refreshes: 0,
    refreshFailures: 0,
    readTriggeredRefreshes: 0,
  };

  constructor(
    private readonly rollup: RollupFeeReader,
    private readonly identityProvider: L1SyncSnapshotProvider,
    private readonly dateProvider: DateProvider,
    private readonly config: FeeSnapshotServiceConfig,
    private readonly log: Logger = createLogger('sequencer:fee-snapshot'),
  ) {
    this.constants = {
      l1GenesisTime: config.l1GenesisTime,
      slotDuration: config.slotDuration,
      ethereumSlotDuration: config.ethereumSlotDuration,
    };
    this.runningPromise = new RunningPromise(() => this.tick(), this.log, config.pollIntervalMs);
  }

  /** Starts the background refresh loop. */
  public start(): void {
    if (this.stopped) {
      throw new FeeSnapshotError('Cannot start a stopped fee snapshot service');
    }
    this.runningPromise.start();
    this.log.verbose('Fee snapshot service started', { pollIntervalMs: this.config.pollIntervalMs });
  }

  /** Stops the loop and awaits any in-flight refresh. Parked readers resolve with it or hit their own timeout. */
  public async stop(): Promise<void> {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    await this.runningPromise.stop();
    await this.inFlight?.catch(() => undefined);
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
    const { current } = await this.resolveLookup();
    return current.currentMinFee;
  }

  /** Returns current min fees first, followed by predicted min fees for each slot in the prediction window. */
  public async getPredictedMinFees(manaUsage: ManaUsageEstimate): Promise<GasFees[]> {
    const { current, prediction } = await this.resolveLookup();
    return [current.currentMinFee, ...prediction.predictions[manaUsage]];
  }

  /**
   * Resolves the two anchor candidates for the current wall clock, refreshing when the snapshot is missing, no
   * longer matches the archiver identity, or does not cover a wanted slot. Issues no L1 request on the warm path.
   */
  private async resolveLookup(): Promise<{ current: FeeQuoteCandidate; prediction: FeeQuoteCandidate }> {
    const deadline = this.dateProvider.now() + this.config.refreshTimeoutMs;

    for (let attempt = 0; attempt < MAX_LOOKUP_ATTEMPTS; attempt++) {
      if (this.stopped) {
        throw new FeeQuoteUnavailableError('the service was stopped');
      }
      const snapshot = this.snapshot;
      if (!snapshot) {
        await this.readTriggeredRefresh(deadline);
        continue;
      }

      // Identity check before the staleness bound: a snapshot the archiver has already moved past is never
      // served, and a refresh that cannot replace it surfaces its own error rather than a stale quote. This is
      // also what preserves freshness parity with a per-call latest-block check, at zero L1 cost, and what
      // corrects a refresh that published while the identity was changing.
      const identity = this.identityProvider.getL1SyncSnapshot();
      if (identity && !identity.blockHash.equals(snapshot.l1.blockHash)) {
        await this.readTriggeredRefresh(deadline);
        continue;
      }

      const nowSeconds = BigInt(this.dateProvider.nowInSeconds());
      const current = snapshot.candidates.get(this.wantedCurrentSlot(snapshot.pendingCheckpointSlot, nowSeconds));
      const prediction = snapshot.candidates.get(this.wantedPredictionSlot(snapshot.pinnedSlot, nowSeconds));
      if (!current || !prediction) {
        await this.readTriggeredRefresh(deadline);
        continue;
      }

      this.assertHeadFresh(snapshot, nowSeconds);
      return { current, prediction };
    }

    throw new FeeQuoteUnavailableError(`no snapshot covered the wanted slots within ${this.config.refreshTimeoutMs}ms`);
  }

  /** Anchor slot of the current-fee rule: the next proposable slot, floored on the pending checkpoint. */
  private wantedCurrentSlot(pendingCheckpointSlot: SlotNumber, atSeconds: bigint): number {
    return Math.max(pendingCheckpointSlot + 1, getSlotAtNextL1Block(atSeconds, this.constants));
  }

  /** Anchor slot of the prediction rule: the next proposable slot, floored on the pinned block's slot. */
  private wantedPredictionSlot(pinnedSlot: SlotNumber, atSeconds: bigint): number {
    return Math.max(pinnedSlot, getSlotAtNextL1Block(atSeconds, this.constants));
  }

  /** Fails closed when the pinned L1 head is older than the bound, i.e. the archiver or provider is frozen. */
  private assertHeadFresh(snapshot: FeeSnapshot, nowSeconds: bigint): void {
    const { maxL1HeadAgeSeconds } = this.config;
    if (maxL1HeadAgeSeconds <= 0) {
      return;
    }
    const ageSeconds = Number(nowSeconds - snapshot.l1.blockTimestamp);
    if (ageSeconds > maxL1HeadAgeSeconds) {
      throw new FeeQuoteStaleError(ageSeconds, maxL1HeadAgeSeconds);
    }
  }

  /**
   * Awaits a refresh on behalf of a read, bounded by the remaining deadline. On timeout only the wait is
   * abandoned: the shared refresh keeps running for the poll loop and any other waiter.
   */
  private async readTriggeredRefresh(deadline: number): Promise<void> {
    this.stats.readTriggeredRefreshes++;
    const remaining = deadline - this.dateProvider.now();
    if (remaining <= 0) {
      throw new FeeQuoteUnavailableError('the read deadline elapsed before a refresh could complete');
    }
    try {
      await executeTimeout(() => this.triggerRefresh('read'), remaining, 'fee snapshot refresh');
    } catch (err) {
      if (err instanceof TimeoutError) {
        throw new FeeQuoteUnavailableError(`no refresh completed within ${remaining}ms`);
      }
      throw err;
    }
  }

  /** Refreshes when the archiver identity changed or the covered slots are about to be outrun by the clock. */
  private async tick(): Promise<void> {
    if (this.stopped || this.dateProvider.now() < this.nextRetryAtMs) {
      return;
    }
    const identity = this.identityProvider.getL1SyncSnapshot();
    if (!identity) {
      return;
    }
    const snapshot = this.snapshot;
    if (!snapshot || !identity.blockHash.equals(snapshot.l1.blockHash)) {
      await this.triggerRefresh('poll-identity').catch(() => undefined);
    } else if (!this.coversUpcomingSlots(snapshot)) {
      await this.triggerRefresh('poll-coverage').catch(() => undefined);
    }
  }

  /** True when the snapshot covers both anchors now and one slot ahead, so an L1 stall cannot freeze quotes. */
  private coversUpcomingSlots(snapshot: FeeSnapshot): boolean {
    const nowSeconds = BigInt(this.dateProvider.nowInSeconds());
    const lookahead = nowSeconds + BigInt(this.config.slotDuration);
    return [nowSeconds, lookahead].every(
      atSeconds =>
        snapshot.candidates.has(this.wantedCurrentSlot(snapshot.pendingCheckpointSlot, atSeconds)) &&
        snapshot.candidates.has(this.wantedPredictionSlot(snapshot.pinnedSlot, atSeconds)),
    );
  }

  /**
   * Single-flight refresh: concurrent callers and the poll loop share one in-flight refresh, which is cleared
   * before its waiters resume so the next caller can start a fresh one against a newer identity.
   */
  private triggerRefresh(cause: RefreshCause): Promise<FeeSnapshot> {
    if (this.stopped) {
      return Promise.reject(new FeeQuoteUnavailableError('the service was stopped'));
    }
    // Reads must not bypass the failure backoff: with a failing L1, per-request refreshes would turn incoming
    // RPC traffic directly into L1 load. Fail fast instead; the background loop retries once the backoff elapses.
    if (this.dateProvider.now() < this.nextRetryAtMs) {
      return Promise.reject(
        new FeeQuoteUnavailableError(`refreshes are backing off after ${this.consecutiveFailures} failures`),
      );
    }
    if (this.inFlight) {
      return this.inFlight;
    }
    const identity = this.identityProvider.getL1SyncSnapshot();
    if (!identity) {
      return Promise.reject(new FeeQuoteUnavailableError('the archiver has no L1 identity yet'));
    }
    const refresh: Promise<FeeSnapshot> = this.runRefresh(identity, cause).finally(() => {
      if (this.inFlight === refresh) {
        this.inFlight = undefined;
      }
    });
    this.inFlight = refresh;
    return refresh;
  }

  private async runRefresh(identity: L1SyncSnapshot, cause: RefreshCause): Promise<FeeSnapshot> {
    try {
      const snapshot = await this.buildSnapshot(identity);
      // No ordering guard on publish: refreshes are single-flight, and L1 identity is hash-authoritative, so
      // the height can legitimately move backwards (reorg, or a lagging fallback backend). A height guard
      // would discard every rebuild after a rollback and wedge reads.
      this.snapshot = snapshot;
      this.stats.refreshes++;
      this.consecutiveFailures = 0;
      this.nextRetryAtMs = 0;
      this.log.debug('Published fee snapshot', {
        cause,
        blockNumber: snapshot.l1.blockNumber,
        pendingCheckpointSlot: snapshot.pendingCheckpointSlot,
        pinnedSlot: snapshot.pinnedSlot,
        candidateSlots: [...snapshot.candidates.keys()],
      });
      return snapshot;
    } catch (err) {
      this.stats.refreshFailures++;
      this.consecutiveFailures++;
      this.nextRetryAtMs = this.dateProvider.now() + this.backoffMs();
      this.log.warn('Fee snapshot refresh failed; keeping last-good snapshot', {
        cause,
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

  /**
   * Builds a complete snapshot in four batched stages, all pinned to the identity's L1 block. Each stage's
   * inputs are fully determined by the previous ones: tips and governance values, then the checkpoints those
   * tips name, then per-candidate fee state, then the L1 fee oracle over the resulting prediction windows.
   */
  private async buildSnapshot(identity: L1SyncSnapshot): Promise<FeeSnapshot> {
    const options = { blockNumber: identity.blockNumber };

    const globals = await this.rollup.getFeeGlobals(options);
    const { tips } = globals;

    // Checkpoint 0 is the valid genesis checkpoint, so `pending`/`proven` of 0 are read normally; the proven
    // read is skipped only when it coincides with the pending one.
    const includeProven = tips.proven !== tips.pending;
    const checkpoints = await this.rollup.getCheckpoints(
      includeProven ? [tips.pending, tips.proven] : [tips.pending],
      options,
    );
    const pendingCheckpoint = checkpoints[0];
    const provenCheckpoint = includeProven ? checkpoints[1] : pendingCheckpoint;

    // Sampled here rather than at refresh entry: two round trips have already elapsed, and the candidate set
    // should be centred on the slot a read will want once this snapshot is published.
    const nowSeconds = BigInt(this.dateProvider.nowInSeconds());
    const pendingCheckpointSlot = pendingCheckpoint.slotNumber;
    const pinnedSlot = getSlotAtTimestamp(identity.blockTimestamp, this.constants);
    const candidateSlots = unique([
      ...withHeadroom(this.wantedCurrentSlot(pendingCheckpointSlot, nowSeconds)),
      ...withHeadroom(this.wantedPredictionSlot(pinnedSlot, nowSeconds)),
    ]);

    const slotInputs = await this.rollup.getSlotFeeInputs(
      candidateSlots.map(slot => this.tsForSlot(slot)),
      options,
    );
    const effectiveParents = slotInputs.map(input => (input.canPrune ? provenCheckpoint : pendingCheckpoint));

    const oracleSlots = new Set<number>();
    candidateSlots.forEach((slot, i) => {
      for (const oracleSlot of getPredictionWindowSlots(SlotNumber(slot), effectiveParents[i].slotNumber)) {
        oracleSlots.add(oracleSlot);
      }
    });
    const orderedOracleSlots = [...oracleSlots].sort((a, b) => a - b);
    const { l1Fees, tips: tailTips } = await this.rollup.getL1FeesAndTips(
      orderedOracleSlots.map(slot => this.tsForSlot(slot)),
      options,
    );
    if (tailTips.pending !== tips.pending || tailTips.proven !== tips.proven) {
      // Every stage is pinned to one block number, but a fallback transport can still serve two stages from
      // backends on different forks at that height. Failing the refresh keeps the last-good snapshot instead
      // of publishing a quote assembled from two states; the backoff schedules the retry.
      throw new FeeSnapshotError(
        `Chain tips changed across the fee refresh: pending ${tips.pending} -> ${tailTips.pending}, ` +
          `proven ${tips.proven} -> ${tailTips.proven}`,
      );
    }
    const l1FeesBySlot = new Map(orderedOracleSlots.map((slot, i) => [slot, l1Fees[i]]));

    const candidates = new Map<number, FeeQuoteCandidate>();
    candidateSlots.forEach((slot, i) => {
      candidates.set(slot, {
        slot: SlotNumber(slot),
        timestamp: this.tsForSlot(slot),
        currentMinFee: new GasFees(0, slotInputs[i].manaMinFee),
        predictions: this.computePredictionsForSlot(SlotNumber(slot), effectiveParents[i], globals, l1FeesBySlot),
      });
    });

    return { l1: identity, pendingCheckpointSlot, pinnedSlot, candidates };
  }

  /** Computes the complete prediction array for every mana-usage estimate at a single candidate slot. */
  private computePredictionsForSlot(
    anchorSlot: SlotNumber,
    effectiveParent: { slotNumber: SlotNumber; feeHeader: FeeHeader },
    globals: RollupFeeGlobals,
    l1FeesBySlot: Map<number, L1FeeData>,
  ): Record<ManaUsageEstimate, GasFees[]> {
    const state = buildFeeOracleState({
      anchorSlot,
      effectiveParent,
      manaTarget: globals.manaTarget,
      manaLimit: globals.manaLimit,
      provingCostPerManaEth: globals.provingCostPerManaEth,
      epochDuration: BigInt(this.config.epochDuration),
      l1FeesForSlot: slot => {
        const fees = l1FeesBySlot.get(slot);
        if (!fees) {
          throw new FeeSnapshotError(`Fee refresh is missing the L1 fees for slot ${slot}`);
        }
        return fees;
      },
    });
    return {
      [ManaUsageEstimate.None]: computePredictions(state, ManaUsageEstimate.None),
      [ManaUsageEstimate.Target]: computePredictions(state, ManaUsageEstimate.Target),
      [ManaUsageEstimate.Limit]: computePredictions(state, ManaUsageEstimate.Limit),
    };
  }

  private tsForSlot(slot: number): bigint {
    return getTimestampForSlot(SlotNumber(slot), this.constants);
  }
}

/** The anchor slot plus its headroom slots, in ascending order. */
function withHeadroom(anchorSlot: number): number[] {
  return times(CANDIDATE_HEADROOM_SLOTS + 1, i => anchorSlot + i);
}
