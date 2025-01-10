import {
  type ProofAndVerificationKey,
  type ProvingJobId,
  type ProvingJobInputsMap,
  type ProvingJobProducer,
  type ProvingJobResultsMap,
  type ProvingJobStatus,
  ProvingRequestType,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  makeProvingJobId,
} from '@aztec/circuit-types';
import {
  type AVM_PROOF_LENGTH_IN_FIELDS,
  type AvmCircuitInputs,
  type BaseParityInputs,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  type NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  type ParityPublicInputs,
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
  type SingleTxBlockRootRollupInputs,
  type TubeInputs,
} from '@aztec/circuits.js/rollup';
import { sha256 } from '@aztec/foundation/crypto';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise, promiseWithResolvers } from '@aztec/foundation/promise';
import { SerialQueue } from '@aztec/foundation/queue';
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
  abortFn?: () => Promise<void>;
  signal?: AbortSignal;
};

export class BrokerCircuitProverFacade implements ServerCircuitProver {
  private jobs: Map<ProvingJobId, ProvingJob> = new Map();
  private runningPromise?: RunningPromise;
  private timeOfLastSnapshotSync = Date.now();
  private queue: SerialQueue = new SerialQueue();
  private jobsToRetrieve: Set<ProvingJobId> = new Set();

  constructor(
    private broker: ProvingJobProducer,
    private proofStore: ProofStore = new InlineProofStore(),
    private waitTimeoutMs = MAX_WAIT_MS,
    private pollIntervalMs = 1000,
    private log = createLogger('prover-client:broker-circuit-prover-facade'),
  ) {}

  private enqueueJob<T extends ProvingRequestType>(
    id: ProvingJobId,
    type: T,
    inputs: ProvingJobInputsMap[T],
    epochNumber = 0,
    signal?: AbortSignal,
  ): Promise<ProvingJobResultsMap[T]> {
    if (!this.queue) {
      throw new Error('BrokerCircuitProverFacade not started');
    }
    return this.queue!.put(() => this._enqueueJob(id, type, inputs, epochNumber, signal)).then(
      ({ enqueuedPromise }) => enqueuedPromise,
    );
  }

  private async _enqueueJob<T extends ProvingRequestType>(
    id: ProvingJobId,
    type: T,
    inputs: ProvingJobInputsMap[T],
    epochNumber = 0,
    signal?: AbortSignal,
  ): Promise<{ enqueuedPromise: Promise<ProvingJobResultsMap[T]> }> {
    // Check if there is already a promise for this job
    const existingPromise = this.jobs.get(id);
    if (existingPromise) {
      this.log.verbose(`Job already found in facade id=${id} type=${ProvingRequestType[type]}`, {
        provingJobId: id,
        provingJobType: ProvingRequestType[type],
        epochNumber,
      });
      return { enqueuedPromise: existingPromise.promise.promise as Promise<ProvingJobResultsMap[T]> };
    }
    const inputsUri = await this.proofStore.saveProofInput(id, type, inputs);
    const jobStatus = await this.broker.enqueueProvingJob({
      id,
      type,
      inputsUri,
      epochNumber,
    });

    // Create a promise for this job id, regardless of whether it was enqueued at the broker
    // The running promise will monitor for the job to be completed and resolve it either way
    const promise = promiseWithResolvers<ProvingJobResultsMap[T]>();
    const abortFn = async () => {
      signal?.removeEventListener('abort', abortFn);
      await this.broker.cancelProvingJob(id);
    };
    const job: ProvingJob = {
      id,
      type,
      promise,
      abortFn,
      signal,
    };
    this.jobs.set(id, job);

    // If we are here then the job was successfully accepted by the broker
    // the returned status is for before any action was performed
    if (jobStatus.status === 'not-found') {
      // Job added for the first time
      // notify the broker if job is aborted
      signal?.addEventListener('abort', abortFn);

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
    } else if (jobStatus.status === 'fulfilled' || jobStatus.status === 'rejected') {
      // Job was already completed by the broker
      // No need to notify the broker on aborted job
      job.abortFn = undefined;
      this.log.verbose(
        `Job already completed when sent to broker id=${id} type=${ProvingRequestType[type]} epochNumber=${epochNumber}`,
        {
          provingJobId: id,
          provingJobType: ProvingRequestType[type],
          epochNumber,
          inputsUri: truncate(inputsUri),
        },
      );

      // Job was not enqueued. It must be completed already, add to our set of already completed jobs
      this.jobsToRetrieve.add(id);
    } else {
      // Job was previously sent to the broker but is not completed
      // notify the broker if job is aborted
      signal?.addEventListener('abort', abortFn);
      this.log.verbose(
        `Job already in queue or in progress when sent to broker id=${id} type=${ProvingRequestType[type]} epochNumber=${epochNumber}`,
        {
          provingJobId: id,
          provingJobType: ProvingRequestType[type],
          epochNumber,
          inputsUri: truncate(inputsUri),
        },
      );
    }
    const typedPromise = promise.promise as Promise<ProvingJobResultsMap[T]>;
    return { enqueuedPromise: typedPromise };
  }

