/**
 * Timetable constants used for sequencer timing calculations.
 * These define the time budgets for various phases of block production.
 *
 * The sequencer slot is divided into phases:
 * 1. Checkpoint initialization (sync + proposer check)
 * 2. Block building (execution)
 * 3. Checkpoint assembly
 * 4. P2P propagation for proposal and attestations (round-trip)
 * 5. L1 publishing
 */

/** Time budget for checkpoint initialization (sync + proposer check) in seconds */
export const CHECKPOINT_INITIALIZATION_TIME = 1;

/** Time budget for assembling a checkpoint after building the last block in seconds */
export const CHECKPOINT_ASSEMBLE_TIME = 1;

/** Default one-way P2P propagation time for proposals and attestations in seconds */
export const DEFAULT_P2P_PROPAGATION_TIME = 2;

/** Default L1 publishing time (matches Ethereum slot duration on mainnet) in seconds */
export const DEFAULT_L1_PUBLISHING_TIME = 12;

/** Minimum execution time for building a block in seconds */
export const MIN_EXECUTION_TIME = 2;

export type CheckpointTimingConfig = {
  aztecSlotDuration: number;
  blockDuration?: number;
  lastBlockDuration?: number;
  checkpointAssembleTime?: number;
  checkpointInitializationTime?: number;
  l1PublishingTime?: number;
  minExecutionTime?: number;
  p2pPropagationTime?: number;
  pipelining?: boolean;
};

/**
 * Shared checkpoint timing model used by the sequencer timetable and P2P validators.
 *
 * All offsets are measured from the build-slot start timestamp, except for the
 * `pipelined*WindowIntoTargetSlot` getters, which are measured from the start of
 * the current target slot.
 */
export class CheckpointTimingModel {
  public readonly aztecSlotDuration: number;
  public readonly blockDuration: number | undefined;
  public readonly lastBlockDuration: number | undefined;
  public readonly checkpointAssembleTime: number;
  public readonly checkpointInitializationTime: number;
  public readonly l1PublishingTime: number;
  public readonly minExecutionTime: number;
  public readonly p2pPropagationTime: number;
  public readonly pipelining: boolean;

  constructor(opts: CheckpointTimingConfig) {
    this.aztecSlotDuration = opts.aztecSlotDuration;
    this.blockDuration = opts.blockDuration;
    this.lastBlockDuration =
      opts.lastBlockDuration !== undefined && this.blockDuration !== undefined && opts.lastBlockDuration < this.blockDuration
        ? opts.lastBlockDuration
        : this.blockDuration;
    this.checkpointAssembleTime = opts.checkpointAssembleTime ?? CHECKPOINT_ASSEMBLE_TIME;
    this.checkpointInitializationTime = opts.checkpointInitializationTime ?? CHECKPOINT_INITIALIZATION_TIME;
    this.l1PublishingTime = opts.l1PublishingTime ?? DEFAULT_L1_PUBLISHING_TIME;
    this.minExecutionTime = opts.minExecutionTime ?? MIN_EXECUTION_TIME;
    this.p2pPropagationTime = opts.p2pPropagationTime ?? DEFAULT_P2P_PROPAGATION_TIME;
    this.pipelining = opts.pipelining ?? false;
  }

  public get checkpointFinalizationTime(): number {
    return this.checkpointAssembleTime + this.p2pPropagationTime * 2 + this.l1PublishingTime;
  }

  public get pipeliningAttestationGracePeriod(): number {
    return (this.blockDuration ?? 0) + this.p2pPropagationTime;
  }

  public get timeReservedAtEnd(): number {
    if (this.pipelining) {
      return this.checkpointAssembleTime + this.p2pPropagationTime;
    }

    return (this.lastBlockDuration ?? this.blockDuration ?? 0) + this.checkpointFinalizationTime;
  }

  public get minimumBuildSlotWork(): number {
    return (
      this.checkpointInitializationTime +
      this.minExecutionTime * 2 +
      (this.pipelining ? 0 : this.checkpointFinalizationTime)
    );
  }

  public get initializeDeadline(): number {
    return this.aztecSlotDuration - this.minimumBuildSlotWork;
  }

  public get checkpointAssemblyDeadline(): number {
    if (this.pipelining) {
      return this.aztecSlotDuration + this.pipeliningAttestationGracePeriod;
    }

    return this.aztecSlotDuration - this.l1PublishingTime - 2 * this.p2pPropagationTime;
  }

  public get checkpointAttestationStartDeadline(): number {
    return this.checkpointAssemblyDeadline;
  }

  public get checkpointAttestationDeadline(): number {
    if (this.pipelining) {
      return this.aztecSlotDuration * 2 - this.l1PublishingTime;
    }

    return this.aztecSlotDuration - this.l1PublishingTime;
  }

  public get checkpointPublishingDeadline(): number {
    if (this.pipelining) {
      return this.aztecSlotDuration * 2 - this.l1PublishingTime;
    }

    return this.aztecSlotDuration - this.l1PublishingTime;
  }

  public get pipelinedProposalWindowIntoTargetSlot(): number {
    return this.p2pPropagationTime;
  }

  public get pipelinedAttestationWindowIntoTargetSlot(): number {
    return this.aztecSlotDuration - this.l1PublishingTime;
  }

  public calculateMaxBlocksPerSlot(): number {
    if (!this.blockDuration) {
      return 1;
    }

    const timeAvailableForBlocks = this.aztecSlotDuration - this.checkpointInitializationTime - this.timeReservedAtEnd;
    if (this.lastBlockDuration !== undefined && this.lastBlockDuration < this.blockDuration) {
      return Math.max(1, Math.floor((timeAvailableForBlocks - this.lastBlockDuration) / this.blockDuration) + 1);
    }

    return Math.max(1, Math.floor(timeAvailableForBlocks / this.blockDuration));
  }
}

/**
 * Calculates the maximum number of blocks that can be built in a slot.
 * Used by both the sequencer timetable and p2p gossipsub scoring.
 *
 * @param aztecSlotDurationSec - Aztec slot duration in seconds
 * @param blockDurationSec - Duration per block in seconds (undefined = single block mode)
 * @param opts - Optional overrides for timing constants
 * @returns Maximum number of blocks per slot
 */
export function calculateMaxBlocksPerSlot(
  aztecSlotDurationSec: number,
  blockDurationSec: number | undefined,
  opts: {
    checkpointInitializationTime?: number;
    checkpointAssembleTime?: number;
    p2pPropagationTime?: number;
    l1PublishingTime?: number;
    pipelining?: boolean;
    lastBlockDurationSec?: number;
  } = {},
): number {
  return new CheckpointTimingModel({
    aztecSlotDuration: aztecSlotDurationSec,
    blockDuration: blockDurationSec,
    lastBlockDuration: opts.lastBlockDurationSec,
    checkpointAssembleTime: opts.checkpointAssembleTime,
    checkpointInitializationTime: opts.checkpointInitializationTime,
    l1PublishingTime: opts.l1PublishingTime,
    p2pPropagationTime: opts.p2pPropagationTime,
    pipelining: opts.pipelining,
  }).calculateMaxBlocksPerSlot();
}
