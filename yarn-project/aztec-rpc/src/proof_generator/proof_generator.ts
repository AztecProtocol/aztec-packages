import { KernelCircuitProver, KernelPrivateInputs } from '../circuits.js';

export class ProofGenerator {
  constructor(private prover: KernelCircuitProver) {}

  public async createProof(inputs: KernelPrivateInputs) {
    // TODO - iterate
    const { accumulatedTxData } = await this.prover.createProof(inputs);
    return { accumulatedTxData: accumulatedTxData as any };
  }
}
