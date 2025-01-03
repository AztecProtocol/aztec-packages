import {
  type ProofAndVerificationKey,
  type ProvingJobId,
  type ProvingJobInputsMap,
  type ProvingJobProducer,
  type ProvingJobResultsMap,
  ProvingRequestType,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
} from '@aztec/circuit-types';
import {
  type AVM_PROOF_LENGTH_IN_FIELDS,
  type AvmCircuitInputs,
  type BaseParityInputs,
  type KernelCircuitPublicInputs,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  type NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  type ParityPublicInputs,
  type PrivateKernelEmptyInputData,
  type RECURSIVE_PROOF_LENGTH,
  type RootParityInputs,
  type TUBE_PROOF_LENGTH,
} from '@aztec/circuits.js';
import {
  type BaseOrMergeRollupPublicInputs,
  type BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  type EmptyBlockRootRollupInputs,
  type MergeRollupInputs,
  type PrivateBaseRollupInputs,
  type PublicBaseRollupInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  type TubeInputs,
} from '@aztec/circuits.js/rollup';
import { sha256 } from '@aztec/foundation/crypto';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise, promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { truncate } from '@aztec/foundation/string';

import { InlineProofStore, type ProofStore } from './proof_store.js';

// 20 minutes, roughly the length of an Aztec epoch. If a proof isn't ready in this amount of time then we've failed to prove the whole epoch
const MAX_WAIT_MS = 1_200_000;

// Perform a snapshot sync every 30 seconds
const SNAPSHOT_SYNC_INTERVAL_MS = 30_000;

const MAX_CONCURRENT_JOB_SETTLED_REQUESTS = 10;
const SNAPSHOT_SYNC_CHECK_MAX_REQUEST_SIZE = 1000;

type ProvingJob = {
  id: ProvingJobId;
  type: ProvingRequestType;
  promise: PromiseWithResolvers<any>;
};

export class BrokerCircuitProverFacade implements ServerCircuitProver {
  private jobs: Map<ProvingJobId, ProvingJob> = new Map();
  private runningPromise?: RunningPromise;
  private timeOfLastSnapshotSync = Date.now();

  constructor(
    private broker: ProvingJobProducer,
    private proofStore: ProofStore = new InlineProofStore(),
    private waitTimeoutMs = MAX_WAIT_MS,
    private pollIntervalMs = 1000,
    private log = createLogger('prover-client:broker-circuit-prover-facade'),
  ) {}

  private async enqueueAndWaitForJob<T extends ProvingRequestType>(
    id: ProvingJobId,
    type: T,
    inputs: ProvingJobInputsMap[T],
    epochNumber = 0,
    signal?: AbortSignal,
  ): Promise<ProvingJobResultsMap[T]> {
    const inputsUri = await this.proofStore.saveProofInput(id, type, inputs);
    const enqueued = await this.broker.enqueueProvingJob({
      id,
      type,
      inputsUri,
      epochNumber,
    });

    if (enqueued) {
      // notify broker of cancelled job
      const abortFn = async () => {
        signal?.removeEventListener('abort', abortFn);
        await this.broker.cancelProvingJob(id);
      };

      signal?.addEventListener('abort', abortFn);

      const promise = promiseWithResolvers<ProvingJobResultsMap[T]>();
      const job: ProvingJob = {
        id,
        type,
        promise,
      };
      this.jobs.set(id, job);
      this.log.verbose(
        `Job enqueued with broker id=${id} type=${ProvingRequestType[type]} epochNumber=${epochNumber}`,
        {
          provingJobId: id,
          provingJobType: ProvingRequestType[type],
          epochNumber,
          inputsUri: truncate(inputsUri),
          numOutstandingJobs: this.jobs.size,
        },
      );
      const typedPromise = promise.promise as Promise<ProvingJobResultsMap[T]>;
      return typedPromise;
    } else {
      this.log.verbose(
        `Job not enqueued when sent to broker id=${id} type=${ProvingRequestType[type]} epochNumber=${epochNumber}`,
        {
          provingJobId: id,
          provingJobType: ProvingRequestType[type],
          epochNumber,
          inputsUri: truncate(inputsUri),
        },
      );

      // Job was not enqueued. It must be completed already
      return this.retrieveCompletedJobResult(id, type);
    }
  }

