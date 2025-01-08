import {
  type ProofAndVerificationKey,
  type ProvingJob,
  type ProvingJobInputsMap,
  type ProvingJobSource,
  type ProvingRequestResultFor,
  ProvingRequestType,
  type PublicInputsAndRecursiveProof,
  type ServerCircuitProver,
} from '@aztec/circuit-types';
import type {
  AVM_PROOF_LENGTH_IN_FIELDS,
  AvmCircuitInputs,
  BaseParityInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  ParityPublicInputs,
  PrivateKernelEmptyInputData,
  PrivateToRollupKernelCircuitPublicInputs,
  RECURSIVE_PROOF_LENGTH,
  RootParityInputs,
  TUBE_PROOF_LENGTH,
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
import { randomBytes } from '@aztec/foundation/crypto';
import { AbortError, TimeoutError } from '@aztec/foundation/error';
import { createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, RunningPromise, promiseWithResolvers } from '@aztec/foundation/promise';
import { PriorityMemoryQueue } from '@aztec/foundation/queue';
import { type TelemetryClient, type Tracer, trackSpan } from '@aztec/telemetry-client';

import { InlineProofStore, type ProofStore } from '../proving_broker/proof_store.js';
import { ProvingQueueMetrics } from './queue_metrics.js';

type ProvingJobWithResolvers<T extends ProvingRequestType = ProvingRequestType> = ProvingJob &
  PromiseWithResolvers<ProvingRequestResultFor<T>> & {
    signal?: AbortSignal;
    epochNumber?: number;
    attempts: number;
    heartbeat: number;
  };

const MAX_RETRIES = 3;

const defaultIdGenerator = () => randomBytes(4).toString('hex');
const defaultTimeSource = () => Date.now();
/**
 * A helper class that sits in between services that need proofs created and agents that can create them.
 * The queue accumulates jobs and provides them to agents prioritized by block number.
 */
export class MemoryProvingQueue implements ServerCircuitProver, ProvingJobSource {
  private log = createLogger('prover-client:prover-pool:queue');
  private queue = new PriorityMemoryQueue<ProvingJobWithResolvers>(
    (a, b) => (a.epochNumber ?? 0) - (b.epochNumber ?? 0),
  );
  private jobsInProgress = new Map<string, ProvingJobWithResolvers>();
  private runningPromise: RunningPromise;
  private metrics: ProvingQueueMetrics;

  public readonly tracer: Tracer;

  constructor(
    client: TelemetryClient,
    /** Timeout the job if an agent doesn't report back in this time */
    private jobTimeoutMs = 60 * 1000,
    /** How often to check for timed out jobs */
    pollingIntervalMs = 1000,
    private generateId = defaultIdGenerator,
    private timeSource = defaultTimeSource,
    private proofStore: ProofStore = new InlineProofStore(),
  ) {
    this.tracer = client.getTracer('MemoryProvingQueue');
    this.metrics = new ProvingQueueMetrics(client, 'MemoryProvingQueue');
    this.runningPromise = new RunningPromise(this.poll.bind(this), this.log, pollingIntervalMs);
  }

  public start() {
    if (this.runningPromise.isRunning()) {
      this.log.warn('Proving queue is already running');
      return;
    }

    this.runningPromise.start();
    this.log.info('Proving queue started');
  }

  public async stop() {
    if (!this.runningPromise.isRunning()) {
      this.log.warn('Proving queue is already stopped');
      return;
    }

    await this.runningPromise.stop();
    this.log.info('Proving queue stopped');
  }

  public async getProvingJob({ timeoutSec = 1 } = {}): Promise<ProvingJob | undefined> {
    if (!this.runningPromise.isRunning()) {
      throw new Error('Proving queue is not running. Start the queue before getting jobs.');
    }

    try {
      const job = await this.queue.get(timeoutSec);
      if (!job) {
        return undefined;
      }

      if (job.signal?.aborted) {
        return undefined;
      }

      job.heartbeat = this.timeSource();
      this.jobsInProgress.set(job.id, job);
      return {
        id: job.id,
        type: job.type,
        inputsUri: job.inputsUri,
        epochNumber: job.epochNumber,
      };
    } catch (err) {
      if (err instanceof TimeoutError) {
        return undefined;
      }

      throw err;
    }
  }

  resolveProvingJob<T extends ProvingRequestType>(jobId: string, result: ProvingRequestResultFor<T>): Promise<void> {
    if (!this.runningPromise.isRunning()) {
      throw new Error('Proving queue is not running.');
    }

    const job = this.jobsInProgress.get(jobId);
    if (!job) {
      this.log.warn(`Job id=${jobId} not found. Can't resolve`);
      return Promise.resolve();
    }

    this.jobsInProgress.delete(jobId);
    if (!job.signal?.aborted) {
      job.resolve(result);
    }

    return Promise.resolve();
  }

  rejectProvingJob(jobId: string, reason: string): Promise<void> {
    if (!this.runningPromise.isRunning()) {
      throw new Error('Proving queue is not running.');
    }

    const job = this.jobsInProgress.get(jobId);
    if (!job) {
      this.log.warn(`Job id=${jobId} not found. Can't reject`);
      return Promise.resolve();
    }

    this.jobsInProgress.delete(jobId);

    if (job.signal?.aborted) {
      return Promise.resolve();
    }

    // every job should be retried with the exception of the public VM since its in development and can fail
    if (job.attempts < MAX_RETRIES && job.type !== ProvingRequestType.PUBLIC_VM) {
      job.attempts++;
      this.log.warn(
        `Job id=${job.id} type=${ProvingRequestType[job.type]} failed with error: ${reason}. Retry ${
          job.attempts
        }/${MAX_RETRIES}`,
      );
      this.queue.put(job);
    } else {
      const logFn =
        job.type === ProvingRequestType.PUBLIC_VM && !process.env.AVM_PROVING_STRICT ? this.log.warn : this.log.error;
      logFn(`Job id=${job.id} type=${ProvingRequestType[job.type]} failed with error: ${reason}`);
      job.reject(new Error(reason));
    }
    return Promise.resolve();
  }

  public heartbeat(jobId: string): Promise<void> {
    if (!this.runningPromise.isRunning()) {
      throw new Error('Proving queue is not running.');
    }

    const job = this.jobsInProgress.get(jobId);
    if (job) {
      job.heartbeat = this.timeSource();
    }

    return Promise.resolve();
  }

  public isJobRunning(jobId: string): boolean {
    return this.jobsInProgress.has(jobId);
  }

  @trackSpan('MemoryProvingQueue.poll')
  private poll() {
    const now = this.timeSource();
    this.metrics.recordQueueSize(this.queue.length());

    for (const job of this.jobsInProgress.values()) {
      if (job.signal?.aborted) {
        this.jobsInProgress.delete(job.id);
        continue;
      }

      if (job.heartbeat + this.jobTimeoutMs < now) {
        this.log.warn(`Job ${job.id} type=${ProvingRequestType[job.type]} has timed out`);

        this.jobsInProgress.delete(job.id);
        job.heartbeat = 0;
        this.queue.put(job);
      }
    }
  }

  private async enqueue<T extends ProvingRequestType>(
    type: T,
    inputs: ProvingJobInputsMap[T],
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<ProvingRequestResultFor<T>['result']> {
    if (!this.runningPromise.isRunning()) {
      return Promise.reject(new Error('Proving queue is not running.'));
    }

    const { promise, resolve, reject } = promiseWithResolvers<ProvingRequestResultFor<T>>();
    const id = this.generateId();
    const inputsUri = await this.proofStore.saveProofInput(id, type, inputs);
    const item: ProvingJobWithResolvers<T> = {
      id,
      type,
      inputsUri,
      signal,
      promise,
      resolve,
      reject,
      attempts: 1,
      heartbeat: 0,
      epochNumber: epochNumber ?? 0,
    };

    if (signal) {
      signal.addEventListener('abort', () => reject(new AbortError('Operation has been aborted')));
    }

    this.log.debug(
      `Adding id=${item.id} type=${ProvingRequestType[type]} proving job to queue depth=${this.queue.length()}`,
    );

    if (!this.queue.put(item as ProvingJobWithResolvers<any>)) {
      throw new Error();
    }

    return promise.then(({ result }) => result);
  }

  getEmptyPrivateKernelProof(
    inputs: PrivateKernelEmptyInputData,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<
      PrivateToRollupKernelCircuitPublicInputs,
      typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
    >
  > {
    return this.enqueue(ProvingRequestType.PRIVATE_KERNEL_EMPTY, inputs, signal, epochNumber);
  }

  getTubeProof(
    inputs: TubeInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>> {
    return this.enqueue(ProvingRequestType.TUBE_PROOF, inputs, signal, epochNumber);
  }

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getBaseParityProof(
    inputs: BaseParityInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return this.enqueue(ProvingRequestType.BASE_PARITY, inputs, signal, epochNumber);
  }

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getRootParityProof(
    inputs: RootParityInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>> {
    return this.enqueue(ProvingRequestType.ROOT_PARITY, inputs, signal, epochNumber);
  }

  getPrivateBaseRollupProof(
    inputs: PrivateBaseRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueue(ProvingRequestType.PRIVATE_BASE_ROLLUP, inputs, signal, epochNumber);
  }

  getPublicBaseRollupProof(
    inputs: PublicBaseRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueue(ProvingRequestType.PUBLIC_BASE_ROLLUP, inputs, signal, epochNumber);
  }

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getMergeRollupProof(
    inputs: MergeRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueue(ProvingRequestType.MERGE_ROLLUP, inputs, signal, epochNumber);
  }

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getBlockRootRollupProof(
    inputs: BlockRootRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueue(ProvingRequestType.BLOCK_ROOT_ROLLUP, inputs, signal, epochNumber);
  }

  getEmptyBlockRootRollupProof(
    inputs: EmptyBlockRootRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueue(ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP, inputs, signal, epochNumber);
  }

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getBlockMergeRollupProof(
    inputs: BlockMergeRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueue(ProvingRequestType.BLOCK_MERGE_ROLLUP, inputs, signal, epochNumber);
  }

  /**
   * Creates a proof for the given input.
   * @param input - Input to the circuit.
   */
  getRootRollupProof(
    inputs: RootRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs>> {
    return this.enqueue(ProvingRequestType.ROOT_ROLLUP, inputs, signal, epochNumber);
  }

  /**
   * Creates an AVM proof.
   */
  getAvmProof(
    inputs: AvmCircuitInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<ProofAndVerificationKey<typeof AVM_PROOF_LENGTH_IN_FIELDS>> {
    return this.enqueue(ProvingRequestType.PUBLIC_VM, inputs, signal, epochNumber);
  }

  /**
   * Verifies a circuit proof
   */
  verifyProof(): Promise<void> {
    return Promise.reject('not implemented');
  }
}
