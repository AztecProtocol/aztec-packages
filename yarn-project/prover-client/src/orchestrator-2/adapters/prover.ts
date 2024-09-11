import { type ProvingRequest, type ProvingRequestResult, ProvingRequestType, type ServerCircuitProver } from '@aztec/circuit-types';

import { type Prover } from '../types.js';

export class ProverAdapter implements Prover {
  constructor(
    public readonly epochNumber: number,
    private readonly prover: ServerCircuitProver,
    private readonly signal?: AbortSignal,
  ) {}

  prove<Request extends ProvingRequest>(request: Request): Promise<ProvingRequestResult<Request['type']>>;
  prove(request: ProvingRequest): Promise<ProvingRequestResult<ProvingRequest['type']>> {
    switch (request.type) {
      case ProvingRequestType.BASE_PARITY:
        return this.prover.getBaseParityProof(request.inputs, this.signal, this.epochNumber);
      case ProvingRequestType.ROOT_PARITY:
        return this.prover.getRootParityProof(request.inputs, this.signal, this.epochNumber);
      case ProvingRequestType.BASE_ROLLUP:
        return this.prover.getBaseRollupProof(request.inputs, this.signal, this.epochNumber);
      case ProvingRequestType.MERGE_ROLLUP:
        return this.prover.getMergeRollupProof(request.inputs, this.signal, this.epochNumber);
      case ProvingRequestType.BLOCK_ROOT_ROLLUP:
        return this.prover.getBlockRootRollupProof(request.inputs, this.signal, this.epochNumber);
      case ProvingRequestType.BLOCK_MERGE_ROLLUP:
        return this.prover.getBlockMergeRollupProof(request.inputs, this.signal, this.epochNumber);
      case ProvingRequestType.ROOT_ROLLUP:
        return this.prover.getRootRollupProof(request.inputs, this.signal, this.epochNumber);
      case ProvingRequestType.TUBE_PROOF:
        return this.prover.getTubeProof(request.inputs, this.signal, this.epochNumber);
      case ProvingRequestType.PUBLIC_VM:
        return this.prover.getAvmProof(request.inputs, this.signal, this.epochNumber);
      case ProvingRequestType.PUBLIC_KERNEL_NON_TAIL:
        return this.prover.getPublicKernelProof(
          { type: request.kernelType, inputs: request.inputs },
          this.signal,
          this.epochNumber,
        );
      case ProvingRequestType.PUBLIC_KERNEL_TAIL:
        return this.prover.getPublicTailProof(
          { type: request.kernelType, inputs: request.inputs },
          this.signal,
          this.epochNumber,
        );
      case ProvingRequestType.PRIVATE_KERNEL_EMPTY:
        return this.prover.getEmptyPrivateKernelProof(request.inputs, this.signal, this.epochNumber);
      default: {
        const _: never = request;
        throw new Error('Unsupported proving request type');
      }
    }
  }
}
