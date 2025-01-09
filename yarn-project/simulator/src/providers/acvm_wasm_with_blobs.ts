import { foreignCallHandler } from '@aztec/noir-protocol-circuits-types/server';
import { type NoirCompiledCircuit } from '@aztec/types/noir';

import { ExecutionError, executeCircuit } from '@noir-lang/acvm_js';
import { type WitnessMap } from '@noir-lang/types';

import { ACIRCallback, ACIRExecutionResult } from '../acvm/acvm.js';
import { type ACVMWitness } from '../acvm/acvm_types.js';
import { type SimulationProvider, parseErrorPayload } from '../common/simulation_provider.js';

/**
 * A simulation provider that uses the WASM simulator with the ability to handle blobs via the foreign call handler.
 * This class is temporary while brillig cannot handle the blob math, and it is kept separate
 * because the zkg commitment library used in the blob code is not browser compatible.
 *
 * It is only used in the context of server-side code executing simulated protocol circuits.
 */
export class WASMSimulatorWithBlobs implements SimulationProvider {
  async executeProtocolCircuit(input: WitnessMap, compiledCircuit: NoirCompiledCircuit): Promise<WitnessMap> {
    // Execute the circuit on those initial witness values
    //
    // Decode the bytecode from base64 since the acvm does not know about base64 encoding
    const decodedBytecode = Buffer.from(compiledCircuit.bytecode, 'base64');
    //
    // Execute the circuit
    try {
      const _witnessMap = await executeCircuit(
        decodedBytecode,
        input,
        foreignCallHandler, // handle calls to debug_log and evaluate_blobs mock
      );

      return _witnessMap;
    } catch (err) {
      // Typescript types catched errors as unknown or any, so we need to narrow its type to check if it has raw assertion payload.
      if (typeof err === 'object' && err !== null && 'rawAssertionPayload' in err) {
        throw parseErrorPayload(compiledCircuit.abi, err as ExecutionError);
      }
      throw new Error(`Circuit execution failed: ${err}`);
    }
  }

  async executeUserCircuit(
    _acir: Buffer,
    _initialWitness: ACVMWitness,
    _callback: ACIRCallback,
  ): Promise<ACIRExecutionResult> {
    throw new Error('Not implemented');
  }
}
