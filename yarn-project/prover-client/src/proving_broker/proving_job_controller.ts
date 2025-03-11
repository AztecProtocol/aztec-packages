import { createLogger } from '@aztec/foundation/log';
import type {
  ProvingJobId,
  ProvingJobInputs,
  ProvingJobResultsMap,
  ServerCircuitProver,
} from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

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
    private epochNumber: number,
    private startedAt: number,
    private circuitProver: ServerCircuitProver,
    private onComplete: ProvingJobCompletionCallback,
    private log = createLogger('prover-client:proving-agent:job-controller'),
  ) {}

  public start(): void {
    if (this.status !== ProvingJobControllerStatus.IDLE) {
      this.log.verbose(
        `Job controller for jobId=${this.jobId} not starting because it is not idle currentStatus=${this.status}`,
        {
          currentStatus: this.status,
          jobId: this.jobId,
        },
      );
      return;
    }

    this.status = ProvingJobControllerStatus.PROVING;
    this.log.verbose(`Job controller started jobId=${this.jobId}`, {
      jobId: this.jobId,
    });

    this.promise = this.generateProof()
      .then(
        result => {
          if (this.status === ProvingJobControllerStatus.ABORTED) {
            this.log.warn(`Job controller for jobId=${this.jobId} completed successfully but job was aborted`, {
              currentStatus: this.status,
              jobId: this.jobId,
            });
            return;
          }
          this.status = ProvingJobControllerStatus.DONE;
          this.log.verbose(`Job controller for jobId=${this.jobId} completed successfully`, {
            jobId: this.jobId,
          });
          return this.onComplete(this.jobId, this.inputs.type, undefined, result);
        },
        error => {
          if (this.status === ProvingJobControllerStatus.ABORTED) {
            this.log.warn(`Job controller for jobId=${this.jobId} finished with an error but job was aborted`, {
              currentStatus: this.status,
              jobId: this.jobId,
            });
            return;
          }

          if (error.name === 'AbortError') {
            // Ignore abort errors
            return;
          }

          this.log.verbose(`Job controller for jobId=${this.jobId} finished with an error`, {
            jobId: this.jobId,
            err: error,
          });

          this.status = ProvingJobControllerStatus.DONE;
          return this.onComplete(this.jobId, this.inputs.type, error, undefined);
        },
      )
      .catch(err => {
        this.log.error(`Job constroller failed to send result for jobId=${this.jobId}: ${err}`, err, {
          jobId: this.jobId,
        });
      });
  }

  public getStatus(): ProvingJobControllerStatus {
    return this.status;
  }

  public abort(): void {
    if (this.status !== ProvingJobControllerStatus.PROVING) {
      this.log.warn(`Tried to abort job controller for jobId=${this.jobId} but it is not running`, {
        currentStatus: this.status,
        jobId: this.jobId,
      });
      return;
    }

    this.status = ProvingJobControllerStatus.ABORTED;
    this.abortController.abort();
    this.log.verbose(`Aborted job controller for jobId=${this.jobId}`, {
      jobId: this.jobId,
    });
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
        return await this.circuitProver.getAvmProof(inputs, signal, this.epochNumber);
      }

      case ProvingRequestType.PRIVATE_BASE_ROLLUP: {
        return await this.circuitProver.getPrivateBaseRollupProof(inputs, signal, this.epochNumber);
      }

      case ProvingRequestType.PUBLIC_BASE_ROLLUP: {
        return await this.circuitProver.getPublicBaseRollupProof(inputs, signal, this.epochNumber);
      }

      case ProvingRequestType.MERGE_ROLLUP: {
        return await this.circuitProver.getMergeRollupProof(inputs, signal, this.epochNumber);
      }

      case ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP: {
        return await this.circuitProver.getEmptyBlockRootRollupProof(inputs, signal, this.epochNumber);
      }

      case ProvingRequestType.BLOCK_ROOT_ROLLUP: {
        return await this.circuitProver.getBlockRootRollupProof(inputs, signal, this.epochNumber);
      }

      case ProvingRequestType.SINGLE_TX_BLOCK_ROOT_ROLLUP: {
        return await this.circuitProver.getSingleTxBlockRootRollupProof(inputs, signal, this.epochNumber);
      }

      case ProvingRequestType.BLOCK_MERGE_ROLLUP: {
        return await this.circuitProver.getBlockMergeRollupProof(inputs, signal, this.epochNumber);
      }

      case ProvingRequestType.ROOT_ROLLUP: {
        return await this.circuitProver.getRootRollupProof(inputs, signal, this.epochNumber);
      }

      case ProvingRequestType.BASE_PARITY: {
        return await this.circuitProver.getBaseParityProof(inputs, signal, this.epochNumber);
      }

      case ProvingRequestType.ROOT_PARITY: {
        return await this.circuitProver.getRootParityProof(inputs, signal, this.epochNumber);
      }

      case ProvingRequestType.TUBE_PROOF: {
        return await this.circuitProver.getTubeProof(inputs, signal, this.epochNumber);
      }

      default: {
        const _exhaustive: never = type;
        return Promise.reject(new Error(`Invalid proof request type: ${type}`));
      }
    }
  }
}
