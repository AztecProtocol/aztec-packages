import type { SequencerState } from './utils.js';

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

export class SequencerInterruptedError extends Error {
  constructor() {
    super(`Sequencer was interrupted`);
    this.name = 'SequencerInterruptedError';
  }
}
