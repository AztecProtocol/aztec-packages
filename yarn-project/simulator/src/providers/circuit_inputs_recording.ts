import { createLogger } from '@aztec/foundation/log';

import type { ForeignCallInput } from '@noir-lang/acvm_js';
import fs from 'fs/promises';

import type { ACIRCallback } from '../acvm/acvm.js';
import { Oracle } from '../acvm/oracle/oracle.js';

/**
 * Creates a recording middleware that wraps an ACIRCallback to record inputs and outputs.
 * @param callback The inner callback to wrap
 * @returns A new ACIRCallback that logs calls and forwards to the inner callback
 */
export function createRecordingCallback(callback: ACIRCallback): ACIRCallback {
  const logger = createLogger('simulator:acvm:recording');
  const filePath = process.env.CIRCUIT_RECORD_FILE_PATH;

  if (!filePath) {
    logger.debug('CIRCUIT_RECORD_FILE_PATH not set, recording middleware disabled');
    return callback;
  }

  const recordCall = async (name: string, inputs: unknown[], outputs: unknown) => {
    try {
      const entry = {
        timestamp: Date.now(),
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
