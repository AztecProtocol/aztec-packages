import { KernelCircuitProver, KernelPrivateInputs } from '../circuits.js';

export class ProofGenerator {
  constructor(private prover: KernelCircuitProver) {}

  createProof(inputs: KernelPrivateInputs) {
    // TODO - iterate
    return this.prover.createProof(inputs);
  }
}
