import { type ProvingRequest, ProvingRequestType, type ServerCircuitProver, type SimulationRequestResult } from '@aztec/circuit-types';

import { type Simulator } from '../types.js';

export class SimulatorAdapter implements Simulator {
  constructor(
    public readonly epochNumber: number,
    private readonly simulator: ServerCircuitProver,
    private readonly signal?: AbortSignal,
  ) {}

  simulate<Request extends ProvingRequest>(request: Request): Promise<SimulationRequestResult<Request['type']>>;
  async simulate(request: ProvingRequest): Promise<SimulationRequestResult<ProvingRequest['type']>> {
    switch (request.type) {
      case ProvingRequestType.BASE_PARITY:
        return (await this.simulator.getBaseParityProof(request.inputs, this.signal, this.epochNumber)).publicInputs;
      case ProvingRequestType.ROOT_PARITY:
        return (await this.simulator.getRootParityProof(request.inputs, this.signal, this.epochNumber)).publicInputs;
      case ProvingRequestType.BASE_ROLLUP:
        return (await this.simulator.getBaseRollupProof(request.inputs, this.signal, this.epochNumber)).inputs;
      case ProvingRequestType.MERGE_ROLLUP:
        return (await this.simulator.getMergeRollupProof(request.inputs, this.signal, this.epochNumber)).inputs;
      case ProvingRequestType.BLOCK_ROOT_ROLLUP:
        return (await this.simulator.getBlockRootRollupProof(request.inputs, this.signal, this.epochNumber)).inputs;
      case ProvingRequestType.BLOCK_MERGE_ROLLUP:
        return (await this.simulator.getBlockMergeRollupProof(request.inputs, this.signal, this.epochNumber)).inputs;
      case ProvingRequestType.ROOT_ROLLUP:
        return (await this.simulator.getRootRollupProof(request.inputs, this.signal, this.epochNumber)).inputs;
      case ProvingRequestType.TUBE_PROOF:
        return null;
      case ProvingRequestType.PUBLIC_VM:
        return null;
      case ProvingRequestType.PUBLIC_KERNEL_NON_TAIL:
        return (
          await this.simulator.getPublicKernelProof(
            { type: request.kernelType, inputs: request.inputs },
            this.signal,
            this.epochNumber,
          )
        ).inputs;
      case ProvingRequestType.PUBLIC_KERNEL_TAIL:
        return (
          await this.simulator.getPublicTailProof(
            { type: request.kernelType, inputs: request.inputs },
            this.signal,
            this.epochNumber,
          )
        ).inputs;
      case ProvingRequestType.PRIVATE_KERNEL_EMPTY:
        return (await this.simulator.getEmptyPrivateKernelProof(request.inputs, this.signal, this.epochNumber)).inputs;
      default: {
        const _: never = request;
        throw new Error('Unsupported proving request type');
      }
    }
  }
}
