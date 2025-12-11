import { createLogger } from '@aztec/aztec.js/log';

import { DEFAULT_ATTESTATION_PROPAGATION_TIME } from '../config.js';
import { SequencerTooSlowError } from './errors.js';
import type { SequencerMetrics } from './metrics.js';
import { SequencerState } from './utils.js';

export const MIN_EXECUTION_TIME = 1;
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

  /**
   * What's the minimum time we want to leave available for execution and reexecution (used to derive init deadline)
   * Defaults to half of the block duration if set, otherwise a constant.
   */
  public readonly minExecutionTime: number = MIN_EXECUTION_TIME;

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
    this.minExecutionTime = this.blockDuration ? this.blockDuration / 2 : MIN_EXECUTION_TIME;
    this.enforce = opts.enforce;

    // Assume zero-cost propagation time and faster runs in test environments where L1 slot duration is shortened
    if (this.ethereumSlotDuration < 8) {
      this.attestationPropagationTime = 0;
      this.blockValidationTime = 0.5;
      this.blockPrepareTime = 0.5;
    }

    const allWorkToDo =
      this.blockPrepareTime +
      this.minExecutionTime * 2 +
      this.attestationPropagationTime * 2 +
      this.blockValidationTime +
      this.l1PublishingTime;

    const initializeDeadline = this.aztecSlotDuration - allWorkToDo;
    this.initializeDeadline = initializeDeadline;

    this.log.verbose(`Sequencer timetable initialized (${this.enforce ? 'enforced' : 'not enforced'})`, {
      ethereumSlotDuration: this.ethereumSlotDuration,
      aztecSlotDuration: this.aztecSlotDuration,
      l1PublishingTime: this.l1PublishingTime,
      minExecutionTime: this.minExecutionTime,
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

  private get afterBlockBuildingTimeNeededWithoutReexec() {
    return this.blockValidationTime + this.attestationPropagationTime * 2 + this.l1PublishingTime;
  }

  public getBlockProposalExecTimeEnd(secondsIntoSlot: number): number {
    // We are N seconds into the slot. We need to account for `afterBlockBuildingTimeNeededWithoutReexec` seconds,
    // send then split the remaining time between the re-execution and the block building.
    const maxAllowed = this.aztecSlotDuration - this.afterBlockBuildingTimeNeededWithoutReexec;
    const available = maxAllowed - secondsIntoSlot;
    const executionTimeEnd = secondsIntoSlot + available / 2;
    this.log.verbose(`Block proposal execution time deadline is ${executionTimeEnd}`, {
      secondsIntoSlot,
      maxAllowed,
      available,
      executionTimeEnd,
    });
    return executionTimeEnd;
  }

  private get afterBlockReexecTimeNeeded() {
    return this.attestationPropagationTime + this.l1PublishingTime;
  }

  public getValidatorReexecTimeEnd(secondsIntoSlot?: number): number {
    // We need to leave for `afterBlockReexecTimeNeeded` seconds available.
    const validationTimeEnd = this.aztecSlotDuration - this.afterBlockReexecTimeNeeded;
    this.log.debug(`Validator re-execution time deadline is ${validationTimeEnd}`, {
      secondsIntoSlot,
      validationTimeEnd,
    });
    return validationTimeEnd;
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
        return this.initializeDeadline + this.blockPrepareTime;
      case SequencerState.WAITING_UNTIL_NEXT_BLOCK:
        return this.initializeDeadline + this.blockPrepareTime;
      case SequencerState.FINALIZING_CHECKPOINT:
        return this.aztecSlotDuration - this.l1PublishingTime - 2 * this.attestationPropagationTime;
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
   * Get timing information for building blocks within a slot.
   * @param secondsIntoSlot - Current seconds into the slot
   * @returns Object containing:
   *   - canStart: boolean - Whether there's time to start a block now
   *   - deadline: number - Deadline (seconds into slot) for current/next block
   *   - isLastBlock: boolean - Whether the next block would be the last
   */
  public canStartNextBlock(secondsIntoSlot: number): {
    canStart: boolean;
    deadline: number;
    isLastBlock: boolean;
  } {
    const minExecutionTime = this.minExecutionTime;
    const deadline = this.getBlockProposalExecTimeEnd(secondsIntoSlot);
    const canStart = deadline - secondsIntoSlot >= minExecutionTime;

    // Single block per slot
    if (this.blockDuration === undefined) {
      this.log.verbose(`${canStart ? 'Can' : 'Cannot'} start single-block checkpoint at ${secondsIntoSlot}s into slot`);
      return { deadline, canStart, isLastBlock: true };
    }

    // Multiple blocks per slot
    // TODO(palla/mbps): The following is most likely incorrect. When the sequencer sends the penultimate
    // block in the slot, the attestors will finish executing it at the very end of the slot, leaving no time for
    // yet another block, but the following logic seems like it may still allow it. Review this.
    const timeForNextBlockEnd = secondsIntoSlot + this.blockDuration;
    const canStartAnotherBlock =
      this.getBlockProposalExecTimeEnd(timeForNextBlockEnd) - timeForNextBlockEnd >= minExecutionTime;
    const effectiveDeadline = canStartAnotherBlock ? timeForNextBlockEnd : deadline;

    this.log.verbose(
      canStart
        ? canStartAnotherBlock
          ? `Starting new block at ${secondsIntoSlot}s into slot`
          : `Starting last block at ${secondsIntoSlot}s into slot`
        : `No time left for starting new block at ${secondsIntoSlot}s into slot`,
      {
        secondsIntoSlot,
        blockDuration: this.blockDuration,
        minExecutionTime,
        deadline,
        effectiveDeadline,
        timeForNextBlockEnd,
        canStartAnotherBlock,
        canStart,
      },
    );

    return { canStart, deadline: effectiveDeadline, isLastBlock: !canStartAnotherBlock };
  }
}