  private async retrieveCompletedJobResult<T extends ProvingRequestType>(
    id: ProvingJobId,
    type: T,
  ): Promise<ProvingJobResultsMap[T]> {
    // loop here until the job settles
    // NOTE: this could also terminate because the job was cancelled through event listener above
    const result = await retryUntil(
      async () => {
        try {
          return await this.broker.waitForJobToSettle(id);
        } catch (err) {
          // waitForJobToSettle can only fail for network errors
          // keep retrying until we time out
        }
      },
      `Proving job=${id} type=${ProvingRequestType[type]}`,
      this.waitTimeoutMs / 1000,
      this.pollIntervalMs / 1000,
    );

    if (result.status === 'fulfilled') {
      const output = await this.proofStore.getProofOutput(result.value);
      if (output.type === type) {
        return output.result as ProvingJobResultsMap[T];
      } else {
        throw new Error(`Unexpected proof type: ${output.type}. Expected: ${type}`);
      }
    } else {
      throw new Error(result.reason);
    }
  }

  public start() {
    if (this.runningPromise) {
      throw new Error('BrokerCircuitProverFacade already started');
    }

    this.log.verbose('Starting BrokerCircuitProverFacade');

    this.runningPromise = new RunningPromise(() => this.monitorForCompletedJobs(), this.log, this.pollIntervalMs);
    this.runningPromise.start();
  }

  public async stop(): Promise<void> {
    if (!this.runningPromise) {
      throw new Error('BrokerCircuitProverFacade not started');
    }
    this.log.verbose('Stopping BrokerCircuitProverFacade');
    await this.runningPromise.stop();
  }

  private async monitorForCompletedJobs() {
    const processJob = async (job: ProvingJob) => {
      try {
        this.log.debug(`Received notification of completed job id=${job.id} type=${ProvingRequestType[job.type]}`);
        const result = await this.retrieveCompletedJobResult(job.id, job.type);
        this.log.verbose(`Resolved job id=${job.id} type=${ProvingRequestType[job.type]}`);
        job.promise.resolve(result);
      } catch (err) {
        this.log.error(`Error processing job id=${job.id} type=${ProvingRequestType[job.type]}`, err);
        job.promise.reject(err);
      }
      this.jobs.delete(job.id);
    };

    const getAllCompletedJobs = async (ids: ProvingJobId[]) => {
      const allCompleted = [];
      while (ids.length > 0) {
        const slice = ids.splice(0, SNAPSHOT_SYNC_CHECK_MAX_REQUEST_SIZE);
        const completed = await this.broker.getCompletedJobs(slice);
        allCompleted.push(...completed);
      }
      const final = await this.broker.getCompletedJobs([]);
      return allCompleted.concat(final);
    };

    // Here we check for completed jobs. If everything works well (there are no service restarts etc) then all we need to do
    // to maintain correct job state is to check for incrementally completed jobs. i.e. call getCompletedJobs with and empty array
    // However, if there are any problems then we may lose sync with the broker's actual set of completed jobs.
    // In this case we need to perform a full snapshot sync. This involves sending all of our outstanding job Ids to the broker
    // and have the broker report on whether they are completed or not.
    // We perform an incremental sync on every call of this function with a full snapshot sync periodically.
    // This should keep us ini sync without over-burdening the broker with snapshot sync requests

    const snapshotSyncIds = [];
    const currentTime = Date.now();
    const secondsSinceLastSnapshotSync = currentTime - this.timeOfLastSnapshotSync;
    if (secondsSinceLastSnapshotSync > SNAPSHOT_SYNC_INTERVAL_MS) {
      this.timeOfLastSnapshotSync = currentTime;
      snapshotSyncIds.push(...this.jobs.keys());
      this.log.trace(`Performing full snapshot sync of completed jobs with ${snapshotSyncIds.length} job(s)`);
    } else {
      this.log.trace(`Performing incremental sync of completed jobs`);
    }

    const snapshotIdsLength = snapshotSyncIds.length;
    const completedJobs = await getAllCompletedJobs(snapshotSyncIds);
    const filtered = completedJobs.map(jobId => this.jobs.get(jobId)).filter(job => job !== undefined);
    if (filtered.length > 0) {
      this.log.verbose(
        `Check for job completion notifications returned ${filtered.length} job(s), snapshot ids length: ${snapshotIdsLength}, num outstanding jobs: ${this.jobs.size}`,
      );
    } else {
      this.log.trace(
        `Check for job completion notifications returned 0 jobs, snapshot ids length: ${snapshotIdsLength}, num outstanding jobs: ${this.jobs.size}`,
      );
    }
    while (filtered.length > 0) {
      const slice = filtered.splice(0, MAX_CONCURRENT_JOB_SETTLED_REQUESTS);
      await Promise.all(slice.map(job => processJob(job!)));
    }
  }

