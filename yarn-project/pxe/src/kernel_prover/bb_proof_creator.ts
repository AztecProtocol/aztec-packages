import {
  type Fr,
  type PrivateCircuitPublicInputs,
  type PrivateKernelInitCircuitPrivateInputs,
  type PrivateKernelInnerCircuitPrivateInputs,
  type PrivateKernelTailCircuitPrivateInputs,
} from '@aztec/circuits.js';

import { type ProofCreator, type ProofOutput, type ProofOutputFinal } from './interface/proof_creator.js';

/**
 * The BBProofCreator class is responsible for generating siloed commitments and zero-knowledge proofs
 * for private kernel circuit. It leverages Barretenberg to perform cryptographic operations and proof creation.
 * The class provides methods to compute commitments based on the given public inputs and to generate proofs based on
 * signed transaction requests, previous kernel data, private call data, and a flag indicating whether it's the first
 * iteration or not.
 */
export class BBProofCreator implements ProofCreator {
  getSiloedCommitments(_: PrivateCircuitPublicInputs): Promise<Fr[]> {
    throw new Error('Method not implemented.');
  }
  createProofInit(_: PrivateKernelInitCircuitPrivateInputs): Promise<ProofOutput> {
    throw new Error('Method not implemented.');
  }
  createProofInner(_: PrivateKernelInnerCircuitPrivateInputs): Promise<ProofOutput> {
    throw new Error('Method not implemented.');
  }
  createProofTail(_: PrivateKernelTailCircuitPrivateInputs): Promise<ProofOutputFinal> {
    throw new Error('Method not implemented.');
  }
}
