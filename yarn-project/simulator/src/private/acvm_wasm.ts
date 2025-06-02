import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import initACVM, { type ExecutionError, type ForeignCallHandler, executeCircuit } from '@aztec/noir-acvm_js';
import initAbi from '@aztec/noir-noirc_abi';
import type { FunctionArtifactWithContractName } from '@aztec/stdlib/abi';
import type { NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';

import { type ACIRCallback, type ACIRExecutionResult, acvm } from './acvm/acvm.js';
import type { ACVMWitness } from './acvm/acvm_types.js';
import type { ACVMSuccess } from './acvm_native.js';
import { type CircuitSimulator, enrichNoirError } from './circuit_simulator.js';

export class WASMSimulator implements CircuitSimulator {
  constructor(protected log = createLogger('wasm-simulator')) {}

  async init(): Promise<void> {
    // If these are available, then we are in the
    // web environment. For the node environment, this
    // is a no-op.
    if (typeof initAbi === 'function') {
      /** @ts-expect-error The node bundle doesn't include these default imports, so TS complains */
      await Promise.all([initAbi(), initACVM()]);
    }
  }

  async executeProtocolCircuit(
    input: ACVMWitness,
    artifact: NoirCompiledCircuitWithName,
    callback: ForeignCallHandler,
  ): Promise<ACVMSuccess> {
    this.log.debug('init', { hash: artifact.hash });
    await this.init();

    // Decode the bytecode from base64 since the acvm does not know about base64 encoding
    const decodedBytecode = Buffer.from(artifact.bytecode, 'base64');
    //
    // Execute the circuit
    try {
      const timer = new Timer();
      const result = await executeCircuit(
        decodedBytecode,
        input,
        callback, // handle calls to debug_log
      );
      this.log.debug('execution successful', { hash: artifact.hash });
      return { witness: result, duration: timer.ms() } as ACVMSuccess;
    } catch (err) {
      // Typescript types caught errors as unknown or any, so we need to narrow its type to check if it has raw
      // assertion payload.
      if (typeof err === 'object' && err !== null && 'rawAssertionPayload' in err) {
        const parsed = enrichNoirError(artifact, err as ExecutionError);
        this.log.debug('execution failed', {
          hash: artifact.hash,
          error: parsed,
          message: parsed.message,
        });
        throw parsed;
      }
      this.log.debug('execution failed', { hash: artifact.hash, error: err });
      throw new Error(`Circuit execution failed: ${err}`);
    }
  }

  async executeUserCircuit(
    input: ACVMWitness,
    artifact: FunctionArtifactWithContractName,
    callback: ACIRCallback,
  ): Promise<ACIRExecutionResult> {
    await this.init();
    return acvm(artifact.bytecode, input, callback);
  }
}
