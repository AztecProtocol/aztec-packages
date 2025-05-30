import type {
  AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  RECURSIVE_PROOF_LENGTH,
  TUBE_PROOF_LENGTH,
} from '@aztec/constants';
import { sha256 } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, RunningPromise, promiseWithResolvers } from '@aztec/foundation/promise';
import { truncate } from '@aztec/foundation/string';
import type { AvmCircuitInputs } from '@aztec/stdlib/avm';
import {
  type ProofAndVerificationKey,
  type ProofUri,
  type ProvingJobId,
  type ProvingJobInputsMap,
  type ProvingJobProducer,
  type ProvingJobResultsMap,
  type ProvingJobStatus,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
  makeProvingJobId,
} from '@aztec/stdlib/interfaces/server';
import type { BaseParityInputs, ParityPublicInputs, RootParityInputs } from '@aztec/stdlib/parity';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import type {
  BaseOrMergeRollupPublicInputs,
  BlockMergeRollupInputs,
  BlockRootOrBlockMergePublicInputs,
  BlockRootRollupInputs,
  EmptyBlockRootRollupInputs,
  MergeRollupInputs,
  PrivateBaseRollupInputs,
  PublicBaseRollupInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
  SingleTxBlockRootRollupInputs,
  TubeInputs,
} from '@aztec/stdlib/rollup';

import { InlineProofStore, type ProofStore } from './proof_store/index.js';

// Perform a snapshot sync every 30 seconds
const SNAPSHOT_SYNC_INTERVAL_MS = 30_000;

const MAX_CONCURRENT_JOB_SETTLED_REQUESTS = 10;
const SNAPSHOT_SYNC_CHECK_MAX_REQUEST_SIZE = 1000;

type ProvingJob = {
  id: ProvingJobId;
  inputsUri?: ProofUri;
  type: ProvingRequestType;
  deferred: PromiseWithResolvers<any>;
  abortFn: () => void;
  signal?: AbortSignal;
};

export class BrokerCircuitProverFacade implements ServerCircuitProver {
  private jobs: Map<ProvingJobId, ProvingJob> = new Map();
  private runningPromise?: RunningPromise;
  private timeOfLastSnapshotSync = Date.now();
  private jobsToRetrieve: Set<ProvingJobId> = new Set();

  constructor(
    private broker: ProvingJobProducer,
    private proofStore: ProofStore = new InlineProofStore(),
    private failedProofStore?: ProofStore,
    private pollIntervalMs = 1000,
    private log = createLogger('prover-client:broker-circuit-prover-facade'),
  ) {}

  /**
   * This is a critical section. This function can not be async since it writes
   * to the jobs map which acts as a mutex, ensuring a job is only ever created once.
   *
   * This could be called in a SerialQueue if it needs to become async.
   */
  private getOrCreateProvingJob<T extends ProvingRequestType>(
    id: ProvingJobId,
    type: T,
    signal?: AbortSignal,
  ): { job: ProvingJob; isEnqueued: boolean } {
    // Check if there is already a promise for this job
    const existingJob = this.jobs.get(id);
    if (existingJob) {
      this.log.verbose(`Job already found in facade id=${id} type=${ProvingRequestType[type]}`, {
        provingJobId: id,
        provingJobType: ProvingRequestType[type],
      });
      return { job: existingJob, isEnqueued: true };
    }

    // Create a promise for this job id, regardless of whether it was enqueued at the broker
    // The running promise will monitor for the job to be completed and resolve it either way
    // We install an error handler to prevent unhandled rejections in the process before the
    // job promise is awaited by the caller (see #13166)
    const promise = promiseWithResolvers<ProvingJobResultsMap[T]>();
    promise.promise.catch(err =>
      this.log.error(`Job errored with '${err.message ?? err}' id=${id} type=${ProvingRequestType[type]}`, {
        provingJobId: id,
        provingJobType: ProvingRequestType[type],
      }),
    );
    const abortFn = () => {
      signal?.removeEventListener('abort', abortFn);
      void this.broker.cancelProvingJob(id).catch(err => this.log.warn(`Error cancelling job id=${id}`, err));
    };
    const job: ProvingJob = {
      id,
      type,
      deferred: promise,
      abortFn,
      signal,
    };

    this.jobs.set(id, job);
    return { job, isEnqueued: false };
  }

