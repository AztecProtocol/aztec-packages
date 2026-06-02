import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { Logger } from '@aztec/foundation/log';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { ProposerTimetable, type SubslotSelection } from '@aztec/stdlib/timetable';

/**
 * Proposer-side timetable for the sequencer.
 *
 * Thin adapter over {@link ProposerTimetable} that resolves block sub-slot scheduling, ideal-path
 * start/build deadlines, and the single consensus attestation deadline for a target slot. All getters
 * return absolute wall-clock timestamps in seconds (callers wrap in `Date`).
 */
export class SequencerTimetable {
  private readonly timetable: ProposerTimetable;

  /** Maximum number of blocks that can be built in this slot configuration. */
  public readonly maxNumberOfBlocks: number;

  /** Minimum block-building time (`min_block_duration`) in seconds. */
  public readonly minBlockDuration: number;

  /** Whether the proposer enforces sub-slot/start deadlines. */
  public readonly enforce: boolean;

  constructor(
    opts: {
      l1Constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>;
      blockDurationMs?: number;
      minBlockDuration?: number;
      p2pPropagationTime?: number;
      checkpointProposalPrepareTime?: number;
      enforce: boolean;
    },
    private readonly log?: Logger,
  ) {
    this.timetable = new ProposerTimetable({
      l1Constants: opts.l1Constants,
      blockDuration: opts.blockDurationMs !== undefined ? opts.blockDurationMs / 1000 : undefined,
      minBlockDuration: opts.minBlockDuration,
      p2pPropagationTime: opts.p2pPropagationTime,
      checkpointProposalPrepareTime: opts.checkpointProposalPrepareTime,
      enforce: opts.enforce,
    });

    this.maxNumberOfBlocks = this.timetable.getMaxBlocksPerCheckpoint();
    this.minBlockDuration = this.timetable.minBlockDuration;
    this.enforce = opts.enforce;

    this.log?.info(
      `Sequencer timetable initialized with ${this.maxNumberOfBlocks} blocks per slot (${this.enforce ? 'enforced' : 'not enforced'})`,
      {
        aztecSlotDuration: this.timetable.aztecSlotDuration,
        ethereumSlotDuration: this.timetable.ethereumSlotDuration,
        blockDuration: this.timetable.blockDuration,
        minBlockDuration: this.minBlockDuration,
        p2pPropagationTime: this.timetable.p2pPropagationTime,
        checkpointProposalPrepareTime: this.timetable.checkpointProposalPrepareTime,
        maxNumberOfBlocks: this.maxNumberOfBlocks,
        enforce: this.enforce,
      },
    );

    if (this.maxNumberOfBlocks < 1) {
      throw new Error(
        `Invalid timing configuration: derived ${this.maxNumberOfBlocks} blocks per checkpoint for slot duration ` +
          `${this.timetable.aztecSlotDuration}s and block duration ${this.timetable.blockDuration}s.`,
      );
    }
  }

  /**
   * Selects the next block sub-slot to build for the target slot given the current wall-clock time.
   * Sub-slot deadlines in the result are absolute timestamps in seconds.
   */
  public selectNextSubslot(targetSlot: SlotNumber, now: number): SubslotSelection {
    return this.timetable.selectNextSubslot(targetSlot, now);
  }

  /** Latest start time at which the proposer can still build one minimum-duration block (absolute seconds). */
  public getStartDeadline(targetSlot: SlotNumber): number {
    return this.timetable.getStartDeadline(targetSlot);
  }

  /** Latest time to keep waiting for txs for sub-slot `index` (absolute seconds). */
  public getWaitForTxsDeadline(targetSlot: SlotNumber, index: number): number {
    return this.timetable.getWaitForTxsDeadline(targetSlot, index);
  }

  /**
   * Single hard consensus deadline for re-execution/validation/signing and the proposer's attestation
   * collection cutoff: `target_slot_start + S - 2E` (absolute seconds).
   */
  public getAttestationDeadline(targetSlot: SlotNumber): number {
    return this.timetable.getAttestationDeadline(targetSlot);
  }
}
