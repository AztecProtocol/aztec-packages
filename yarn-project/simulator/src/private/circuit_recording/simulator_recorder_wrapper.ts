import type { ForeignCallHandler } from '@aztec/noir-acvm_js';
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
    // If a callback was provided, we wrap it so that its oracle calls are recorded. The wrapped callback reads the
    // active recording lazily, so it picks up the recording opened by record() below.
    const wrappedCallback = this.recorder.wrapCallback(callback);

    // record() opens a recording for this circuit, runs the simulation within it, and finalizes it. A simulation
    // failure is re-thrown unchanged, so recorder bookkeeping never masks the underlying error.
    const { result, recording } = await this.recorder.record(
      { input, bytecode, circuitName: contractName, functionName },
      () => simulateFn(wrappedCallback as C),
    );

    (result as ACIRExecutionResult).oracles = recording.oracleCalls.reduce(
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
