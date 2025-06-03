import type { ExecutionError, ForeignCallHandler } from '@aztec/noir-acvm_js';
import { abiDecodeError } from '@aztec/noir-noirc_abi';
import { parseDebugSymbols } from '@aztec/stdlib/abi';
import type { FunctionArtifactWithContractName } from '@aztec/stdlib/abi';
import type { NoirCompiledCircuit, NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';

import { type ACIRCallback, type ACIRExecutionResult, extractCallStack } from './acvm/acvm.js';
import type { ACVMWitness } from './acvm/acvm_types.js';
import type { ACVMSuccess } from './acvm_native.js';

/**
 * Low level simulation interface
 */
export interface CircuitSimulator {
  /**
   * Execute a protocol circuit/generate a witness
   * @param input - The initial witness map defining all of the inputs to `circuit`.
   * @param artifact - ACIR circuit bytecode and its metadata.
   * @param callback - A callback to process any foreign calls from the circuit. Can be undefined as for native
   * ACVM simulator we don't process foreign calls.
   * @returns The solved witness calculated by executing the circuit on the provided inputs.
   */
  executeProtocolCircuit(
    input: ACVMWitness,
    artifact: NoirCompiledCircuitWithName,
    callback: ForeignCallHandler | undefined,
  ): Promise<ACVMSuccess>;

  /**
   * Execute a user circuit (smart contract function)/generate a witness
   * @param input - The initial witness map defining all of the inputs to `circuit`.
   * @param artifact - Contract function ACIR circuit bytecode and its metadata.
   * @param callback - A callback to process any foreign calls from the circuit.
   * @returns The solved witness calculated by executing the circuit on the provided inputs, as well as the return
   * witness indices as specified by the circuit.
   */
  executeUserCircuit(
    input: ACVMWitness,
    artifact: FunctionArtifactWithContractName,
    callback: ACIRCallback,
  ): Promise<ACIRExecutionResult>;
}

export type DecodedError = ExecutionError & { decodedAssertionPayload?: any; noirCallStack?: string[] };

// Payload parsing taken from noir/noir-repo/tooling/noir_js/src/witness_generation.ts.
// TODO: import this in isolation without having to import noir_js in its entirety.
export function enrichNoirError(artifact: NoirCompiledCircuit, originalError: ExecutionError): DecodedError {
  const enrichedError = originalError as DecodedError;

  if (originalError.rawAssertionPayload) {
    try {
      // Decode the payload
      const decodedPayload = abiDecodeError(artifact.abi, originalError.rawAssertionPayload);

      if (typeof decodedPayload === 'string') {
        // If it's a string, just add it to the error message
        enrichedError.message = `Circuit execution failed: ${decodedPayload}`;
      } else {
        // If not, attach the payload to the original error
        enrichedError.decodedAssertionPayload = decodedPayload;
      }
    } catch {
      // Ignore errors decoding the payload
    }
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
  } catch {
    // Ignore errors resolving the callstack
  }

  return enrichedError;
}
