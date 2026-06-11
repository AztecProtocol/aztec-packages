import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';

import { getTimestampForSlot } from '../epoch-helpers/index.js';
import {
  type ResolvedTimingBudgets,
  getDefaultCheckpointProposalSyncGrace,
  resolveL1PublishLeadTime,
  resolveTimingBudgets,
} from './budgets.js';
import { ConsensusTimetable, type SlotTimingConstants } from './consensus_timetable.js';

/**
 * Ideal L1 publish/send time for a target slot: `target_slot_start - lead`. Derived directly from
 * slot-timing constants so callers that hold only an {@link SlotTimingConstants} (e.g. the publisher's
 * send scheduler) compute the same value as {@link ProposerTimetable.getL1PublishIdealTime} without
 * constructing a full timetable. The lead is resolved through {@link resolveL1PublishLeadTime}, the single
 * source for the `?? getDefault` fallback.
 */
export function getL1PublishIdealTime(slot: SlotNumber, l1Constants: SlotTimingConstants): number {
  return Number(getTimestampForSlot(slot, l1Constants)) - resolveL1PublishLeadTime(l1Constants);
}

/** Result of selecting the next block sub-slot to build. */
export type SubslotSelection =
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
 *
 * `maxBlocksPerCheckpoint` is computed from the local operational budgets and then clamped down to the optional
 * network-provided value when that value is lower; a network value at or above the computed count leaves the
 * computed count in effect. When clamping down occurs and a logger is supplied, a warning is emitted.
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

  /**
   * Effective maximum number of block sub-slots per checkpoint: the value the local operational budgets compute,
   * clamped down to the explicit network value when that value is lower. A network value above the computed
   * count has no effect (the computed count is used) and is not logged.
   */
  public readonly maxBlocksPerCheckpoint: number;

  constructor(opts: {
    l1Constants: SlotTimingConstants;
    blockDuration: number;
    minBlockDuration: number;
    p2pPropagationTime: number;
    checkpointProposalPrepareTime: number;
    checkpointProposalInitTime: number;
    checkpointProposalSyncGrace?: number;
    /** Explicit network max blocks per checkpoint; the effective value is clamped down to this when it is lower. */
    maxBlocksPerCheckpoint?: number;
    /** Optional logger; warns when the local budgets compute more blocks than the network value allows. */
    logger?: Logger;
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

    // Clamp min block duration to the block duration so a single sub-slot is always startable.
    this.minBlockDuration = Math.min(budgets.minBlockDuration, this.blockDuration);

    const computed = this.computeMaxBlocksPerCheckpoint();
    this.maxBlocksPerCheckpoint =
      opts.maxBlocksPerCheckpoint !== undefined ? Math.min(computed, opts.maxBlocksPerCheckpoint) : computed;
    if (opts.maxBlocksPerCheckpoint !== undefined && opts.maxBlocksPerCheckpoint < computed) {
      opts.logger?.warn(`Locally computed max blocks per checkpoint clamped down to the network-provided value`, {
        computed,
        maxBlocksPerCheckpoint: opts.maxBlocksPerCheckpoint,
      });
    }
    if (this.maxBlocksPerCheckpoint < 1) {
      throw new Error(
        `Invalid timing configuration: derived ${this.maxBlocksPerCheckpoint} blocks per checkpoint for ` +
          `slot duration ${this.aztecSlotDuration}s and block duration ${this.blockDuration}s.`,
      );
    }
  }

  /**
   * Computes the maximum number of full-duration block sub-slots in a checkpoint from the already-resolved
   * budgets. Derived from the spec's `max_blocks_per_checkpoint = floor((last_block_build_time -
   * first_subslot_start) / D)`, where the first sub-slot starts one `checkpoint_proposal_init_time` (`init`)
   * after `build_frame_start`, so it simplifies to `floor((S - init - D - 2P - prepCp) / D)`.
   */
  private computeMaxBlocksPerCheckpoint(): number {
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
   * `l1_publish_ideal_time - D - 2P - prepCp` (= `checkpoint_proposal_send_time - prepCp`). Derived from the
   * ideal L1 publish time so it tracks `lead`; the proposer sizes block production around the ideal
   * L1-publish path only.
   */
  public getLastBlockBuildTime(slot: SlotNumber): number {
    return (
      this.getL1PublishIdealTime(slot) -
      this.blockDuration -
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
   */
  public getBuildStartDeadline(slot: SlotNumber): number {
    return this.getLastBlockBuildTime(slot) - this.minBlockDuration;
  }

  /** Ideal L1 publish/send time: `target_slot_start - lead`. Also the ideal attestation-receipt target. */
  public getL1PublishIdealTime(slot: SlotNumber): number {
    return getL1PublishIdealTime(slot, this.getL1Constants());
  }

  /**
   * Build deadline for sub-slot `k` (zero-based): `build_frame_start + init + (k + 1) * D`.
   *
   * The `init` (`checkpoint_proposal_init_time`) offset reserves the proposer's sync/proposer-check/init
   * budget at the start of the build frame, so the first sub-slot still has its full duration once the
   * prologue finishes rather than being eaten by it.
   */
  public getBlockBuildDeadline(slot: SlotNumber, blockIndex: number): number {
    return this.getBuildFrameStart(slot) + this.checkpointProposalInitTime + (blockIndex + 1) * this.blockDuration;
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
   * @param slot - Target slot the checkpoint commits to.
   * @param now - Current wall-clock time in seconds.
   */
  public selectNextSubslot(slot: SlotNumber, now: number): SubslotSelection {
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
}
