import { createLogger } from '@aztec/aztec.js/log';
import {
  CHECKPOINT_ASSEMBLE_TIME,
  CHECKPOINT_INITIALIZATION_TIME,
  DEFAULT_P2P_PROPAGATION_TIME,
  MIN_EXECUTION_TIME,
} from '@aztec/stdlib/timetable';

import { SequencerTooSlowError } from './errors.js';
import type { SequencerMetrics } from './metrics.js';
import { SequencerState } from './utils.js';

export class SequencerTimetable {
  /**
   * How late into the slot can we be to start working. Computed as the total time needed for assembling and publishing a block,
   * assuming an execution time equal to `minExecutionTime`, subtracted from the slot duration. This means that, if the proposer
   * starts building at this time, and all times hold, it will have at least `minExecutionTime` to execute txs for the block.
   */
  public readonly initializeDeadline: number;

  /**
   * Fixed time offset (in seconds) when the first sub-slot starts, used as baseline for all block deadlines.
   * This is an estimate of how long initialization (sync + proposer check) typically takes.
   * If actual initialization takes longer/shorter, blocks just get less/more time accordingly.
   */
  public readonly initializationOffset: number;

  /**
   * Total time needed to finalize and publish a checkpoint, including:
   * - Assembling the checkpoint
   * - Round-trip p2p propagation for the checkpoint proposal and its corresponding attestations
   * - Publishing to L1
   */
  public readonly checkpointFinalizationTime: number;

  /**
   * How long it takes to get a published block into L1. L1 builders typically accept txs up to 4 seconds into their slot,
   * but we'll timeout sooner to give it more time to propagate (remember we also have blobs!). Still, when working in anvil,
   * we can just post in the very last second of the L1 slot and still expect the tx to be accepted.
   */
  public readonly l1PublishingTime: number;

  /**
   * What's the minimum time we want to leave available for execution and reexecution (used to derive init deadline)
   * Defaults to half of the block duration if set, otherwise a constant.
   */
  public readonly minExecutionTime: number = MIN_EXECUTION_TIME;

  /** How long it takes to get ready to start building */
  public readonly checkpointInitializationTime: number = CHECKPOINT_INITIALIZATION_TIME;

  /** How long it takes to for proposals and attestations to travel across the p2p layer (one-way) */
  public readonly p2pPropagationTime: number;

  /** How much time we spend assembling a checkpoint after building the last block */
  public readonly checkpointAssembleTime: number = CHECKPOINT_ASSEMBLE_TIME;

  /** Ethereum slot duration in seconds */
  public readonly ethereumSlotDuration: number;

  /** Aztec slot duration in seconds (must be multiple of ethereum slot duration) */
  public readonly aztecSlotDuration: number;

  /** Whether assertTimeLeft will throw if not enough time. */
  public readonly enforce: boolean;

  /** Duration per block when building multiple blocks per slot (undefined = single block per slot) */
  public readonly blockDuration: number | undefined;

  /** Maximum number of blocks that can be built in this slot configuration */
  public readonly maxNumberOfBlocks: number;

