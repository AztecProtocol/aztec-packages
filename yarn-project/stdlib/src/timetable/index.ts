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
  ethereumSlotDuration?: number;
  blockDuration?: number;
  checkpointAssembleTime?: number;
  checkpointInitializationTime?: number;
  l1PublishingTime?: number;
  minExecutionTime?: number;
  p2pPropagationTime?: number;
};

export interface CheckpointTiming {
  readonly aztecSlotDuration: number;
  readonly blockDuration: number | undefined;
  readonly checkpointAssembleTime: number;
  readonly checkpointInitializationTime: number;
  readonly l1PublishingTime: number;
  readonly minExecutionTime: number;
  readonly p2pPropagationTime: number;
  readonly checkpointFinalizationTime: number;
  readonly pipeliningAttestationGracePeriod: number;
  readonly timeReservedAtEnd: number;
  readonly minimumBuildSlotWork: number;
  readonly initializeDeadline: number;
  readonly checkpointAssemblyDeadline: number;
  readonly checkpointAttestationStartDeadline: number;
  readonly checkpointAttestationDeadline: number;
  readonly checkpointPublishingDeadline: number;

  calculateMaxBlocksPerSlot(): number;
}

export interface PipelinedCheckpointTiming extends CheckpointTiming {
  readonly proposalWindowIntoTargetSlot: number;
  readonly attestationWindowIntoTargetSlot: number;
}

/**
 * Checkpoint timing model for proposer pipelining.
 *
 * The build work starts at the wall-clock slot boundary and the checkpoint
 * proposal is broadcast early enough that attestations complete by the end of
 * the build slot. L1 submission can then be sent at the boundary of the target
 * slot. The target-slot window getters are intended for consumers such as P2P
 * validators that need to validate pipelined messages against wallclock time.
 */
class CheckpointTimingModel implements PipelinedCheckpointTiming {
  public readonly aztecSlotDuration: number;
  public readonly blockDuration: number | undefined;
  public readonly checkpointAssembleTime: number;
  public readonly checkpointInitializationTime: number;
  public readonly l1PublishingTime: number;
  public readonly minExecutionTime: number;
  public readonly p2pPropagationTime: number;

  constructor(opts: CheckpointTimingConfig) {
    this.aztecSlotDuration = opts.aztecSlotDuration;
    this.blockDuration = opts.blockDuration;

    this.checkpointAssembleTime = opts.checkpointAssembleTime ?? CHECKPOINT_ASSEMBLE_TIME;
    this.checkpointInitializationTime = opts.checkpointInitializationTime ?? CHECKPOINT_INITIALIZATION_TIME;
    this.l1PublishingTime = opts.l1PublishingTime ?? DEFAULT_L1_PUBLISHING_TIME;
    this.minExecutionTime = opts.minExecutionTime ?? MIN_EXECUTION_TIME;
    this.p2pPropagationTime = opts.p2pPropagationTime ?? DEFAULT_P2P_PROPAGATION_TIME;
  }

  public get checkpointFinalizationTime(): number {
    // Allow enough time to
    // - build the checkpoint
    // - Round-trip over p2p
    // - Publish to L1
    return this.checkpointAssembleTime + this.p2pPropagationTime * 2 + this.l1PublishingTime;
  }

  public get proposalWindowIntoTargetSlot(): number {
    // Proposals no longer spill into the target slot: they are broadcast early
    // enough in the build slot that attestations complete before the boundary.
    // Any residual tolerance into the target slot is covered by clock disparity.
    return 0;
  }

  public get attestationWindowIntoTargetSlot(): number {
    // Straggler grace: attestations aim to complete by build-slot end. Allow a
    // small window into the target slot for late arrivals (round-trip p2p).
    return 2 * this.p2pPropagationTime;
  }

  public get pipeliningAttestationGracePeriod(): number {
    // Under the early-pipelining regime attestations complete inside the build
    // slot itself, so there is no extra grace into the target slot.
    return 0;
  }

  public get timeReservedAtEnd(): number {
    // Reserve enough time at the end of the build slot for:
    // - assembling and broadcasting the checkpoint proposal
    // - round-trip p2p propagation (proposal out, attestations back)
    // - validators re-executing the last block
    return this.checkpointAssembleTime + 2 * this.p2pPropagationTime + (this.blockDuration ?? 0);
  }

  public get minimumBuildSlotWork(): number {
    return this.checkpointInitializationTime + this.minExecutionTime * 2;
  }

  public get initializeDeadline(): number {
    return this.aztecSlotDuration - this.minimumBuildSlotWork;
  }

  public get checkpointAssemblyDeadline(): number {
    // Allow enough time to build all blocks and receive attestations. With
    // `pipeliningAttestationGracePeriod = 0` this equals `aztecSlotDuration`.
    return this.aztecSlotDuration + this.pipeliningAttestationGracePeriod;
  }

  public get checkpointAttestationStartDeadline(): number {
    return this.checkpointAssemblyDeadline;
  }

  public get checkpointAttestationDeadline(): number {
    // Allowed to be into the next wallclock slot minus the allocated l1 publishing time
    return this.aztecSlotDuration * 2 - this.l1PublishingTime;
  }

