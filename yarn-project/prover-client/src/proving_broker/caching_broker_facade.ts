import {
  type ProofAndVerificationKey,
  type ProverCache,
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
  type BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  type BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  type EmptyBlockRootRollupInputs,
  type KernelCircuitPublicInputs,
  type MergeRollupInputs,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  type ParityPublicInputs,
  type PrivateBaseRollupInputs,
  type PrivateKernelEmptyInputData,
  type PublicBaseRollupInputs,
  type RECURSIVE_PROOF_LENGTH,
  type RootParityInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  type TUBE_PROOF_LENGTH,
  type TubeInputs,
} from '@aztec/circuits.js';
import { sha256 } from '@aztec/foundation/crypto';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';

import { InlineProofStore, type ProofStore } from './proof_store.js';
import { InMemoryProverCache } from './prover_cache/memory.js';

// 20 minutes, roughly the length of an Aztec epoch. If a proof isn't ready in this amount of time then we've failed to prove the whole epoch
const MAX_WAIT_MS = 1_200_000;

/**
 * A facade around a job broker that generates stable job ids and caches results
 */
export class CachingBrokerFacade implements ServerCircuitProver {
  constructor(
    private broker: ProvingJobProducer,
    private cache: ProverCache = new InMemoryProverCache(),
    private proofStore: ProofStore = new InlineProofStore(),
    private waitTimeoutMs = MAX_WAIT_MS,
    private pollIntervalMs = 1000,
    private log = createLogger('prover-client:caching-prover-broker'),
  ) {}

  private async enqueueAndWaitForJob<T extends ProvingRequestType>(
    id: ProvingJobId,
    type: T,
    inputs: ProvingJobInputsMap[T],
    signal?: AbortSignal,
  ): Promise<ProvingJobResultsMap[T]> {
    // first try the cache
    let jobEnqueued = false;
    try {
      const cachedResult = await this.cache.getProvingJobStatus(id);
      if (cachedResult.status !== 'not-found') {
        this.log.debug(`Found cached result for job=${id}: status=${cachedResult.status}`);
      }

      if (cachedResult.status === 'fulfilled') {
        const output = await this.proofStore.getProofOutput(cachedResult.value);
        if (output.type === type) {
          return output.result as ProvingJobResultsMap[T];
        } else {
          this.log.warn(`Cached result type mismatch for job=${id}. Expected=${type} but got=${output.type}`);
        }
      } else if (cachedResult.status === 'rejected') {
        // prefer returning a rejected promises so that we don't trigger the catch block below
        return Promise.reject(new Error(cachedResult.reason));
      } else if (cachedResult.status === 'in-progress' || cachedResult.status === 'in-queue') {
        jobEnqueued = true;
      } else {
        jobEnqueued = false;
      }
    } catch (err) {
      this.log.warn(`Failed to get cached proving job id=${id}: ${err}. Re-running job`);
    }

    if (!jobEnqueued) {
      try {
        const inputsUri = await this.proofStore.saveProofInput(id, type, inputs);
        await this.broker.enqueueProvingJob({
          id,
          type,
          inputsUri,
        });
        await this.cache.setProvingJobStatus(id, { status: 'in-queue' });
      } catch (err) {
        this.log.error(`Failed to enqueue proving job id=${id}: ${err}`);
        await this.cache.setProvingJobStatus(id, { status: 'not-found' });
        throw err;
      }
    }

    // notify broker of cancelled job
    const abortFn = async () => {
      signal?.removeEventListener('abort', abortFn);
      await this.broker.removeAndCancelProvingJob(id);
    };

    signal?.addEventListener('abort', abortFn);

    try {
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

      try {
        await this.cache.setProvingJobStatus(id, result);
      } catch (err) {
        this.log.warn(`Failed to cache proving job id=${id} resultStatus=${result.status}: ${err}`);
      }

      if (result.status === 'fulfilled') {
        const output = await this.proofStore.getProofOutput(result.value);
        if (output.type === type) {
          return output.result as ProvingJobResultsMap[T];
        } else {
          return Promise.reject(new Error(`Unexpected proof type: ${output.type}. Expected: ${type}`));
        }
      } else {
        return Promise.reject(new Error(result.reason));
      }
    } finally {
      signal?.removeEventListener('abort', abortFn);
    }
  }