  public start() {
    if (this.runningPromise) {
      throw new Error('BrokerCircuitProverFacade already started');
    }

    this.log.verbose('Starting BrokerCircuitProverFacade');

    this.runningPromise = new RunningPromise(() => this.monitorForCompletedJobs(), this.log, this.pollIntervalMs);
    this.runningPromise.start();

    this.queue = new SerialQueue();
    this.queue.start();
  }

  public async stop(): Promise<void> {
    if (!this.runningPromise) {
      throw new Error('BrokerCircuitProverFacade not started');
    }
    this.log.verbose('Stopping BrokerCircuitProverFacade');
    await this.runningPromise.stop();

    if (this.queue) {
      await this.queue.cancel();
      await this.queue.end();
    }

    // Reject any outstanding promises as stopped
    for (const [_, v] of this.jobs) {
      v.promise.reject(new Error('Broker facade stopped'));
    }
    this.jobs.clear();
  }

  private async updateCompletedJobs() {
    // Here we check for completed jobs. If everything works well (there are no service restarts etc) then all we need to do
    // to maintain correct job state is to check for incrementally completed jobs. i.e. call getCompletedJobs with an empty array
    // However, if there are any problems then we may lose sync with the broker's actual set of completed jobs.
    // In this case we need to perform a full snapshot sync. This involves sending all of our outstanding job Ids to the broker
    // and have the broker report on whether they are completed or not.
    // We perform an incremental sync on every call of this function with a full snapshot sync periodically.
    // This should keep us in sync without over-burdening the broker with snapshot sync requests

    const getAllCompletedJobs = async (ids: ProvingJobId[]) => {
      // In this function we take whatever set of snapshot ids and we ask the broker for completed job notifications
      // We collect all returned notifications and return them
      const allCompleted = new Set<ProvingJobId>();
      try {
        let numRequests = 0;
        while (ids.length > 0) {
          const slice = ids.splice(0, SNAPSHOT_SYNC_CHECK_MAX_REQUEST_SIZE);
          const completed = await this.broker.getCompletedJobs(slice);
          completed.forEach(id => allCompleted.add(id));
          ++numRequests;
        }
        if (numRequests === 0) {
          const final = await this.broker.getCompletedJobs([]);
          final.forEach(id => allCompleted.add(id));
        }
      } catch (err) {
        this.log.error(`Error thrown when requesting completed job notifications from the broker`, err);
      }
      return allCompleted;
    };

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

    // Now request the notifications from the broker
    const snapshotIdsLength = snapshotSyncIds.length;
    const completedJobs = await getAllCompletedJobs(snapshotSyncIds);

    // We now have an additional set of completed job notifications to add to our cached set giving us the full set of jobs that we have been told are ready
    // We filter this list to what we actually need, in case for any reason it is different and store in our cache
    const allJobsReady = [...completedJobs, ...this.jobsToRetrieve];
    this.jobsToRetrieve = new Set(allJobsReady.filter(id => this.jobs.has(id)));

    if (completedJobs.size > 0) {
      this.log.verbose(
        `Check for job completion notifications returned ${completedJobs.size} job(s), snapshot ids length: ${snapshotIdsLength}, num outstanding jobs: ${this.jobs.size}, total jobs ready: ${this.jobsToRetrieve.size}`,
      );
    } else {
      this.log.trace(
        `Check for job completion notifications returned 0 jobs, snapshot ids length: ${snapshotIdsLength}, num outstanding jobs: ${this.jobs.size}, total jobs ready: ${this.jobsToRetrieve.size}`,
      );
    }
  }