  private async enqueueJob<T extends ProvingRequestType>(
    id: ProvingJobId,
    type: T,
    inputs: ProvingJobInputsMap[T],
    epochNumber = 0,
    signal?: AbortSignal,
  ): Promise<ProvingJobResultsMap[T]> {
    const { job: job, isEnqueued } = this.getOrCreateProvingJob(id, type, signal);
    if (isEnqueued) {
      return job.deferred.promise;
    }

    try {
      const inputsUri = await this.proofStore.saveProofInput(id, type, inputs);
      job.inputsUri = inputsUri;

      // Send the job to the broker
      const jobStatus = await this.broker.enqueueProvingJob({ id, type, inputsUri, epochNumber });

      const jobLogText = `id=${id} type=${ProvingRequestType[type]} epochNumber=${epochNumber}`;
      const jobLogData = {
        provingJobId: id,
        provingJobType: ProvingRequestType[type],
        epochNumber,
        inputsUri: truncate(inputsUri),
        status: jobStatus.status,
        numOutstandingJobs: this.jobs.size,
      };

      // If we are here then the job was successfully accepted by the broker
      // the returned status is for before any action was performed
      if (jobStatus.status === 'fulfilled' || jobStatus.status === 'rejected') {
        // Job was already completed by the broker
        // No need to notify the broker on aborted job
        this.log.verbose(`Job already completed when sent to broker ${jobLogText}`, jobLogData);

        // Job was not enqueued. It must be completed already, add to our set of already completed jobs
        this.jobsToRetrieve.add(id);
      } else {
        // notify the broker if job is aborted
        signal?.addEventListener('abort', job.abortFn);

        // Job added for the first time
        if (jobStatus.status === 'not-found') {
          this.log.verbose(`Job enqueued with broker ${jobLogText}`, jobLogData);
        } else {
          // Job was previously sent to the broker but is not completed
          this.log.verbose(`Job already in queue or in progress when sent to broker ${jobLogText}`, jobLogData);
        }
      }
    } catch (err) {
      this.jobs.delete(job.id);
      job.deferred.reject(err);
    }

    return job.deferred.promise as Promise<ProvingJobResultsMap[T]>;
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

    // Reject any outstanding promises as stopped
    for (const [_, v] of this.jobs) {
      v.deferred.reject(new Error('Broker facade stopped'));
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

    const snapshotSyncIds: string[] = [];
    const currentTime = Date.now();
    const secondsSinceLastSnapshotSync = currentTime - this.timeOfLastSnapshotSync;
    if (secondsSinceLastSnapshotSync > SNAPSHOT_SYNC_INTERVAL_MS) {
      this.timeOfLastSnapshotSync = currentTime;
      snapshotSyncIds.push(...this.jobs.keys());
      this.log.trace(`Performing full snapshot sync of completed jobs with ${snapshotSyncIds.length} job(s)`);
    } else {
      this.log.trace(`Performing incremental sync of completed jobs`, { snapshotSyncIds });
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
        job.deferred.resolve(result.result);
      } else {
        this.log.error(
          `Resolving proving job with error id=${job.id} type=${ProvingRequestType[job.type]}`,
          result.reason,
        );
        if (result.reason !== 'Aborted') {
          void this.backupFailedProofInputs(job);
        }
        job.deferred.reject(new Error(result.reason));
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

  private async backupFailedProofInputs(job: ProvingJob) {
    try {
      if (!this.failedProofStore || !job.inputsUri) {
        return;
      }
      const inputs = await this.proofStore.getProofInput(job.inputsUri);
      const uri = await this.failedProofStore.saveProofInput(job.id, inputs.type, inputs.inputs);
      this.log.info(`Stored proof inputs for failed job id=${job.id} type=${ProvingRequestType[job.type]} at ${uri}`, {
        id: job.id,
        type: job.type,
        uri,
      });
    } catch (err) {
      this.log.error(
        `Error backing up proof inputs for failed job id=${job.id} type=${ProvingRequestType[job.type]}`,
        err,
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
    skipPublicInputsValidation?: boolean, // TODO(#14234)[Unconditional PIs validation]: remove this argument
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<ProofAndVerificationKey<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>> {
    this.log.info(`getAvmProof() called with skipPublicInputsValidation: ${skipPublicInputsValidation}`);

    return this.enqueueJob(
      this.generateId(ProvingRequestType.PUBLIC_VM, inputs, epochNumber),
      ProvingRequestType.PUBLIC_VM,
      inputs,
      epochNumber,
      signal,
    ).then(result => {
      // TODO(#14234)[Unconditional PIs validation]: Remove ".then()".
      // Override the default value of skipPublicInputsValidation potentially set in BBNativeRollupProver.getAvmProof().
      result.proof.proof[0] = skipPublicInputsValidation ? new Fr(1) : new Fr(0);
      return result;
    });
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
