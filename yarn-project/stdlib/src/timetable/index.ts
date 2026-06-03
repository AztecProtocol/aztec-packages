import { SlotNumber } from '@aztec/foundation/branded-types';

import { type L1RollupConstants, getSlotStartBuildTimestamp, getTimestampForSlot } from '../epoch-helpers/index.js';

/** Default minimum block-building duration (`min_block_duration`) in seconds. */
export const DEFAULT_MIN_BLOCK_DURATION = 2;

/** Default one-way P2P propagation time (`p2p_propagation_time`) for proposals and attestations in seconds. */
export const DEFAULT_P2P_PROPAGATION_TIME = 2;

/** Default local checkpoint proposal preparation time (`checkpoint_proposal_prepare_time`) in seconds. */
export const DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME = 1;

/**
 * Default proposer initialization time (`checkpoint_proposal_init_time`) in seconds: the budget reserved at
 * the start of the build frame for sync, the proposer check, and checkpoint initialization before the first
 * block sub-slot opens. The proposer rarely starts building exactly at `build_frame_start`; this offset
 * shifts the sub-slot grid so the first sub-slot still has its full duration once the prologue completes.
 */
export const DEFAULT_CHECKPOINT_PROPOSAL_INIT_TIME = 1;

/** Default L1 publishing time (matches Ethereum slot duration on mainnet) in seconds. Deprecated: vestigial under the pipelined model. */
export const DEFAULT_L1_PUBLISHING_TIME = 12;

/**
 * Ethereum slot duration (seconds) below which a network is treated as a fast local/e2e profile with mocked
 * p2p. Profiles at or above this keep the production operational budgets. Mainnet is 12s; fast anvil-style
 * local profiles run at 4s.
 */
export const FAST_PROFILE_ETHEREUM_SLOT_DURATION = 8;

/**
 * Operational timing budgets for the fast local/e2e profile (mocked p2p), per the README's "Local e2e with
 * mocked p2p" section. When `ethereum_slot_duration < FAST_PROFILE_ETHEREUM_SLOT_DURATION`, these cap the
 * proposer's operational budgets so a fast network does not inherit the conservative production budgets,
 * which would shrink the per-checkpoint build window and under-pack checkpoints. Explicitly configured
 * budgets below these caps are kept as-is (the budgets are clamped down, never raised).
 */
export const FAST_PROFILE_P2P_PROPAGATION_TIME = 0.5;

/** Fast-profile checkpoint proposal preparation budget (seconds). See {@link FAST_PROFILE_P2P_PROPAGATION_TIME}. */
export const FAST_PROFILE_CHECKPOINT_PROPOSAL_PREPARE_TIME = 0.5;

/** Fast-profile minimum block-building budget (seconds). See {@link FAST_PROFILE_P2P_PROPAGATION_TIME}. */
export const FAST_PROFILE_MIN_BLOCK_DURATION = 1;

/** Resolved operational timing budgets used to size the proposer build window. */
type ResolvedTimingBudgets = {
  minBlockDuration: number;
  p2pPropagationTime: number;
  checkpointProposalPrepareTime: number;
  checkpointProposalInitTime: number;
};

/**
 * Resolves the operational timing budgets from the (possibly undefined) inputs, applying the fast local/e2e
 * profile when `ethereumSlotDuration < FAST_PROFILE_ETHEREUM_SLOT_DURATION`.
 *
 * Production profiles (`ethereumSlotDuration` undefined or `>= FAST_PROFILE_ETHEREUM_SLOT_DURATION`) use the
 * production defaults verbatim. Fast profiles clamp `p2pPropagationTime`, `checkpointProposalPrepareTime`,
 * and `minBlockDuration` down to the fast-profile caps so a fast network (mocked p2p) gets a build window
 * sized for local timing rather than the conservative production budgets. The clamp only lowers budgets, so
 * an operator that explicitly configured a smaller value keeps it. `checkpointProposalInitTime` is unchanged
 * by the profile: it is a proposer prologue budget, not a propagation/preparation budget.
 */
