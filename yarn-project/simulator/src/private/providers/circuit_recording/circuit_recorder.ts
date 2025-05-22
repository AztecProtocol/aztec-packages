import { createLogger } from '@aztec/foundation/log';
import type { ForeignCallHandler, ForeignCallInput, ForeignCallOutput } from '@aztec/noir-acvm_js';

import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import type { ACIRCallback } from '../../acvm/acvm.js';
import type { ACVMWitness } from '../../acvm/acvm_types.js';
import { Oracle } from '../../acvm/oracle/oracle.js';

/**
 * Class responsible for recording circuit inputs necessary to replay the circuit. These inputs are the initial witness
 * map and the oracle calls made during the circuit execution/witness generation.
 *
 * The recording is stored in a JSON file called `circuit_name_circuit_function_name_YYYY-MM-DD_N.json` where N is
 * a counter to ensure unique filenames. The file is stored in the `recordDir` directory provided as a parameter to
 * CircuitRecorder.start().
 *
 * Example recording file:
 * ```json
 * {
 *   "circuitName": "AMM",
 *   "functionName": "add_liquidity",
 *   "bytecodeMd5Hash": "b46c640ed38f20eac5f61a5e41d8dd1e",
 *   "timestamp": 1740691464360,
 *   "inputs": {
 *     "0": "0x1e89de1f0ad5204263733b7ddf65bec45b8f44714a4da85a46474dad677679ef",
 *     "1": "0x00f4d59c0ff773427bb0fed5b422557ca4dc5655abe53d31fa9408cb3c5a672f",
 *     "5": "0x000000000000000000000000000000000000000000000000000000000000000f"
 *   },
 *   "oracleCalls": [
 *     {
 *       "name": "loadCapsule",
 *       "inputs": [
 *         [
 *           "0x102422483bad6abd385948435667e144ac4c272576e325e7563608876cd446fd"
 *         ],
 *         [
 *           "0x000000000000000000000000000000000000000000000000000000000000004d"
 *         ],
 *         [
 *           "0x0000000000000000000000000000000000000000000000000000000000000001"
 *         ]
 *       ],
 *       "outputs": [
 *         "0x0000000000000000000000000000000000000000000000000000000000000000",
 *         [
 *           "0x0000000000000000000000000000000000000000000000000000000000000000"
 *         ]
 *       ]
 *     },
 *     {
 *       "name": "fetchTaggedLogs",
 *       "inputs": []
 *     }
 *   ]
 * }
 * ```
 */
export class CircuitRecorder {
  private readonly logger = createLogger('simulator:acvm:recording');
  private isFirstCall = true;

  private constructor(private readonly filePath: string) {}

  /**
   * Initializes a new circuit recording session.
   * @param recordDir - Directory to store the recording
   * @param input - Circuit input witness
   * @param circuitBytecode - Compiled circuit bytecode
   * @param circuitName - Name of the circuit
   * @param functionName - Name of the circuit function (defaults to 'main'). This is meaningful only for
   * contracts as protocol circuits artifacts always contain a single entrypoint function called 'main'.
   * @returns A new CircuitRecorder instance
   */
  static async start(
    recordDir: string,
    input: ACVMWitness,
    circuitBytecode: Buffer,
    circuitName: string,
    functionName: string = 'main',
  ): Promise<CircuitRecorder> {
    const recording = {
      circuitName: circuitName,
      functionName: functionName,
      bytecodeMd5Hash: createHash('md5').update(circuitBytecode).digest('hex'),
      timestamp: Date.now(),
      inputs: Object.fromEntries(input),
    };

    const recordingStringWithoutClosingBracket = JSON.stringify(recording, null, 2).slice(0, -2);

    try {
      // Check if the recording directory exists and is a directory
      const stats = await fs.stat(recordDir);
      if (!stats.isDirectory()) {
        throw new Error(`Recording path ${recordDir} exists but is not a directory`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // The directory does not exist so we create it
        await fs.mkdir(recordDir, { recursive: true });
      } else {
        throw err;
      }
    }

    const filePath = await CircuitRecorder.#computeFilePathAndStoreInitialRecording(
      recordDir,
      circuitName,
      functionName,
      recordingStringWithoutClosingBracket,
    );
    return new CircuitRecorder(filePath);
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
   * Wraps a callback to record all oracle/foreign calls.
   * @param callback - The original callback to wrap, either a user circuit callback or protocol circuit callback.
   * @returns A wrapped callback that records all oracle interactions.
   */
  wrapCallback(callback: ACIRCallback | ForeignCallHandler | undefined): ACIRCallback | ForeignCallHandler | undefined {
    if (!callback) {
      return undefined;
    }
    if (this.#isACIRCallback(callback)) {
      return this.#wrapUserCircuitCallback(callback);
    }
    return this.#wrapProtocolCircuitCallback(callback);
  }

  /**
   * Type guard to check if a callback is an ACIRCallback.
   */
  #isACIRCallback(callback: ACIRCallback | ForeignCallHandler): callback is ACIRCallback {
    return typeof callback === 'object' && callback !== null && !('call' in callback);
  }

