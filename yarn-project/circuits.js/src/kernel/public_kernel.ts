import { publicKernelInitSim, publicKernelInnerSim } from '../cbind/circuits.gen.js';
import {
  CircuitError,
  CircuitsWasm,
  KernelCircuitPublicInputs,
  PublicKernelInputsInit,
  PublicKernelInputsInner,
} from '../index.js';

/**
 * Computes the public inputs of the public init kernel circuit.
 * @param input - The public init kernel circuit inputs.
 * @returns The public inputs.
 */
export async function simulatePublicKernelInitCircuit(input: PublicKernelInputsInit): Promise<KernelCircuitPublicInputs> {
  const result = publicKernelInitSim(await CircuitsWasm.get(), input);
  if (result instanceof CircuitError) {
    result.message += '\nRefer to https://docs.aztec.network/aztec/protocol/errors for more information.';
    throw new CircuitError(result.code, result.message);
  }
  return result;
}

/**
 * Computes the public inputs of the public inner kernel circuit.
 * @param input - The public inner kernel circuit inputs.
 * @returns The public inputs.
 */
export async function simulatePublicKernelInnerCircuit(input: PublicKernelInputsInner): Promise<KernelCircuitPublicInputs> {
  const result = publicKernelInnerSim(await CircuitsWasm.get(), input);
  if (result instanceof CircuitError) {
    result.message += '\nRefer to https://docs.aztec.network/aztec/protocol/errors for more information.';
    throw new CircuitError(result.code, result.message);
  }
  return result;
}