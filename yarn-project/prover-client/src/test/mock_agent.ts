import type {
  GetProvingJobResponse,
  ProverAgentStatus,
  ProvingJobConsumer,
  ProvingJobFilter,
  ProvingJobId,
  ProvingJobInputs,
  ProvingJobResultsMap,
  ServerCircuitProver,
} from '@aztec/stdlib/interfaces/server';
import type { ProofUri } from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

import type { ProofStore } from '../proving_broker/proof_store/index.js';

export class MockAgent implements ProvingJobConsumer {
  private isRunning = false;
  private currentJobId?: ProvingJobId;
  private currentProofType?: ProvingRequestType;
  private startTime?: number;
  private proofResults: Map<ProvingJobId, ProvingJobResultsMap[ProvingRequestType]> = new Map();

  constructor(
    private broker: ProvingJobConsumer,
    private proofStore: ProofStore,
    private circuitProver: ServerCircuitProver,
    private proofAllowList: Array<ProvingRequestType> = [],
    private pollIntervalMs = 1000,
  ) {}

  public start(): void {
    this.isRunning = true;
    void this.pollForJobs();
  }

  public stop(): void {
    this.isRunning = false;
  }

  public getStatus(): ProverAgentStatus {
    if (this.currentJobId) {
      return {
        status: 'proving',
        jobId: this.currentJobId,
        proofType: this.currentProofType!,
        startedAtISO: new Date(this.startTime!).toISOString(),
      };
    }
    return this.isRunning ? { status: 'running' } : { status: 'stopped' };
  }

  private async pollForJobs(): Promise<void> {
    while (this.isRunning) {
      try {
        const job = await this.broker.getProvingJob({ allowList: this.proofAllowList });
        if (job) {
          await this.processJob(job);
        }
      } catch {
        // Silently handle errors in polling loop
      }
      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
    }
  }

  private async processJob({ job, time }: GetProvingJobResponse): Promise<void> {
    this.currentJobId = job.id;
    this.currentProofType = job.type;
    this.startTime = time;

    try {
      // Get inputs from proof store
      const inputs = await this.proofStore.getProofInput(job.inputsUri);

      // Simulate proof generation with the circuit prover
      const result = await this.generateProof(inputs, job.epochNumber);

      this.proofResults.set(job.id, result);

      // Report success to broker
      const proofUri = 'mock-proof-uri' as ProofUri;
      await this.broker.reportProvingJobSuccess(job.id, proofUri, { allowList: this.proofAllowList });
    } catch (error) {
      // Report error to broker
      await this.broker.reportProvingJobError(job.id, error instanceof Error ? error.message : 'Unknown error', true, {
        allowList: this.proofAllowList,
      });
    } finally {
      this.currentJobId = undefined;
      this.currentProofType = undefined;
      this.startTime = undefined;
    }
  }

  private async generateProof(
    inputs: ProvingJobInputs,
    epochNumber: number,
  ): Promise<ProvingJobResultsMap[ProvingRequestType]> {
    const { type, inputs: circuitInputs } = inputs;
    const result = await (() => {
      switch (type) {
        case ProvingRequestType.PUBLIC_VM:
          return this.circuitProver.getAvmProof(circuitInputs, undefined, undefined, epochNumber);
        case ProvingRequestType.PRIVATE_BASE_ROLLUP:
          return this.circuitProver.getPrivateBaseRollupProof(circuitInputs, undefined, epochNumber);
        case ProvingRequestType.PUBLIC_BASE_ROLLUP:
          return this.circuitProver.getPublicBaseRollupProof(circuitInputs, undefined, epochNumber);
        case ProvingRequestType.MERGE_ROLLUP:
          return this.circuitProver.getMergeRollupProof(circuitInputs, undefined, epochNumber);
        case ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP:
          return this.circuitProver.getEmptyBlockRootRollupProof(circuitInputs, undefined, epochNumber);
        case ProvingRequestType.BLOCK_ROOT_ROLLUP:
          return this.circuitProver.getBlockRootRollupProof(circuitInputs, undefined, epochNumber);
        case ProvingRequestType.SINGLE_TX_BLOCK_ROOT_ROLLUP:
          return this.circuitProver.getSingleTxBlockRootRollupProof(circuitInputs, undefined, epochNumber);
        case ProvingRequestType.BLOCK_MERGE_ROLLUP:
          return this.circuitProver.getBlockMergeRollupProof(circuitInputs, undefined, epochNumber);
        case ProvingRequestType.ROOT_ROLLUP:
          return this.circuitProver.getRootRollupProof(circuitInputs, undefined, epochNumber);
        case ProvingRequestType.BASE_PARITY:
          return this.circuitProver.getBaseParityProof(circuitInputs, undefined, epochNumber);
        case ProvingRequestType.ROOT_PARITY:
          return this.circuitProver.getRootParityProof(circuitInputs, undefined, epochNumber);
        case ProvingRequestType.TUBE_PROOF:
          return this.circuitProver.getTubeProof(circuitInputs, undefined, epochNumber);
        default:
          throw new Error(`Unsupported proof type: ${type}`);
      }
    })();
    return result;
  }

  // Implement ProvingJobConsumer interface methods
  async getProvingJob(filter?: ProvingJobFilter): Promise<GetProvingJobResponse | undefined> {
    const result = await this.broker.getProvingJob(filter);
    return result;
  }

  async reportProvingJobProgress(
    id: string,
    startedAt: number,
    filter?: ProvingJobFilter,
  ): Promise<GetProvingJobResponse | undefined> {
    const result = await this.broker.reportProvingJobProgress(id, startedAt, filter);
    return result;
  }

  async reportProvingJobError(
    id: string,
    err: string,
    retry?: boolean,
    filter?: ProvingJobFilter,
  ): Promise<GetProvingJobResponse | undefined> {
    const result = await this.broker.reportProvingJobError(id, err, retry, filter);
    return result;
  }

  async reportProvingJobSuccess(
    id: string,
    result: ProofUri,
    filter?: ProvingJobFilter,
  ): Promise<GetProvingJobResponse | undefined> {
    const response = await this.broker.reportProvingJobSuccess(id, result, filter);
    return response;
  }
}