  /**
   * Wraps a user circuit callback to record all oracle calls.
   * @param callback - The original circuit callback.
   * @returns A wrapped callback that records all oracle interactions which is to be provided to the ACVM.
   */
  #wrapUserCircuitCallback(callback: ACIRCallback): ACIRCallback {
    const recordingCallback: ACIRCallback = {} as ACIRCallback;
    const oracleMethods = Object.getOwnPropertyNames(Oracle.prototype).filter(name => name !== 'constructor');

    for (const name of oracleMethods) {
      const fn = callback[name as keyof ACIRCallback];
      if (!fn) {
        throw new Error(`Oracle method ${name} not found when setting up recording callback`);
      }

      recordingCallback[name as keyof ACIRCallback] = (...args: ForeignCallInput[]): ReturnType<typeof fn> => {
        const result = fn.call(callback, ...args);
        if (result instanceof Promise) {
          return result.then(async r => {
            await this.#recordCall(name, args, r);
            return r;
          }) as ReturnType<typeof fn>;
        }
        void this.#recordCall(name, args, result);
        return result;
      };
    }

    return recordingCallback;
  }

  /**
   * Wraps a protocol circuit callback to record all oracle calls.
   * @param callback - The original oracle circuit callback.
   * @returns A wrapped handler that records all oracle interactions which is to be provided to the ACVM.
   */
  #wrapProtocolCircuitCallback(callback: ForeignCallHandler): ForeignCallHandler {
    return async (name: string, inputs: ForeignCallInput[]): Promise<ForeignCallOutput[]> => {
      const result = await callback(name, inputs);
      await this.#recordCall(name, inputs, result);
      return result;
    };
  }

  /**
   * Records a single oracle/foreign call with its inputs and outputs.
   * @param name - Name of the call
   * @param inputs - Input arguments
   * @param outputs - Output results
   */
  async #recordCall(name: string, inputs: unknown[], outputs: unknown) {
    try {
      const entry = {
        name,
        inputs,
        outputs,
      };
      const prefix = this.isFirstCall ? '    ' : '    ,';
      this.isFirstCall = false;
      await fs.appendFile(this.filePath, prefix + JSON.stringify(entry) + '\n');
    } catch (err) {
      this.logger.error('Failed to log circuit call', { error: err });
    }
  }

  /**
   * Finalizes the recording file by adding closing brackets. Without calling this method, the recording file is
   * incomplete and it fails to parse.
   */
  async finish(): Promise<void> {
    try {
      await fs.appendFile(this.filePath, '  ]\n}\n');
    } catch (err) {
      this.logger.error('Failed to finalize recording file', { error: err });
    }
  }

  /**
   * Finalizes the recording file by adding the error and closing brackets. Without calling this method or `finish`,
   * the recording file is incomplete and it fails to parse.
   * @param error - The error that occurred during circuit execution
   */
  async finishWithError(error: unknown): Promise<void> {
    try {
      await fs.appendFile(this.filePath, '  ],\n');
      await fs.appendFile(this.filePath, `  "error": ${JSON.stringify(error)}\n`);
      await fs.appendFile(this.filePath, '}\n');
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
