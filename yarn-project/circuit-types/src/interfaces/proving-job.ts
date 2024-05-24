import {
  type BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  type BaseRollupInputs,
  type KernelCircuitPublicInputs,
  type MergeRollupInputs,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  type PublicKernelCircuitPublicInputs,
  type RECURSIVE_PROOF_LENGTH,
  type RecursiveProof,
  type RootParityInput,
  type RootParityInputs,
  type RootRollupInputs,
  type RootRollupPublicInputs,
  type VerificationKeyData,
} from '@aztec/circuits.js';

import type { PublicKernelNonTailRequest, PublicKernelTailRequest } from '../tx/processed_tx.js';

export type PublicInputsAndProof<T> = {
  inputs: T;
  proof: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>;
  verificationKey: VerificationKeyData;
};

export function makePublicInputsAndProof<T>(
  inputs: T,
  proof: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
  verificationKey: VerificationKeyData,
) {
  const result: PublicInputsAndProof<T> = {
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
  PUBLIC_VM,

  PUBLIC_KERNEL_NON_TAIL,
  PUBLIC_KERNEL_TAIL,

  BASE_ROLLUP,
  MERGE_ROLLUP,
  ROOT_ROLLUP,

  BASE_PARITY,
  ROOT_PARITY,
}

export type ProvingRequest =
  | {
      type: ProvingRequestType.PUBLIC_VM;
      // prefer object over unknown so that we can run "in" checks, e.g. `'toBuffer' in request.inputs`
      inputs: object;
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
      type: ProvingRequestType.ROOT_ROLLUP;
      inputs: RootRollupInputs;
    };

export type ProvingRequestPublicInputs = {
  [ProvingRequestType.PUBLIC_VM]: PublicInputsAndProof<object>;

  [ProvingRequestType.PUBLIC_KERNEL_NON_TAIL]: PublicInputsAndProof<PublicKernelCircuitPublicInputs>;
  [ProvingRequestType.PUBLIC_KERNEL_TAIL]: PublicInputsAndProof<KernelCircuitPublicInputs>;

  [ProvingRequestType.BASE_ROLLUP]: PublicInputsAndProof<BaseOrMergeRollupPublicInputs>;
  [ProvingRequestType.MERGE_ROLLUP]: PublicInputsAndProof<BaseOrMergeRollupPublicInputs>;
  [ProvingRequestType.ROOT_ROLLUP]: PublicInputsAndProof<RootRollupPublicInputs>;

  [ProvingRequestType.BASE_PARITY]: RootParityInput<typeof RECURSIVE_PROOF_LENGTH>;
  [ProvingRequestType.ROOT_PARITY]: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>;
};

export type ProvingRequestResult<T extends ProvingRequestType> = ProvingRequestPublicInputs[T];

export interface ProvingJobSource {
  getProvingJob(): Promise<ProvingJob<ProvingRequest> | undefined>;

  resolveProvingJob<T extends ProvingRequestType>(jobId: string, result: ProvingRequestResult<T>): Promise<void>;

  rejectProvingJob(jobId: string, reason: Error): Promise<void>;
}
