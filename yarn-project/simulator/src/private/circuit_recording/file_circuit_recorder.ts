import type { Logger } from '@aztec/foundation/log';

import fs from 'fs/promises';
import path from 'path';

import { CircuitRecorder, type CircuitRecording } from './circuit_recorder.js';

/** Per-recording file state, keyed by recording so concurrent/nested executions don't share it. */
type RecordingFileState = { filePath: string; isFirstCall: boolean };

export class FileCircuitRecorder extends CircuitRecorder {
  readonly #fileState = new WeakMap<CircuitRecording, RecordingFileState>();

  constructor(
    private readonly recordDir: string,
    logger?: Logger,
  ) {
    super(logger);
  }

  protected override async onStart(recording: CircuitRecording): Promise<void> {
    const recordingStringWithoutClosingBracket = JSON.stringify(
      { ...recording, parent: undefined, oracleCalls: undefined },
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

    const filePath = await FileCircuitRecorder.#computeFilePathAndStoreInitialRecording(
      this.recordDir,
      recording.circuitName,
      recording.functionName,
      recordingStringWithoutClosingBracket,
    );
    this.#fileState.set(recording, { filePath, isFirstCall: true });
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
  override async recordCall(name: string, inputs: unknown[], outputs: unknown, time: number) {
    const entry = await super.recordCall(name, inputs, outputs, time);
    const recording = this.currentRecording();
    const state = recording && this.#fileState.get(recording);
    if (state) {
      try {
        const prefix = state.isFirstCall ? '    ' : '    ,';
        state.isFirstCall = false;
        await fs.appendFile(state.filePath, prefix + JSON.stringify(entry) + '\n');
      } catch (err) {
        this.logger.error('Failed to log circuit call', { error: err });
      }
    }
    return entry;
  }

  /** Closes the recording file with the trailing brackets so the JSON parses. */
  protected override async onFinish(recording: CircuitRecording): Promise<void> {
    const state = this.#fileState.get(recording);
    if (!state) {
      return;
    }
    try {
      await fs.appendFile(state.filePath, '  ]\n}\n');
    } catch (err) {
      this.logger.error('Failed to finalize recording file', { error: err });
    }
  }

  /** Closes the recording file with the execution error and trailing brackets so the JSON parses. */
  protected override async onError(recording: CircuitRecording, error: unknown): Promise<void> {
    const state = this.#fileState.get(recording);
    if (!state) {
      return;
    }
    try {
      await fs.appendFile(state.filePath, '  ],\n');
      await fs.appendFile(state.filePath, `  "error": ${JSON.stringify(error)}\n`);
      await fs.appendFile(state.filePath, '}\n');
    } catch (err) {
      this.logger.error('Failed to finalize recording file with error', { error: err });
    }
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
