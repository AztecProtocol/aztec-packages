import type { SlotNumber } from '@aztec/foundation/branded-types';

import { type ResolvedTimingBudgets, getDefaultCheckpointProposalSyncGrace, resolveTimingBudgets } from './budgets.js';
import { ConsensusTimetable, type SlotTimingConstants } from './consensus_timetable.js';

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
    blockDuration: number | undefined;
    minBlockDuration: number;
    p2pPropagationTime: number;
    checkpointProposalPrepareTime: number;
    checkpointProposalInitTime: number;
    checkpointProposalSyncGrace?: number;
    enforce: boolean;
  }) {
    super({
      l1Constants: opts.l1Constants,
      blockDuration: opts.blockDuration,
      checkpointProposalSyncGrace:
        opts.checkpointProposalSyncGrace ?? getDefaultCheckpointProposalSyncGrace(opts.blockDuration),
    });

    // Resolve operational budgets, applying the fast local/e2e profile for low ethereum slot durations so a
    // fast network does not inherit the conservative production budgets (which would shrink the build window).
    const budgets: ResolvedTimingBudgets = resolveTimingBudgets(this.ethereumSlotDuration, {
      minBlockDuration: opts.minBlockDuration,
      p2pPropagationTime: opts.p2pPropagationTime,
      checkpointProposalPrepareTime: opts.checkpointProposalPrepareTime,
      checkpointProposalInitTime: opts.checkpointProposalInitTime,
    });
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
  public getBuildStartDeadline(slot: SlotNumber): number {
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