  constructor(
    opts: {
      ethereumSlotDuration: number;
      aztecSlotDuration: number;
      l1PublishingTime: number;
      p2pPropagationTime?: number;
      blockDurationMs?: number;
      enforce: boolean;
    },
    private readonly metrics?: SequencerMetrics,
    private readonly log = createLogger('sequencer:timetable'),
  ) {
    this.ethereumSlotDuration = opts.ethereumSlotDuration;
    this.aztecSlotDuration = opts.aztecSlotDuration;
    this.l1PublishingTime = opts.l1PublishingTime;
    this.p2pPropagationTime = opts.p2pPropagationTime ?? DEFAULT_P2P_PROPAGATION_TIME;
    this.blockDuration = opts.blockDurationMs ? opts.blockDurationMs / 1000 : undefined;
    this.enforce = opts.enforce;

    // Assume zero-cost propagation time and faster runs in test environments where L1 slot duration is shortened
    if (this.ethereumSlotDuration < 8) {
      this.p2pPropagationTime = 0;
      this.checkpointAssembleTime = 0.5;
      this.checkpointInitializationTime = 0.5;
      this.minExecutionTime = 1;
    }

    // Min execution time cannot be less than the block duration if set
    if (this.blockDuration !== undefined && this.minExecutionTime > this.blockDuration) {
      this.minExecutionTime = this.blockDuration;
    }

    // Calculate initialization offset - estimate of time needed for sync + proposer check
    // This is the baseline for all sub-slot deadlines
    this.initializationOffset = this.checkpointInitializationTime;

    // Calculate total checkpoint finalization time (assembly + attestations + L1 publishing)
    this.checkpointFinalizationTime =
      this.checkpointAssembleTime +
      this.p2pPropagationTime * 2 + // Round-trip propagation
      this.l1PublishingTime; // L1 publishing

    // Calculate maximum number of blocks that fit in this slot
    if (!this.blockDuration) {
      this.maxNumberOfBlocks = 1; // Single block per slot
    } else {
      const timeReservedAtEnd =
        this.blockDuration + // Last sub-slot for validator re-execution
        this.checkpointFinalizationTime; // Checkpoint finalization
      const timeAvailableForBlocks = this.aztecSlotDuration - this.initializationOffset - timeReservedAtEnd;
      this.maxNumberOfBlocks = Math.floor(timeAvailableForBlocks / this.blockDuration);
    }

    // Minimum work to do within a slot for building a block with the minimum time for execution and publishing its checkpoint
    const minWorkToDo =
      this.initializationOffset +
      this.minExecutionTime * 2 + // Execution and reexecution
      this.checkpointFinalizationTime;

    const initializeDeadline = this.aztecSlotDuration - minWorkToDo;
    this.initializeDeadline = initializeDeadline;

    this.log.verbose(
      `Sequencer timetable initialized with ${this.maxNumberOfBlocks} blocks per slot (${this.enforce ? 'enforced' : 'not enforced'})`,
      {
        ethereumSlotDuration: this.ethereumSlotDuration,
        aztecSlotDuration: this.aztecSlotDuration,
        l1PublishingTime: this.l1PublishingTime,
        minExecutionTime: this.minExecutionTime,
        blockPrepareTime: this.checkpointInitializationTime,
        p2pPropagationTime: this.p2pPropagationTime,
        blockAssembleTime: this.checkpointAssembleTime,
        initializeDeadline: this.initializeDeadline,
        enforce: this.enforce,
        minWorkToDo,
        blockDuration: this.blockDuration,
        maxNumberOfBlocks: this.maxNumberOfBlocks,
      },
    );

    if (initializeDeadline <= 0) {
      throw new Error(
        `Block proposal initialize deadline cannot be negative (got ${initializeDeadline} from total time needed ${minWorkToDo} and a slot duration of ${this.aztecSlotDuration}).`,
      );
    }
  }

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
      case SequencerState.WAITING_UNTIL_NEXT_BLOCK:
        return this.initializeDeadline + this.checkpointInitializationTime;
      case SequencerState.ASSEMBLING_CHECKPOINT:
      case SequencerState.COLLECTING_ATTESTATIONS:
        return this.aztecSlotDuration - this.l1PublishingTime - 2 * this.p2pPropagationTime;
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
   * Determines if we can start building the next block and returns its deadline.
   *
   * The timetable divides the slot into fixed sub-slots. This method finds the next
   * available sub-slot that has enough time remaining to build a block.
   *
   * @param secondsIntoSlot - Current time (seconds into the slot)
   * @returns Object with canStart flag, deadline, and whether this is the last block
   */
  public canStartNextBlock(
    secondsIntoSlot: number,
  ):
    | { canStart: true; deadline: undefined; isLastBlock: true }
    | { canStart: false; deadline: undefined; isLastBlock: false }
    | { canStart: boolean; deadline: number; isLastBlock: boolean } {
    // When timetable enforcement is disabled, always allow starting,
    // and build a single block with no deadline. This is here just to
    // satisfy a subset of e2e tests and the sandbox that assume that the
    // sequencer is permanently mining every tx sent.
    if (!this.enforce) {
      return { canStart: true, deadline: undefined, isLastBlock: true };
    }

    // If no block duration is set, then we're in single-block mode, which
    // is handled for backwards compatibility towards another subset of e2e tests.
    if (this.blockDuration === undefined) {
      // In single block mode, execution and re-execution happen sequentially, so we need to
      // split the available time between them. After building, we need time for attestations and L1.
      const maxAllowed = this.aztecSlotDuration - this.checkpointFinalizationTime;
      const available = (maxAllowed - secondsIntoSlot) / 2; // Split remaining time: half for execution, half for re-execution
      const canStart = available >= this.minExecutionTime;
      const deadline = secondsIntoSlot + available;

      this.log.verbose(
        `${canStart ? 'Can' : 'Cannot'} start single-block checkpoint at ${secondsIntoSlot}s into slot`,
        { secondsIntoSlot, maxAllowed, available, deadline },
      );
      return { canStart, deadline, isLastBlock: true };
    }

    // Otherwise, we're in multi-block-per-slot mode, the default when running in production
    // Find the next available sub-slot that has enough time remaining
    for (let subSlot = 1; subSlot <= this.maxNumberOfBlocks; subSlot++) {
      // Calculate end for this sub-slot
      const deadline = this.initializationOffset + subSlot * this.blockDuration;

      // Check if we have enough time to build a block with this deadline
      const timeUntilDeadline = deadline - secondsIntoSlot;

      if (timeUntilDeadline >= this.minExecutionTime) {
        // Found an available sub-slot! Is this the last one?
        const isLastBlock = subSlot === this.maxNumberOfBlocks;

        this.log.verbose(
          `Can start ${isLastBlock ? 'last block' : 'block'} in sub-slot ${subSlot} with deadline ${deadline}s`,
          { secondsIntoSlot, deadline, timeUntilDeadline, subSlot, maxBlocks: this.maxNumberOfBlocks },
        );

        return { canStart: true, deadline, isLastBlock };
      }
    }

    // No sub-slots available with enough time
    this.log.verbose(`No time left to start any more blocks`, {
      secondsIntoSlot,
      maxBlocks: this.maxNumberOfBlocks,
      initializationOffset: this.initializationOffset,
    });

    return { canStart: false, deadline: undefined, isLastBlock: false };
  }
}
