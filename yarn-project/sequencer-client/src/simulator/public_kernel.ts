import { CircuitSimulationStats } from '@aztec/circuit-types/stats';
import { PublicKernelCircuitPrivateInputs, PublicKernelCircuitPublicInputs } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';
import {
  PublicKernelAppLogicArtifact,
  PublicKernelSetupArtifact,
  PublicKernelTeardownArtifact,
  convertPublicInnerRollupInputsToWitnessMap,
  convertPublicInnerRollupOutputFromWitnessMap,
  convertPublicSetupRollupInputsToWitnessMap,
  convertPublicSetupRollupOutputFromWitnessMap,
  convertPublicTailRollupInputsToWitnessMap,
  convertPublicTailRollupOutputFromWitnessMap,
} from '@aztec/noir-protocol-circuits-types';

import { PublicKernelCircuitSimulator, WASMSimulator } from './index.js';
import { SimulationProvider } from './simulation_provider.js';

/**
 * Implements the PublicKernelCircuitSimulator.
 */
export class RealPublicKernelCircuitSimulator implements PublicKernelCircuitSimulator {
  private log = createDebugLogger('aztec:public-kernel-simulator');

  // Some circuits are so small it is faster to use WASM
  private wasmSimulator: WASMSimulator = new WASMSimulator();

  constructor(private simulator: SimulationProvider) {}

  /**
   * Simulates the public kernel setup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async publicKernelCircuitSetup(
    input: PublicKernelCircuitPrivateInputs,
  ): Promise<PublicKernelCircuitPublicInputs> {
    if (!input.previousKernel.publicInputs.needsSetup) {
      throw new Error(`Expected previous kernel inputs to need setup`);
    }
    const inputWitness = convertPublicSetupRollupInputsToWitnessMap(input);
    const [duration, witness] = await elapsed(() =>
      this.wasmSimulator.simulateCircuit(inputWitness, PublicKernelSetupArtifact),
    );
    const result = convertPublicSetupRollupOutputFromWitnessMap(witness);
    this.log(`Simulated public kernel setup circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'public-kernel-setup',
      duration,
      inputSize: input.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);
    return result;
  }

  /**
   * Simulates the public kernel app logic circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async publicKernelCircuitAppLogic(
    input: PublicKernelCircuitPrivateInputs,
  ): Promise<PublicKernelCircuitPublicInputs> {
    if (!input.previousKernel.publicInputs.needsAppLogic) {
      throw new Error(`Expected previous kernel inputs to need app logic`);
    }
    const inputWitness = convertPublicInnerRollupInputsToWitnessMap(input);
    const [duration, witness] = await elapsed(() =>
      this.wasmSimulator.simulateCircuit(inputWitness, PublicKernelAppLogicArtifact),
    );
    const result = convertPublicInnerRollupOutputFromWitnessMap(witness);
    this.log(`Simulated public kernel app logic circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'public-kernel-app-logic',
      duration,
      inputSize: input.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);
    return result;
  }

  /**
   * Simulates the public kernel teardown circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async publicKernelCircuitTeardown(
    input: PublicKernelCircuitPrivateInputs,
  ): Promise<PublicKernelCircuitPublicInputs> {
    if (!input.previousKernel.publicInputs.needsTeardown) {
      throw new Error(`Expected previous kernel inputs to need teardown`);
    }
    const inputWitness = convertPublicTailRollupInputsToWitnessMap(input);
    const [duration, witness] = await elapsed(() =>
      this.wasmSimulator.simulateCircuit(inputWitness, PublicKernelTeardownArtifact),
    );
    const result = convertPublicTailRollupOutputFromWitnessMap(witness);
    this.log(`Simulated public kernel teardown circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'public-kernel-teardown',
      duration,
      inputSize: input.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);
    return result;
  }
}
