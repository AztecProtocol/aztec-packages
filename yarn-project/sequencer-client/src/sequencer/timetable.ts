import { createLogger } from '@aztec/aztec.js/log';

import { DEFAULT_ATTESTATION_PROPAGATION_TIME } from '../config.js';
import { SequencerTooSlowError } from './errors.js';
import type { SequencerMetrics } from './metrics.js';
import { SequencerState } from './utils.js';

export const MIN_EXECUTION_TIME = 3;
export const BLOCK_PREPARE_TIME = 1;
export const BLOCK_VALIDATION_TIME = 1;

export class SequencerTimetable {
  /**
   * How late into the slot can we be to start working. Computed as the total time needed for assembling and publishing a block,
   * assuming an execution time equal to `minExecutionTime`, subtracted from the slot duration. This means that, if the proposer
   * starts building at this time, and all times hold, it will have at least `minExecutionTime` to execute txs for the block.
   */
  public readonly initializeDeadline: number;

  /**
   * How long it takes to get a published block into L1. L1 builders typically accept txs up to 4 seconds into their slot,
   * but we'll timeout sooner to give it more time to propagate (remember we also have blobs!). Still, when working in anvil,
   * we can just post in the very last second of the L1 slot and still expect the tx to be accepted.
   */
  public readonly l1PublishingTime: number;

  /** How long it takes to get ready to start building */
  public readonly blockPrepareTime: number = BLOCK_PREPARE_TIME;

  /** How long it takes to for proposals and attestations to travel across the p2p layer (one-way) */
  public readonly attestationPropagationTime: number;

  /** How much time we spend validating and processing a block after building it, and assembling the proposal to send to attestors */
  public readonly blockValidationTime: number = BLOCK_VALIDATION_TIME;

  /** Ethereum slot duration in seconds */
  public readonly ethereumSlotDuration: number;

  /** Aztec slot duration in seconds (must be multiple of ethereum slot duration) */
  public readonly aztecSlotDuration: number;

  /** Whether assertTimeLeft will throw if not enough time. */
  public readonly enforce: boolean;

  /** Duration per block when building multiple blocks per slot (undefined = single block per slot) */
  public readonly blockDuration: number | undefined;

  constructor(
    opts: {
      ethereumSlotDuration: number;
      aztecSlotDuration: number;
      l1PublishingTime: number;
      attestationPropagationTime?: number;
      blockDurationMs?: number;
      enforce: boolean;
    },
    private readonly metrics?: SequencerMetrics,
    private readonly log = createLogger('sequencer:timetable'),
  ) {
    this.ethereumSlotDuration = opts.ethereumSlotDuration;
    this.aztecSlotDuration = opts.aztecSlotDuration;
    this.l1PublishingTime = opts.l1PublishingTime;
    this.attestationPropagationTime = opts.attestationPropagationTime ?? DEFAULT_ATTESTATION_PROPAGATION_TIME;
    this.blockDuration = opts.blockDurationMs ? opts.blockDurationMs / 1000 : undefined;
    this.enforce = opts.enforce;

    // Assume zero-cost propagation time and faster runs in test environments where L1 slot duration is shortened
    if (this.ethereumSlotDuration < 8) {
      this.attestationPropagationTime = 0;
      this.blockValidationTime = 0.5;
      this.blockPrepareTime = 0.5;
    }

    const allWorkToDo =
      this.blockPrepareTime +
      MIN_EXECUTION_TIME * 2 +
      this.attestationPropagationTime * 2 +
      this.blockValidationTime +
      this.l1PublishingTime;

    const initializeDeadline = this.aztecSlotDuration - allWorkToDo;
    this.initializeDeadline = initializeDeadline;

    this.log.verbose(`Sequencer timetable initialized (${this.enforce ? 'enforced' : 'not enforced'})`, {
      ethereumSlotDuration: this.ethereumSlotDuration,
      aztecSlotDuration: this.aztecSlotDuration,
      l1PublishingTime: this.l1PublishingTime,
      minExecutionTime: MIN_EXECUTION_TIME,
      blockPrepareTime: this.blockPrepareTime,
      attestationPropagationTime: this.attestationPropagationTime,
      blockValidationTime: this.blockValidationTime,
      initializeDeadline: this.initializeDeadline,
      enforce: this.enforce,
      allWorkToDo,
    });

    if (initializeDeadline <= 0) {
      throw new Error(
        `Block proposal initialize deadline cannot be negative (got ${initializeDeadline} from total time needed ${allWorkToDo} and a slot duration of ${this.aztecSlotDuration}).`,
      );
    }
  }

