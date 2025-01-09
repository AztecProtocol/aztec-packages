import { type NoirCompiledCircuit } from '@aztec/types/noir';

import { ExecutionError } from '@noir-lang/acvm_js';
import { abiDecodeError } from '@noir-lang/noirc_abi';
import { Abi, type WitnessMap } from '@noir-lang/types';

import { type ACIRCallback, type ACIRExecutionResult } from '../acvm/acvm.js';
import { type ACVMWitness } from '../acvm/acvm_types.js';

/**
 * Low level simulation interface
 */
export interface SimulationProvider {
  executeProtocolCircuit(input: WitnessMap, compiledCircuit: NoirCompiledCircuit): Promise<WitnessMap>;
  executeUserCircuit(acir: Buffer, initialWitness: ACVMWitness, callback: ACIRCallback): Promise<ACIRExecutionResult>;
}

export type ErrorWithPayload = ExecutionError & { decodedAssertionPayload?: any };

// Error handling taken from noir/noir-repo/tooling/noir_js/src/witness_generation.ts.
// TODO: import this in isolation without having to import noir_js in its entirety.
export function parseErrorPayload(abi: Abi, originalError: ExecutionError): Error {
  const payload = originalError.rawAssertionPayload;
  if (!payload) return originalError;
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
