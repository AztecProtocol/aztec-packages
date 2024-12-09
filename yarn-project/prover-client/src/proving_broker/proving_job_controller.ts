import {
  type ProvingJobId,
  type ProvingJobInputs,
  type ProvingJobResultsMap,
  ProvingRequestType,
  type ServerCircuitProver,
} from '@aztec/circuit-types';

export enum ProvingJobControllerStatus {
  IDLE = 'idle',
  PROVING = 'proving',
  DONE = 'done',
  ABORTED = 'aborted',
}

interface ProvingJobCompletionCallback<T extends ProvingRequestType = ProvingRequestType> {
  (
    jobId: ProvingJobId,
    type: T,
    error: Error | undefined,
    result: ProvingJobResultsMap[T] | undefined,
  ): void | Promise<void>;
}

export class ProvingJobController {
  private status: ProvingJobControllerStatus = ProvingJobControllerStatus.IDLE;
  private promise?: Promise<void>;
  private abortController = new AbortController();

  constructor(
    private jobId: ProvingJobId,
    private inputs: ProvingJobInputs,
    private startedAt: number,
    private circuitProver: ServerCircuitProver,
    private onComplete: ProvingJobCompletionCallback,
  ) {}

  public start(): void {
    if (this.status !== ProvingJobControllerStatus.IDLE) {
      return;
    }

    this.status = ProvingJobControllerStatus.PROVING;
    this.promise = this.generateProof()
      .then(
        result => {
          if (this.status === ProvingJobControllerStatus.ABORTED) {
            return;
          }

          this.status = ProvingJobControllerStatus.DONE;
          return this.onComplete(this.jobId, this.inputs.type, undefined, result);
        },
        error => {
          if (this.status === ProvingJobControllerStatus.ABORTED) {
            return;
          }

          if (error.name === 'AbortError') {
            // Ignore abort errors
            return;
          }

          this.status = ProvingJobControllerStatus.DONE;
          return this.onComplete(this.jobId, this.inputs.type, error, undefined);
        },
      )
      .catch(_ => {
        // ignore completion errors
      });
  }

  public getStatus(): ProvingJobControllerStatus {
    return this.status;
  }

  public abort(): void {
    if (this.status !== ProvingJobControllerStatus.PROVING) {
      return;
    }

    this.status = ProvingJobControllerStatus.ABORTED;
    this.abortController.abort();
  }

  public getJobId(): ProvingJobId {
    return this.jobId;
  }

  public getStartedAt(): number {
    return this.startedAt;
  }

  public getProofTypeName(): string {
    return ProvingRequestType[this.inputs.type];
  }

  private async generateProof(): Promise<ProvingJobResultsMap[ProvingRequestType]> {
    const { type, inputs } = this.inputs;
    const signal = this.abortController.signal;
    switch (type) {
      case ProvingRequestType.PUBLIC_VM: {
        return await this.circuitProver.getAvmProof(inputs, signal);
      }

      case ProvingRequestType.PRIVATE_BASE_ROLLUP: {
        return await this.circuitProver.getPrivateBaseRollupProof(inputs, signal);
      }

      case ProvingRequestType.PUBLIC_BASE_ROLLUP: {
        return await this.circuitProver.getPublicBaseRollupProof(inputs, signal);
      }

      case ProvingRequestType.MERGE_ROLLUP: {
        return await this.circuitProver.getMergeRollupProof(inputs, signal);
      }

      case ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP: {
        return await this.circuitProver.getEmptyBlockRootRollupProof(inputs, signal);
      }

      case ProvingRequestType.BLOCK_ROOT_ROLLUP: {
        return await this.circuitProver.getBlockRootRollupProof(inputs, signal);
      }

      case ProvingRequestType.BLOCK_MERGE_ROLLUP: {
        return await this.circuitProver.getBlockMergeRollupProof(inputs, signal);
      }

      case ProvingRequestType.ROOT_ROLLUP: {
        return await this.circuitProver.getRootRollupProof(inputs, signal);
      }

      case ProvingRequestType.BASE_PARITY: {
        return await this.circuitProver.getBaseParityProof(inputs, signal);
      }

      case ProvingRequestType.ROOT_PARITY: {
        return await this.circuitProver.getRootParityProof(inputs, signal);
      }

      case ProvingRequestType.PRIVATE_KERNEL_EMPTY: {
        return await this.circuitProver.getEmptyPrivateKernelProof(inputs, signal);
      }

      case ProvingRequestType.TUBE_PROOF: {
        return await this.circuitProver.getTubeProof(inputs, signal);
      }

      default: {
        const _exhaustive: never = type;
        return Promise.reject(new Error(`Invalid proof request type: ${type}`));
      }
    }
  }
}
