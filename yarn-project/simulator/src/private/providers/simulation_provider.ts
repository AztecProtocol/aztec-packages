import { parseDebugSymbols } from '@aztec/stdlib/abi';
import type { NoirCompiledCircuit } from '@aztec/stdlib/noir';

import type { ExecutionError } from '@noir-lang/acvm_js';
import { abiDecodeError } from '@noir-lang/noirc_abi';
import type { WitnessMap } from '@noir-lang/types';

import { type ACIRCallback, type ACIRExecutionResult, extractCallStack } from '../acvm/acvm.js';
import type { ACVMWitness } from '../acvm/acvm_types.js';

/**
 * Low level simulation interface
 */
export interface SimulationProvider {
  executeProtocolCircuit(input: WitnessMap, compiledCircuit: NoirCompiledCircuit): Promise<WitnessMap>;
  executeUserCircuit(acir: Buffer, initialWitness: ACVMWitness, callback: ACIRCallback): Promise<ACIRExecutionResult>;
}

export type DecodedError = ExecutionError & { decodedAssertionPayload?: any; noirCallStack?: string[] };

// Payload parsing taken from noir/noir-repo/tooling/noir_js/src/witness_generation.ts.
// TODO: import this in isolation without having to import noir_js in its entirety.
export function enrichNoirError(artifact: NoirCompiledCircuit, originalError: ExecutionError): DecodedError {
  const payload = originalError.rawAssertionPayload;
  if (!payload) {
    return originalError;
  }
  const enrichedError = originalError as DecodedError;

  try {
    // Decode the payload
    const decodedPayload = abiDecodeError(artifact.abi, payload);

    if (typeof decodedPayload === 'string') {
      // If it's a string, just add it to the error message
      enrichedError.message = `Circuit execution failed: ${decodedPayload}`;
    } else {
      // If not, attach the payload to the original error
      enrichedError.decodedAssertionPayload = decodedPayload;
    }
  } catch (_errorDecoding) {
    // Ignore errors decoding the payload
  }

  try {
    // Decode the callstack
    const callStack = extractCallStack(originalError, {
      // TODO(https://github.com/AztecProtocol/aztec-packages/issues/5813)
      // We only support handling debug info for the circuit entry point.
      // So for now we simply index into the first debug info.
      debugSymbols: parseDebugSymbols(artifact.debug_symbols)[0],
      files: artifact.file_map,
    });

    enrichedError.noirCallStack = callStack?.map(errorLocation => {
      if (typeof errorLocation === 'string') {
        return `at opcode ${errorLocation}`;
      } else {
        return `at ${errorLocation.locationText} (${errorLocation.filePath}:${errorLocation.line}:${errorLocation.column})`;
      }
    });
  } catch (_errorResolving) {
    // Ignore errors resolving the callstack
  }

  return enrichedError;
}
