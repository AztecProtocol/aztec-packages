import {
  ProvingRequestType,
  type ServerCircuitProver,
  type V2ProofInput,
  type V2ProofOutput,
  type V2ProvingJobId,
} from '@aztec/circuit-types';

export enum ProvingJobStatus {
  IDLE = 'idle',
  PROVING = 'proving',
  DONE = 'done',
}

type ProvingJobCompletionCallback = (
  jobId: V2ProvingJobId,
  type: ProvingRequestType,
  error: Error | undefined,
  result: V2ProofOutput | undefined,
) => void | Promise<void>;

export class ProvingJobController {
  private status: ProvingJobStatus = ProvingJobStatus.IDLE;
  private promise?: Promise<void>;
  private abortController = new AbortController();

  constructor(
    private jobId: V2ProvingJobId,
    private inputs: V2ProofInput,
    private startedAt: number,
    private circuitProver: ServerCircuitProver,
    private onComplete: ProvingJobCompletionCallback,
  ) {}

  public start(): void {
    if (this.status !== ProvingJobStatus.IDLE) {
      return;
    }

    this.status = ProvingJobStatus.PROVING;
    this.promise = this.generateProof()
      .then(
        result => {
          this.status = ProvingJobStatus.DONE;
          return this.onComplete(this.jobId, this.inputs.type, undefined, result);
        },
        error => {
          this.status = ProvingJobStatus.DONE;
          if (error.name === 'AbortError') {
            // Ignore abort errors
            return;
          }
          return this.onComplete(this.jobId, this.inputs.type, error, undefined);
        },
      )
      .catch(_ => {
        // ignore completion errors
      });
  }

  public getStatus(): ProvingJobStatus {
    return this.status;
  }

  public abort(): void {
    if (this.status !== ProvingJobStatus.PROVING) {
      return;
    }

    this.abortController.abort();
  }

  public getJobId(): V2ProvingJobId {
    return this.jobId;
  }

  public getStartedAt(): number {
    return this.startedAt;
  }

  public getProofTypeName(): string {
    return ProvingRequestType[this.inputs.type];
  }

  private async generateProof(): Promise<V2ProofOutput> {
    const { type, value: inputs } = this.inputs;
    const signal = this.abortController.signal;
    switch (type) {
      case ProvingRequestType.PUBLIC_VM: {
        const value = await this.circuitProver.getAvmProof(inputs, signal);
        return { type, value };
      }

      case ProvingRequestType.PRIVATE_BASE_ROLLUP: {
        const value = await this.circuitProver.getPrivateBaseRollupProof(inputs, signal);
        return { type, value };
      }

      case ProvingRequestType.PUBLIC_BASE_ROLLUP: {
        const value = await this.circuitProver.getPublicBaseRollupProof(inputs, signal);
        return { type, value };
      }

      case ProvingRequestType.MERGE_ROLLUP: {
        const value = await this.circuitProver.getMergeRollupProof(inputs, signal);
        return { type, value };
      }

      case ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP: {
        const value = await this.circuitProver.getEmptyBlockRootRollupProof(inputs, signal);
        return { type, value };
      }

      case ProvingRequestType.BLOCK_ROOT_ROLLUP: {
        const value = await this.circuitProver.getBlockRootRollupProof(inputs, signal);
        return { type, value };
      }

      case ProvingRequestType.BLOCK_MERGE_ROLLUP: {
        const value = await this.circuitProver.getBlockMergeRollupProof(inputs, signal);
        return { type, value };
      }

      case ProvingRequestType.ROOT_ROLLUP: {
        const value = await this.circuitProver.getRootRollupProof(inputs, signal);
        return { type, value };
      }

      case ProvingRequestType.BASE_PARITY: {
        const value = await this.circuitProver.getBaseParityProof(inputs, signal);
        return { type, value };
      }

      case ProvingRequestType.ROOT_PARITY: {
        const value = await this.circuitProver.getRootParityProof(inputs, signal);
        return { type, value };
      }

      case ProvingRequestType.PRIVATE_KERNEL_EMPTY: {
        const value = await this.circuitProver.getEmptyPrivateKernelProof(inputs, signal);
        return { type, value };
      }

      case ProvingRequestType.TUBE_PROOF: {
        const value = await this.circuitProver.getTubeProof(inputs, signal);
        return { type, value };
      }

      default: {
        const _exhaustive: never = type;
        return Promise.reject(new Error(`Invalid proof request type: ${type}`));
      }
    }
  }
}
