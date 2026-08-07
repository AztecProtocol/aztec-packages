import type { L1SyncSnapshot } from '@aztec/ethereum/l1-types';
import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';

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

/** Cause of a refresh, recorded on logs for observability. */
export type RefreshCause = 'poll-identity' | 'poll-coverage' | 'read';

/**
 * Extra slots materialized above each anchor so quotes survive a run of empty Ethereum slots or a short L1
 * stall without a refresh. Two suffices only because the Aztec slot duration is a positive multiple of the
 * Ethereum slot duration, so one L1 block advances the wanted slot by at most one; together with the poll
 * tick's one-slot lookahead that leaves a full slot of margin to refresh in.
 */
export const CANDIDATE_HEADROOM_SLOTS = 2;

/**
 * Attempts a read makes before giving up: one stale in-flight publication, one corrective refresh, and one
 * successful lookup. Identity churn beyond that inside a single call's deadline is reported as unavailable.
 */
export const MAX_LOOKUP_ATTEMPTS = 3;

export const BACKOFF_BASE_MS = 250;
export const BACKOFF_MAX_MS = 8_000;