function resolveTimingBudgets(
  ethereumSlotDuration: number | undefined,
  opts: {
    minBlockDuration?: number;
    p2pPropagationTime?: number;
    checkpointProposalPrepareTime?: number;
    checkpointProposalInitTime?: number;
  },
): ResolvedTimingBudgets {
  const minBlockDuration = opts.minBlockDuration ?? DEFAULT_MIN_BLOCK_DURATION;
  const p2pPropagationTime = opts.p2pPropagationTime ?? DEFAULT_P2P_PROPAGATION_TIME;
  const checkpointProposalPrepareTime = opts.checkpointProposalPrepareTime ?? DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME;
  const checkpointProposalInitTime = opts.checkpointProposalInitTime ?? DEFAULT_CHECKPOINT_PROPOSAL_INIT_TIME;

  const isFastProfile =
    ethereumSlotDuration !== undefined && ethereumSlotDuration < FAST_PROFILE_ETHEREUM_SLOT_DURATION;
  if (!isFastProfile) {
    return { minBlockDuration, p2pPropagationTime, checkpointProposalPrepareTime, checkpointProposalInitTime };
  }

  return {
    minBlockDuration: Math.min(minBlockDuration, FAST_PROFILE_MIN_BLOCK_DURATION),
    p2pPropagationTime: Math.min(p2pPropagationTime, FAST_PROFILE_P2P_PROPAGATION_TIME),
    checkpointProposalPrepareTime: Math.min(
      checkpointProposalPrepareTime,
      FAST_PROFILE_CHECKPOINT_PROPOSAL_PREPARE_TIME,
    ),
    checkpointProposalInitTime,
  };
}

/**
 * @deprecated Use {@link DEFAULT_MIN_BLOCK_DURATION} (`min_block_duration`) instead. Retained for the
 * archiver/aztec-node grace periods that still key off the old `minExecutionTime` constant.
 */
export const MIN_EXECUTION_TIME = DEFAULT_MIN_BLOCK_DURATION;

/** Slot-timing protocol constants the timetables derive wall-clock times from. */
type SlotTimingConstants = Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>;

/**
 * Consensus acceptance bounds for the pipelined timetable.
 *
 * Returns the deadlines and matching receive-window lower bounds that validators and p2p use to decide
 * whether a proposal or attestation is acceptable for a given target slot. All getters take a target slot
 * and return an absolute wall-clock timestamp in seconds.
 *
 * Inputs are protocol slot-timing constants only (`genesis`, `aztec_slot_duration`,
 * `ethereum_slot_duration`, `block_duration`); no operational budgets, so every node agrees on these
 * bounds. See `sequencer-client/src/sequencer/README.md` for the timing model.
 */
export class ConsensusTimetable {
  /** Aztec slot duration (`S`) in seconds. */
  public readonly aztecSlotDuration: number;

  /** Ethereum slot duration (`E`) in seconds. */
  public readonly ethereumSlotDuration: number;

  /** Block sub-slot duration (`D`) in seconds, or undefined in single-block mode. */
  public readonly blockDuration: number | undefined;

  /** L1 genesis timestamp in seconds (`genesis`), the anchor all slot timings derive from. */
  public readonly genesisTime: bigint;

  constructor(opts: { l1Constants: SlotTimingConstants; blockDuration?: number }) {
    const { l1Constants, blockDuration } = opts;
    if (l1Constants.slotDuration <= 0) {
      throw new Error(`aztecSlotDuration must be positive (got ${l1Constants.slotDuration})`);
    }
    if (l1Constants.ethereumSlotDuration <= 0) {
      throw new Error(`ethereumSlotDuration must be positive (got ${l1Constants.ethereumSlotDuration})`);
    }
    if (blockDuration !== undefined && blockDuration <= 0) {
      throw new Error(`blockDuration must be positive when provided (got ${blockDuration})`);
    }

    this.aztecSlotDuration = l1Constants.slotDuration;
    this.ethereumSlotDuration = l1Constants.ethereumSlotDuration;
    this.blockDuration = blockDuration;
    this.genesisTime = l1Constants.l1GenesisTime;
  }

