import type { ForeignCallHandler } from '@aztec/noir-protocol-circuits-types/types';
import type { FunctionArtifactWithContractName } from '@aztec/stdlib/abi';
import type { NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';

import type { ACIRCallback, ACIRCallbackStats, ACIRExecutionResult } from '../acvm/acvm.js';
import type { ACVMWitness } from '../acvm/acvm_types.js';
import type { ACVMSuccess } from '../acvm_native.js';
import type { CircuitSimulator } from '../circuit_simulator.js';
import type { CircuitRecorder } from './circuit_recorder.js';

/**
 * Takes a circuit simulator and wraps it in a circuit recorder. See CircuitRecorder for more details on how circuit
 * recording works.
 */
export class SimulatorRecorderWrapper implements CircuitSimulator {
  constructor(
    private simulator: CircuitSimulator,
    private recorder: CircuitRecorder,
  ) {}

  executeProtocolCircuit(
    input: ACVMWitness,
    artifact: NoirCompiledCircuitWithName,
    callback: ForeignCallHandler | undefined,
  ): Promise<ACVMSuccess> {
    const bytecode = Buffer.from(artifact.bytecode, 'base64');

    return this.#simulate<ForeignCallHandler | undefined, ACVMSuccess>(
      wrappedCallback => this.simulator.executeProtocolCircuit(input, artifact, wrappedCallback),
      input,
      bytecode,
      artifact.name,
      'main',
      callback,
    );
  }

  executeUserCircuit(
    input: ACVMWitness,
    artifact: FunctionArtifactWithContractName,
    callback: ACIRCallback,
  ): Promise<ACIRExecutionResult> {
    return this.#simulate<ACIRCallback, ACIRExecutionResult>(
      wrappedCallback => this.simulator.executeUserCircuit(input, artifact, wrappedCallback),
      input,
      artifact.bytecode,
      artifact.contractName,
      artifact.name,
      callback,
    );
  }

  async #simulate<C extends ACIRCallback | ForeignCallHandler | undefined, T extends ACIRExecutionResult | ACVMSuccess>(
    simulateFn: (wrappedCallback: C) => Promise<T>,
    input: ACVMWitness,
    bytecode: Buffer,
    contractName: string,
    functionName: string,
    callback: C,
  ): Promise<T> {
    // Start recording circuit execution
    await this.recorder.start(input, bytecode, contractName, functionName);

    // If callback was provided, we wrap it in a circuit recorder callback wrapper
    const wrappedCallback = this.recorder.wrapCallback(callback);
    let result: T;
    try {
      result = await simulateFn(wrappedCallback as C);
    } catch (error) {
      // If an error occurs, we finalize the recording file with the error
      await this.recorder.finishWithError(error);
      throw error;
    }

    // Witness generation is complete so we finish the circuit recorder
    const recording = await this.recorder.finish();

    (result as ACIRExecutionResult).oracles = recording.oracleCalls?.reduce(
      (acc, { time, name }) => {
        if (!acc[name]) {
          acc[name] = { times: [] };
        }
        acc[name].times.push(time);
        return acc;
      },
      {} as Record<string, ACIRCallbackStats>,
    );

    return result;
  }
}