  getAvmProof(
    inputs: AvmCircuitInputs,
    signal?: AbortSignal,
    _blockNumber?: number,
  ): Promise<ProofAndVerificationKey<typeof AVM_PROOF_LENGTH_IN_FIELDS>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.PUBLIC_VM, inputs),
      ProvingRequestType.PUBLIC_VM,
      inputs,
      signal,
    );
  }

  getBaseParityProof(
    inputs: BaseParityInputs,
    signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.BASE_PARITY, inputs),
      ProvingRequestType.BASE_PARITY,
      inputs,
      signal,
    );
  }

  getBlockMergeRollupProof(
    input: BlockMergeRollupInputs,
    signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.BLOCK_MERGE_ROLLUP, input),
      ProvingRequestType.BLOCK_MERGE_ROLLUP,
      input,
      signal,
    );
  }

  getBlockRootRollupProof(
    input: BlockRootRollupInputs,
    signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.BLOCK_ROOT_ROLLUP, input),
      ProvingRequestType.BLOCK_ROOT_ROLLUP,
      input,
      signal,
    );
  }

  getEmptyBlockRootRollupProof(
    input: EmptyBlockRootRollupInputs,
    signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP, input),
      ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP,
      input,
      signal,
    );
  }

  getEmptyPrivateKernelProof(
    inputs: PrivateKernelEmptyInputData,
    signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<KernelCircuitPublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.PRIVATE_KERNEL_EMPTY, inputs),
      ProvingRequestType.PRIVATE_KERNEL_EMPTY,
      inputs,
      signal,
    );
  }

  getMergeRollupProof(
    input: MergeRollupInputs,
    signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.MERGE_ROLLUP, input),
      ProvingRequestType.MERGE_ROLLUP,
      input,
      signal,
    );
  }
  getPrivateBaseRollupProof(
    baseRollupInput: PrivateBaseRollupInputs,
    signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.PRIVATE_BASE_ROLLUP, baseRollupInput),
      ProvingRequestType.PRIVATE_BASE_ROLLUP,
      baseRollupInput,
      signal,
    );
  }

  getPublicBaseRollupProof(
    inputs: PublicBaseRollupInputs,
    signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.PUBLIC_BASE_ROLLUP, inputs),
      ProvingRequestType.PUBLIC_BASE_ROLLUP,
      inputs,
      signal,
    );
  }

  getRootParityProof(
    inputs: RootParityInputs,
    signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<ParityPublicInputs, typeof NESTED_RECURSIVE_PROOF_LENGTH>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.ROOT_PARITY, inputs),
      ProvingRequestType.ROOT_PARITY,
      inputs,
      signal,
    );
  }

  getRootRollupProof(
    input: RootRollupInputs,
    signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<PublicInputsAndRecursiveProof<RootRollupPublicInputs, typeof RECURSIVE_PROOF_LENGTH>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.ROOT_ROLLUP, input),
      ProvingRequestType.ROOT_ROLLUP,
      input,
      signal,
    );
  }

  getTubeProof(
    tubeInput: TubeInputs,
    signal?: AbortSignal,
    _epochNumber?: number,
  ): Promise<ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>> {
    return this.enqueueAndWaitForJob(
      this.generateId(ProvingRequestType.TUBE_PROOF, tubeInput),
      ProvingRequestType.TUBE_PROOF,
      tubeInput,
      signal,
    );
  }

  private generateId(type: ProvingRequestType, inputs: { toBuffer(): Buffer }) {
    const inputsHash = sha256(inputs.toBuffer());
    return `${ProvingRequestType[type]}:${inputsHash.toString('hex')}`;
  }
}
