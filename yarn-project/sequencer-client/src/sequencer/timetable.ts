import { createLogger } from '@aztec/aztec.js';

import type { SequencerMetrics } from './metrics.js';
import { SequencerState } from './utils.js';

const MIN_EXECUTION_TIME = 1;
const BLOCK_PREPARE_TIME = 1;
const BLOCK_VALIDATION_TIME = 1;
const ATTESTATION_PROPAGATION_TIME = 2;

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
  public readonly l1PublishingTime;

  /** What's the minimum time we want to leave available for execution and reexecution (used to derive init deadline) */
  public readonly minExecutionTime: number = MIN_EXECUTION_TIME;

  /** How long it takes to get ready to start building */
  public readonly blockPrepareTime: number = BLOCK_PREPARE_TIME;

  /** How long it takes to for proposals and attestations to travel across the p2p layer (one-way) */
  public readonly attestationPropagationTime: number = ATTESTATION_PROPAGATION_TIME;

  /** How much time we spend validating and processing a block after building it, and assembling the proposal to send to attestors */
  public readonly blockValidationTime: number = BLOCK_VALIDATION_TIME;

  constructor(
    private readonly ethereumSlotDuration: number,
    private readonly aztecSlotDuration: number,
    private readonly maxL1TxInclusionTimeIntoSlot: number,
    private readonly enforce: boolean = true,
    private readonly metrics?: SequencerMetrics,
    private readonly log = createLogger('sequencer:timetable'),
  ) {
    this.l1PublishingTime = this.ethereumSlotDuration - this.maxL1TxInclusionTimeIntoSlot;

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
    if (initializeDeadline <= 0) {
      throw new Error(
        `Block proposal initialize deadline cannot be negative (got ${initializeDeadline} from total time needed ${allWorkToDo} and a slot duration of ${this.aztecSlotDuration}).`,
      );
    }
    this.initializeDeadline = initializeDeadline;
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
    this.log.debug(`Block proposal execution time deadline is ${executionTimeEnd}`, {
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

  public getMaxAllowedTime(state: SequencerState): number | undefined {
    switch (state) {
      case SequencerState.STOPPED:
      case SequencerState.IDLE:
      case SequencerState.SYNCHRONIZING:
      case SequencerState.PROPOSER_CHECK:
        return; // We don't really care about times for this states
      case SequencerState.INITIALIZING_PROPOSAL:
        return this.initializeDeadline;
      case SequencerState.CREATING_BLOCK:
        return this.initializeDeadline + this.blockPrepareTime;
      case SequencerState.COLLECTING_ATTESTATIONS:
        return this.aztecSlotDuration - this.l1PublishingTime - 2 * this.attestationPropagationTime;
      case SequencerState.PUBLISHING_BLOCK:
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
}

export class SequencerTooSlowError extends Error {
  constructor(
    public readonly proposedState: SequencerState,
    public readonly maxAllowedTime: number,
    public readonly currentTime: number,
  ) {
    super(
      `Too far into slot for ${proposedState} (time into slot ${currentTime}s greater than ${maxAllowedTime}s allowance)`,
    );
    this.name = 'SequencerTooSlowError';
  }
}
