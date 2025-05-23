import { sha512 } from '@aztec/foundation/crypto';

import fs from 'fs/promises';
import path from 'path';

import type { ACVMWitness } from '../../acvm/acvm_types.js';
import { CircuitRecorder, type CircuitRecording } from './circuit_recorder.js';

export class MemoryCircuitRecorder extends CircuitRecorder {
  constructor() {
    super();
  }

  /**
   * Initializes a new circuit recording session.
   * @param recordDir - Directory to store the recording
   * @param input - Circuit input witness
   * @param circuitBytecode - Compiled circuit bytecode
   * @param circuitName - Name of the circuit
   * @param functionName - Name of the circuit function (defaults to 'main'). This is meaningful only for
   * contracts as protocol circuits artifacts always contain a single entrypoint function called 'main'.
   */
  async start(input: ACVMWitness, circuitBytecode: Buffer, circuitName: string, functionName: string = 'main') {
    this.recording = {
      circuitName: circuitName,
      functionName: functionName,
      bytecodeSHA512Hash: sha512(circuitBytecode).toString('hex'),
      timestamp: Date.now(),
      inputs: Object.fromEntries(input),
    };
  }

  /**
   * Finalizes the recording file by adding closing brackets. Without calling this method, the recording file is
   * incomplete and it fails to parse.
   */
  async finish(): Promise<CircuitRecording> {
    return Promise.resolve(this.recording);
  }

  /**
   * Finalizes the recording file by adding the error and closing brackets. Without calling this method or `finish`,
   * the recording file is incomplete and it fails to parse.
   * @param error - The error that occurred during circuit execution
   */
  async finishWithError(error: unknown): Promise<CircuitRecording> {
    this.recording.error = JSON.stringify(error);
    return Promise.resolve(this.recording);
  }
}
