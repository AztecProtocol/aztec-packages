import fs from 'fs/promises';
import path from 'path';

import type { ACVMWitness } from '../acvm/acvm_types.js';
import { CircuitRecorder, type CircuitRecording } from './circuit_recorder.js';

export class FileCircuitRecorder extends CircuitRecorder {
  declare recording?: CircuitRecording & { filePath: string; isFirstCall: boolean };

  constructor(private readonly recordDir: string) {
    super();
  }

  override async start(
    input: ACVMWitness,
    circuitBytecode: Buffer,
    circuitName: string,
    functionName: string = 'main',
  ) {
    await super.start(input, circuitBytecode, circuitName, functionName);

    const recordingStringWithoutClosingBracket = JSON.stringify(
      { ...this.recording, isFirstCall: undefined, parent: undefined, oracleCalls: undefined, filePath: undefined },
      null,
      2,
    ).slice(0, -2);

    try {
      // Check if the recording directory exists and is a directory
      const stats = await fs.stat(this.recordDir);
      if (!stats.isDirectory()) {
        throw new Error(`Recording path ${this.recordDir} exists but is not a directory`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // The directory does not exist so we create it
        await fs.mkdir(this.recordDir, { recursive: true });
      } else {
        throw err;
      }
    }

    this.recording!.isFirstCall = true;
    this.recording!.filePath = await FileCircuitRecorder.#computeFilePathAndStoreInitialRecording(
      this.recordDir,
      this.recording!.circuitName,
      this.recording!.functionName,
      recordingStringWithoutClosingBracket,
    );
  }

  /**
   * Computes a unique file path for the recording by trying different counter values.
   * This is needed because multiple recordings of the same circuit could be happening simultaneously or an older
   * recording might be present.
   * @param recordDir - Directory to store the recording
   * @param circuitName - Name of the circuit
   * @param functionName - Name of the circuit function
   * @param recordingContent - Initial recording content
   * @returns A unique file path for the recording
   */
  static async #computeFilePathAndStoreInitialRecording(
    recordDir: string,
    circuitName: string,
    functionName: string,
    recordingContent: string,
  ): Promise<string> {
    let counter = 0;
    while (true) {
      try {
        const filePath = getFilePath(recordDir, circuitName, functionName, counter);
        // Write the initial recording content to the file
        await fs.writeFile(filePath, recordingContent + ',\n  "oracleCalls": [\n', {
          flag: 'wx', // wx flag fails if file exists
        });
        return filePath;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
          counter++;
          continue;
        }
        throw err;
      }
    }
  }

  /**
   * Records a single oracle/foreign call with its inputs and outputs.
   * @param name - Name of the call
   * @param inputs - Input arguments
   * @param outputs - Output results
   */
  override async recordCall(name: string, inputs: unknown[], outputs: unknown, time: number, stackDepth: number) {
    const entry = await super.recordCall(name, inputs, outputs, time, stackDepth);
    try {
      const prefix = this.recording!.isFirstCall ? '    ' : '    ,';
      this.recording!.isFirstCall = false;
      await fs.appendFile(this.recording!.filePath, prefix + JSON.stringify(entry) + '\n');
    } catch (err) {
      this.logger.error('Failed to log circuit call', { error: err });
    }
    return entry;
  }

  /**
   * Finalizes the recording file by adding closing brackets. Without calling this method, the recording file is
   * incomplete and it fails to parse.
   */
  override async finish(): Promise<CircuitRecording> {
    // Finish sets the recording to undefined if we are at the topmost circuit,
    // so we save the current file path before that
    const filePath = this.recording!.filePath;
    const result = await super.finish();
    try {
      await fs.appendFile(filePath, '  ]\n}\n');
    } catch (err) {
      this.logger.error('Failed to finalize recording file', { error: err });
    }
    return result!;
  }

  /**
   * Finalizes the recording file by adding the error and closing brackets. Without calling this method or `finish`,
   * the recording file is incomplete and it fails to parse.
   * @param error - The error that occurred during circuit execution
   */
  override async finishWithError(error: unknown): Promise<CircuitRecording> {
    // Finish sets the recording to undefined if we are at the topmost circuit,
    // so we save the current file path before that
    const filePath = this.recording!.filePath;
    const result = await super.finishWithError(error);
    try {
      await fs.appendFile(filePath, '  ],\n');
      await fs.appendFile(filePath, `  "error": ${JSON.stringify(error)}\n`);
      await fs.appendFile(filePath, '}\n');
    } catch (err) {
      this.logger.error('Failed to finalize recording file with error', { error: err });
    }
    return result!;
  }
}

/**
 * Generates a file path for storing circuit recordings. The format of the filename is:
 * `circuit_name_circuit_function_name_YYYY-MM-DD_N.json` where N is a counter to ensure unique filenames.
 * @param recordDir - Base directory for recordings
 * @param circuitName - Name of the circuit
 * @param functionName - Name of the circuit function
 * @param counter - Counter to ensure unique filenames. This is expected to be incremented in a loop until there is no
 * existing file with the same name.
 * @returns A file path for the recording.
 */
function getFilePath(recordDir: string, circuitName: string, functionName: string, counter: number): string {
  const date = new Date();
  const formattedDate = date.toISOString().split('T')[0];
  const filename = `${circuitName}_${functionName}_${formattedDate}_${counter}.json`;
  return path.join(recordDir, filename);
}