  public get checkpointPublishingDeadline(): number {
    // Allowed to be into the next wallclock slot minus the allocated l1 Publishing time
    return this.aztecSlotDuration * 2 - this.l1PublishingTime;
  }

  public calculateMaxBlocksPerSlot(): number {
    if (!this.blockDuration) {
      return 1;
    }

    const timeAvailableForBlocks = this.aztecSlotDuration - this.checkpointInitializationTime - this.timeReservedAtEnd;
    return Math.floor(timeAvailableForBlocks / this.blockDuration);
  }
}

/**
 * Creates a checkpoint timing model.
 *
 * Most callers should use this factory and depend only on the shared
 * `CheckpointTiming` interface.
 */
export function createCheckpointTimingModel(opts: CheckpointTimingConfig): CheckpointTiming {
  return createPipelinedCheckpointTimingModel(opts);
}

/**
 * Creates a checkpoint timing model exposing the target-slot window accessors.
 *
 * Use this when the caller specifically needs the pipelined timing surface, such
 * as proposal or attestation acceptance windows into the target slot.
 */
export function createPipelinedCheckpointTimingModel(opts: CheckpointTimingConfig): PipelinedCheckpointTiming {
  validateCheckpointTimingConfig(opts);
  const normalizedOpts = normalizeCheckpointTimingConfig(opts);

  const timing = new CheckpointTimingModel(normalizedOpts);
  validateCheckpointTimingModel(timing);
  return timing;
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
  } = {},
): number {
  return createCheckpointTimingModel({
    aztecSlotDuration: aztecSlotDurationSec,
    blockDuration: blockDurationSec,
    checkpointAssembleTime: opts.checkpointAssembleTime,
    checkpointInitializationTime: opts.checkpointInitializationTime,
    l1PublishingTime: opts.l1PublishingTime,
    p2pPropagationTime: opts.p2pPropagationTime,
  }).calculateMaxBlocksPerSlot();
}

function assertNonNegative(name: string, value: number): void {
  if (value < 0) {
    throw new Error(`${name} must be non-negative (got ${value})`);
  }
}

function validateCheckpointTimingConfig(opts: CheckpointTimingConfig): void {
  if (opts.aztecSlotDuration <= 0) {
    throw new Error(`aztecSlotDuration must be positive (got ${opts.aztecSlotDuration})`);
  }

  if (opts.ethereumSlotDuration !== undefined && opts.ethereumSlotDuration <= 0) {
    throw new Error(`ethereumSlotDuration must be positive when provided (got ${opts.ethereumSlotDuration})`);
  }

  if (opts.blockDuration !== undefined && opts.blockDuration <= 0) {
    throw new Error(`blockDuration must be positive when provided (got ${opts.blockDuration})`);
  }

  if (opts.minExecutionTime !== undefined && opts.minExecutionTime <= 0) {
    throw new Error(`minExecutionTime must be positive when provided (got ${opts.minExecutionTime})`);
  }

  if (opts.checkpointAssembleTime !== undefined) {
    assertNonNegative('checkpointAssembleTime', opts.checkpointAssembleTime);
  }
  if (opts.checkpointInitializationTime !== undefined) {
    assertNonNegative('checkpointInitializationTime', opts.checkpointInitializationTime);
  }
  if (opts.l1PublishingTime !== undefined) {
    assertNonNegative('l1PublishingTime', opts.l1PublishingTime);
  }
  if (opts.p2pPropagationTime !== undefined) {
    assertNonNegative('p2pPropagationTime', opts.p2pPropagationTime);
  }
}

function normalizeCheckpointTimingConfig(opts: CheckpointTimingConfig): CheckpointTimingConfig {
  let checkpointAssembleTime = opts.checkpointAssembleTime ?? CHECKPOINT_ASSEMBLE_TIME;
  let checkpointInitializationTime = opts.checkpointInitializationTime ?? CHECKPOINT_INITIALIZATION_TIME;
  let minExecutionTime = opts.minExecutionTime ?? MIN_EXECUTION_TIME;
  let p2pPropagationTime = opts.p2pPropagationTime ?? DEFAULT_P2P_PROPAGATION_TIME;

  if (opts.ethereumSlotDuration !== undefined && opts.ethereumSlotDuration < 8) {
    p2pPropagationTime = 0;
    checkpointAssembleTime = 0.5;
    checkpointInitializationTime = 0.5;
    minExecutionTime = 1;
  }

  if (opts.blockDuration !== undefined && minExecutionTime > opts.blockDuration) {
    minExecutionTime = opts.blockDuration;
  }

  return {
    ...opts,
    checkpointAssembleTime,
    checkpointInitializationTime,
    minExecutionTime,
    p2pPropagationTime,
  };
}

function validateCheckpointTimingModel(model: CheckpointTiming): void {
  if (model.blockDuration === undefined) {
    return;
  }

  const timeAvailableForBlocks = model.aztecSlotDuration - model.checkpointInitializationTime - model.timeReservedAtEnd;
  if (timeAvailableForBlocks < model.blockDuration) {
    throw new Error(
      `Invalid timing configuration: only ${timeAvailableForBlocks}s available for block building, which is less than one blockDuration (${model.blockDuration}s).`,
    );
  }
}
