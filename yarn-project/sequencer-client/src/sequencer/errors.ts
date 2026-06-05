export class SequencerInterruptedError extends Error {
  constructor() {
    super(`Sequencer was interrupted`);
    this.name = 'SequencerInterruptedError';
  }
}
