import { sha512 } from '@aztec/foundation/crypto';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { ForeignCallHandler, ForeignCallInput, ForeignCallOutput } from '@aztec/noir-acvm_js';

import type { ACIRCallback } from '../acvm/acvm.js';
import type { ACVMWitness } from '../acvm/acvm_types.js';

export type OracleCall = {
  name: string;
  inputs: unknown[];
  outputs: unknown;
  time: number;
  // Due to the recursive nature of the simulator, we might have
  // oracle calls performed after a foreign call (which is itself an oracle call)
  // We keep track of the stack depth in this variable to ensure the recorded oracle
  // calls are correctly associated with the right circuit.
  // This is only use as a debugging tool
  stackDepth: number;
};

export class CircuitRecording {
  circuitName: string;
  functionName: string;
  bytecodeSHA512Hash: string;
  timestamp: number;
  inputs: Record<string, string>;
  oracleCalls: OracleCall[];
  error?: string;
  parent?: CircuitRecording;

  constructor(circuitName: string, functionName: string, bytecodeSHA512Hash: string, inputs: Record<string, string>) {
    this.circuitName = circuitName;
    this.functionName = functionName;
    this.bytecodeSHA512Hash = bytecodeSHA512Hash;
    this.timestamp = Date.now();
    this.inputs = inputs;
    this.oracleCalls = [];
  }

  setParent(recording?: CircuitRecording): void {
    this.parent = recording;
  }
}

/**
 * Class responsible for recording circuit inputs necessary to replay the circuit. These inputs are the initial witness
 * map and the oracle calls made during the circuit execution/witness generation.
 *
 * Example recording object:
 * ```json
 * {
 *   "circuitName": "AMM",
 *   "functionName": "add_liquidity",
 *   "bytecodeSHA512Hash": "b46c640ed38f20eac5f61a5e41d8dd1e",
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
  protected readonly logger = createLogger('simulator:acvm:recording');

  protected recording?: CircuitRecording;

  private stackDepth: number = 0;
  private newCircuit: boolean = true;

  protected constructor() {}

  /**
   * Initializes a new circuit recording session.
   * @param recordDir - Directory to store the recording
   * @param input - Circuit input witness
   * @param circuitBytecode - Compiled circuit bytecode
   * @param circuitName - Name of the circuit
   * @param functionName - Name of the circuit function (defaults to 'main'). This is meaningful only for
   * contracts as protocol circuits artifacts always contain a single entrypoint function called 'main'.
   */
  start(input: ACVMWitness, circuitBytecode: Buffer, circuitName: string, functionName: string): Promise<void> {
    const parentRef = this.recording;
    if (this.newCircuit) {
      this.recording = new CircuitRecording(
        circuitName,
        functionName,
        sha512(circuitBytecode).toString('hex'),
        Object.fromEntries(input),
      );
    }
    this.recording!.setParent(parentRef);

    return Promise.resolve();
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
    const oracleMethods = Object.keys(callback);

    for (const name of oracleMethods) {
      const fn = callback[name as keyof ACIRCallback];
      if (!fn || typeof fn !== 'function') {
        throw new Error(`Oracle method ${name} not found when setting up recording callback`);
      }

      const isExternalCall = (name as keyof ACIRCallback) === 'callPrivateFunction';

      recordingCallback[name as keyof ACIRCallback] = (...args: ForeignCallInput[]): ReturnType<typeof fn> => {
        const timer = new Timer();
        // If we're entering another circuit via `callPrivateFunction`, we increase the stack depth and set the
        // newCircuit variable to ensure we are creating a new recording object.
        if (isExternalCall) {
          this.stackDepth++;
          this.newCircuit = true;
        }
        const result = fn.call(callback, ...args);
        if (result instanceof Promise) {
          return result.then(async r => {
            // Once we leave the nested circuit, we decrease the stack depth and set newCircuit to false
            // since we are going back to the "parent" circuit which can never be new
            if (isExternalCall) {
              this.stackDepth--;
              this.newCircuit = false;
              this.recording = this.recording!.parent;
            }
            await this.recordCall(name, args, r, timer.ms(), this.stackDepth);
            return r;
          }) as ReturnType<typeof fn>;
        }
        // Once we leave the nested circuit, we decrease the stack depth and set newCircuit to false
        // since we are going back to the "parent" circuit which can never be new
        if (isExternalCall) {
          this.stackDepth--;
          this.newCircuit = false;
          this.recording = this.recording!.parent;
        }
        void this.recordCall(name, args, result, timer.ms(), this.stackDepth);
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
      const timer = new Timer();
      const result = await callback(name, inputs);
      await this.recordCall(name, inputs, result, timer.ms(), 0);
      return result;
    };
  }

  /**
   * Records a single oracle/foreign call with its inputs and outputs.
   * @param name - Name of the call
   * @param inputs - Input arguments
   * @param outputs - Output results
   */
  recordCall(name: string, inputs: unknown[], outputs: unknown, time: number, stackDepth: number): Promise<OracleCall> {
    const entry = {
      name,
      inputs,
      outputs,
      time,
      stackDepth,
    };
    this.recording!.oracleCalls.push(entry);
    return Promise.resolve(entry);
  }

  /**
   * Finalizes the recording by resetting the state and returning the recording object.
   */
  finish(): Promise<CircuitRecording> {
    const result = this.recording;
    // If this is the top-level circuit recording, we reset the state for the next simulator call
    if (!result!.parent) {
      this.newCircuit = true;
      this.recording = undefined;
    }
    return Promise.resolve(result!);
  }

  /**
   * Finalizes the recording by resetting the state and returning the recording object with an attached error.
   * @param error - The error that occurred during circuit execution
   */
  finishWithError(error: unknown): Promise<CircuitRecording> {
    const result = this.recording;
    // If this is the top-level circuit recording, we reset the state for the next simulator call
    if (!result!.parent) {
      this.newCircuit = true;
      this.recording = undefined;
    }
    result!.error = JSON.stringify(error);
    return Promise.resolve(result!);
  }
}
