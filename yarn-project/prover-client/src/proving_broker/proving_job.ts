import { type ProofAndVerificationKey, type PublicInputsAndRecursiveProof } from '@aztec/circuit-types';
import {
  AvmCircuitInputs,
  type BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  BaseRollupInputs,
  BlockMergeRollupInputs,
  type BlockRootOrBlockMergePublicInputs,
  BlockRootRollupInputs,
  type KernelCircuitPublicInputs,
  MergeRollupInputs,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  PrivateKernelEmptyInputs,
  type Proof,
  PublicKernelCircuitPrivateInputs,
  type PublicKernelCircuitPublicInputs,
  PublicKernelTailCircuitPrivateInputs,
  type RECURSIVE_PROOF_LENGTH,
  type RecursiveProof,
  type RootParityInput,
  RootParityInputs,
  RootRollupInputs,
  type RootRollupPublicInputs,
  type TUBE_PROOF_LENGTH,
  TubeInputs,
} from '@aztec/circuits.js';

import { randomBytes } from 'crypto';

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

/**
 * A mapping from proof type to the inputs needed to produce the proof.
 * This object is useful for serializing/deserializing
 */
export const ProofInputs = {
  [ProofType.AvmProof]: AvmCircuitInputs,

  [ProofType.TubeProof]: TubeInputs,
  [ProofType.EmptyTubeProof]: PrivateKernelEmptyInputs,

  [ProofType.PublicKernelSetupProof]: PublicKernelCircuitPrivateInputs,
  [ProofType.PublicKernelAppLogicProof]: PublicKernelCircuitPrivateInputs,
  [ProofType.PublicKernelTeardownProof]: PublicKernelCircuitPrivateInputs,
  [ProofType.PublicKernelTailProof]: PublicKernelTailCircuitPrivateInputs,

  [ProofType.BaseRollupProof]: BaseRollupInputs,
  [ProofType.MergeRollupProof]: MergeRollupInputs,
  [ProofType.RootRollupProof]: RootRollupInputs,

  [ProofType.BlockMergeRollupProof]: BlockMergeRollupInputs,
  [ProofType.BlockRootRollupProof]: BlockRootRollupInputs,

  [ProofType.BaseParityProof]: BaseParityInputs,
  [ProofType.RootParityProof]: RootParityInputs,
};

export type ProofInputs = {
  [K in keyof typeof ProofInputs]: InstanceType<(typeof ProofInputs)[K]>;
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

export type ProvingJobId<T extends ProofType = ProofType> = `${T}:${string}` & {
  readonly __brand: unique symbol;
};

export function makeProvingJobId<T extends ProofType>(proofType: T): ProvingJobId<T> {
  const id = randomBytes(8).toString('hex');
  return `${proofType}:${id}` as ProvingJobId<T>;
}

export function getProofTypeFromId<T extends ProofType>(id: ProvingJobId<T>): T {
  const proofType = id.split(':')[0];

  // TS enums also contain a reverse mapping from value to key
  if (proofType in ProofType) {
    return proofType as T;
  }

  throw new Error(`Invalid proof type: ${proofType}`);
}

export interface ProvingJob<T extends ProofType = ProofType> {
  readonly id: ProvingJobId<T>;
  readonly blockNumber: number;
  readonly inputs: ProofInputs[T];
}

export type ProvingJobStatus<T extends ProofType> =
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
