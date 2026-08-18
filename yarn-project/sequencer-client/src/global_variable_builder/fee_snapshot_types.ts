import type { RollupChainTips } from '@aztec/ethereum/contracts';
import type { L1SyncSnapshot } from '@aztec/ethereum/l1-types';
import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { GasFees, ManaUsageEstimate } from '@aztec/stdlib/gas';

/**
 * One complete, finished fee quote for a single candidate slot. Entries are outputs, never partially derived
 * state: both the current fee and all three prediction arrays are precomputed at refresh time so the read path
 * issues zero L1 requests.
 */
export type FeeQuoteCandidate = {
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
  /** Chain tips at the pinned block; the next refresh speculatively reads these checkpoints with its globals. */
  tips: RollupChainTips;
  /** Floor of the current-fee anchor rule: the slot after the pending checkpoint at the pinned block. */
  currentFloorSlot: SlotNumber;
  /** Floor of the prediction anchor rule: the slot of the pinned block timestamp (TS arithmetic). */
  predictionFloorSlot: SlotNumber;
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

/**
 * No fee quote can be produced right now: no identity, no covering snapshot, stale pinned head, refresh
 * timeout, or stopped.
 */
export class FeeQuoteUnavailableError extends FeeSnapshotError {
  constructor(reason: string) {
    super(`Fee quote is unavailable: ${reason}`);
    this.name = 'FeeQuoteUnavailableError';
  }
}
