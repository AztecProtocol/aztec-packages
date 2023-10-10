import {
  PublicKernelInputsInit,
  PublicKernelInputsInner,
  PublicKernelPublicInputs,
  simulatePublicKernelInitCircuit,
  simulatePublicKernelInnerCircuit,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { elapsed } from '@aztec/foundation/timer';
import { CircuitSimulationStats } from '@aztec/types/stats';

import { PublicKernelCircuitSimulator } from './index.js';

/**
 * Implements the PublicKernelCircuitSimulator by calling the wasm implementations of the circuits.
 */
export class WasmPublicKernelCircuitSimulator implements PublicKernelCircuitSimulator {
  private log = createDebugLogger('aztec:public-kernel-simulator');

  /**
   * Simulates the public kernel circuit (with a previous private kernel circuit run) from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async publicKernelInitCircuit(input: PublicKernelInputsInit): Promise<PublicKernelPublicInputs> {
    const [duration, result] = await elapsed(() => simulatePublicKernelInitCircuit(input));
    this.log(`Simulated public init kernel circuit with private input`, {
      eventName: 'circuit-simulation',
      circuitName: 'public-kernel-init',
      duration,
      inputSize: input.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);
    return result;
  }

  /**
   * Simulates the public kernel circuit (with no previous public kernel circuit run) from its inputs.
   * @param input - Inputs to the circuit.
   * @returns The public inputs as outputs of the simulation.
   */
  public async publicKernelInnerCircuit(input: PublicKernelInputsInner): Promise<PublicKernelPublicInputs> {
    const [duration, result] = await elapsed(() => simulatePublicKernelInnerCircuit(input));
    this.log(`Simulated public kernel inner circuit with private input`, {
      eventName: 'circuit-simulation',
      circuitName: 'public-kernel-inner',
      duration,
      inputSize: input.toBuffer().length,
      outputSize: result.toBuffer().length,
    } satisfies CircuitSimulationStats);
    return result;
  }
}