  /**
   * Calculate deadline for a regular (non-last) block.
   * Deadline is when the block execution should complete.
   * @param checkpointStartTime - Seconds into slot when checkpoint building began
   * @param blockIndex - Index of the block (0 for first, 1 for second, etc.)
   * @returns Seconds into slot when block should be complete
   */
  public getRegularBlockDeadline(checkpointStartTime: number, blockIndex: number): number {
    if (!this.blockDuration) {
      throw new Error('getRegularBlockDeadline called but blockDuration is undefined');
    }
    return checkpointStartTime + (blockIndex + 1) * this.blockDuration;
  }

  /**
   * Calculate when a block should start building (to maintain regular intervals).
   * @param checkpointStartTime - Seconds into slot when checkpoint building began
   * @param blockIndex - Index of the block (0 for first, 1 for second, etc.)
   * @returns Seconds into slot when block should start
   */
  public getBlockStartTime(checkpointStartTime: number, blockIndex: number): number {
    if (!this.blockDuration) {
      throw new Error('getBlockStartTime called but blockDuration is undefined');
    }
    return checkpointStartTime + blockIndex * this.blockDuration;
  }

  /**
   * Calculate time needed after completing a block to finish the checkpoint.
   * Includes validator re-execution, propagation, validation, and L1 publishing.
   * @param blockBuildDuration - How long it took to build the block
   * @returns Seconds needed
   */
  private getAfterBlockTimeNeeded(blockBuildDuration: number): number {
    return (
      blockBuildDuration + // Validators need same time to re-execute
      2 * this.attestationPropagationTime + // Round-trip propagation (proposal and attestations)
      this.blockValidationTime + // Time to finalize checkpoint and create proposal
      this.l1PublishingTime // Time to publish to L1
    );
  }

  // TODO(palla/mbps): Review these times for new states
  public getMaxAllowedTime(
    state: Extract<SequencerState, SequencerState.STOPPED | SequencerState.IDLE | SequencerState.SYNCHRONIZING>,
  ): undefined;
  public getMaxAllowedTime(
    state: Exclude<SequencerState, SequencerState.STOPPED | SequencerState.IDLE | SequencerState.SYNCHRONIZING>,
  ): number;
  public getMaxAllowedTime(state: SequencerState): number | undefined;
  public getMaxAllowedTime(state: SequencerState): number | undefined {
    switch (state) {
      case SequencerState.STOPPED:
      case SequencerState.STOPPING:
      case SequencerState.IDLE:
      case SequencerState.SYNCHRONIZING:
        return; // We don't really care about times for this states
      case SequencerState.PROPOSER_CHECK:
      case SequencerState.INITIALIZING_CHECKPOINT:
        return this.initializeDeadline;
      case SequencerState.WAITING_FOR_TXS:
      case SequencerState.CREATING_BLOCK:
        // TODO(timing): These states have block-specific deadlines that depend on
        // which block is being built. The deadline is calculated in CheckpointProposalJob
        // using the deadline returned by canStartNextBlock().
        return this.initializeDeadline + this.blockPrepareTime;
      case SequencerState.WAITING_UNTIL_NEXT_BLOCK:
        // Conservative estimate - actual deadline depends on checkpoint start time and block index
        return this.initializeDeadline + this.blockPrepareTime;
      case SequencerState.FINALIZING_CHECKPOINT: {
        // After building last block, need time for:
        // - validators to re-execute last block (assume MAX blockDuration for safety)
        // - attestations to propagate back (2 * attestationPropagationTime)
        // - validation time
        // - L1 publishing time
        // Conservative estimate using blockDuration as max last block time
        const conservativeLastBlockTime = this.blockDuration ?? MIN_EXECUTION_TIME;
        return (
          this.aztecSlotDuration -
          conservativeLastBlockTime -
          2 * this.attestationPropagationTime -
          this.blockValidationTime -
          this.l1PublishingTime
        );
      }
      case SequencerState.COLLECTING_ATTESTATIONS:
        return this.aztecSlotDuration - this.l1PublishingTime - 2 * this.attestationPropagationTime;
      case SequencerState.PUBLISHING_CHECKPOINT:
        return this.aztecSlotDuration - this.l1PublishingTime;
      default: {
        const _exhaustiveCheck: never = state;
        throw new Error(`Unexpected state: ${state}`);
      }
    }
  }

