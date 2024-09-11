import {
  type AvmProofAndVerificationKey,
  type NestedRecursiveProofAndVK,
  ProvingRequestType,
  type PublicInputsAndRecursiveProof,
  type PublicKernelNonTailRequest,
  type TubeProofAndVK,
} from '@aztec/circuit-types';
import { type PublicKernelCircuitPrivateInputs, type PublicKernelCircuitPublicInputs } from '@aztec/circuits.js';
import { memoize } from '@aztec/foundation/decorators';
import { createDebugLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { type Circuit, type OrchestratorContext } from '../types.js';

type PublicKernelPreviousProof = NestedRecursiveProofAndVK | TubeProofAndVK;

export class PublicKernelNonTailCircuit implements Circuit<typeof ProvingRequestType.PUBLIC_KERNEL_NON_TAIL> {
  private logger = createDebugLogger('aztec:prover-client:public-kernel-non-tail');

  private previousKernelProof = promiseWithResolvers<PublicKernelPreviousProof>();
  private nestedAvmProof = promiseWithResolvers<AvmProofAndVerificationKey>();

  constructor(public readonly provingRequest: PublicKernelNonTailRequest, private context: OrchestratorContext) {}

  public setPreviousKernelProof(proof: PublicKernelPreviousProof) {
    this.previousKernelProof.resolve(proof);
  }

  public setNestedAvmProof(proof: AvmProofAndVerificationKey) {
    this.nestedAvmProof.resolve(proof);
  }

  @memoize
  private async getProvingInputs(): Promise<PublicKernelCircuitPrivateInputs> {
    const previousKernelProof = await this.previousKernelProof.promise;
    const avmProof = await this.nestedAvmProof.promise;

    // TODO: The kernel does not require the AVM VK, we're just getting the proof. Is that correct?
    // TODO(#7369): How should we properly set up vkPath, vkIndex, and clientIvc for previous kernel?
    // This is lifted from the TxProvingState, but ignores those properties on the previous kernel.
    // How come it works? Maybe recursive proofs in public kernels are not being verified yet
    return this.provingRequest.inputs.withNestedProofs(avmProof.proof, {
      proof: previousKernelProof.proof,
      vk: previousKernelProof.verificationKey,
    });
  }

  @memoize
  public simulate(): Promise<PublicKernelCircuitPublicInputs> {
    const { inputs, type: kernelType } = this.provingRequest;
    return this.context.simulator.simulate({ type: ProvingRequestType.PUBLIC_KERNEL_NON_TAIL, kernelType, inputs });
  }

  @memoize
  public async prove(): Promise<PublicInputsAndRecursiveProof<PublicKernelCircuitPublicInputs>> {
    const inputs = await this.getProvingInputs();

    const result = await this.context.prover.prove({
      type: ProvingRequestType.PUBLIC_KERNEL_NON_TAIL,
      kernelType: this.provingRequest.type,
      inputs,
    });

    if (this.context.options.checkSimulationMatchesProof && !result.inputs.equals(await this.simulate())) {
      throw new Error(`Simulation output and proof public inputs do not match`);
    }

    return result;
  }
}
