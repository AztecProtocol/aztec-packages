import type { SlotNumber } from '@aztec/foundation/branded-types';

import { type L1RollupConstants, getTimestampForSlot } from '../epoch-helpers/index.js';
import { getDefaultCheckpointProposalSyncGrace } from './budgets.js';

/** Slot-timing protocol constants the timetables derive wall-clock times from. */
export type SlotTimingConstants = Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>;

/**
 * Consensus acceptance bounds for the pipelined timetable.
 *
 * Returns the deadlines and matching receive-window lower bounds that validators and p2p use to decide
 * whether a proposal or attestation is acceptable for a given target slot. All getters take a target slot
 * and return an absolute wall-clock timestamp in seconds.
 *
 * Inputs are protocol slot-timing constants only (`genesis`, `aztec_slot_duration`,
 * `ethereum_slot_duration`, `block_duration`, `checkpoint_proposal_sync_grace`); no operational budgets, so every
 * node agrees on these bounds. See `stdlib/src/timetable/README.md` for the timing model.
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

  /** Consensus grace for received checkpoint proposals to materialize into local proposed state. */
  public readonly checkpointProposalSyncGrace: number;

  constructor(opts: {
    l1Constants: SlotTimingConstants;
    blockDuration: number | undefined;
    checkpointProposalSyncGrace?: number;
  }) {
    const { l1Constants, blockDuration } = opts;
    const checkpointProposalSyncGrace =
      opts.checkpointProposalSyncGrace ?? getDefaultCheckpointProposalSyncGrace(blockDuration);
    if (l1Constants.slotDuration <= 0) {
      throw new Error(`aztecSlotDuration must be positive (got ${l1Constants.slotDuration})`);
    }
    if (l1Constants.ethereumSlotDuration <= 0) {
      throw new Error(`ethereumSlotDuration must be positive (got ${l1Constants.ethereumSlotDuration})`);
    }
    if (blockDuration !== undefined && blockDuration <= 0) {
      throw new Error(`blockDuration must be positive when provided (got ${blockDuration})`);
    }
    if (checkpointProposalSyncGrace < 0) {
      throw new Error(`checkpointProposalSyncGrace must be non-negative (got ${checkpointProposalSyncGrace})`);
    }

    this.aztecSlotDuration = l1Constants.slotDuration;
    this.ethereumSlotDuration = l1Constants.ethereumSlotDuration;
    this.blockDuration = blockDuration;
    this.genesisTime = l1Constants.l1GenesisTime;
    this.checkpointProposalSyncGrace = checkpointProposalSyncGrace;
  }

  /**
   * Build-frame start for the target slot: `target_slot_start - S - E`. Anchors all sub-slot timings.
   * Computed directly (not via a `slot - 1` hop) so it is well-defined for slot 0, whose build frame
   * predates genesis; p2p validators evaluate acceptance windows for arbitrary peer-supplied slots.
   */
  public getBuildFrameStart(slot: SlotNumber): number {
    return this.getTargetSlotStart(slot) - this.aztecSlotDuration - this.ethereumSlotDuration;
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
   * Wall-clock deadline by which a received checkpoint proposal should have materialized into local proposed
   * state. This is `next_proposer_build_frame_start + checkpointProposalSyncGrace`, rounded up to the next
   * integer second because L1 timestamps and archiver comparisons are second-granularity.
   */
  public getCheckpointProposalSyncedDeadline(slot: SlotNumber): number {
    return Math.ceil(
      this.getCheckpointProposalReceiveDeadline(slot) + (this.blockDuration ?? 0) + this.checkpointProposalSyncGrace,
    );
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