  /**
   * Build-frame start for the target slot: `target_slot_start - S - E`, equal to
   * `getSlotStartBuildTimestamp(slot - 1)`. Anchors all sub-slot timings.
   */
  public getBuildFrameStart(slot: SlotNumber): number {
    return getSlotStartBuildTimestamp(SlotNumber(slot - 1), this.getL1Constants());
  }

  /** Start of the target slot: `genesis + slot * S`. */
  public getTargetSlotStart(slot: SlotNumber): number {
    return Number(getTimestampForSlot(slot, this.getL1Constants()));
  }

  /**
   * Earliest acceptable arrival for a checkpoint proposal: `target_slot_start - S - E` (the build frame
   * opening). Nothing legitimate for this slot exists before its build frame opens.
   */
  public getCheckpointProposalReceiveStart(slot: SlotNumber): number {
    return this.getBuildFrameStart(slot);
  }

  /**
   * Hard consensus receive deadline for a checkpoint proposal: `target_slot_start - E - D`. Validators
   * reject proposals arriving after this, and the next proposer does not build on them. In single-block
   * mode (`blockDuration` undefined) the `D` term drops to zero, giving `target_slot_start - E` (the
   * next proposer's build-frame boundary), so this remains usable rather than throwing.
   */
  public getCheckpointProposalReceiveDeadline(slot: SlotNumber): number {
    return this.getTargetSlotStart(slot) - this.ethereumSlotDuration - (this.blockDuration ?? 0);
  }

  /**
   * Earliest acceptable arrival for an attestation: `target_slot_start - S - E` (the build frame
   * opening). Deliberately liberal; attestations are attributed by content, not timing.
   */
  public getAttestationReceiveStart(slot: SlotNumber): number {
    return this.getBuildFrameStart(slot);
  }

  /**
   * Single hard consensus deadline: `target_slot_start + S - 2E`. The latest the checkpoint can still
   * land on L1 in the target slot, and the cutoff by which every block and the checkpoint must be
   * re-executed, validated, and signed. Consensus-driven (used for inactivity/slashing decisions).
   */
  public getAttestationDeadline(slot: SlotNumber): number {
    return this.getTargetSlotStart(slot) + this.aztecSlotDuration - 2 * this.ethereumSlotDuration;
  }

  /** Slot-timing protocol constants this timetable derives wall-clock times from. */
  public getL1Constants(): SlotTimingConstants {
    return {
      l1GenesisTime: this.genesisTime,
      slotDuration: this.aztecSlotDuration,
      ethereumSlotDuration: this.ethereumSlotDuration,
    };
  }
}

/** Result of selecting the next block sub-slot to build. */
export type SubslotSelection =
  | { canStart: true; index: number; deadline: undefined; isLastBlock: true }
  | { canStart: false; index: undefined; deadline: undefined; isLastBlock: false }
  | { canStart: true; index: number; deadline: number; isLastBlock: boolean };

/**
 * Proposer ideal/happy-path schedule and block sub-slot timetable.
 *
 * Composes a {@link ConsensusTimetable} and adds the operational budgets that only the proposer needs
 * (`min_block_duration`, `p2p_propagation_time`, `checkpoint_proposal_prepare_time`). Used by the
 * sequencer and checkpoint-proposal job. All getters take a target slot and return an absolute
 * wall-clock timestamp in seconds (or sub-slot deadlines in seconds for {@link selectNextSubslot}).
 *
 * The single hard deadline {@link getAttestationDeadline} is inherited from the composed
 * {@link ConsensusTimetable}, so the proposer uses one object.
 */
export class ProposerTimetable extends ConsensusTimetable {
  /** Minimum block-building time (`min_block_duration`) in seconds. */
  public readonly minBlockDuration: number;

  /** One-way proposal/attestation propagation budget (`p2p_propagation_time`) in seconds. */
  public readonly p2pPropagationTime: number;

