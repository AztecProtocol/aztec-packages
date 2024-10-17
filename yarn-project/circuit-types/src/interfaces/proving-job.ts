import {
  type AvmCircuitInputs,
  type BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  type BaseRollupInputs,
  type BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  type EmptyBlockRootRollupInputs,
  type KernelCircuitPublicInputs,
  type MergeRollupInputs,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  type PrivateKernelEmptyInputData,
  type Proof,
  type PublicKernelCircuitPrivateInputs,
  type PublicKernelCircuitPublicInputs,
  type PublicKernelInnerCircuitPrivateInputs,
  type PublicKernelTailCircuitPrivateInputs,
  type RECURSIVE_PROOF_LENGTH,
  type RecursiveProof,
  type RootParityInput,
  type RootParityInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  type TUBE_PROOF_LENGTH,
  type TubeInputs,
  type VMCircuitPublicInputs,
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

  PUBLIC_KERNEL_INNER,
  PUBLIC_KERNEL_MERGE,
  PUBLIC_KERNEL_TAIL,

  BASE_ROLLUP,
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
    case ProvingRequestType.PUBLIC_KERNEL_INNER:
      return 'public-kernel-inner';
    case ProvingRequestType.PUBLIC_KERNEL_MERGE:
      return 'public-kernel-merge';
    case ProvingRequestType.PUBLIC_KERNEL_TAIL:
      return 'public-kernel-tail';
    case ProvingRequestType.BASE_ROLLUP:
      return 'base-rollup';
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

export type PublicKernelInnerRequest = {
  type: ProvingRequestType.PUBLIC_KERNEL_INNER;
  inputs: PublicKernelInnerCircuitPrivateInputs;
};

export type PublicKernelMergeRequest = {
  type: ProvingRequestType.PUBLIC_KERNEL_MERGE;
  inputs: PublicKernelCircuitPrivateInputs;
};

export type PublicKernelTailRequest = {
  type: ProvingRequestType.PUBLIC_KERNEL_TAIL;
  inputs: PublicKernelTailCircuitPrivateInputs;
};

export type ProvingRequest =
  | {
      type: ProvingRequestType.PUBLIC_VM;
      inputs: AvmCircuitInputs;
    }
  | PublicKernelInnerRequest
  | PublicKernelMergeRequest
  | PublicKernelTailRequest
  | {
      type: ProvingRequestType.BASE_PARITY;
      inputs: BaseParityInputs;
    }
  | {
      type: ProvingRequestType.ROOT_PARITY;
      inputs: RootParityInputs;
    }
  | {
      type: ProvingRequestType.BASE_ROLLUP;
      inputs: BaseRollupInputs;
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

export type ProvingRequestPublicInputs = {
  [ProvingRequestType.PRIVATE_KERNEL_EMPTY]: PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>;
  [ProvingRequestType.PUBLIC_VM]: ProofAndVerificationKey<Proof>;

  [ProvingRequestType.PUBLIC_KERNEL_INNER]: PublicInputsAndRecursiveProof<VMCircuitPublicInputs>;
  [ProvingRequestType.PUBLIC_KERNEL_MERGE]: PublicInputsAndRecursiveProof<PublicKernelCircuitPublicInputs>;
  [ProvingRequestType.PUBLIC_KERNEL_TAIL]: PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>;

  [ProvingRequestType.BASE_ROLLUP]: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>;
  [ProvingRequestType.MERGE_ROLLUP]: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>;
  [ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP]: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>;
  [ProvingRequestType.BLOCK_ROOT_ROLLUP]: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>;
  [ProvingRequestType.BLOCK_MERGE_ROLLUP]: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>;
  [ProvingRequestType.ROOT_ROLLUP]: PublicInputsAndRecursiveProof<RootRollupPublicInputs>;

  [ProvingRequestType.BASE_PARITY]: RootParityInput<typeof RECURSIVE_PROOF_LENGTH>;
  [ProvingRequestType.ROOT_PARITY]: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>;
  [ProvingRequestType.TUBE_PROOF]: ProofAndVerificationKey<RecursiveProof<typeof TUBE_PROOF_LENGTH>>;
};

export type ProvingRequestResult<T extends ProvingRequestType> = ProvingRequestPublicInputs[T];

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
