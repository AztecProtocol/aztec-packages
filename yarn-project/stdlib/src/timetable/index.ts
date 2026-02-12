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
  if (!blockDurationSec) {
    return 1; // Single block per slot
  }

  const initOffset = opts.checkpointInitializationTime ?? CHECKPOINT_INITIALIZATION_TIME;
  const assembleTime = opts.checkpointAssembleTime ?? CHECKPOINT_ASSEMBLE_TIME;
  const p2pTime = opts.p2pPropagationTime ?? DEFAULT_P2P_PROPAGATION_TIME;
  const l1Time = opts.l1PublishingTime ?? DEFAULT_L1_PUBLISHING_TIME;

  // Calculate checkpoint finalization time (assembly + round-trip propagation + L1 publishing)
  const checkpointFinalizationTime = assembleTime + p2pTime * 2 + l1Time;

  // Time reserved at end for last sub-slot (validator re-execution) + finalization
  const timeReservedAtEnd = blockDurationSec + checkpointFinalizationTime;

  // Time available for building blocks
  const timeAvailableForBlocks = aztecSlotDurationSec - initOffset - timeReservedAtEnd;

  return Math.max(1, Math.floor(timeAvailableForBlocks / blockDurationSec));
}
