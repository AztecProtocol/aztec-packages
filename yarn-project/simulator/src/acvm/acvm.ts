import { type NoirCallStack } from '@aztec/circuit-types';
import type { FunctionDebugMetadata } from '@aztec/foundation/abi';
import { createLogger } from '@aztec/foundation/log';

import {
  type ExecutionError,
  type ForeignCallInput,
  type ForeignCallOutput,
  executeCircuitWithReturnWitness,
} from '@noir-lang/acvm_js';

import { resolveOpcodeLocations, traverseCauseChain } from '../common/errors.js';
import { type ACVMWitness } from './acvm_types.js';
import { type ORACLE_NAMES } from './oracle/index.js';

/**
 * The callback interface for the ACIR.
 */
type ACIRCallback = Record<
  ORACLE_NAMES,
  (
    ...args: ForeignCallInput[]
  ) =>
    | void
    | Promise<void>
    | ForeignCallOutput
    | ForeignCallOutput[]
    | Promise<ForeignCallOutput>
    | Promise<ForeignCallOutput[]>
>;

/**
 * The result of executing an ACIR.
 */
export interface ACIRExecutionResult {
  /**
   * An execution result contains two witnesses.
   * 1. The partial witness of the execution.
   * 2. The return witness which contains the given public return values within the full witness.
   */
  partialWitness: ACVMWitness;
  returnWitness: ACVMWitness;
}

/**
 * The function call that executes an ACIR.
 */
export async function acvm(
  acir: Buffer,
  initialWitness: ACVMWitness,
  callback: ACIRCallback,
): Promise<ACIRExecutionResult> {
  const logger = createLogger('simulator:acvm');

  const solvedAndReturnWitness = await executeCircuitWithReturnWitness(
    acir,
    initialWitness,
    async (name: string, args: ForeignCallInput[]) => {
      try {
        logger.debug(`Oracle callback ${name}`);
        const oracleFunction = callback[name as ORACLE_NAMES];
        if (!oracleFunction) {
          throw new Error(`Oracle callback ${name} not found`);
        }

        const result = await oracleFunction.call(callback, ...args);

        if (typeof result === 'undefined') {
          return [];
        } else if (result instanceof Array && !result.every(item => typeof item === 'string')) {
          // We are dealing with a nested array which means that we do not need it wrap it in another array as to have
          // the nested array structure it is already "wrapped".
          return result as ForeignCallOutput[];
        } else {
          return [result] as ForeignCallOutput[];
        }
      } catch (err) {
        let typedError: Error;
        if (err instanceof Error) {
          typedError = err;
        } else {
          typedError = new Error(`Error in oracle callback ${err}`);
        }
        logger.error(`Error in oracle callback ${name}: ${typedError.message}`);
        throw typedError;
      }
    },
  ).catch((err: Error) => {
    // Wasm callbacks act as a boundary for stack traces, so we capture it here and complete the error if it happens.
    const stack = new Error().stack;

    traverseCauseChain(err, cause => {
      if (cause.stack) {
        cause.stack += stack;
      }
    });

    throw err;
  });

  return { partialWitness: solvedAndReturnWitness.solvedWitness, returnWitness: solvedAndReturnWitness.returnWitness };
}

/**
 * Extracts the call stack from an thrown by the acvm.
 * @param error - The error to extract from.
 * @param debug - The debug metadata of the function called.
 * @returns The call stack, if available.
 */
export function extractCallStack(
  error: Error | ExecutionError,
  debug?: FunctionDebugMetadata,
): NoirCallStack | undefined {
  if (!('callStack' in error) || !error.callStack) {
    return undefined;
  }
  const { callStack, brilligFunctionId } = error;
  if (!debug) {
    return callStack;
  }

  try {
    return resolveOpcodeLocations(callStack, debug, brilligFunctionId);
  } catch (err) {
    return callStack;
  }
}