  getAvmProof(
    inputs: AvmCircuitInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<ProofAndVerificationKey<typeof AVM_PROOF_LENGTH_IN_FIELDS>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.PUBLIC_VM, inputs, epochNumber),
      ProvingRequestType.PUBLIC_VM,
      inputs,
      epochNumber,
      signal,
    );
  }

  getBaseParityProof(
    inputs: BaseParityInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.BASE_PARITY, inputs, epochNumber),
      ProvingRequestType.BASE_PARITY,
      inputs,
      epochNumber,
      signal,
    );
  }

  getBlockMergeRollupProof(
    input: BlockMergeRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.BLOCK_MERGE_ROLLUP, input, epochNumber),
      ProvingRequestType.BLOCK_MERGE_ROLLUP,
      input,
      epochNumber,
      signal,
    );
  }

  getBlockRootRollupProof(
    input: BlockRootRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.BLOCK_ROOT_ROLLUP, input, epochNumber),
      ProvingRequestType.BLOCK_ROOT_ROLLUP,
      input,
      epochNumber,
      signal,
    );
  }

  getEmptyBlockRootRollupProof(
    input: EmptyBlockRootRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP, input, epochNumber),
      ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP,
      input,
      epochNumber,
      signal,
    );
  }

  getEmptyPrivateKernelProof(
    inputs: PrivateKernelEmptyInputData,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<KernelCircuitPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.PRIVATE_KERNEL_EMPTY, inputs, epochNumber),
      ProvingRequestType.PRIVATE_KERNEL_EMPTY,
      inputs,
      epochNumber,
      signal,
    );
  }

  getMergeRollupProof(
    input: MergeRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.MERGE_ROLLUP, input, epochNumber),
      ProvingRequestType.MERGE_ROLLUP,
      input,
      epochNumber,
      signal,
    );
  }
  getPrivateBaseRollupProof(
    baseRollupInput: PrivateBaseRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.PRIVATE_BASE_ROLLUP, baseRollupInput, epochNumber),
      ProvingRequestType.PRIVATE_BASE_ROLLUP,
      baseRollupInput,
      epochNumber,
      signal,
    );
  }

  getPublicBaseRollupProof(
    inputs: PublicBaseRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.PUBLIC_BASE_ROLLUP, inputs, epochNumber),
      ProvingRequestType.PUBLIC_BASE_ROLLUP,
      inputs,
      epochNumber,
      signal,
    );
  }

  getRootParityProof(
    inputs: RootParityInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.ROOT_PARITY, inputs, epochNumber),
      ProvingRequestType.ROOT_PARITY,
      inputs,
      epochNumber,
      signal,
    );
  }

  getRootRollupProof(
    input: RootRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.ROOT_ROLLUP, input, epochNumber),
      ProvingRequestType.ROOT_ROLLUP,
      input,
      epochNumber,
      signal,
    );
  }

  getTubeProof(
    tubeInput: TubeInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.TUBE_PROOF, tubeInput, epochNumber),
      ProvingRequestType.TUBE_PROOF,
      tubeInput,
      epochNumber,
      signal,
    );
  }

  private generateId(type: ProvingRequestType, inputs: { toBuffer(): Buffer }, epochNumber = 0) {
    const inputsHash = sha256(inputs.toBuffer());
    return `${epochNumber}:${ProvingRequestType[type]}:${inputsHash.toString('hex')}`;
  }
}