  private async retrieveJobsThatShouldBeReady() {
    const convertJobResult = async <T extends ProvingRequestType>(
      result: ProvingJobStatus,
      jobType: ProvingRequestType,
    ): Promise<{
      success: boolean;
      reason?: string;
      result?: ProvingJobResultsMap[T];
    }> => {
      if (result.status === 'fulfilled') {
        const output = await this.proofStore.getProofOutput(result.value);
        if (output.type === jobType) {
          return { result: output.result as ProvingJobResultsMap[T], success: true };
        } else {
          return { success: false, reason: `Unexpected proof type: ${output.type}. Expected: ${jobType}` };
        }
      } else if (result.status === 'rejected') {
        return { success: false, reason: result.reason };
      } else {
        throw new Error(`Unexpected proving job status ${result.status}`);
      }
    };

    const processJob = async (job: ProvingJob) => {
      // First retrieve the settled job from the broker
      this.log.debug(`Received notification of completed job id=${job.id} type=${ProvingRequestType[job.type]}`);
      let settledResult;
      try {
        settledResult = await this.broker.getProvingJobStatus(job.id);
      } catch (err) {
        // If an error occurs retrieving the job result then just log it and move on.
        // We will try again on the next iteration
        this.log.error(
          `Error retrieving job result from broker job id=${job.id} type=${ProvingRequestType[job.type]}`,
          err,
        );
        return false;
      }

      // Then convert the result and resolve/reject the promise
      let result;
      try {
        result = await convertJobResult(settledResult, job.type);
      } catch (err) {
        // If an error occurs retrieving the job result then just log it and move on.
        // We will try again on the next iteration
        this.log.error(`Error processing job result job id=${job.id} type=${ProvingRequestType[job.type]}`, err);
        return false;
      }

      if (result.success) {
        this.log.verbose(`Resolved proving job id=${job.id} type=${ProvingRequestType[job.type]}`);
        job.promise.resolve(result.result);
      } else {
        this.log.error(
          `Resolving proving job with error id=${job.id} type=${ProvingRequestType[job.type]}`,
          result.reason,
        );
        job.promise.reject(new Error(result.reason));
      }

      if (job.abortFn && job.signal) {
        job.signal?.removeEventListener('abort', job.abortFn);
      }

      // Job is now processed removed from our cache
      this.jobs.delete(job.id);
      this.jobsToRetrieve.delete(job.id);
      return true;
    };

    const toBeRetrieved = Array.from(this.jobsToRetrieve.values())
      .map(id => this.jobs.get(id)!)
      .filter(x => x !== undefined);
    const totalJobsToRetrieve = toBeRetrieved.length;
    let totalJobsRetrieved = 0;
    while (toBeRetrieved.length > 0) {
      const slice = toBeRetrieved.splice(0, MAX_CONCURRENT_JOB_SETTLED_REQUESTS);
      const results = await Promise.all(slice.map(job => processJob(job!)));
      totalJobsRetrieved += results.filter(x => x).length;
    }
    if (totalJobsToRetrieve > 0) {
      this.log.verbose(
        `Successfully retrieved ${totalJobsRetrieved} of ${totalJobsToRetrieve} jobs that should be ready, total ready jobs is now: ${this.jobsToRetrieve.size}`,
      );
    }
  }

  private async monitorForCompletedJobs() {
    // Monitoring for completed jobs involves 2 stages.

    // 1. Update our list of completed jobs.
    // We poll the broker for any new job completion notifications and after filtering/deduplication add them to our cached
    // list of jobs that we have been told are ready.
    await this.updateCompletedJobs();

    // 2. Retrieve the jobs that should be ready.
    // We have a list of jobs that we have been told are ready, so we go ahead and ask for their results
    await this.retrieveJobsThatShouldBeReady();
  }

  getAvmProof(
    inputs: AvmCircuitInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<ProofAndVerificationKey<typeof AVM_PROOF_LENGTH_IN_FIELDS>> {
    return this.enqueueJob(
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
    return this.enqueueJob(
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
    return this.enqueueJob(
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
    return this.enqueueJob(
      this.generateId(ProvingRequestType.BLOCK_ROOT_ROLLUP, input, epochNumber),
      ProvingRequestType.BLOCK_ROOT_ROLLUP,
      input,
      epochNumber,
      signal,
    );
  }

  getSingleTxBlockRootRollupProof(
    input: SingleTxBlockRootRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueueJob(
      this.generateId(ProvingRequestType.BLOCK_ROOT_ROLLUP, input, epochNumber),
      ProvingRequestType.SINGLE_TX_BLOCK_ROOT_ROLLUP,
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
    return this.enqueueJob(
      this.generateId(ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP, input, epochNumber),
      ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP,
      input,
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
    return this.enqueueJob(
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
    return this.enqueueJob(
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
    return this.enqueueJob(
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
    return this.enqueueJob(
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
    return this.enqueueJob(
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
    return this.enqueueJob(
      this.generateId(ProvingRequestType.TUBE_PROOF, tubeInput, epochNumber),
      ProvingRequestType.TUBE_PROOF,
      tubeInput,
      epochNumber,
      signal,
    );
  }

  private generateId(type: ProvingRequestType, inputs: { toBuffer(): Buffer }, epochNumber = 0) {
    const inputsHash = sha256(inputs.toBuffer());
    return makeProvingJobId(epochNumber, type, inputsHash.toString('hex'));
  }
}
