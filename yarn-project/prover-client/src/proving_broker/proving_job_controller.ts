import { randomBytes } from '@aztec/foundation/crypto';
import { AbortError } from '@aztec/foundation/error';
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
  RUNNING = 'running',
  DONE = 'done',
}

export class ProvingJobController {
  private status: ProvingJobControllerStatus = ProvingJobControllerStatus.IDLE;
  private promise?: Promise<void>;
  private abortController = new AbortController();
  private result?: ProvingJobResultsMap[ProvingRequestType] | Error;

  constructor(
    private jobId: ProvingJobId,
    private inputs: ProvingJobInputs,
    private epochNumber: number,
    private startedAt: number,
    private circuitProver: ServerCircuitProver,
    private onComplete: () => void,
    private log = createLogger('prover-client:proving-agent:job-controller-' + randomBytes(4).toString('hex')),
  ) {}

  public start(): void {
    if (this.status !== ProvingJobControllerStatus.IDLE) {
      this.log.warn(
        `Job controller for jobId=${this.jobId} not starting because it is not idle currentStatus=${this.status}`,
        {
          currentStatus: this.status,
          jobId: this.jobId,
        },
      );
      return;
    }

    this.promise = this.run();

    this.log.info(`Job controller started jobId=${this.jobId}`, {
      jobId: this.jobId,
    });
  }

  public getStatus(): ProvingJobControllerStatus {
    return this.status;
  }

  public getResult(): ProvingJobResultsMap[ProvingRequestType] | Error | undefined {
    return this.result;
  }

  public abort(): void {
    if (this.status !== ProvingJobControllerStatus.RUNNING) {
      this.log.warn(`Tried to abort job controller for jobId=${this.jobId} but it is not running`, {
        currentStatus: this.status,
        jobId: this.jobId,
      });
      return;
    }

    this.abortController.abort();
    this.log.warn(`Aborted job controller for jobId=${this.jobId}`, {
      jobId: this.jobId,
    });
  }

  public getJobId(): ProvingJobId {
    return this.jobId;
  }

  public getProofType(): ProvingRequestType {
    return this.inputs.type;
  }

  public getStartedAt(): number {
    return this.startedAt;
  }

  public getProofTypeName(): string {
    return ProvingRequestType[this.inputs.type];
  }

  private run = async () => {
    this.status = ProvingJobControllerStatus.RUNNING;
    let result: ProvingJobResultsMap[ProvingRequestType] | Error;
    try {
      result = await this.generateProof();
    } catch (err) {
      if (err && err instanceof Error) {
        result = err;
      } else {
        result = new Error('Unknown proving error: ' + String(err), { cause: err });
      }
    }

    if (this.abortController.signal.aborted) {
      this.log.warn(`Job controller for jobId=${this.jobId} completed but job was aborted`, {
        currentStatus: this.status,
        jobId: this.jobId,
      });
      result = new AbortError('Proof was aborted');
    }

    this.result = result;
    this.status = ProvingJobControllerStatus.DONE;
    try {
      this.onComplete();
    } catch (err) {
      this.log.warn(`On complete handler error: ${err}`, { jobId: this.jobId });
    }
  };

  private async generateProof(): Promise<ProvingJobResultsMap[ProvingRequestType]> {
    const { type, inputs } = this.inputs;
    const signal = this.abortController.signal;
    switch (type) {
      case ProvingRequestType.PUBLIC_VM: {
        // TODO(#14234)[Unconditional PIs validation]: Remove argument "undefined".
        return await this.circuitProver.getAvmProof(inputs, undefined, signal, this.epochNumber);
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

      case ProvingRequestType.PADDING_BLOCK_ROOT_ROLLUP: {
        return await this.circuitProver.getPaddingBlockRootRollupProof(inputs, signal, this.epochNumber);
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
