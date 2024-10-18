import { type ProofAndVerificationKey, type PublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import type {
  AvmCircuitInputs,
  BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  BaseRollupInputs,
  BlockMergeRollupInputs,
  BlockRootOrBlockMergePublicInputs,
  BlockRootRollupInputs,
  KernelCircuitPublicInputs,
  MergeRollupInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  PrivateKernelEmptyInputs,
  Proof,
  PublicKernelCircuitPrivateInputs,
  PublicKernelCircuitPublicInputs,
  PublicKernelTailCircuitPrivateInputs,
  RECURSIVE_PROOF_LENGTH,
  RecursiveProof,
  RootParityInput,
  RootParityInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
  TUBE_PROOF_LENGTH,
  TubeInputs,
} from '@aztec/circuits.js';

export enum ProofType {
  AvmProof = 'AvmProof',

  TubeProof = 'TubeProof',
  EmptyTubeProof = 'EmptyTubeProof',

  PublicKernelSetupProof = 'PublicKernelSetupProof',
  PublicKernelAppLogicProof = 'PublicKernelAppLogicProof',
  PublicKernelTeardownProof = 'PublicKernelTeardownProof',
  PublicKernelTailProof = 'PublicKernelTailProof',

  BaseRollupProof = 'BaseRollupProof',
  MergeRollupProof = 'MergeRollupProof',
  RootRollupProof = 'RootRollupProof',

  BlockMergeRollupProof = 'BlockMergeRollupProof',
  BlockRootRollupProof = 'BlockRootRollupProof',

  BaseParityProof = 'BaseParityProof',
  RootParityProof = 'RootParityProof',
}

export type ProofInputs = {
  AvmProof: AvmCircuitInputs;

  TubeProof: TubeInputs;
  EmptyTubeProof: PrivateKernelEmptyInputs;

  PublicKernelSetupProof: PublicKernelCircuitPrivateInputs;
  PublicKernelAppLogicProof: PublicKernelCircuitPrivateInputs;
  PublicKernelTeardownProof: PublicKernelCircuitPrivateInputs;
  PublicKernelTailProof: PublicKernelTailCircuitPrivateInputs;

  BaseRollupProof: BaseRollupInputs;
  MergeRollupProof: MergeRollupInputs;
  RootRollupProof: RootRollupInputs;

  BlockRootRollupProof: BlockRootRollupInputs;
  BlockMergeRollupProof: BlockMergeRollupInputs;

  BaseParityProof: BaseParityInputs;
  RootParityProof: RootParityInputs;
};

export type ProofOutputs = {
  AvmProof: ProofAndVerificationKey<Proof>;

  TubeProof: ProofAndVerificationKey<RecursiveProof<typeof TUBE_PROOF_LENGTH>>;
  EmptyTubeProof: PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>;

  PublicKernelSetupProof: PublicInputsAndRecursiveProof<PublicKernelCircuitPublicInputs>;
  PublicKernelAppLogicProof: PublicInputsAndRecursiveProof<PublicKernelCircuitPublicInputs>;
  PublicKernelTeardownProof: PublicInputsAndRecursiveProof<PublicKernelCircuitPublicInputs>;
  PublicKernelTailProof: PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>;

  BaseRollupProof: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>;
  MergeRollupProof: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>;
  RootRollupProof: PublicInputsAndRecursiveProof<RootRollupPublicInputs>;

  BlockMergeRollupProof: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>;
  BlockRootRollupProof: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>;

  BaseParityProof: RootParityInput<typeof RECURSIVE_PROOF_LENGTH>;
  RootParityProof: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>;
};

export type ProofRequestId = string & { readonly __brand: unique symbol };

export function makeProofRequestId(): ProofRequestId {
  return Math.random().toString(36).slice(2) as ProofRequestId;
}

export interface ProofRequest<T extends ProofType> {
  readonly id: ProofRequestId;
  readonly blockNumber: number;
  readonly proofType: T;
  readonly inputs: ProofInputs[T];
}

export type ProofResult<T extends ProofType> =
  | {
      readonly id: ProofRequestId;
      readonly proofType: T;
      readonly value: ProofOutputs[T];
    }
  | {
      readonly id: ProofRequestId;
      readonly proofType: T;
      readonly error: Error;
    };

export type ProofRequestStatus<T extends ProofType> =
  | {
      status: 'in-queue';
    }
  | {
      status: 'in-progress';
    }
  | {
      status: 'not-found';
    }
  | {
      status: 'resolved';
      value: ProofOutputs[T];
    }
  | {
      status: 'rejected';
      error: Error;
    };