  /** Local checkpoint proposal preparation budget (`checkpoint_proposal_prepare_time`) in seconds. */
  public readonly checkpointProposalPrepareTime: number;

  /** Proposer initialization budget (`checkpoint_proposal_init_time`) reserved before the first sub-slot, in seconds. */
  public readonly checkpointProposalInitTime: number;

  /** Whether the proposer enforces sub-slot/start deadlines (false keeps the single-mined-block test mode). */
  public readonly enforce: boolean;

  /** Maximum number of full-duration block sub-slots derivable from this timing config. */
  public readonly maxBlocksPerCheckpoint: number;

  constructor(opts: {
    l1Constants: SlotTimingConstants;
    blockDuration?: number;
    minBlockDuration?: number;
    p2pPropagationTime?: number;
    checkpointProposalPrepareTime?: number;
    checkpointProposalInitTime?: number;
    enforce: boolean;
  }) {
    super({ l1Constants: opts.l1Constants, blockDuration: opts.blockDuration });

    // Resolve operational budgets, applying the fast local/e2e profile for low ethereum slot durations so a
    // fast network does not inherit the conservative production budgets (which would shrink the build window).
    const budgets = resolveTimingBudgets(this.ethereumSlotDuration, opts);
    this.p2pPropagationTime = budgets.p2pPropagationTime;
    this.checkpointProposalPrepareTime = budgets.checkpointProposalPrepareTime;
    this.checkpointProposalInitTime = budgets.checkpointProposalInitTime;
    this.enforce = opts.enforce;

    // Clamp min block duration to the block duration so a single sub-slot is always startable.
    this.minBlockDuration =
      this.blockDuration !== undefined
        ? Math.min(budgets.minBlockDuration, this.blockDuration)
        : budgets.minBlockDuration;

    this.maxBlocksPerCheckpoint = this.computeMaxBlocksPerCheckpoint();
  }

  /**
   * Computes the maximum number of full-duration block sub-slots in a checkpoint from the already-resolved
   * budgets. Derived from the spec's `max_blocks_per_checkpoint = floor((last_block_build_time -
   * first_subslot_start) / D)`, where the first sub-slot starts one `checkpoint_proposal_init_time` (`init`)
   * after `build_frame_start`, so it simplifies to `floor((S - init - D - 2P - prepCp) / D)`. Single-block
   * mode (`blockDuration` undefined) returns 1.
   */
  private computeMaxBlocksPerCheckpoint(): number {
    if (this.blockDuration === undefined) {
      return 1;
    }

    // last_block_build_time - (build_frame_start + init) = S - init - D - 2P - prepCp.
    const timeAvailableForBlocks =
      this.aztecSlotDuration -
      this.checkpointProposalInitTime -
      this.blockDuration -
      2 * this.p2pPropagationTime -
      this.checkpointProposalPrepareTime;
    return Math.floor(timeAvailableForBlocks / this.blockDuration);
  }

  /**
   * Ideal time the last block must finish building by to make the ideal L1 publish path:
   * `target_slot_start - E - D - 2P - prepCp` (= `checkpoint_proposal_send_time - prepCp`). Single value;
   * the proposer sizes block production around the ideal L1-publish path only. In single-block mode
   * (`blockDuration` undefined) the `D` term drops out, since the single block is itself the final block.
   */
  public getLastBlockBuildTime(slot: SlotNumber): number {
    return (
      this.getTargetSlotStart(slot) -
      this.ethereumSlotDuration -
      (this.blockDuration ?? 0) -
      2 * this.p2pPropagationTime -
      this.checkpointProposalPrepareTime
    );
  }

