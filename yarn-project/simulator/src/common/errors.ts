import type { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { RawAssertionPayload } from '@aztec/noir-acvm_js';
import { abiDecodeError } from '@aztec/noir-noirc_abi';
import type {
  BrilligFunctionId,
  DebugFileMap,
  DebugInfo,
  FunctionAbi,
  LocationNodeDebugInfo,
  OpcodeLocation,
} from '@aztec/stdlib/abi';
import {
  type FailingFunction,
  type NoirCallStack,
  SimulationError,
  type SourceCodeLocation,
} from '@aztec/stdlib/errors';

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
 * Resolves the source code locations from an array of opcode locations
 */
export function resolveOpcodeLocations(
  opcodeLocations: OpcodeLocation[],
  debug: DebugInfo,
  files: DebugFileMap,
  brilligFunctionId?: BrilligFunctionId,
): SourceCodeLocation[] {
  let locations = opcodeLocations.flatMap(opcodeLocation =>
    getSourceCodeLocationsFromOpcodeLocation(opcodeLocation, debug, files, brilligFunctionId),
  );

  // Adds the acir call stack if the last location is a brillig opcode
  if (locations.length > 0) {
    const decomposedOpcodeLocation = opcodeLocations[opcodeLocations.length - 1].split('.');
    if (decomposedOpcodeLocation.length === 2) {
      const acirCallstackId = debug.acir_locations[decomposedOpcodeLocation[0]];
      if (acirCallstackId !== undefined) {
        const callStack = debug.location_tree.locations[acirCallstackId];
        const acirCallstack = getCallStackFromLocationNode(callStack, debug.location_tree.locations, files);
        locations = acirCallstack.concat(locations);
      }
    }
  }
  return locations;
}

function getCallStackFromLocationNode(
  callStack: LocationNodeDebugInfo,
  locationTree: LocationNodeDebugInfo[],
  files: DebugFileMap,
): SourceCodeLocation[] {
  const result: SourceCodeLocation[] = [];

  while (callStack.parent !== null) {
    const { file: fileId, span } = callStack.value;

    const { path, source } = files[fileId];

    const locationText = source.substring(span.start, span.end);
    const precedingText = source.substring(0, span.start);
    const previousLines = precedingText.split('\n');
    // Lines and columns in stacks are one indexed.
    const line = previousLines.length;
    const column = previousLines[previousLines.length - 1].length + 1;

    // Unshift since we are exploring child nodes first
    result.unshift({
      filePath: path,
      line,
      column,
      fileSource: source,
      locationText,
    });

    callStack = locationTree[callStack.parent];
  }

  return result;
}
/**
 * Extracts the call stack from the location of a failing opcode and the debug metadata.
 * One opcode can point to multiple calls due to inlining.
 */
function getSourceCodeLocationsFromOpcodeLocation(
  opcodeLocation: string,
  debug: DebugInfo,
  files: DebugFileMap,
  brilligFunctionId?: BrilligFunctionId,
): SourceCodeLocation[] {
  let callStackID = debug.acir_locations[opcodeLocation];
  const brilligLocation = extractBrilligLocation(opcodeLocation);
  if (brilligFunctionId !== undefined && brilligLocation !== undefined) {
    callStackID = debug.brillig_locations[brilligFunctionId][brilligLocation];
    if (callStackID === undefined) {
      return [];
    }
  }

  if (callStackID === undefined) {
    return [];
  }
  const callStack = debug.location_tree.locations[callStackID];
  return getCallStackFromLocationNode(callStack, debug.location_tree.locations, files);
}

/**
 * Extracts a brillig location from an opcode location.
 */
function extractBrilligLocation(opcodeLocation: string): string | undefined {
  const splitted = opcodeLocation.split('.');
  if (splitted.length === 2) {
    return splitted[1];
  }
  return undefined;
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
