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
  pipelining?: boolean;
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
 * Shared base for checkpoint timing implementations.
 *
 * This class owns the common inputs and formulas used by both pipelined and
 * non-pipelined scheduling. Variant-specific deadline math is delegated to the
 * concrete subclasses below.
 */
abstract class BaseCheckpointTiming implements CheckpointTiming {
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

  public get pipeliningAttestationGracePeriod(): number {
    // Allow enough time to
    // - build the block
    // - pass it back over p2p
    return (this.blockDuration ?? 0) + this.p2pPropagationTime;
  }

  public abstract get timeReservedAtEnd(): number;
  public abstract get minimumBuildSlotWork(): number;

  public get initializeDeadline(): number {
    return this.aztecSlotDuration - this.minimumBuildSlotWork;
  }

  public abstract get checkpointAssemblyDeadline(): number;

  public get checkpointAttestationStartDeadline(): number {
    return this.checkpointAssemblyDeadline;
  }

  public abstract get checkpointAttestationDeadline(): number;
  public abstract get checkpointPublishingDeadline(): number;

  public calculateMaxBlocksPerSlot(): number {
    if (!this.blockDuration) {
      return 1;
    }

    const timeAvailableForBlocks = this.aztecSlotDuration - this.checkpointInitializationTime - this.timeReservedAtEnd;
    return Math.floor(timeAvailableForBlocks / this.blockDuration);
  }
}

/**
 * Checkpoint timing model for the non-pipelined sequencer flow.
 *
 * In this mode, checkpoint assembly, attestation collection, and L1 publishing
 * must all complete within the current Aztec slot.
 */
class StandardCheckpointTimingModel extends BaseCheckpointTiming {
  public get timeReservedAtEnd(): number {
    return (this.blockDuration ?? 0) + this.checkpointFinalizationTime;
  }

  public get minimumBuildSlotWork(): number {
    return this.checkpointInitializationTime + this.minExecutionTime * 2 + this.checkpointFinalizationTime;
  }

  public get checkpointAssemblyDeadline(): number {
    return this.aztecSlotDuration - this.l1PublishingTime - 2 * this.p2pPropagationTime;
  }

  public get checkpointAttestationDeadline(): number {
    return this.aztecSlotDuration - this.l1PublishingTime;
  }

  public get checkpointPublishingDeadline(): number {
    return this.aztecSlotDuration - this.l1PublishingTime;
  }
}

/**
 * Checkpoint timing model for proposer pipelining.
 *
 * In this mode, the build work still starts in the current slot, but checkpoint
 * assembly and attestation collection can extend into the target slot. The extra
 * target-slot window getters are intended for consumers such as P2P validators
 * that need to validate pipelined messages against wallclock time.
 */
class PipelinedCheckpointTimingModel extends BaseCheckpointTiming implements PipelinedCheckpointTiming {
  public get proposalWindowIntoTargetSlot(): number {
    // Allow the p2p propagation time to receive a checkpoint proposal from leader
    return this.p2pPropagationTime;
  }

  public get attestationWindowIntoTargetSlot(): number {
    return this.aztecSlotDuration - this.l1PublishingTime;
  }

  public get timeReservedAtEnd(): number {
    return this.checkpointAssembleTime + this.p2pPropagationTime;
  }

  public get minimumBuildSlotWork(): number {
    return this.checkpointInitializationTime + this.minExecutionTime * 2;
  }

  public get checkpointAssemblyDeadline(): number {
    // Allow enough time to
    // - build all blocks
    // - receive attestations
    return this.aztecSlotDuration + this.pipeliningAttestationGracePeriod;
  }

  public get checkpointAttestationDeadline(): number {
    // Allowed to be into the next wallclock slot minus the allocated l1 publishing time
    return this.aztecSlotDuration * 2 - this.l1PublishingTime;
  }

  public get checkpointPublishingDeadline(): number {
    // Allowed to be into the next wallclock slot minus the allocated l1 Publishing time
    return this.aztecSlotDuration * 2 - this.l1PublishingTime;
  }
}

/**
 * Creates a checkpoint timing model for the requested scheduling mode.
 *
 * Most callers should use this factory and depend only on the shared
 * `CheckpointTiming` interface. The returned implementation is selected from
 * `opts.pipelining`.
 */
export function createCheckpointTimingModel(opts: CheckpointTimingConfig): CheckpointTiming {
  validateCheckpointTimingConfig(opts);
  const normalizedOpts = normalizeCheckpointTimingConfig(opts);

  const timing = normalizedOpts.pipelining
    ? new PipelinedCheckpointTimingModel(normalizedOpts)
    : new StandardCheckpointTimingModel(normalizedOpts);
  validateCheckpointTimingModel(timing);
  return timing;
}

/**
 * Creates a pipelined checkpoint timing model with target-slot window accessors.
 *
 * Use this when the caller specifically needs the pipelined-only timing surface,
 * such as proposal or attestation acceptance windows into the target slot.
 */
export function createPipelinedCheckpointTimingModel(
  opts: Omit<CheckpointTimingConfig, 'pipelining'>,
): PipelinedCheckpointTiming {
  validateCheckpointTimingConfig(opts);
  const normalizedOpts = normalizeCheckpointTimingConfig(opts);

  const timing = new PipelinedCheckpointTimingModel(normalizedOpts);
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
    pipelining?: boolean;
  } = {},
): number {
  return createCheckpointTimingModel({
    aztecSlotDuration: aztecSlotDurationSec,
    blockDuration: blockDurationSec,
    checkpointAssembleTime: opts.checkpointAssembleTime,
    checkpointInitializationTime: opts.checkpointInitializationTime,
    l1PublishingTime: opts.l1PublishingTime,
    p2pPropagationTime: opts.p2pPropagationTime,
    pipelining: opts.pipelining,
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
