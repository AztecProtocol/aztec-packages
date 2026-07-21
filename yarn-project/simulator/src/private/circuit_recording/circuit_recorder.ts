import { sha512 } from '@aztec/foundation/crypto/sha512';
import { type Logger, type LoggerBindings, resolveLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { ForeignCallHandler, ForeignCallInput, ForeignCallOutput } from '@aztec/noir-acvm_js';

import { AsyncLocalStorage } from 'node:async_hooks';

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

/** Inputs needed to open a recording for a single circuit execution. */
export type RecordingMetadata = {
  input: ACVMWitness;
  bytecode: Buffer;
  circuitName: string;
  functionName: string;
};

/**
 * Class responsible for recording circuit inputs necessary to replay the circuit. These inputs are the initial witness
 * map and the oracle calls made during the circuit execution/witness generation.
 *
 * The active recording for an execution lives in `AsyncLocalStorage`, so each (possibly nested) circuit execution owns
 * its own recording and concurrent or re-entrant executions cannot corrupt one another's state. Nested executions
 * (`aztec_prv_callPrivateFunction`, utility calls) re-enter {@link record}, which links the child to the recording
 * active in the enclosing async context and lets ALS restore the parent automatically when the child completes.
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
  protected readonly logger: Logger;

  readonly #recordings = new AsyncLocalStorage<CircuitRecording>();

  protected constructor(loggerOrBindings?: Logger | LoggerBindings) {
    this.logger = resolveLogger('simulator:acvm:recording', loggerOrBindings);
  }

  /**
   * Records a single circuit execution. Opens a recording for the circuit (linked as a child of the recording active
   * in the current async context, if any), runs `fn` within that recording's context, and finalizes it. The recording
   * is returned alongside the result so callers can derive per-circuit stats (e.g. oracle timings).
   *
   * Recorder bookkeeping never alters execution: if `fn` throws, the error is attached to the recording and re-thrown
   * unchanged.
   * @param metadata - Identifies the circuit and its initial witness.
   * @param fn - Runs the circuit execution; its oracle calls are recorded into this recording.
   */
  record<T>(metadata: RecordingMetadata, fn: () => Promise<T>): Promise<{ result: T; recording: CircuitRecording }> {
    const parent = this.#recordings.getStore();
    const recording = new CircuitRecording(
      metadata.circuitName,
      metadata.functionName,
      sha512(metadata.bytecode).toString('hex'),
      Object.fromEntries(metadata.input),
    );
    recording.setParent(parent);

    return this.#recordings.run(recording, async () => {
      await this.onStart(recording);
      try {
        const result = await fn();
        await this.onFinish(recording);
        return { result, recording };
      } catch (error) {
        recording.error = JSON.stringify(error);
        await this.onError(recording, error);
        throw error;
      }
    });
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
   * Wraps a user circuit callback to record all oracle calls. A nested circuit entered via an oracle (e.g.
   * `aztec_prv_callPrivateFunction`) re-enters {@link record}, so its own oracle calls land on the child recording and
   * this circuit's calls (including the entering oracle call itself) land on this recording once the child completes.
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

      recordingCallback[name as keyof ACIRCallback] = (...args: ForeignCallInput[]): ReturnType<typeof fn> => {
        const timer = new Timer();
        const result = fn.call(callback, ...args);
        if (result instanceof Promise) {
          return result.then(async r => {
            await this.recordCall(name, args, r, timer.ms());
            return r;
          }) as ReturnType<typeof fn>;
        }
        void this.recordCall(name, args, result, timer.ms());
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
      await this.recordCall(name, inputs, result, timer.ms());
      return result;
    };
  }

  /**
   * Records a single oracle/foreign call with its inputs and outputs against the recording active in the current
   * async context.
   * @param name - Name of the call
   * @param inputs - Input arguments
   * @param outputs - Output results
   */
  recordCall(name: string, inputs: unknown[], outputs: unknown, time: number): Promise<OracleCall> {
    const recording = this.#recordings.getStore();
    const entry = {
      name,
      inputs,
      outputs,
      time,
      stackDepth: depthOf(recording),
    };
    // Outside any active recording context (e.g. a stray call after the scope closed, or a direct unit-test call)
    // there is nowhere to record; return the entry without throwing into the execution path.
    recording?.oracleCalls.push(entry);
    return Promise.resolve(entry);
  }

  /** The recording active in the current async context, if any. */
  protected currentRecording(): CircuitRecording | undefined {
    return this.#recordings.getStore();
  }

  /** Hook invoked when a recording opens, within the recording's context. Overridden to persist recordings. */
  protected onStart(_recording: CircuitRecording): Promise<void> {
    return Promise.resolve();
  }

  /** Hook invoked when a recording completes successfully, within the recording's context. */
  protected onFinish(_recording: CircuitRecording): Promise<void> {
    return Promise.resolve();
  }

  /** Hook invoked when a recording's execution throws, within the recording's context. */
  protected onError(_recording: CircuitRecording, _error: unknown): Promise<void> {
    return Promise.resolve();
  }
}

/** Depth of a recording in the call tree: 0 for a top-level circuit, incremented per nested circuit. */
function depthOf(recording: CircuitRecording | undefined): number {
  let depth = 0;
  for (let ancestor = recording?.parent; ancestor; ancestor = ancestor.parent) {
    depth++;
  }
  return depth;
}
