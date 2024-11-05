import {
  type KernelCircuitPublicInputs,
  type PublicKernelCircuitPrivateInputs,
  type PublicKernelCircuitPublicInputs,
  type PublicKernelInnerCircuitPrivateInputs,
  type PublicKernelTailCircuitPrivateInputs,
  type VMCircuitPublicInputs,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';
import {
  SimulatedPublicKernelInnerArtifact,
  SimulatedPublicKernelMergeArtifact,
  SimulatedPublicKernelTailArtifact,
  convertSimulatedPublicInnerInputsToWitnessMap,
  convertSimulatedPublicInnerOutputFromWitnessMap,
  convertSimulatedPublicMergeInputsToWitnessMap,
  convertSimulatedPublicMergeOutputFromWitnessMap,
  convertSimulatedPublicTailInputsToWitnessMap,
  convertSimulatedPublicTailOutputFromWitnessMap,
} from '@aztec/noir-protocol-circuits-types';

import { type SimulationProvider } from '../providers/simulation_provider.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';

/**
 * Implements the PublicKernelCircuitSimulator.
 */
export class RealPublicKernelCircuitSimulator implements PublicKernelCircuitSimulator {
  private log = createDebugLogger('aztec:public-kernel-simulator');

  constructor(private simulator: SimulationProvider) {}

  /**
   * Simulates the public kernel setup circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async publicKernelCircuitInner(input: PublicKernelInnerCircuitPrivateInputs): Promise<VMCircuitPublicInputs> {
    const inputWitness = convertSimulatedPublicInnerInputsToWitnessMap(input);
    const [duration, witness] = await elapsed(() =>
      this.simulator.simulateCircuit(inputWitness, SimulatedPublicKernelInnerArtifact),
    );
    const result = convertSimulatedPublicInnerOutputFromWitnessMap(witness);
    this.log.debug(`Simulated public kernel inner circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'public-kernel-inner',
      duration,
      inputSize: input.toBuffer().length,
      outputSize: result.toBuffer().length,
    });
    return result;
  }

  /**
   * Simulates the public kernel app logic circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async publicKernelCircuitMerge(
    input: PublicKernelCircuitPrivateInputs,
  ): Promise<PublicKernelCircuitPublicInputs> {
    const inputWitness = convertSimulatedPublicMergeInputsToWitnessMap(input);
    const [duration, witness] = await elapsed(() =>
      this.simulator.simulateCircuit(inputWitness, SimulatedPublicKernelMergeArtifact),
    );
    const result = convertSimulatedPublicMergeOutputFromWitnessMap(witness);
    this.log.debug(`Simulated public kernel merge circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'public-kernel-merge',
      duration,
      inputSize: input.toBuffer().length,
      outputSize: result.toBuffer().length,
    });
    return result;
  }

  /**
   * Simulates the public kernel tail circuit from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async publicKernelCircuitTail(
    input: PublicKernelTailCircuitPrivateInputs,
  ): Promise<KernelCircuitPublicInputs> {
    const inputWitness = convertSimulatedPublicTailInputsToWitnessMap(input);
    const [duration, witness] = await elapsed(() =>
      this.simulator.simulateCircuit(inputWitness, SimulatedPublicKernelTailArtifact),
    );
    const result = convertSimulatedPublicTailOutputFromWitnessMap(witness);
    this.log.debug(`Simulated public kernel tail circuit`, {
      eventName: 'circuit-simulation',
      circuitName: 'public-kernel-tail',
      duration,
      inputSize: input.toBuffer().length,
      outputSize: result.toBuffer().length,
    });
    return result;
  }
}
