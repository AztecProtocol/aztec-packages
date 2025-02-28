import { createLogger } from '@aztec/foundation/log';
import type { ForeignCallHandler } from '@aztec/noir-protocol-circuits-types/types';
import type { FunctionArtifactWithContractName } from '@aztec/stdlib/abi';
import type { NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';

import type { ACIRCallback, ACIRExecutionResult } from '../../acvm/acvm.js';
import type { ACVMWitness } from '../../acvm/acvm_types.js';
import type { SimulationProvider } from '../../common/simulation_provider.js';
import { CircuitRecorder } from './circuit_recorder.js';

/**
 * Takes a simulation provider and wraps it in a circuit recorder. See CircuitRecorder for more details on how circuit
 * recording works.
 */
export class SimulationProviderRecorderWrapper implements SimulationProvider {
  constructor(private simulator: SimulationProvider, private log = createLogger('simulator-recorder')) {}

  async executeProtocolCircuit(
    input: ACVMWitness,
    compiledCircuit: NoirCompiledCircuitWithName,
    callback: ForeignCallHandler | undefined,
  ): Promise<ACVMWitness> {
    const recordingEnabled = process.env.CIRCUIT_RECORD_DIR !== undefined;
    let circuitRecorder: CircuitRecorder | undefined;
    let wrappedCallback = callback;

    if (recordingEnabled && callback) {
      // Recording is enabled so we start a new circuit recorder
      circuitRecorder = await CircuitRecorder.start(
        process.env.CIRCUIT_RECORD_DIR!,
        input,
        Buffer.from(compiledCircuit.bytecode, 'base64'),
        compiledCircuit.name,
        'main',
      );
      // We wrap the callback in a circuit recorder callback wrapper
      wrappedCallback = circuitRecorder.wrapProtocolCircuitCallback(callback);
    }

    try {
      const result = await this.simulator.executeProtocolCircuit(input, compiledCircuit, wrappedCallback);

      if (recordingEnabled && circuitRecorder) {
        // Recording is enabled and witness generation is complete so we finish the circuit recorder
        await circuitRecorder.finish();
      }

      return result;
    } catch (err) {
      this.log.error('Circuit execution failed', { error: err });
      throw err;
    }
  }

  async executeUserCircuit(
    input: ACVMWitness,
    artifact: FunctionArtifactWithContractName,
    callback: ACIRCallback,
  ): Promise<ACIRExecutionResult> {
    if (!process.env.CIRCUIT_RECORD_DIR) {
      return this.simulator.executeUserCircuit(input, artifact, callback);
    }

    // The CIRCUIT_RECORD_DIR environment variable is set, so we start a new circuit recorder
    const recorder = await CircuitRecorder.start(
      process.env.CIRCUIT_RECORD_DIR,
      input,
      artifact.bytecode,
      artifact.contractName,
      artifact.name,
    );
    // We wrap the oracle callback in a circuit recorder callback wrapper
    const wrappedCallback = recorder.wrapUserCircuitCallback(callback);
    const result = await this.simulator.executeUserCircuit(input, artifact, wrappedCallback);
    // Witness generation is complete so we finish the circuit recorder
    await recorder.finish();

    return result;
  }
}
