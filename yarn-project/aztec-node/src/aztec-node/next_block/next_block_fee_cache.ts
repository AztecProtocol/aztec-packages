import type { EpochCacheInterface } from '@aztec/epoch-cache';
import {
  type RollupContract,
  SimulationOverridesBuilder,
  type SimulationOverridesPlan,
} from '@aztec/ethereum/contracts';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import { type DateProvider, executeTimeout } from '@aztec/foundation/timer';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L1SyncPoint, L2BlockSource, L2Frontier } from '@aztec/stdlib/block';
import { buildCheckpointSimulationOverridesPlan } from '@aztec/stdlib/checkpoint';
import type { CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import type { CheckpointGlobalVariables, GlobalVariableBuilder } from '@aztec/stdlib/tx';

import {
  type BoundaryFeeKey,
  type NewCheckpointPlan,
  boundaryFeeKeyEquals,
  computeBoundaryFeeKey,
  getClockSlot,
  planNextBlock,
} from './next_block_planner.js';

/** Default interval for the background refresh, well below L1's block time. */
export const DEFAULT_REFRESH_INTERVAL_MS = 1000;

/**
 * A record older than this many refresh intervals is treated as missing: the refresh has been failing long
 * enough that serving its value could underquote a fee that has since stepped. Ten intervals because one
 * failed pass is a hiccup, and a ten-second-old boundary fee is almost always still right.
 */
export const MAX_AGE_INTERVALS = 10;

/** Refresh passes an uncapped reader will wait through before giving up on its boundary. */
const MAX_REFRESH_ATTEMPTS = 2;

/** A priced checkpoint boundary, with the L1 block it was priced at kept as metadata. */
type BoundaryFeeRecord = {
  key: BoundaryFeeKey;
  l1SyncPoint: L1SyncPoint | undefined;
  globals: CheckpointGlobalVariables;
  refreshedAtMs: number;
};

/** Dependencies required to build a {@link NextBlockFeeCache}. */
export interface NextBlockFeeCacheDeps {
  blockSource: L2BlockSource;
  globalVariableBuilder: GlobalVariableBuilder;
  /**
   * Rollup contract used to build the fee-relevant L1 state overrides when opening a new checkpoint.
   * Only needed when a proposed parent checkpoint exists (pipelining) or the pending chain is invalid;
   * may be omitted in environments that never reach those states (e.g. TXE). When omitted, those paths
   * degrade to a pinned-tips plan (non-pipelined fees) instead.
   */
  rollupContract?: RollupContract;
  epochCache: EpochCacheInterface;
  signatureContext: CoordinationSignatureContext;
  dateProvider: DateProvider;
  log?: Logger;
}

/**
 * Owns the one L1-derived value the next block needs: the checkpoint globals a block opening a fresh
 * checkpoint would carry, in particular its mana min fee. A background loop keeps the leading boundary priced
 * so requests are answered from memory, and readers look a record up by its logical {@link BoundaryFeeKey}.
 *
 * The L1 block a record was priced at is metadata, not part of the lookup: the min fee for a fixed slot and
 * parent depends only on rollup storage, and every write to it moves the frontier and hence the key. A miss
 * therefore means a real transition — a slot rollover, a checkpoint landing or being proposed, a validity flip
 * — not merely a new L1 block.
 *
 * Rule the class exists to enforce: the request path never originates an L1 call the background loop would not
 * make, and never has more than one in flight. A request that misses waits for the single shared refresh (the
 * quote bounds that wait; a simulation does not), rather than issuing a call of its own.
 *
 * Before {@link start} (or after {@link stop}) requests still price inline through the same refresh path, which
 * is what tests and TXE-like environments rely on.
 */
export class NextBlockFeeCache {
  private readonly blockSource: L2BlockSource;
  private readonly globalVariableBuilder: GlobalVariableBuilder;
  private readonly rollupContract: RollupContract | undefined;
  private readonly epochCache: EpochCacheInterface;
  private readonly signatureContext: CoordinationSignatureContext;
  private readonly dateProvider: DateProvider;
  private readonly log: Logger;

  private current: BoundaryFeeRecord | undefined;
  private previous: BoundaryFeeRecord | undefined;
  private refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS;
  private refreshLoop: RunningPromise | undefined;
  private inFlightRefresh: Promise<void> | undefined;

  constructor(deps: NextBlockFeeCacheDeps) {
    this.blockSource = deps.blockSource;
    this.globalVariableBuilder = deps.globalVariableBuilder;
    this.rollupContract = deps.rollupContract;
    this.epochCache = deps.epochCache;
    this.signatureContext = deps.signatureContext;
    this.dateProvider = deps.dateProvider;
    this.log = deps.log ?? createLogger('node:next-block-fee-cache');
  }

  /**
   * Starts the background refresh. The priming pass is best-effort: a node whose archiver or L1 client is not
   * ready yet still starts, and the loop fills the cache once they are. A second call while running is a no-op,
   * so it cannot orphan a loop that {@link stop} could then never reach.
   */
  public async start(pollingIntervalMs = DEFAULT_REFRESH_INTERVAL_MS): Promise<void> {
    if (this.refreshLoop) {
      return;
    }
    this.refreshIntervalMs = pollingIntervalMs;
    this.refreshLoop = new RunningPromise(() => this.refresh(), this.log, pollingIntervalMs);
    await this.refresh().catch(err => this.log.debug(`Priming the next-block boundary fee failed`, err));
    this.refreshLoop.start();
  }

  public async stop(): Promise<void> {
    const loop = this.refreshLoop;
    this.refreshLoop = undefined;
    await loop?.stop();
    await this.inFlightRefresh?.catch(() => {});
  }

  /**
   * The checkpoint globals for a boundary keyed by `key`, or undefined when they could not be produced in time.
   *
   * A matching record under the staleness cutoff is served straight away. Otherwise the caller joins the single
   * shared refresh: a simulation waits for it and surfaces its failure, while a quote passes `maxWaitMs` and
   * falls back to whatever the cache already holds rather than turning an L1 outage into a multi-second RPC.
   */
  public async getBoundaryGlobals(
    key: BoundaryFeeKey,
    frontier: L2Frontier,
    opts?: { maxWaitMs?: number },
  ): Promise<CheckpointGlobalVariables | undefined> {
    const maxWaitMs = opts?.maxWaitMs;
    // An uncapped reader gets more than one attempt because the refresh it joins may be one that started from an
    // older frontier and therefore priced a different boundary; the next pass is its own. Still never concurrent.
    const attempts = maxWaitMs === undefined ? MAX_REFRESH_ATTEMPTS : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const hit = this.findRecord(key);
      if (hit) {
        return hit.globals;
      }
      const refresh = this.refresh(frontier);
      await (maxWaitMs === undefined ? refresh : this.waitFor(refresh, maxWaitMs));
    }
    return this.findRecord(key)?.globals;
  }

  /**
   * Runs one refresh pass, or joins the one already running. Single-flight is what keeps a burst of requests
   * during a transition down to a single L1 round trip, shared with the background loop.
   * @param frontier - Snapshot to plan from; read fresh from the archiver when omitted, as the loop does.
   */
  public refresh(frontier?: L2Frontier): Promise<void> {
    if (this.inFlightRefresh) {
      return this.inFlightRefresh;
    }
    const refresh = this.runRefresh(frontier).finally(() => {
      this.inFlightRefresh = undefined;
    });
    this.inFlightRefresh = refresh;
    return refresh;
  }

  private async runRefresh(frontier?: L2Frontier): Promise<void> {
    const snapshot = frontier ?? (await this.blockSource.getL2Frontier());
    const plan = planNextBlock(snapshot, getClockSlot(this.epochCache));
    const key = computeBoundaryFeeKey(plan, snapshot.pendingChainValidationStatus);
    if (!key || !plan.newCheckpoint) {
      // Mid-checkpoint: the fee is frozen in the in-progress checkpoint's header, so there is nothing to price.
      return;
    }

    const current = this.current;
    const sameKey = current !== undefined && boundaryFeeKeyEquals(current.key, key);
    if (sameKey && l1SyncPointEquals(current.l1SyncPoint, snapshot.l1SyncPoint)) {
      // This pass confirmed against a fresh snapshot that none of the fee's inputs moved, so the record is as
      // good as one just priced. Re-stamping it is what makes the staleness cutoff mean "how long we have been
      // unable to confirm", rather than expiring a value that is still exactly right.
      this.current = { ...current, refreshedAtMs: this.dateProvider.now() };
      return;
    }

    const overrides = await this.buildOverridesPlan(snapshot, plan.newCheckpoint);
    // Pinned to the L1 block the frontier was read at, so the fee describes the same L1 state the plan derives
    // from. Undefined before the archiver's first sync pass, where the read falls back to L1's head.
    const globals = await this.globalVariableBuilder.buildCheckpointGlobalVariables(
      EthAddress.ZERO,
      AztecAddress.ZERO,
      plan.newCheckpoint.targetSlot,
      overrides,
      { blockNumber: snapshot.l1SyncPoint?.blockNumber },
    );

    const record = { key, l1SyncPoint: snapshot.l1SyncPoint, globals, refreshedAtMs: this.dateProvider.now() };
    if (!sameKey) {
      // Keep the boundary we just left addressable: a request that planned from the previous frontier is still
      // served while the new one settles.
      this.previous = current;
    }
    this.current = record;
  }

  /** The freshest record matching `key`, or undefined when none is recent enough to trust. */
  private findRecord(key: BoundaryFeeKey): BoundaryFeeRecord | undefined {
    const maxAgeMs = MAX_AGE_INTERVALS * this.refreshIntervalMs;
    const now = this.dateProvider.now();
    return [this.current, this.previous].find(
      record => record !== undefined && boundaryFeeKeyEquals(record.key, key) && now - record.refreshedAtMs < maxAgeMs,
    );
  }

  /** Awaits `promise` for at most `maxWaitMs`, swallowing both a timeout and the promise's own failure. */
  private waitFor(promise: Promise<void>, maxWaitMs: number): Promise<void> {
    return executeTimeout(() => promise, maxWaitMs).catch(err =>
      this.log.debug(`Refreshing the next-block boundary fee failed or timed out`, err),
    );
  }

  /**
   * Builds the chain-state overrides plan passed to `buildCheckpointGlobalVariables`, mirroring the sequencer
   * (which always pins tips to neutralize prunes). When pipelining, the plan carries the proposed parent's
   * archive, temp-checkpoint-log cell, and locally-derived fee header; when the pending chain is invalid, it
   * pins the tips to the last valid checkpoint instead.
   *
   * Both of those need a rollup contract for the L1 fee reads. Environments that omit it (e.g. TXE, which never
   * has a proposed checkpoint and whose pending chain is always valid) fall back to pinning both pending and
   * proven tips to the checkpointed tip, which neutralizes prunes in fee computation at the cost of
   * non-pipelined fees.
   */
  private buildOverridesPlan(
    frontier: L2Frontier,
    newCheckpoint: NewCheckpointPlan,
  ): Promise<SimulationOverridesPlan | undefined> {
    const { targetCheckpoint, proposedCheckpointData, checkpointedCheckpointNumber } = newCheckpoint;
    const rollup = this.rollupContract;
    if (!rollup) {
      return Promise.resolve(
        new SimulationOverridesBuilder()
          .withChainTips({ pending: checkpointedCheckpointNumber, proven: checkpointedCheckpointNumber })
          .build(),
      );
    }

    // The helper treats pipelining and invalidation as mutually exclusive; a proposed parent takes precedence.
    const validationStatus = frontier.pendingChainValidationStatus;
    const invalidateToPendingCheckpointNumber =
      !proposedCheckpointData && !validationStatus.valid
        ? CheckpointNumber(validationStatus.checkpoint.checkpointNumber - 1)
        : undefined;
    return buildCheckpointSimulationOverridesPlan({
      checkpointNumber: targetCheckpoint,
      proposedCheckpointData,
      invalidateToPendingCheckpointNumber,
      checkpointedCheckpointNumber,
      rollup,
      signatureContext: this.signatureContext,
      log: this.log,
    });
  }
}

function l1SyncPointEquals(a: L1SyncPoint | undefined, b: L1SyncPoint | undefined): boolean {
  return a === undefined || b === undefined ? a === b : a.blockHash.equals(b.blockHash);
}
