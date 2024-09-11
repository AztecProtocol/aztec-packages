import { type ProcessedTx, ProvingRequestType, type TubeProofAndVK } from '@aztec/circuit-types';
import { TubeInputs } from '@aztec/circuits.js';
import { memoize } from '@aztec/foundation/decorators';

import { type Circuit, type OrchestratorContext } from '../types.js';

export class TubeCircuit implements Circuit<typeof ProvingRequestType.TUBE_PROOF> {
  constructor(public readonly tx: ProcessedTx, private context: OrchestratorContext) {}

  public simulate(): Promise<null> {
    return Promise.resolve(null);
  }

  @memoize
  public prove(): Promise<TubeProofAndVK> {
    const inputs = new TubeInputs(this.tx.clientIvcProof);
    return this.context.prover.prove({ type: ProvingRequestType.TUBE_PROOF, inputs });
  }
}
