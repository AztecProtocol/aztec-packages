import type { FeeHeader, L1FeeData, RollupContract, RollupFeeGlobals } from '@aztec/ethereum/contracts';
import type { L1SyncSnapshot, L1SyncSnapshotProvider } from '@aztec/ethereum/l1-types';
import { SlotNumber } from '@aztec/foundation/branded-types';
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
import type { FeeProvider } from '@aztec/stdlib/tx';

import { buildFeeOracleState, computePredictions, getPredictionWindowSlots } from './fee_prediction.js';
import {
  CANDIDATE_HEADROOM_SLOTS,
  type FeeQuoteCandidate,
  FeeQuoteStaleError,
  FeeQuoteUnavailableError,
  type FeeSnapshot,
  FeeSnapshotError,
  type FeeSnapshotServiceConfig,
  MAX_LOOKUP_ATTEMPTS,
  type RefreshCause,
} from './fee_snapshot_types.js';

/**
 * Serves current and predicted fee quotes from an in-memory snapshot refreshed in the background per L1 block,
 * so warm RPC calls issue zero L1 requests. Reads are served from a complete, immutable, atomically-swapped
 * {@link FeeSnapshot} whose every value was read at the archiver's synced L1 block.
 */
export class FeeSnapshotService implements FeeProvider {
  private snapshot: FeeSnapshot | undefined;
  private inFlight: Promise<FeeSnapshot> | undefined;

  private readonly runningPromise: RunningPromise;
  private stopped = false;

  private readonly constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>;

  constructor(
    private readonly rollup: RollupContract,
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
  public async getPredictedMinFees(manaUsage: ManaUsageEstimate = ManaUsageEstimate.Target): Promise<GasFees[]> {
    const { current, prediction } = await this.resolveLookup();
    return [current.currentMinFee, ...prediction.predictions[manaUsage]];
  }

  /**
   * Resolves the two anchor candidates for the current wall clock. The loop makes up to three attempts under a
   * single deadline: each attempt either serves from the published snapshot or identifies why it cannot (no
   * snapshot, superseded identity, uncovered slot), triggers a refresh, awaits it, and tries again.
   */
  private async resolveLookup(): Promise<{ current: FeeQuoteCandidate; prediction: FeeQuoteCandidate }> {
    const deadline = this.dateProvider.now() + this.config.refreshTimeoutMs;

    for (let attempt = 0; attempt < MAX_LOOKUP_ATTEMPTS; attempt++) {
      if (this.stopped) {
        throw new FeeQuoteUnavailableError('the service was stopped');
      }
      const snapshot = this.snapshot;
      if (!snapshot) {
        await this.refresh('read', deadline);
        continue;
      }

      // Identity check before the staleness bound: a snapshot the archiver has already moved past is never
      // served, and a refresh that cannot replace it surfaces its own error rather than a stale quote. This is
      // also what preserves freshness parity with a per-call latest-block check, at zero L1 cost, and what
      // corrects a refresh that published while the identity was changing.
      const identity = this.identityProvider.getL1SyncSnapshot();
      if (identity && !identity.blockHash.equals(snapshot.l1.blockHash)) {
        await this.refresh('read', deadline);
        continue;
      }

      const nowSeconds = BigInt(this.dateProvider.nowInSeconds());
      const current = snapshot.candidates.get(this.wantedCurrentSlot(snapshot.pendingCheckpointSlot, nowSeconds));
      const prediction = snapshot.candidates.get(this.wantedPredictionSlot(snapshot.pinnedSlot, nowSeconds));
      if (!current || !prediction) {
        await this.refresh('read', deadline);
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

  /** Refreshes when the archiver identity changed or the covered slots are about to be outrun by the clock. */
  private async tick(): Promise<void> {
    if (this.stopped) {
      return;
    }
    const identity = this.identityProvider.getL1SyncSnapshot();
    if (!identity) {
      return;
    }
    const snapshot = this.snapshot;
    if (!snapshot || !identity.blockHash.equals(snapshot.l1.blockHash)) {
      await this.refresh('poll-identity').catch(() => undefined);
    } else if (!this.coversUpcomingSlots(snapshot)) {
      await this.refresh('poll-coverage').catch(() => undefined);
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
   * Awaits the in-flight refresh, starting one if none is running: concurrent readers and the poll loop always
   * share a single refresh, so a failing L1 sees at most one serial request chain regardless of RPC traffic.
   * Fails without touching L1 when the service is stopped or the archiver has no identity to pin reads to.
   * Reads pass their deadline: on expiry only the wait is abandoned — the refresh keeps running for the poll
   * loop and any other waiter — and the read reports unavailable.
   */
  protected async refresh(cause: RefreshCause, deadline?: number): Promise<void> {
    if (this.stopped) {
      throw new FeeQuoteUnavailableError('the service was stopped');
    }
    const remaining = deadline === undefined ? undefined : deadline - this.dateProvider.now();
    if (remaining !== undefined && remaining <= 0) {
      throw new FeeQuoteUnavailableError('the read deadline elapsed before a refresh could complete');
    }
    if (!this.inFlight) {
      const identity = this.identityProvider.getL1SyncSnapshot();
      if (!identity) {
        throw new FeeQuoteUnavailableError('the archiver has no L1 identity yet');
      }
      // The slot is freed only once the refresh settles, and every waiter resumes after that, so a subsequent
      // caller (e.g. a read that found this snapshot already superseded) starts a fresh refresh at a new identity.
      const refresh = this.runRefresh(identity, cause).finally(() => (this.inFlight = undefined));
      this.inFlight = refresh;
    }
    const inFlight = this.inFlight;
    if (remaining === undefined) {
      await inFlight;
      return;
    }
    try {
      await executeTimeout(() => inFlight, remaining, 'fee snapshot refresh');
    } catch (err) {
      if (err instanceof TimeoutError) {
        throw new FeeQuoteUnavailableError(`no refresh completed within ${remaining}ms`);
      }
      throw err;
    }
  }

  /** Builds and publishes a snapshot; on error keeps the last-good snapshot stored and rethrows to all waiters. */
  protected async runRefresh(identity: L1SyncSnapshot, cause: RefreshCause): Promise<FeeSnapshot> {
    try {
      const snapshot = await this.buildSnapshot(identity);
      // No ordering guard on publish: refreshes are single-flight, and L1 identity is hash-authoritative, so
      // the height can legitimately move backwards (reorg, or a lagging fallback backend). A height guard
      // would discard every rebuild after a rollback and wedge reads.
      this.snapshot = snapshot;
      this.log.debug('Published fee snapshot', {
        cause,
        blockNumber: snapshot.l1.blockNumber,
        pendingCheckpointSlot: snapshot.pendingCheckpointSlot,
        pinnedSlot: snapshot.pinnedSlot,
        candidateSlots: [...snapshot.candidates.keys()],
      });
      return snapshot;
    } catch (err) {
      this.log.warn('Fee snapshot refresh failed; keeping last-good snapshot', {
        cause,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
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
      // of publishing a quote assembled from two states; a later read or poll tick retries.
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
