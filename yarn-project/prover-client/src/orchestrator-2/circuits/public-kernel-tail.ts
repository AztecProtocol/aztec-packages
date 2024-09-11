import {
  type NestedRecursiveProofAndVK,
  ProvingRequestType,
  type PublicInputsAndRecursiveProof,
  type PublicKernelTailRequest,
  type TubeProofAndVK,
} from '@aztec/circuit-types';
import { type KernelCircuitPublicInputs, type PublicKernelTailCircuitPrivateInputs } from '@aztec/circuits.js';
import { memoize } from '@aztec/foundation/decorators';
import { createDebugLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { type Circuit, type OrchestratorContext } from '../types.js';

type PublicKernelPreviousProof = NestedRecursiveProofAndVK | TubeProofAndVK;

export class PublicKernelTailCircuit implements Circuit<typeof ProvingRequestType.PUBLIC_KERNEL_TAIL> {
  private logger = createDebugLogger('aztec:prover-client:public-kernel-non-tail');

  private previousKernelProof = promiseWithResolvers<PublicKernelPreviousProof>();

  constructor(public readonly provingRequest: PublicKernelTailRequest, private context: OrchestratorContext) {}

  public setPreviousKernelProof(proof: PublicKernelPreviousProof) {
    this.previousKernelProof.resolve(proof);
  }

  @memoize
  private async getProvingInputs(): Promise<PublicKernelTailCircuitPrivateInputs> {
    const previousKernelProof = await this.previousKernelProof.promise;

    // TODO(#7369): How should we properly set up vkPath and vkIndex for previous kernel?
    // See the public kernel non-tail as well
    return this.provingRequest.inputs.withNestedProof({
      proof: previousKernelProof.proof,
      vk: previousKernelProof.verificationKey,
    });
  }

  @memoize
  public simulate(): Promise<KernelCircuitPublicInputs> {
    const { inputs, type: kernelType } = this.provingRequest;
    return this.context.simulator.simulate({ type: ProvingRequestType.PUBLIC_KERNEL_TAIL, kernelType, inputs });
  }

  @memoize
  public async prove(): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>> {
    const inputs = await this.getProvingInputs();

    const result = await this.context.prover.prove({
      type: ProvingRequestType.PUBLIC_KERNEL_TAIL,
      kernelType: this.provingRequest.type,
      inputs,
    });

    if (this.context.options.checkSimulationMatchesProof && !result.inputs.equals(await this.simulate())) {
      throw new Error(`Simulation output and proof public inputs do not match`);
    }

    return result;
  }
}