  /**
   * Latest start at which the proposer can still squeeze in a minimum-duration block.
   *
   * Multi-block mode: `last_block_build_time - min_block_duration`, an ideal-derived cutoff
   * intentionally earlier (by `P`) than the consensus receive gate would strictly allow, and
   * conservatively no later than the final sub-slot's start cutoff in {@link selectNextSubslot}.
   *
   * Single-block mode (`blockDuration` undefined): `attestation_deadline - 2 * min_block_duration`,
   * matching {@link selectNextSubslot}'s single-block branch (which needs `min_block_duration` for
   * execution and another for re-execution before the attestation deadline). This keeps the build-entry
   * start gate from abandoning a slot that {@link selectNextSubslot} would still allow to start.
   */
  public getStartDeadline(slot: SlotNumber): number {
    return this.blockDuration === undefined
      ? this.getAttestationDeadline(slot) - 2 * this.minBlockDuration
      : this.getLastBlockBuildTime(slot) - this.minBlockDuration;
  }

  /** Ideal L1 publish/send time: `target_slot_start - E`. Also the ideal attestation-receipt target. */
  public getL1PublishIdealTime(slot: SlotNumber): number {
    return this.getTargetSlotStart(slot) - this.ethereumSlotDuration;
  }

  /**
   * Build deadline for sub-slot `k` (zero-based): `build_frame_start + init + (k + 1) * D`.
   *
   * The `init` (`checkpoint_proposal_init_time`) offset reserves the proposer's sync/proposer-check/init
   * budget at the start of the build frame, so the first sub-slot still has its full duration once the
   * prologue finishes rather than being eaten by it.
   */
  public getBlockBuildDeadline(slot: SlotNumber, blockIndex: number): number {
    return (
      this.getBuildFrameStart(slot) +
      this.checkpointProposalInitTime +
      (blockIndex + 1) * this.requireBlockDurationForSchedule()
    );
  }

  /** Latest time to keep waiting for txs for sub-slot `k`: `block_build_deadline(k) - min_block_duration`. */
  public getWaitForTxsDeadline(slot: SlotNumber, blockIndex: number): number {
    return this.getBlockBuildDeadline(slot, blockIndex) - this.minBlockDuration;
  }

  /** Maximum number of full-duration block sub-slots for this timing config. */
  public getMaxBlocksPerCheckpoint(): number {
    return this.maxBlocksPerCheckpoint;
  }

  /**
   * Selects the next block sub-slot to build for the target slot given the current wall-clock time.
   *
   * Scans sub-slots in order and picks the first whose build deadline is at least `min_block_duration`
   * in the future. Sub-slots with insufficient remaining headroom are skipped.
   *
   * When enforcement is disabled, always allows building a single block with no deadline (test/sandbox
   * mode). In single-block mode (`blockDuration === undefined`) enforced, splits the remaining time
   * between execution and re-execution against the attestation deadline.
   *
   * @param slot - Target slot the checkpoint commits to.
   * @param now - Current wall-clock time in seconds.
   */
  public selectNextSubslot(slot: SlotNumber, now: number): SubslotSelection {
    if (!this.enforce) {
      return { canStart: true, index: 0, deadline: undefined, isLastBlock: true };
    }

    if (this.blockDuration === undefined) {
      // Single-block enforced mode: execution and re-execution run sequentially, so split the time
      // remaining until the attestation deadline in half.
      const maxAllowed = this.getAttestationDeadline(slot);
      const available = (maxAllowed - now) / 2;
      const canStart = available >= this.minBlockDuration;
      return canStart
        ? { canStart: true, index: 0, deadline: now + available, isLastBlock: true }
        : { canStart: false, index: undefined, deadline: undefined, isLastBlock: false };
    }

    const maxBlocks = this.maxBlocksPerCheckpoint;
    for (let index = 0; index < maxBlocks; index++) {
      const deadline = this.getBlockBuildDeadline(slot, index);
      if (deadline - now >= this.minBlockDuration) {
        const isLastBlock = index === maxBlocks - 1;
        return { canStart: true, index, deadline, isLastBlock };
      }
    }

    return { canStart: false, index: undefined, deadline: undefined, isLastBlock: false };
  }

  private requireBlockDurationForSchedule(): number {
    if (this.blockDuration === undefined) {
      throw new Error('blockDuration is required for sub-slot scheduling');
    }
    return this.blockDuration;
  }
}
