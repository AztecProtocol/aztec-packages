import { sha512 } from '@aztec/foundation/crypto';

import type { ACVMWitness } from '../../acvm/acvm_types.js';
import { CircuitRecorder, type CircuitRecording } from './circuit_recorder.js';

export class MemoryCircuitRecorder extends CircuitRecorder {
  constructor() {
    super();
  }

  /**
   * Finalizes the recording file by adding closing brackets. Without calling this method, the recording file is
   * incomplete and it fails to parse.
   */
  finish(): Promise<CircuitRecording> {
    return Promise.resolve(this.recording);
  }

  /**
   * Finalizes the recording file by adding the error and closing brackets. Without calling this method or `finish`,
   * the recording file is incomplete and it fails to parse.
   * @param error - The error that occurred during circuit execution
   */
  finishWithError(error: unknown): Promise<CircuitRecording> {
    this.recording.error = JSON.stringify(error);
    return Promise.resolve(this.recording);
  }
}
