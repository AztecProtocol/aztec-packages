import type { ForeignCallHandler } from '@aztec/noir-protocol-circuits-types/types';
import type { FunctionArtifactWithContractName } from '@aztec/stdlib/abi';
import type { NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';

import type { ExecutionError } from '@noir-lang/acvm_js';
import { abiDecodeError } from '@noir-lang/noirc_abi';
import type { Abi } from '@noir-lang/types';

import type { ACIRCallback, ACIRExecutionResult } from '../acvm/acvm.js';
import type { ACVMWitness } from '../acvm/acvm_types.js';

/**
 * Low level simulation interface
 */
export interface SimulationProvider {
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
  ): Promise<ACVMWitness>;

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

export type ErrorWithPayload = ExecutionError & { decodedAssertionPayload?: any };

// Error handling taken from noir/noir-repo/tooling/noir_js/src/witness_generation.ts.
// TODO: import this in isolation without having to import noir_js in its entirety.
export function parseErrorPayload(abi: Abi, originalError: ExecutionError): Error {
  const payload = originalError.rawAssertionPayload;
  if (!payload) {
    return originalError;
  }
  const enrichedError = originalError as ErrorWithPayload;

  try {
    // Decode the payload
    const decodedPayload = abiDecodeError(abi, payload);

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

  return enrichedError;
}
