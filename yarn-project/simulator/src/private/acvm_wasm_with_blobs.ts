import { Timer } from '@aztec/foundation/timer';
import { type ExecutionError, type ForeignCallHandler, executeCircuit } from '@aztec/noir-acvm_js';
import type { WitnessMap } from '@aztec/noir-types';
import type { FunctionArtifactWithContractName } from '@aztec/stdlib/abi';
import type { NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';

import type { ACIRCallback, ACIRExecutionResult } from './acvm/acvm.js';
import type { ACVMWitness } from './acvm/acvm_types.js';
import type { ACVMSuccess } from './acvm_native.js';
import { type CircuitSimulator, enrichNoirError } from './circuit_simulator.js';

/**
 * A circuit simulator that uses the WASM simulator with the ability to handle blobs via the foreign call handler.
 * This class is temporary while brillig cannot handle the blob math, and it is kept separate
 * because the zkg commitment library used in the blob code is not browser compatible.
 *
 * It is only used in the context of server-side code executing simulated protocol circuits.
 */
export class WASMSimulatorWithBlobs implements CircuitSimulator {
  async executeProtocolCircuit(
    input: WitnessMap,
    artifact: NoirCompiledCircuitWithName,
    callback: ForeignCallHandler,
  ): Promise<ACVMSuccess> {
    // Decode the bytecode from base64 since the acvm does not know about base64 encoding
    const decodedBytecode = Buffer.from(artifact.bytecode, 'base64');
    //
    // Execute the circuit
    try {
      const timer = new Timer();
      const _witnessMap = await executeCircuit(
        decodedBytecode,
        input,
        callback, // handle calls to debug_log and evaluate_blobs mock
      );
      return { witness: _witnessMap, duration: timer.ms() } as ACVMSuccess;
    } catch (err) {
      // Typescript types caught errors as unknown or any, so we need to narrow its type to check if it has raw
      // assertion payload.
      if (typeof err === 'object' && err !== null && 'rawAssertionPayload' in err) {
        throw enrichNoirError(artifact, err as ExecutionError);
      }
      throw new Error(`Circuit execution failed: ${err}`);
    }
  }

  executeUserCircuit(
    _input: ACVMWitness,
    _artifact: FunctionArtifactWithContractName,
    _callback: ACIRCallback,
  ): Promise<ACIRExecutionResult> {
    throw new Error('Not implemented');
  }
}
