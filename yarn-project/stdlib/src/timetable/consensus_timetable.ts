import type { SlotNumber } from '@aztec/foundation/branded-types';

import { type L1RollupConstants, getTimestampForSlot } from '../epoch-helpers/index.js';
import { getDefaultCheckpointProposalSyncGrace, getDefaultL1PublishLeadTime } from './budgets.js';

/**
 * Slot-timing protocol constants the timetables derive wall-clock times from. `l1PublishLeadTime` is optional:
 * when omitted, the timetable resolves it deterministically via `getDefaultL1PublishLeadTime` so every node
 * agrees on the consensus deadlines that depend on it.
 */
export type SlotTimingConstants = Pick<
  L1RollupConstants,
  'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration' | 'l1PublishLeadTime'
>;

/**
 * Consensus acceptance bounds for the pipelined timetable.
 *
 * Returns the deadlines and matching receive-window lower bounds that validators and p2p use to decide
 * whether a proposal or attestation is acceptable for a given target slot. All getters take a target slot
 * and return an absolute wall-clock timestamp in seconds.
 *
 * Inputs are protocol slot-timing constants only (`genesis`, `aztec_slot_duration`,
 * `ethereum_slot_duration`, `l1_publish_lead_time`, `block_duration`, `checkpoint_proposal_sync_grace`); no
 * operational budgets, so every node agrees on these bounds. See `stdlib/src/timetable/README.md` for the
 * timing model.
 */
export class ConsensusTimetable {
  /** Aztec slot duration (`S`) in seconds. */
  public readonly aztecSlotDuration: number;

  /** Ethereum slot duration (`E`) in seconds. */
  public readonly ethereumSlotDuration: number;

  /**
   * How far before the target L2 slot the L1 publish transaction is ideally broadcast (`lead`), in seconds.
   * The single anchor for the whole publish path; a network consensus value satisfying `0 < lead < E`. When
   * not supplied it defaults to `getDefaultL1PublishLeadTime(E)` so every node derives the same value.
   */
  public readonly l1PublishLeadTime: number;

  /** Block sub-slot duration (`D`) in seconds. */
  public readonly blockDuration: number;

  /** L1 genesis timestamp in seconds (`genesis`), the anchor all slot timings derive from. */
  public readonly genesisTime: bigint;

  /** Consensus grace for received checkpoint proposals to materialize into local proposed state. */
  public readonly checkpointProposalSyncGrace: number;

  constructor(opts: { l1Constants: SlotTimingConstants; blockDuration: number; checkpointProposalSyncGrace?: number }) {
    const { l1Constants, blockDuration } = opts;
    const checkpointProposalSyncGrace =
      opts.checkpointProposalSyncGrace ?? getDefaultCheckpointProposalSyncGrace(blockDuration);
    const l1PublishLeadTime =
      l1Constants.l1PublishLeadTime ?? getDefaultL1PublishLeadTime(l1Constants.ethereumSlotDuration);
    if (l1Constants.slotDuration <= 0) {
      throw new Error(`aztecSlotDuration must be positive (got ${l1Constants.slotDuration})`);
    }
    if (l1Constants.ethereumSlotDuration <= 0) {
      throw new Error(`ethereumSlotDuration must be positive (got ${l1Constants.ethereumSlotDuration})`);
    }
    if (l1PublishLeadTime <= 0 || l1PublishLeadTime >= l1Constants.ethereumSlotDuration) {
      throw new Error(
        `l1PublishLeadTime must satisfy 0 < lead < ethereumSlotDuration (got ${l1PublishLeadTime}, ` +
          `ethereumSlotDuration ${l1Constants.ethereumSlotDuration})`,
      );
    }
    if (blockDuration <= 0) {
      throw new Error(`blockDuration must be positive (got ${blockDuration})`);
    }
    if (checkpointProposalSyncGrace < 0) {
      throw new Error(`checkpointProposalSyncGrace must be non-negative (got ${checkpointProposalSyncGrace})`);
    }

    this.aztecSlotDuration = l1Constants.slotDuration;
    this.ethereumSlotDuration = l1Constants.ethereumSlotDuration;
    this.l1PublishLeadTime = l1PublishLeadTime;
    this.blockDuration = blockDuration;
    this.genesisTime = l1Constants.l1GenesisTime;
    this.checkpointProposalSyncGrace = checkpointProposalSyncGrace;
  }

  /**
   * Build-frame start for the target slot: `target_slot_start - S - lead`. Anchors all sub-slot timings.
   * Computed directly (not via a `slot - 1` hop) so it is well-defined for slot 0, whose build frame
   * predates genesis; p2p validators evaluate acceptance windows for arbitrary peer-supplied slots.
   */
  public getBuildFrameStart(slot: SlotNumber): number {
    return this.getTargetSlotStart(slot) - this.aztecSlotDuration - this.l1PublishLeadTime;
  }

  /** Start of the target slot: `genesis + slot * S`. */
  public getTargetSlotStart(slot: SlotNumber): number {
    return Number(getTimestampForSlot(slot, this.getL1Constants()));
  }

  /**
   * Earliest acceptable arrival for a checkpoint proposal: `target_slot_start - S - lead` (the build frame
   * opening). Nothing legitimate for this slot exists before its build frame opens.
   */
  public getCheckpointProposalReceiveStart(slot: SlotNumber): number {
    return this.getBuildFrameStart(slot);
  }

  /**
   * Hard consensus receive deadline for a checkpoint proposal: `target_slot_start - lead - D` (the next
   * proposer's build frame start minus one block duration). Validators reject proposals arriving after this,
   * and the next proposer does not build on them.
   */
  public getCheckpointProposalReceiveDeadline(slot: SlotNumber): number {
    return this.getTargetSlotStart(slot) - this.l1PublishLeadTime - this.blockDuration;
  }

  /**
   * Wall-clock deadline by which a received checkpoint proposal should have materialized into local proposed
   * state. This is `next_proposer_build_frame_start + checkpointProposalSyncGrace`, rounded up to the next
   * integer second because L1 timestamps and archiver comparisons are second-granularity.
   */
  public getCheckpointProposalSyncedDeadline(slot: SlotNumber): number {
    return Math.ceil(
      this.getCheckpointProposalReceiveDeadline(slot) + this.blockDuration + this.checkpointProposalSyncGrace,
    );
  }

  /**
   * Earliest acceptable arrival for an attestation: `target_slot_start - S - lead` (the build frame
   * opening). Deliberately liberal; attestations are attributed by content, not timing.
   */
  public getAttestationReceiveStart(slot: SlotNumber): number {
    return this.getBuildFrameStart(slot);
  }

  /**
   * Single hard consensus deadline: `target_slot_start + S - E - lead` (the target slot's last Ethereum
   * block minus one lead). The latest the checkpoint can still land on L1 in the target slot, and the cutoff
   * by which every block and the checkpoint must be re-executed, validated, and signed. Consensus-driven
   * (used for inactivity/slashing decisions).
   */
  public getAttestationDeadline(slot: SlotNumber): number {
    return this.getTargetSlotStart(slot) + this.aztecSlotDuration - this.ethereumSlotDuration - this.l1PublishLeadTime;
  }

  /** Slot-timing protocol constants this timetable derives wall-clock times from. */
  public getL1Constants(): SlotTimingConstants {
    return {
      l1GenesisTime: this.genesisTime,
      slotDuration: this.aztecSlotDuration,
      ethereumSlotDuration: this.ethereumSlotDuration,
      l1PublishLeadTime: this.l1PublishLeadTime,
    };
  }
}
