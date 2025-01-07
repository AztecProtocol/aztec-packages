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
import { retryUntil } from '@aztec/foundation/retry';
import { truncate } from '@aztec/foundation/string';

import { InlineProofStore, type ProofStore } from './proof_store.js';

// 20 minutes, roughly the length of an Aztec epoch. If a proof isn't ready in this amount of time then we've failed to prove the whole epoch
const MAX_WAIT_MS = 1_200_000;

export class BrokerCircuitProverFacade implements ServerCircuitProver {
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
    await this.broker.enqueueProvingJob({
      id,
      type,
      inputsUri,
      epochNumber,
    });

    this.log.verbose(
      `Sent proving job to broker id=${id} type=${ProvingRequestType[type]} epochNumber=${epochNumber}`,
      {
        provingJobId: id,
        provingJobType: ProvingRequestType[type],
        epochNumber,
        inputsUri: truncate(inputsUri),
      },
    );

    // notify broker of cancelled job
    const abortFn = async () => {
      signal?.removeEventListener('abort', abortFn);
      await this.broker.cancelProvingJob(id);
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
    } finally {
      signal?.removeEventListener('abort', abortFn);
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

  getSingleTxBlockRootRollupProof(
    input: SingleTxBlockRootRollupInputs,
    signal?: AbortSignal,
    epochNumber?: number,
  ): Promise<
    PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs, typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>
  > {
    return this.enqueueAndWaitForJob(
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
    return this.enqueueAndWaitForJob(
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
