import { createLogger } from '@aztec/foundation/log';
import type { ForeignCallHandler } from '@aztec/noir-protocol-circuits-types/types';
import type { FunctionArtifactWithContractName } from '@aztec/stdlib/abi';
import type { NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';

import type { ACIRCallback, ACIRExecutionResult } from '../../acvm/acvm.js';
import type { ACVMWitness } from '../../acvm/acvm_types.js';
import type { SimulationProvider } from '../simulation_provider.js';
import { CircuitRecorder } from './circuit_recorder.js';

/**
 * Takes a simulation provider and wraps it in a circuit recorder. See CircuitRecorder for more details on how circuit
 * recording works.
 */
export class SimulationProviderRecorderWrapper implements SimulationProvider {
  constructor(private simulator: SimulationProvider, private log = createLogger('simulator-recorder')) {}

  async executeProtocolCircuit(
    input: ACVMWitness,
    artifact: NoirCompiledCircuitWithName,
    callback: ForeignCallHandler | undefined,
  ): Promise<ACVMWitness> {
    const recordDir = process.env.CIRCUIT_RECORD_DIR;
    if (!recordDir) {
      // Recording is not enabled so we just execute the circuit
      return this.simulator.executeProtocolCircuit(input, artifact, callback);
    }

    // Start recording circuit execution
    const recorder = await CircuitRecorder.start(
      recordDir,
      input,
      Buffer.from(artifact.bytecode, 'base64'),
      artifact.name,
      'main',
    );

    // If callback was provided, we wrap it in a circuit recorder callback wrapper
    const wrappedCallback = callback ? recorder.wrapProtocolCircuitCallback(callback) : undefined;
    const result = await this.simulator.executeProtocolCircuit(input, artifact, wrappedCallback);

    // Finish recording
    await recorder.finish();

    return result;
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