  public assertTimeLeft(newState: SequencerState, secondsIntoSlot: number) {
    if (!this.enforce) {
      return;
    }

    const maxAllowedTime = this.getMaxAllowedTime(newState);
    if (maxAllowedTime === undefined) {
      return;
    }

    const bufferSeconds = maxAllowedTime - secondsIntoSlot;
    if (bufferSeconds < 0) {
      throw new SequencerTooSlowError(newState, maxAllowedTime, secondsIntoSlot);
    }

    this.metrics?.recordStateTransitionBufferMs(Math.floor(bufferSeconds * 1000), newState);
    this.log.trace(`Enough time to transition to ${newState}`, { maxAllowedTime, secondsIntoSlot });
  }

  /**
   * Determine if we can start building the next block, and if so, what the deadline is.
   * This method also determines if the block will be the last in the checkpoint.
   *
   * Key insight: Validators execute blocks sequentially. They cannot start re-executing
   * block N until they finish re-executing block N-1. This means the last block's timing
   * must account for validators finishing the PREVIOUS block's re-execution.
   *
   * @param secondsIntoSlot - Current time (seconds into the slot)
   * @param checkpointStartTime - When checkpoint building began (seconds into slot)
   * @param blockIndex - Index of block we're considering (0=first, 1=second, etc.)
   * @param previousBlockDuration - How long the previous block took to build (0 for first block)
   * @returns Object with canStart, deadline, and isLastBlock flags
   */
  public canStartNextBlock(
    secondsIntoSlot: number,
    checkpointStartTime: number,
    blockIndex: number,
    previousBlockDuration: number,
  ): {
    canStart: boolean;
    deadline: number; // seconds into slot
    isLastBlock: boolean;
  } {
    // Single block per slot - special case
    if (this.blockDuration === undefined) {
      const deadline = this.aztecSlotDuration - this.l1PublishingTime;
      const canStart = secondsIntoSlot <= this.initializeDeadline;
      this.log.verbose(`${canStart ? 'Can' : 'Cannot'} start single-block checkpoint at ${secondsIntoSlot}s into slot`);
      return { deadline, canStart, isLastBlock: true };
    }

    // Multiple blocks per slot
    const remaining = this.aztecSlotDuration - secondsIntoSlot;

    // Calculate when this block should start and its regular deadline
    const expectedStart = this.getBlockStartTime(checkpointStartTime, blockIndex);
    const regularDeadline = this.getRegularBlockDeadline(checkpointStartTime, blockIndex);

    // Check 1: Can we fit a regular block (blockDuration) PLUS another block after it?
    // For this check, assume both this block and the next take the standard blockDuration
    const remainingAfterThisBlock = remaining - this.blockDuration;
    // 17s = 4s propagation + 1s validation + 12s L1 publishing (with default config)
    const afterBlockOverhead = 2 * this.attestationPropagationTime + this.blockValidationTime + this.l1PublishingTime;
    const nextBlockMaxDuration = remainingAfterThisBlock - this.blockDuration - afterBlockOverhead;

    if (nextBlockMaxDuration >= MIN_EXECUTION_TIME) {
      // Yes, we can fit another block after this one
      // So this is NOT the last block - build it as a regular block
      const canStart = secondsIntoSlot <= regularDeadline - MIN_EXECUTION_TIME;

      this.log.verbose(
        canStart
          ? `Starting regular block at ${secondsIntoSlot}s into slot`
          : `No time to start regular block at ${secondsIntoSlot}s into slot`,
        {
          secondsIntoSlot,
          expectedStart,
          regularDeadline,
          remaining,
          canStartAnotherAfter: true,
        },
      );

      return { canStart, deadline: regularDeadline, isLastBlock: false };
    }

    // Check 2: Can we fit this block as the LAST block?
    // Use actual previous block duration (not assumed blockDuration)
    // Formula: M <= remaining - D - 17s where:
    //   M = time for last block
    //   D = previous block duration (validators need this long to re-exec it)
    //   17s = 4s propagation + 1s validation + 12s L1 publishing
    const lastBlockMaxDuration = remaining - previousBlockDuration - afterBlockOverhead;

    if (lastBlockMaxDuration >= MIN_EXECUTION_TIME) {
      // Yes, we can fit one more block as the last block
      const deadline = secondsIntoSlot + lastBlockMaxDuration;

      this.log.verbose(`Starting last block at ${secondsIntoSlot}s into slot with ${lastBlockMaxDuration}s allocated`, {
        secondsIntoSlot,
        remaining,
        previousBlockDuration,
        lastBlockMaxDuration,
        deadline,
      });

      return { canStart: true, deadline, isLastBlock: true };
    }

    // Cannot fit any more blocks
    this.log.verbose(`No time left for starting new block at ${secondsIntoSlot}s into slot`, {
      secondsIntoSlot,
      remaining,
      previousBlockDuration,
      lastBlockMaxDuration,
    });

    return { canStart: false, deadline: 0, isLastBlock: false };
  }
}
