import { type NoirCompiledCircuit } from '@aztec/circuits.js/noir';

import { type ExecutionError } from '@noir-lang/acvm_js';
import { abiDecodeError } from '@noir-lang/noirc_abi';
import { type Abi, type WitnessMap } from '@noir-lang/types';

import { type ACIRCallback, type ACIRExecutionResult } from '../acvm/acvm.js';
import { type ACVMWitness } from '../acvm/acvm_types.js';

/**
 * Low level simulation interface
 */
export interface SimulationProvider {
  /**
   * Execute a protocol circuit
   * @param input - The initial witness map defining all of the inputs to `circuit`..
   * @param compiledCircuit - ACIR circuit bytecode and its metadata.
   * @returns The solved witness calculated by executing the circuit on the provided inputs.
   */
  executeProtocolCircuit(input: WitnessMap, compiledCircuit: NoirCompiledCircuit): Promise<WitnessMap>;

  /**
   * The function call that executes an ACIR.
   * @param acir - The ACIR circuit bytecode to execute.
   * @param initialWitness - The initial witness map defining all of the inputs to `circuit`.
   * @param callback - A callback to process any foreign calls from the circuit.
   * @returns The solved witness calculated by executing the circuit on the provided inputs, as well as the return
   * witness indices as specified by the circuit.
   */
  executeUserCircuit(acir: Buffer, initialWitness: ACVMWitness, callback: ACIRCallback): Promise<ACIRExecutionResult>;
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
