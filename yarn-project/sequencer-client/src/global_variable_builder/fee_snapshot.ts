import type { L1SyncSnapshot } from '@aztec/ethereum/l1-types';
import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';

/**
 * One complete, finished fee quote for a single candidate slot. Entries are outputs, never partially derived
 * state: both the current fee and all three prediction arrays are precomputed at refresh time so the read path
 * issues zero L1 requests and merges only complete arrays.
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
 * from the snapshot-level fields (`pendingCheckpointSlot`, `pinnedSlot`); no per-candidate selection state.
 */
export type FeeSnapshot = {
  /** L1 identity this snapshot was built at (block number + hash + timestamp). */
  l1: L1SyncSnapshot;
  /** Raw pending checkpoint slot at the pinned block — floor for the current-fee anchor rule. */
  pendingCheckpointSlot: SlotNumber;
  /** Slot of the pinned block timestamp (TS arithmetic) — L1-side floor for the prediction anchor rule. */
  pinnedSlot: SlotNumber;
  /** One complete entry per materialized candidate slot, keyed by the primitive slot number. */
  candidates: ReadonlyMap<number, FeeQuoteCandidate>;
  /** Lowest slot of the contiguous materialized window (informational; coverage uses map membership). */
  baseSlot: SlotNumber;
  /** Highest slot of the contiguous materialized window (informational; coverage uses map membership). */
  topSlot: SlotNumber;
  /** Computation-age anchor (DateProvider ms). Reset by every successful refresh, including coverage-only. */
  refreshedAtMs: number;
};

/** Tuning and staleness configuration for the fee snapshot service. All durations use their stated units. */
export type FeeSnapshotServiceConfig = {
  slotDuration: number;
  l1GenesisTime: bigint;
  ethereumSlotDuration: number;
  epochDuration: number;
  /** Symmetric wall-clock error allowance (seconds) that widens the read-time window. `0` disables the window. */
  clockDriftAllowanceSeconds: number;
  /** Extra slots added above the wanted window so empty-Ethereum-slot runs do not freeze quotes. */
  coverageHeadroomSlots: number;
  /** Hard cap on the contiguous provisional window size; larger windows are materialized capped + topped up. */
  maxCandidateWindowSlots: number;
  /** Hard cap on distinct enumerated candidate slots per rule; a drift producing more is rejected at startup. */
  maxClockCandidates: number;
  /** Background poll interval (ms) for the refresh loop; only in-memory comparisons run per tick. */
  pollIntervalMs: number;
  /** Max age (ms) of the last successful refresh before reads fail closed. `0` disables. */
  maxRefreshAgeMs: number;
  /** Max age (seconds) of the pinned L1 head before reads fail closed. `0` disables. */
  maxL1HeadAgeSeconds: number;
  /** Max seconds the pinned L1 head may be dated ahead of the wall clock before reads fail closed. `0` disables. */
  futureHeadAllowanceSeconds: number;
  /** Short bound (ms) a read waits for an in-flight/triggered refresh before failing closed with a typed error. */
  refreshTimeoutMs: number;
};

/** Derives the default fee snapshot service config from the L1 timing constants. */
export function getDefaultFeeSnapshotServiceConfig(base: {
  slotDuration: number;
  l1GenesisTime: bigint;
  ethereumSlotDuration: number;
  epochDuration: number;
}): FeeSnapshotServiceConfig {
  const clockDriftAllowanceSeconds = 2;
  return {
    ...base,
    clockDriftAllowanceSeconds,
    coverageHeadroomSlots: 2,
    maxCandidateWindowSlots: 16,
    maxClockCandidates: 8,
    pollIntervalMs: 150,
    maxRefreshAgeMs: 60_000,
    maxL1HeadAgeSeconds: 300,
    futureHeadAllowanceSeconds: 2 * base.ethereumSlotDuration + clockDriftAllowanceSeconds,
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

/** Invalid service configuration detected at startup (e.g. drift produces more candidates than the cap allows). */
export class FeeSnapshotConfigError extends FeeSnapshotError {
  constructor(message: string) {
    super(message);
    this.name = 'FeeSnapshotConfigError';
  }
}

/** No snapshot is available yet (first refresh not completed) within the caller's bound. */
export class FeeSnapshotUnavailableError extends FeeSnapshotError {
  constructor(message = 'Fee snapshot is not available yet') {
    super(message);
    this.name = 'FeeSnapshotUnavailableError';
  }
}

/** The service was stopped while a read was waiting. */
export class FeeSnapshotStoppedError extends FeeSnapshotError {
  constructor(message = 'Fee snapshot service was stopped') {
    super(message);
    this.name = 'FeeSnapshotStoppedError';
  }
}

/** A wanted slot fell outside the covered window and a refresh could not cover it within the bound. */
export class FeeSnapshotCoverageError extends FeeSnapshotError {
  constructor(message: string) {
    super(message);
    this.name = 'FeeSnapshotCoverageError';
  }
}

/** The last successful refresh is too old (refresh is broken). */
export class FeeSnapshotComputationStaleError extends FeeSnapshotError {
  constructor(
    public readonly ageMs: number,
    public readonly maxAgeMs: number,
  ) {
    super(`Fee snapshot computation is stale: age ${ageMs}ms exceeds max ${maxAgeMs}ms`);
    this.name = 'FeeSnapshotComputationStaleError';
  }
}

/** The pinned L1 head is too old (provider or archiver frozen). */
export class FeeSnapshotL1HeadStaleError extends FeeSnapshotError {
  constructor(
    public readonly ageSeconds: number,
    public readonly maxAgeSeconds: number,
  ) {
    super(`Fee snapshot L1 head is stale: age ${ageSeconds}s exceeds max ${maxAgeSeconds}s`);
    this.name = 'FeeSnapshotL1HeadStaleError';
  }
}

/** The pinned L1 head is dated further into the future than allowed (fails closed in production). */
export class FeeSnapshotFutureHeadError extends FeeSnapshotError {
  constructor(
    public readonly aheadSeconds: number,
    public readonly allowanceSeconds: number,
  ) {
    super(`Fee snapshot L1 head is ${aheadSeconds}s ahead of wall clock, exceeding allowance ${allowanceSeconds}s`);
    this.name = 'FeeSnapshotFutureHeadError';
  }
}
