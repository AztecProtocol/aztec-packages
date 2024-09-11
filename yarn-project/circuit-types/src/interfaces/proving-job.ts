import {
  type AvmCircuitInputs,
  type AvmVerificationKeyData,
  type BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  type BaseRollupInputs,
  type BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  type KernelCircuitPublicInputs,
  type MergeRollupInputs,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  type ParityPublicInputs,
  type PrivateKernelEmptyInputData,
  type Proof,
  type PublicKernelCircuitPublicInputs,
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

import type { PublicKernelNonTailRequest, PublicKernelTailRequest } from '../tx/processed_tx.js';

type PublicInputs<T> = { inputs: T };

export type AvmProofAndVerificationKey = {
  proof: Proof;
  verificationKey: AvmVerificationKeyData;
};

export type PublicInputsAndRecursiveProof<T> = PublicInputs<T> & NestedRecursiveProofAndVK;

export type PublicInputsAndTubeProof<T> = PublicInputs<T> & TubeProofAndVK;

export type NestedRecursiveProofAndVK = {
  proof: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>;
  verificationKey: VerificationKeyData;
};

export type TubeProofAndVK = {
  verificationKey: VerificationKeyData;
  proof: RecursiveProof<typeof TUBE_PROOF_LENGTH>;
};

export function makePublicInputsAndRecursiveProof<T>(
  inputs: T,
  proof: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
  verificationKey: VerificationKeyData,
) {
  const result: PublicInputsAndRecursiveProof<T> = {
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

  PUBLIC_KERNEL_NON_TAIL,
  PUBLIC_KERNEL_TAIL,

  BASE_ROLLUP,
  MERGE_ROLLUP,
  BLOCK_ROOT_ROLLUP,
  BLOCK_MERGE_ROLLUP,
  ROOT_ROLLUP,

  BASE_PARITY,
  ROOT_PARITY,

  /** Recursive Client IVC verification to connect private to public or rollup */
  TUBE_PROOF,
}

export type ProvingRequest =
  | {
      type: ProvingRequestType.PUBLIC_VM;
      inputs: AvmCircuitInputs;
    }
  | {
      type: ProvingRequestType.PUBLIC_KERNEL_NON_TAIL;
      kernelType: PublicKernelNonTailRequest['type'];
      inputs: PublicKernelNonTailRequest['inputs'];
    }
  | {
      type: ProvingRequestType.PUBLIC_KERNEL_TAIL;
      kernelType: PublicKernelTailRequest['type'];
      inputs: PublicKernelTailRequest['inputs'];
    }
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

export type SimulationRequestPublicInputs = {
  [ProvingRequestType.PRIVATE_KERNEL_EMPTY]: KernelCircuitPublicInputs;
  [ProvingRequestType.PUBLIC_VM]: null;

  [ProvingRequestType.PUBLIC_KERNEL_NON_TAIL]: PublicKernelCircuitPublicInputs;
  [ProvingRequestType.PUBLIC_KERNEL_TAIL]: KernelCircuitPublicInputs;

  [ProvingRequestType.BASE_ROLLUP]: BaseOrMergeRollupPublicInputs;
  [ProvingRequestType.MERGE_ROLLUP]: BaseOrMergeRollupPublicInputs;
  [ProvingRequestType.BLOCK_ROOT_ROLLUP]: BlockRootOrBlockMergePublicInputs;
  [ProvingRequestType.BLOCK_MERGE_ROLLUP]: BlockRootOrBlockMergePublicInputs;
  [ProvingRequestType.ROOT_ROLLUP]: RootRollupPublicInputs;

  [ProvingRequestType.BASE_PARITY]: ParityPublicInputs;
  [ProvingRequestType.ROOT_PARITY]: ParityPublicInputs;

  [ProvingRequestType.TUBE_PROOF]: null;
};

export type ProvingRequestPublicInputs = {
  [ProvingRequestType.PRIVATE_KERNEL_EMPTY]: PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>;
  [ProvingRequestType.PUBLIC_VM]: AvmProofAndVerificationKey;

  [ProvingRequestType.PUBLIC_KERNEL_NON_TAIL]: PublicInputsAndRecursiveProof<PublicKernelCircuitPublicInputs>;
  [ProvingRequestType.PUBLIC_KERNEL_TAIL]: PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>;

  [ProvingRequestType.BASE_ROLLUP]: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>;
  [ProvingRequestType.MERGE_ROLLUP]: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>;
  [ProvingRequestType.BLOCK_ROOT_ROLLUP]: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>;
  [ProvingRequestType.BLOCK_MERGE_ROLLUP]: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>;
  [ProvingRequestType.ROOT_ROLLUP]: PublicInputsAndRecursiveProof<RootRollupPublicInputs>;

  [ProvingRequestType.BASE_PARITY]: RootParityInput<typeof RECURSIVE_PROOF_LENGTH>;
  [ProvingRequestType.ROOT_PARITY]: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>;

  [ProvingRequestType.TUBE_PROOF]: TubeProofAndVK;
};

export type SimulationRequestResult<T extends ProvingRequestType> = SimulationRequestPublicInputs[T];

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
