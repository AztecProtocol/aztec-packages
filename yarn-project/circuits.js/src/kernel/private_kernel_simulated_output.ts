import { type WitnessMap } from '@noir-lang/acvm_js';

import type { ClientIvcProof } from '../proofs/client_ivc_proof.js';
import type { VerificationKeyAsFields } from '../vks/verification_key.js';
import type { PrivateKernelCircuitPublicInputs } from './private_kernel_circuit_public_inputs.js';
import type { PrivateKernelProverProfileResult } from './private_kernel_prover_profile_result.js';
import type { PrivateKernelTailCircuitPublicInputs } from './private_kernel_tail_circuit_public_inputs.js';

/**
 * Represents the output of the proof creation process for init and inner private kernel circuit.
 * Contains the public inputs required for the init and inner private kernel circuit and the generated proof.
 */
export type PrivateKernelSimulateOutput<
  PublicInputsType extends PrivateKernelCircuitPublicInputs | PrivateKernelTailCircuitPublicInputs,
> = {
  /** The public inputs required for the proof generation process. */
  publicInputs: PublicInputsType;

  clientIvcProof?: ClientIvcProof;

  verificationKey: VerificationKeyAsFields;

  outputWitness: WitnessMap;

  bytecode: Buffer;

  profileResult?: PrivateKernelProverProfileResult;
};

/**
 * Represents the output of the circuit simulation process for init and inner private kernel circuit.
 */
export type AppCircuitSimulateOutput = {
  verificationKey: VerificationKeyAsFields;
};
