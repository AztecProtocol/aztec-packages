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
  type PrivateBaseRollupInputs,
  type PrivateKernelEmptyInputData,
  type PublicBaseRollupInputs,
  type RECURSIVE_PROOF_LENGTH,
  type RecursiveProof,
  type RootParityInput,
  type RootParityInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  type TUBE_PROOF_LENGTH,
  type TubeInputs,
  type VerificationKeyData,
} from '@aztec/circuits.js';

import { type CircuitName } from '../stats/index.js';

export type ProofAndVerificationKey<P> = {
  proof: P;
  verificationKey: VerificationKeyData;
};

export function makeProofAndVerificationKey<P>(
  proof: P,
  verificationKey: VerificationKeyData,
): ProofAndVerificationKey<P> {
  return { proof, verificationKey };
}

export type PublicInputsAndRecursiveProof<T, N extends number = typeof NESTED_RECURSIVE_PROOF_LENGTH> = {
  inputs: T;
  proof: RecursiveProof<N>;
  verificationKey: VerificationKeyData;
};

export function makePublicInputsAndRecursiveProof<T, N extends number = typeof NESTED_RECURSIVE_PROOF_LENGTH>(
  inputs: T,
  proof: RecursiveProof<N>,
  verificationKey: VerificationKeyData,
) {
  const result: PublicInputsAndRecursiveProof<T, N> = {
    inputs,
    proof,
    verificationKey,
  };
  return result;
}

export type ProvingJob<T extends ProvingRequest> = {
  id: string;
  request: T;
};

export enum ProvingRequestType {
  PRIVATE_KERNEL_EMPTY,
  PUBLIC_VM,

  PRIVATE_BASE_ROLLUP,
  PUBLIC_BASE_ROLLUP,
  MERGE_ROLLUP,
  EMPTY_BLOCK_ROOT_ROLLUP,
  BLOCK_ROOT_ROLLUP,
  BLOCK_MERGE_ROLLUP,
  ROOT_ROLLUP,

  BASE_PARITY,
  ROOT_PARITY,
  // Recursive Client IVC verification to connect private -> public or rollup
  TUBE_PROOF,
}

export function mapProvingRequestTypeToCircuitName(type: ProvingRequestType): CircuitName {
  switch (type) {
    case ProvingRequestType.PRIVATE_KERNEL_EMPTY:
      return 'private-kernel-empty';
    case ProvingRequestType.PUBLIC_VM:
      return 'avm-circuit';
    case ProvingRequestType.PRIVATE_BASE_ROLLUP:
      return 'private-base-rollup';
    case ProvingRequestType.PUBLIC_BASE_ROLLUP:
      return 'public-base-rollup';
    case ProvingRequestType.MERGE_ROLLUP:
      return 'merge-rollup';
    case ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP:
      return 'empty-block-root-rollup';
    case ProvingRequestType.BLOCK_ROOT_ROLLUP:
      return 'block-root-rollup';
    case ProvingRequestType.BLOCK_MERGE_ROLLUP:
      return 'block-merge-rollup';
    case ProvingRequestType.ROOT_ROLLUP:
      return 'root-rollup';
    case ProvingRequestType.BASE_PARITY:
      return 'base-parity';
    case ProvingRequestType.ROOT_PARITY:
      return 'root-parity';
    case ProvingRequestType.TUBE_PROOF:
      return 'tube-circuit';
    default:
      throw new Error(`Cannot find circuit name for proving request type: ${type}`);
  }
}

export type AvmProvingRequest = {
  type: ProvingRequestType.PUBLIC_VM;
  inputs: AvmCircuitInputs;
};

export type ProvingRequest =
  | AvmProvingRequest
  | {
      type: ProvingRequestType.BASE_PARITY;
      inputs: BaseParityInputs;
    }
  | {
      type: ProvingRequestType.ROOT_PARITY;
      inputs: RootParityInputs;
    }
  | {
      type: ProvingRequestType.PRIVATE_BASE_ROLLUP;
      inputs: PrivateBaseRollupInputs;
    }
  | {
      type: ProvingRequestType.PUBLIC_BASE_ROLLUP;
      inputs: PublicBaseRollupInputs;
    }
  | {
      type: ProvingRequestType.MERGE_ROLLUP;
      inputs: MergeRollupInputs;
    }
  | {
      type: ProvingRequestType.BLOCK_ROOT_ROLLUP;
      inputs: BlockRootRollupInputs;
    }
  | {
      type: ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP;
      inputs: EmptyBlockRootRollupInputs;
    }
  | {
      type: ProvingRequestType.BLOCK_MERGE_ROLLUP;
      inputs: BlockMergeRollupInputs;
    }
  | {
      type: ProvingRequestType.ROOT_ROLLUP;
      inputs: RootRollupInputs;
    }
  | {
      type: ProvingRequestType.PRIVATE_KERNEL_EMPTY;
      inputs: PrivateKernelEmptyInputData;
    }
  | {
      type: ProvingRequestType.TUBE_PROOF;
      inputs: TubeInputs;
    };

export type ProvingRequestResults = {
  [ProvingRequestType.PRIVATE_KERNEL_EMPTY]: PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>;
  [ProvingRequestType.PUBLIC_VM]: ProofAndVerificationKey<RecursiveProof<typeof AVM_PROOF_LENGTH_IN_FIELDS>>;
  [ProvingRequestType.PRIVATE_BASE_ROLLUP]: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>;
  [ProvingRequestType.PUBLIC_BASE_ROLLUP]: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>;
  [ProvingRequestType.MERGE_ROLLUP]: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>;
  [ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP]: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>;
  [ProvingRequestType.BLOCK_ROOT_ROLLUP]: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>;
  [ProvingRequestType.BLOCK_MERGE_ROLLUP]: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>;
  [ProvingRequestType.ROOT_ROLLUP]: PublicInputsAndRecursiveProof<RootRollupPublicInputs>;
  [ProvingRequestType.BASE_PARITY]: RootParityInput<typeof RECURSIVE_PROOF_LENGTH>;
  [ProvingRequestType.ROOT_PARITY]: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>;
  [ProvingRequestType.TUBE_PROOF]: ProofAndVerificationKey<RecursiveProof<typeof TUBE_PROOF_LENGTH>>;
};

export type ProvingRequestResult<T extends ProvingRequestType> = ProvingRequestResults[T];

export interface ProvingJobSource {
  /**
   * Gets the next proving job. `heartbeat` must be called periodically to keep the job alive.
   * @returns The proving job, or undefined if there are no jobs available.
   */
  getProvingJob(): Promise<ProvingJob<ProvingRequest> | undefined>;

  /**
   * Keeps the job alive. If this isn't called regularly then the job will be
   * considered abandoned and re-queued for another consumer to pick up
   * @param jobId The ID of the job to heartbeat.
   */
  heartbeat(jobId: string): Promise<void>;

  /**
   * Resolves a proving job.
   * @param jobId - The ID of the job to resolve.
   * @param result - The result of the proving job.
   */
  resolveProvingJob<T extends ProvingRequestType>(jobId: string, result: ProvingRequestResult<T>): Promise<void>;

  /**
   * Rejects a proving job.
   * @param jobId - The ID of the job to reject.
   * @param reason - The reason for rejecting the job.
   */
  rejectProvingJob(jobId: string, reason: Error): Promise<void>;
}
