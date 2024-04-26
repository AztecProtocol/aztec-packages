import { type DebugLogger } from '@aztec/foundation/log';

import { type KernelProverConfig } from '../config/index.js';
import { BBProofCreator } from './bb_proof_creator.js';
import { type ProofCreator } from './interface/proof_creator.js';
import { TestProofCreator } from './test/test_circuit_prover.js';

export class ProverFactory {
  constructor(private config: KernelProverConfig) {}

  public createKernelProofCreator(log?: DebugLogger): Promise<ProofCreator> {
    if (this.config.proverless) {
      return Promise.resolve(new TestProofCreator(log));
    }
    return Promise.resolve(new BBProofCreator());
  }
}
