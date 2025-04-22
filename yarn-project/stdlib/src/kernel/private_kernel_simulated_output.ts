import type { WitnessMap } from '@aztec/noir-acvm_js';

import type { VerificationKeyData } from '../vks/verification_key.js';
import type { PrivateKernelCircuitPublicInputs } from './private_kernel_circuit_public_inputs.js';
import type { PrivateKernelTailCircuitPublicInputs } from './private_kernel_tail_circuit_public_inputs.js';

/**
 * Represents the output of the proof creation process for init and inner private kernel circuit.
 * Contains the public inputs required for the init and inner private kernel circuit and the generated proof.
 */
export interface PrivateKernelSimulateOutput<
  PublicInputsType extends PrivateKernelCircuitPublicInputs | PrivateKernelTailCircuitPublicInputs,
> {
  /** The public inputs required for the proof generation process. */
  publicInputs: PublicInputsType;
  outputWitness: WitnessMap;
  verificationKey: VerificationKeyData;
  bytecode: Buffer;
}

/**
 * Represents the output of the circuit simulation process for init and inner private kernel circuit.
 */
export type AppCircuitSimulateOutput = {
  verificationKey: VerificationKeyData;
};
