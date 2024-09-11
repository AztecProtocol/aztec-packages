import { type AvmProofAndVerificationKey, type AvmProvingRequest, ProvingRequestType } from '@aztec/circuit-types';
import { AvmCircuitInputs, AvmVerificationKeyData, makeEmptyProof } from '@aztec/circuits.js';
import { memoize } from '@aztec/foundation/decorators';
import { createDebugLogger } from '@aztec/foundation/log';

import { type Circuit, type OrchestratorContext } from '../types.js';

export class AvmCircuit implements Circuit<typeof ProvingRequestType.PUBLIC_VM> {
  private logger = createDebugLogger('aztec:prover-client:avm-circuit');

  constructor(public readonly provingRequest: AvmProvingRequest, private context: OrchestratorContext) {}

  public simulate(): Promise<null> {
    return Promise.resolve(null);
  }

  @memoize
  public async prove(): Promise<AvmProofAndVerificationKey> {
    const inputs = this.getInputs();

    try {
      return await this.context.prover.prove({ type: ProvingRequestType.PUBLIC_VM, inputs });
    } catch (err) {
      if (this.context.options.avmProvingStrict) {
        throw err;
      } else {
        this.logger.warn(`Error thrown when proving AVM circuit, but strict proving is off. Error: ${err}.`);
        return { proof: makeEmptyProof(), verificationKey: AvmVerificationKeyData.makeEmpty() };
      }
    }
  }

  private getInputs() {
    const provingRequest = this.provingRequest;
    if (provingRequest.type !== 'AVM') {
      throw new Error(`Invalid proving request type for AVM: ${provingRequest.type}`);
    }

    const publicInputs = provingRequest.kernelRequest.inputs.publicCall.callStackItem.publicInputs;
    return AvmCircuitInputs.from({ ...provingRequest, publicInputs });
  }
}
