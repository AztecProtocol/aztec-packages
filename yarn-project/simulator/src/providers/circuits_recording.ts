import { createLogger } from '@aztec/foundation/log';
import type { FunctionArtifactWithContractName } from '@aztec/stdlib/abi';

import type { ForeignCallInput } from '@noir-lang/acvm_js';
import { createHash } from 'crypto';
import fs from 'fs/promises';
// TODO(benesjan): What about browser?
import path from 'path';

import type { ACIRCallback } from '../acvm/acvm.js';
import type { ACVMWitness } from '../acvm/acvm_types.js';
import { Oracle } from '../acvm/oracle/oracle.js';

/**
 * Sets up recording of circuit inputs and wraps the callback to record oracle calls.
 * If CIRCUIT_RECORD_DIR env var is not set, returns the original callback without recording.
 * @param input Initial witness input to record
 * @param callback The callback to wrap with recording
 * @param artifact The artifact of the circuit being executed
 * @returns Promise<ACIRCallback> The wrapped callback that records oracle calls
 */
export async function setupRecordingIfEnabledAndGetWrappedCallback(
  input: ACVMWitness,
  callback: ACIRCallback,
  artifact: FunctionArtifactWithContractName,
): Promise<ACIRCallback> {
  const logger = createLogger('simulator:acvm:recording');
  const recordDir = process.env.CIRCUIT_RECORD_DIR;

  if (!recordDir) {
    logger.debug('CIRCUIT_RECORD_DIR not set, recording middleware disabled');
    return callback;
  }

  try {
    await fs.mkdir(recordDir, { recursive: true });
  } catch (err) {
    logger.error('Failed to create recording directory', { error: err });
    return callback;
  }

  // Get the filename as a combination of timestamp, the contract name, function name and the bytecode hash
  const bytecodeHash = createHash('md5').update(artifact.bytecode).digest('hex');
  const timestamp = Date.now();
  const filename = `${Math.floor(timestamp)}_${artifact.contractName}_${artifact.name}_${bytecodeHash}.jsonl`;

  const filePath = path.join(recordDir, filename);
  await recordInput(input, filePath, logger);
  return createRecordingCallback(callback, filePath, logger);
}

/**
 * Records the initial witness input to the specified file
 * @param input The witness input to record
 * @param filePath Full path to file to record to
 * @param logger Logger instance to use
 */
async function recordInput(input: ACVMWitness, filePath: string, logger: ReturnType<typeof createLogger>) {
  try {
    const entry = {
      type: 'input',
      witness: Object.fromEntries(input),
    };
    await fs.appendFile(filePath, JSON.stringify(entry) + '\n');
  } catch (err) {
    logger.error('Failed to log circuit input', { error: err });
  }
}

/**
 * Creates a recording middleware that wraps an ACIRCallback to record inputs and outputs.
 * @param callback The inner callback to wrap
 * @param filePath Full path to file to record to
 * @param logger Logger instance to use
 * @returns A new ACIRCallback that logs calls and forwards to the inner callback
 */
function createRecordingCallback(
  callback: ACIRCallback,
  filePath: string,
  logger: ReturnType<typeof createLogger>,
): ACIRCallback {
  const recordCall = async (name: string, inputs: unknown[], outputs: unknown) => {
    try {
      const entry = {
        type: 'oracle_call',
        name,
        inputs,
        outputs,
      };
      await fs.appendFile(filePath, JSON.stringify(entry) + '\n');
    } catch (err) {
      logger.error('Failed to log circuit call', { error: err });
    }
  };

  // Create a new callback object with the same keys
  const recordingCallback: ACIRCallback = {} as ACIRCallback;

  // For each oracle function in the original callback
  const oracleMethods = Object.getOwnPropertyNames(Oracle.prototype).filter(name => name !== 'constructor');

  for (const name of oracleMethods) {
    const fn = callback[name as keyof ACIRCallback];
    if (!fn) {
      continue;
    }

    recordingCallback[name as keyof ACIRCallback] = (...args: ForeignCallInput[]): ReturnType<typeof fn> => {
      const result = fn.call(callback, ...args);
      if (result instanceof Promise) {
        return result.then(async r => {
          await recordCall(name, args, r);
          return r;
        }) as ReturnType<typeof fn>;
      }
      void recordCall(name, args, result);
      return result;
    };
  }

  return recordingCallback;
}
