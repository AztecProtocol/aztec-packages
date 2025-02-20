import { type NoirCompiledCircuit } from '@aztec/circuits.js/noir';
import { createLogger } from '@aztec/foundation/log';
import { foreignCallHandler } from '@aztec/noir-protocol-circuits-types/client';

import initACVM, { type ExecutionError, executeCircuit } from '@noir-lang/acvm_js';
import initAbi from '@noir-lang/noirc_abi';
import { type WitnessMap } from '@noir-lang/types';

import { type ACIRCallback, acvm } from '../acvm/acvm.js';
import { type ACVMWitness } from '../acvm/acvm_types.js';
import { type SimulationProvider, parseErrorPayload } from '../common/simulation_provider.js';

export class WASMSimulator implements SimulationProvider {
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

  async executeProtocolCircuit(input: WitnessMap, compiledCircuit: NoirCompiledCircuit): Promise<WitnessMap> {
    this.log.debug('init', { hash: compiledCircuit.hash });
    await this.init();
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
        foreignCallHandler, // handle calls to debug_log
      );
      this.log.debug('execution successful', { hash: compiledCircuit.hash });
      return _witnessMap;
    } catch (err) {
      // Typescript types catched errors as unknown or any, so we need to narrow its type to check if it has raw assertion payload.
      if (typeof err === 'object' && err !== null && 'rawAssertionPayload' in err) {
        const parsed = parseErrorPayload(compiledCircuit.abi, err as ExecutionError);
        this.log.debug('execution failed', {
          hash: compiledCircuit.hash,
          error: parsed,
          message: parsed.message,
        });
        throw parsed;
      }
      this.log.debug('execution failed', { hash: compiledCircuit.hash, error: err });
      throw new Error(`Circuit execution failed: ${err}`);
    }
  }

  async executeUserCircuit(acir: Buffer, initialWitness: ACVMWitness, callback: ACIRCallback) {
    await this.init();
    return acvm(acir, initialWitness, callback);
  }
}
