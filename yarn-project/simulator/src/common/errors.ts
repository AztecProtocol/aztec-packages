import {
  type FailingFunction,
  type NoirCallStack,
  SimulationError,
  type SourceCodeLocation,
} from '@aztec/circuit-types';
import { type Fr } from '@aztec/circuits.js';
import type { BrilligFunctionId, FunctionAbi, FunctionDebugMetadata, OpcodeLocation } from '@aztec/foundation/abi';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { type RawAssertionPayload } from '@noir-lang/acvm_js';
import { abiDecodeError } from '@noir-lang/noirc_abi';

/**
 * An error that occurred during the execution of a function.
 * @param message - the error message
 * @param failingFunction - the Aztec function that failed
 * @param noirCallStack - the internal call stack of the function that failed (within the failing Aztec function)
 * @param options - additional error options (an optional "cause" entry allows for a recursive error stack where
 *                  an error's cause may be an ExecutionError itself)
 */
export class ExecutionError extends Error {
  constructor(
    message: string,
    /**
     * The function that failed.
     */
    public failingFunction: FailingFunction,
    /**
     * The noir call stack of the function that failed.
     */
    public noirCallStack?: NoirCallStack,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * Traverses the cause chain of an error.
 * @param error - The error to start from.
 * @param callback - A callback on every error, including the first one.
 */
export function traverseCauseChain(error: Error, callback: (error: Error) => void) {
  let currentError: Error | undefined = error;
  while (currentError) {
    callback(currentError);
    if (currentError.cause && currentError.cause instanceof Error) {
      currentError = currentError.cause;
    } else {
      currentError = undefined;
    }
  }
}

/**
 * Creates a simulation error from an error chain generated during the execution of a function.
 * @param error - The error thrown during execution.
 * @returns - A simulation error.
 */
export function createSimulationError(error: Error, revertData?: Fr[]): SimulationError {
  let rootCause = error;
  let noirCallStack: NoirCallStack | undefined = undefined;
  const aztecCallStack: FailingFunction[] = [];

  traverseCauseChain(error, cause => {
    rootCause = cause;
    if (cause instanceof ExecutionError) {
      aztecCallStack.push(cause.failingFunction);
      if (cause.noirCallStack) {
        noirCallStack = cause.noirCallStack;
      }
    }
  });

  return new SimulationError(rootCause.message, aztecCallStack, revertData, noirCallStack, { cause: rootCause });
}

/**
 * Extracts a brillig location from an opcode location.
 * @param opcodeLocation - The opcode location to extract from. It should be in the format `acirLocation.brilligLocation` or `acirLocation`.
 * @returns The brillig location if the opcode location contains one.
 */
function extractBrilligLocation(opcodeLocation: string): string | undefined {
  const splitted = opcodeLocation.split('.');
  if (splitted.length === 2) {
    return splitted[1];
  }
  return undefined;
}

/**
 * Extracts the call stack from the location of a failing opcode and the debug metadata.
 * One opcode can point to multiple calls due to inlining.
 */
function getSourceCodeLocationsFromOpcodeLocation(
  opcodeLocation: string,
  debug: FunctionDebugMetadata,
  brilligFunctionId?: BrilligFunctionId,
): SourceCodeLocation[] {
  const { debugSymbols, files } = debug;

  let callStack = debugSymbols.locations[opcodeLocation] || [];
  if (callStack.length === 0) {
    const brilligLocation = extractBrilligLocation(opcodeLocation);
    if (brilligFunctionId !== undefined && brilligLocation !== undefined) {
      callStack = debugSymbols.brillig_locations[brilligFunctionId][brilligLocation] || [];
    }
  }
  return callStack.map(call => {
    const { file: fileId, span } = call;

    const { path: filePath, source } = files[fileId];

    const locationText = source.substring(span.start, span.end);
    const precedingText = source.substring(0, span.start);
    const previousLines = precedingText.split('\n');
    // Lines and columns in stacks are one indexed.
    const line = previousLines.length;
    const column = previousLines[previousLines.length - 1].length + 1;

    return { filePath, line, column, locationText };
  });
}

/**
 * Extracts the source code locations for an array of opcode locations
 * @param opcodeLocations - The opcode locations that caused the error.
 * @param debug - The debug metadata of the function.
 * @returns The source code locations.
 */
export function resolveOpcodeLocations(
  opcodeLocations: OpcodeLocation[],
  debug: FunctionDebugMetadata,
  brilligFunctionId?: BrilligFunctionId,
): SourceCodeLocation[] {
  return opcodeLocations.flatMap(opcodeLocation =>
    getSourceCodeLocationsFromOpcodeLocation(opcodeLocation, debug, brilligFunctionId),
  );
}

export function resolveAssertionMessage(errorPayload: RawAssertionPayload, abi: FunctionAbi): string | undefined {
  const decoded = abiDecodeError(
    { parameters: [], error_types: abi.errorTypes, return_type: null }, // eslint-disable-line camelcase
    errorPayload,
  );

  if (typeof decoded === 'string') {
    return decoded;
  } else {
    return jsonStringify(decoded);
  }
}

export function resolveAssertionMessageFromRevertData(revertData: Fr[], abi: FunctionAbi): string | undefined {
  if (revertData.length == 0) {
    return undefined;
  }

  const [errorSelector, ...errorData] = revertData;

  return resolveAssertionMessage(
    {
      selector: errorSelector.toBigInt().toString(),
      data: errorData.map(f => f.toString()),
    },
    abi,
  );
}

export function resolveAssertionMessageFromError(err: Error, abi: FunctionAbi): string {
  if (typeof err === 'object' && err !== null && 'rawAssertionPayload' in err && err.rawAssertionPayload) {
    return `Assertion failed: ${resolveAssertionMessage(err.rawAssertionPayload as RawAssertionPayload, abi)}`;
  } else {
    return err.message;
  }
}
