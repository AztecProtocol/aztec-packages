import type { FeeHeader, L1FeeData, RollupContract, RollupFeeGlobals } from '@aztec/ethereum/contracts';
import type { L1SyncSnapshot, L1SyncSnapshotProvider } from '@aztec/ethereum/l1-types';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { times, unique } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import { type DateProvider, executeTimeout } from '@aztec/foundation/timer';
import { getSlotAtNextL1Block, getSlotAtTimestamp, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { GasFees, ManaUsageEstimate, computeExcessMana } from '@aztec/stdlib/gas';
import type { FeeProvider } from '@aztec/stdlib/tx';

import { type FeeOracleState, computePredictions, getPredictionWindowSlots } from './fee_prediction.js';
import {
  type FeeQuoteCandidate,
  FeeQuoteUnavailableError,
  type FeeSnapshot,
  FeeSnapshotError,
  type FeeSnapshotServiceConfig,
} from './fee_snapshot_types.js';

/**
 * Extra slots materialized above each anchor so quotes survive a run of empty Ethereum slots or a short L1
 * stall without a refresh. Two suffices only because the Aztec slot duration is a positive multiple of the
 * Ethereum slot duration, so one L1 block advances the wanted slot by at most one; together with the poll
 * tick's one-slot lookahead that leaves a full slot of margin to refresh in.
 */
const CANDIDATE_HEADROOM_SLOTS = 2;

/** The two candidates a read resolves, one per anchor rule. */
type ResolvedLookup = { current: FeeQuoteCandidate; prediction: FeeQuoteCandidate };

/**
 * Serves current and predicted fee quotes from an in-memory snapshot refreshed in the background per L1 block,
 * so warm RPC calls issue zero L1 requests. Reads are served from a complete, immutable, atomically-swapped
 * {@link FeeSnapshot} whose every value was read at the archiver's synced L1 block.
 */
export class FeeSnapshotService implements FeeProvider {
  protected snapshot: FeeSnapshot | undefined;
  private inFlight: Promise<FeeSnapshot> | undefined;

  private readonly runningPromise: RunningPromise;
  private stopped = false;

  constructor(
    private readonly rollup: RollupContract,
    private readonly identityProvider: L1SyncSnapshotProvider,
    private readonly dateProvider: DateProvider,
    private readonly config: FeeSnapshotServiceConfig,
    private readonly log: Logger = createLogger('sequencer:fee-snapshot'),
  ) {
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
   * Resolves the two anchor candidates for the current wall clock, bounded by the read timeout. On timeout only
   * the wait is abandoned — the shared refresh keeps running for the poll loop and any other waiter — and the
   * read reports unavailable.
   */
  private resolveLookup(): Promise<ResolvedLookup> {
    return executeTimeout(
      signal => this.lookupLoop(signal),
      this.config.refreshTimeoutMs,
      () => new FeeQuoteUnavailableError(`no refresh completed within ${this.config.refreshTimeoutMs}ms`),
    );
  }

  /**
   * Serves from the published snapshot or refreshes until the read times out. An aborted lookup finishes
   * awaiting its current shared refresh but does not initiate another one.
   */
  private async lookupLoop(signal: AbortSignal): Promise<ResolvedLookup> {
    while (!signal.aborted) {
      if (this.stopped) {
        throw new FeeQuoteUnavailableError('the service was stopped');
      }
      const served = this.serveFromSnapshot();
      if (served) {
        return served;
      }
      await this.refresh();
    }
    throw new FeeQuoteUnavailableError(`no refresh completed within ${this.config.refreshTimeoutMs}ms`);
  }

  /**
   * Serves both anchors from the published snapshot, or returns undefined when a refresh is needed. The
   * identity check runs before the staleness bound: a snapshot the archiver has already moved past is never
   * served, which preserves freshness parity with a per-call latest-block check at zero L1 cost. Staleness
   * itself throws — the archiver identity is frozen, so a refresh cannot help.
   */
  private serveFromSnapshot(): ResolvedLookup | undefined {
    const snapshot = this.snapshot;
    if (!snapshot) {
      return undefined;
    }
    const identity = this.identityProvider.getL1SyncSnapshot();
    if (identity && !identity.blockHash.equals(snapshot.l1.blockHash)) {
      return undefined;
    }
    const nowSeconds = BigInt(this.dateProvider.nowInSeconds());
    const current = snapshot.candidates.get(this.wantedSlot(snapshot.currentFloorSlot, nowSeconds));
    const prediction = snapshot.candidates.get(this.wantedSlot(snapshot.predictionFloorSlot, nowSeconds));
    if (!current || !prediction) {
      return undefined;
    }
    this.assertHeadFresh(snapshot, nowSeconds);
    return { current, prediction };
  }

  /** The anchor rule shared by both quotes: the next proposable slot, floored per the snapshot field. */
  private wantedSlot(floorSlot: number, atSeconds: bigint): number {
    return Math.max(floorSlot, getSlotAtNextL1Block(atSeconds, this.config));
  }

  /** Fails closed when the pinned L1 head is older than the bound, i.e. the archiver or provider is frozen. */
  private assertHeadFresh(snapshot: FeeSnapshot, nowSeconds: bigint): void {
    const { maxL1HeadAgeSeconds } = this.config;
    if (maxL1HeadAgeSeconds <= 0) {
      return;
    }
    const ageSeconds = Number(nowSeconds - snapshot.l1.blockTimestamp);
    if (ageSeconds > maxL1HeadAgeSeconds) {
      throw new FeeQuoteUnavailableError(`pinned L1 head age ${ageSeconds}s exceeds max ${maxL1HeadAgeSeconds}s`);
    }
  }

  /** Refreshes when the archiver identity changed or the covered slots are about to be outrun by the clock. */
  private async tick(): Promise<void> {
    const identity = this.identityProvider.getL1SyncSnapshot();
    if (!identity) {
      return;
    }
    const snapshot = this.snapshot;
    if (!snapshot || !identity.blockHash.equals(snapshot.l1.blockHash) || !this.coversUpcomingSlots(snapshot)) {
      await this.refresh().catch(() => undefined);
    }
  }

  /** True when the snapshot covers both anchors now and one slot ahead. */
  private coversUpcomingSlots(snapshot: FeeSnapshot): boolean {
    const nowSeconds = BigInt(this.dateProvider.nowInSeconds());
    const lookahead = nowSeconds + BigInt(this.config.slotDuration);
    return [nowSeconds, lookahead].every(
      atSeconds =>
        snapshot.candidates.has(this.wantedSlot(snapshot.currentFloorSlot, atSeconds)) &&
        snapshot.candidates.has(this.wantedSlot(snapshot.predictionFloorSlot, atSeconds)),
    );
  }

  /**
   * Awaits the in-flight refresh, starting one if none is running: concurrent readers and the poll loop always
   * share a single refresh, so a failing L1 sees at most one serial request chain regardless of RPC traffic.
   * Fails without touching L1 when the archiver has no identity to pin reads to.
   */
  protected async refresh(): Promise<void> {
    if (!this.inFlight) {
      const identity = this.identityProvider.getL1SyncSnapshot();
      if (!identity) {
        throw new FeeQuoteUnavailableError('the archiver has no L1 identity yet');
      }
      // The slot is freed only once the refresh settles, and every waiter resumes after that, so a subsequent
      // caller (e.g. a read that found this snapshot already superseded) starts a fresh refresh at a new identity.
      this.inFlight = this.runRefresh(identity).finally(() => (this.inFlight = undefined));
    }
    await this.inFlight;
  }

  /** Builds and publishes a snapshot; on error keeps the last-good snapshot stored and rethrows to all waiters. */
  protected async runRefresh(identity: L1SyncSnapshot): Promise<FeeSnapshot> {
    try {
      const snapshot = await this.buildSnapshot(identity);
      // No ordering guard on publish: refreshes are single-flight, and L1 identity is hash-authoritative, so
      // the height can legitimately move backwards (reorg, or a lagging fallback backend). A height guard
      // would discard every rebuild after a rollback and wedge reads.
      this.snapshot = snapshot;
      this.log.debug('Published fee snapshot', {
        blockNumber: snapshot.l1.blockNumber,
        currentFloorSlot: snapshot.currentFloorSlot,
        predictionFloorSlot: snapshot.predictionFloorSlot,
        candidateSlots: [...snapshot.candidates.keys()],
      });
      return snapshot;
    } catch (err) {
      this.log.warn('Fee snapshot refresh failed; keeping last-good snapshot', {
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
    const currentFloorSlot = SlotNumber.add(pendingCheckpoint.slotNumber, 1);
    const predictionFloorSlot = getSlotAtTimestamp(identity.blockTimestamp, this.config);
    const candidateSlots = unique([
      ...withHeadroom(this.wantedSlot(currentFloorSlot, nowSeconds)),
      ...withHeadroom(this.wantedSlot(predictionFloorSlot, nowSeconds)),
    ]);

    const slotInputs = await this.rollup.getSlotFeeInputs(
      candidateSlots.map(slot => this.tsForSlot(slot)),
      options,
    );
    const effectiveParents = slotInputs.map(input => (input.canPrune ? provenCheckpoint : pendingCheckpoint));

    const windows = candidateSlots.map((slot, i) =>
      getPredictionWindowSlots(SlotNumber(slot), effectiveParents[i].slotNumber),
    );
    const oracleSlots = unique(windows.flat()).sort((a, b) => a - b);
    const { l1Fees, tips: tailTips } = await this.rollup.getL1FeesAndTips(
      oracleSlots.map(slot => this.tsForSlot(slot)),
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
    // The oracle slots are the union of the windows consumed below, so every window lookup hits.
    const l1FeesBySlot = new Map(oracleSlots.map((slot, i): [number, L1FeeData] => [slot, l1Fees[i]]));
    const getL1Fees = (slot: SlotNumber): L1FeeData => {
      const fees = l1FeesBySlot.get(slot);
      if (!fees) {
        throw new FeeSnapshotError(`Fee refresh is missing the L1 fees for slot ${slot}`);
      }
      return fees;
    };

    const candidates = new Map(
      candidateSlots.map((slot, i): [number, FeeQuoteCandidate] => [
        slot,
        {
          currentMinFee: new GasFees(0, slotInputs[i].manaMinFee),
          predictions: this.computeCandidatePredictions(
            effectiveParents[i].feeHeader,
            globals,
            windows[i].map(getL1Fees),
          ),
        },
      ]),
    );

    return { l1: identity, currentFloorSlot, predictionFloorSlot, candidates };
  }

  /** Computes the complete prediction array for every mana-usage estimate at a single candidate slot. */
  private computeCandidatePredictions(
    feeHeader: FeeHeader,
    globals: RollupFeeGlobals,
    l1FeesBySlot: L1FeeData[],
  ): Record<ManaUsageEstimate, GasFees[]> {
    const state: FeeOracleState = {
      excessMana: computeExcessMana(feeHeader.excessMana, feeHeader.manaUsed, globals.manaTarget),
      ethPerFeeAsset: feeHeader.ethPerFeeAsset,
      manaTarget: globals.manaTarget,
      manaLimit: globals.manaLimit,
      provingCostPerManaEth: globals.provingCostPerManaEth,
      epochDuration: BigInt(this.config.epochDuration),
      l1FeesBySlot,
    };
    return {
      [ManaUsageEstimate.None]: computePredictions(state, ManaUsageEstimate.None),
      [ManaUsageEstimate.Target]: computePredictions(state, ManaUsageEstimate.Target),
      [ManaUsageEstimate.Limit]: computePredictions(state, ManaUsageEstimate.Limit),
    };
  }

  private tsForSlot(slot: number): bigint {
    return getTimestampForSlot(SlotNumber(slot), this.config);
  }
}

/** The anchor slot plus its headroom slots, in ascending order. */
function withHeadroom(anchorSlot: number): number[] {
  return times(CANDIDATE_HEADROOM_SLOTS + 1, i => anchorSlot + i);
}
