import {
  AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  RECURSIVE_PROOF_LENGTH,
} from '@aztec/constants';
import type { ZodFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { AvmCircuitInputs } from '../avm/avm.js';
import { AvmProvingRequestSchema } from '../avm/avm_proving_request.js';
import { ParityBasePrivateInputs } from '../parity/parity_base_private_inputs.js';
import { ParityPublicInputs } from '../parity/parity_public_inputs.js';
import { ParityRootPrivateInputs } from '../parity/parity_root_private_inputs.js';
import { ProvingRequestType } from '../proofs/proving_request_type.js';
import { RecursiveProof } from '../proofs/recursive_proof.js';
import { BlockMergeRollupPrivateInputs } from '../rollup/block_merge_rollup_private_inputs.js';
import { BlockRollupPublicInputs } from '../rollup/block_rollup_public_inputs.js';
import {
  BlockRootEmptyTxFirstRollupPrivateInputs,
  BlockRootFirstRollupPrivateInputs,
  BlockRootRollupPrivateInputs,
  BlockRootSingleTxFirstRollupPrivateInputs,
  BlockRootSingleTxRollupPrivateInputs,
} from '../rollup/block_root_rollup_private_inputs.js';
import { CheckpointMergeRollupPrivateInputs } from '../rollup/checkpoint_merge_rollup_private_inputs.js';
import { CheckpointRollupPublicInputs } from '../rollup/checkpoint_rollup_public_inputs.js';
import {
  CheckpointPaddingRollupPrivateInputs,
  CheckpointRootRollupPrivateInputs,
  CheckpointRootSingleBlockRollupPrivateInputs,
} from '../rollup/checkpoint_root_rollup_private_inputs.js';
import { PrivateTxBaseRollupPrivateInputs } from '../rollup/private_tx_base_rollup_private_inputs.js';
import { PublicTubePrivateInputs } from '../rollup/public_tube_private_inputs.js';
import { PublicTubePublicInputs } from '../rollup/public_tube_public_inputs.js';
import { PublicTxBaseRollupPrivateInputs } from '../rollup/public_tx_base_rollup_private_inputs.js';
import { RootRollupPrivateInputs } from '../rollup/root_rollup_private_inputs.js';
import { RootRollupPublicInputs } from '../rollup/root_rollup_public_inputs.js';
import { TxMergeRollupPrivateInputs } from '../rollup/tx_merge_rollup_private_inputs.js';
import { TxRollupPublicInputs } from '../rollup/tx_rollup_public_inputs.js';
import { VerificationKeyData } from '../vks/verification_key.js';

export type ProofAndVerificationKey<N extends number> = {
  proof: RecursiveProof<N>;
  verificationKey: VerificationKeyData;
};

function schemaForRecursiveProofAndVerificationKey<N extends number>(
  proofLength: N,
): ZodFor<ProofAndVerificationKey<N>> {
  return z.object({
    proof: RecursiveProof.schemaFor(proofLength),
    verificationKey: VerificationKeyData.schema,
  });
}

export function makeProofAndVerificationKey<N extends number>(
  proof: RecursiveProof<N>,
  verificationKey: VerificationKeyData,
): ProofAndVerificationKey<N> {
  return { proof, verificationKey };
}

export type PublicInputsAndRecursiveProof<T, N extends number = typeof NESTED_RECURSIVE_PROOF_LENGTH> = {
  inputs: T;
  proof: RecursiveProof<N>;
  verificationKey: VerificationKeyData;
};

function schemaForPublicInputsAndRecursiveProof<T extends object, N extends number>(
  inputs: ZodFor<T>,
  proofSize: N,
): ZodFor<PublicInputsAndRecursiveProof<T, typeof proofSize>> {
  return z.object({
    inputs,
    proof: RecursiveProof.schemaFor(proofSize),
    verificationKey: VerificationKeyData.schema,
  }) as ZodFor<PublicInputsAndRecursiveProof<T, N>>;
}

export function makePublicInputsAndRecursiveProof<T, N extends number = typeof NESTED_RECURSIVE_PROOF_LENGTH>(
  inputs: T,
  proof: RecursiveProof<N>,
  verificationKey: VerificationKeyData,
): PublicInputsAndRecursiveProof<T, N> {
  return { inputs, proof, verificationKey };
}

export const ProvingJobInputs = z.discriminatedUnion('type', [
  AvmProvingRequestSchema,
  z.object({ type: z.literal(ProvingRequestType.PARITY_BASE), inputs: ParityBasePrivateInputs.schema }),
  z.object({ type: z.literal(ProvingRequestType.PARITY_ROOT), inputs: ParityRootPrivateInputs.schema }),
  z.object({ type: z.literal(ProvingRequestType.PUBLIC_TUBE), inputs: PublicTubePrivateInputs.schema }),
  z.object({
    type: z.literal(ProvingRequestType.PRIVATE_TX_BASE_ROLLUP),
    inputs: PrivateTxBaseRollupPrivateInputs.schema,
  }),
  z.object({
    type: z.literal(ProvingRequestType.PUBLIC_TX_BASE_ROLLUP),
    inputs: PublicTxBaseRollupPrivateInputs.schema,
  }),
  z.object({ type: z.literal(ProvingRequestType.TX_MERGE_ROLLUP), inputs: TxMergeRollupPrivateInputs.schema }),
  z.object({
    type: z.literal(ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP),
    inputs: BlockRootFirstRollupPrivateInputs.schema,
  }),
  z.object({
    type: z.literal(ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP),
    inputs: BlockRootSingleTxFirstRollupPrivateInputs.schema,
  }),
  z.object({
    type: z.literal(ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP),
    inputs: BlockRootEmptyTxFirstRollupPrivateInputs.schema,
  }),
  z.object({ type: z.literal(ProvingRequestType.BLOCK_ROOT_ROLLUP), inputs: BlockRootRollupPrivateInputs.schema }),
  z.object({
    type: z.literal(ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP),
    inputs: BlockRootSingleTxRollupPrivateInputs.schema,
  }),
  z.object({ type: z.literal(ProvingRequestType.BLOCK_MERGE_ROLLUP), inputs: BlockMergeRollupPrivateInputs.schema }),
  z.object({
    type: z.literal(ProvingRequestType.CHECKPOINT_ROOT_ROLLUP),
    inputs: CheckpointRootRollupPrivateInputs.schema,
  }),
  z.object({
    type: z.literal(ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP),
    inputs: CheckpointRootSingleBlockRollupPrivateInputs.schema,
  }),
  z.object({
    type: z.literal(ProvingRequestType.CHECKPOINT_PADDING_ROLLUP),
    inputs: CheckpointPaddingRollupPrivateInputs.schema,
  }),
  z.object({
    type: z.literal(ProvingRequestType.CHECKPOINT_MERGE_ROLLUP),
    inputs: CheckpointMergeRollupPrivateInputs.schema,
  }),
  z.object({ type: z.literal(ProvingRequestType.ROOT_ROLLUP), inputs: RootRollupPrivateInputs.schema }),
]);

export function getProvingJobInputClassFor(type: ProvingRequestType) {
  switch (type) {
    case ProvingRequestType.PUBLIC_VM:
      return AvmCircuitInputs;
    case ProvingRequestType.PUBLIC_TUBE:
      return PublicTubePrivateInputs;
    case ProvingRequestType.PRIVATE_TX_BASE_ROLLUP:
      return PrivateTxBaseRollupPrivateInputs;
    case ProvingRequestType.PUBLIC_TX_BASE_ROLLUP:
      return PublicTxBaseRollupPrivateInputs;
    case ProvingRequestType.TX_MERGE_ROLLUP:
      return TxMergeRollupPrivateInputs;
    case ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP:
      return BlockRootFirstRollupPrivateInputs;
    case ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP:
      return BlockRootSingleTxFirstRollupPrivateInputs;
    case ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP:
      return BlockRootEmptyTxFirstRollupPrivateInputs;
    case ProvingRequestType.BLOCK_ROOT_ROLLUP:
      return BlockRootRollupPrivateInputs;
    case ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP:
      return BlockRootSingleTxRollupPrivateInputs;
    case ProvingRequestType.BLOCK_MERGE_ROLLUP:
      return BlockMergeRollupPrivateInputs;
    case ProvingRequestType.CHECKPOINT_ROOT_ROLLUP:
      return CheckpointRootRollupPrivateInputs;
    case ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP:
      return CheckpointRootSingleBlockRollupPrivateInputs;
    case ProvingRequestType.CHECKPOINT_PADDING_ROLLUP:
      return CheckpointPaddingRollupPrivateInputs;
    case ProvingRequestType.CHECKPOINT_MERGE_ROLLUP:
      return CheckpointMergeRollupPrivateInputs;
    case ProvingRequestType.ROOT_ROLLUP:
      return RootRollupPrivateInputs;
    case ProvingRequestType.PARITY_BASE:
      return ParityBasePrivateInputs;
    case ProvingRequestType.PARITY_ROOT:
      return ParityRootPrivateInputs;
    default: {
      const _exhaustive: never = type;
      throw new Error(`Cannot find circuit inputs class for proving type ${type}`);
    }
  }
}

export type ProvingJobInputs = z.infer<typeof ProvingJobInputs>;

export type ProvingJobInputsMap = {
  [ProvingRequestType.PUBLIC_VM]: AvmCircuitInputs;
  [ProvingRequestType.PUBLIC_TUBE]: PublicTubePrivateInputs;
  [ProvingRequestType.PRIVATE_TX_BASE_ROLLUP]: PrivateTxBaseRollupPrivateInputs;
  [ProvingRequestType.PUBLIC_TX_BASE_ROLLUP]: PublicTxBaseRollupPrivateInputs;
  [ProvingRequestType.TX_MERGE_ROLLUP]: TxMergeRollupPrivateInputs;
  [ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP]: BlockRootFirstRollupPrivateInputs;
  [ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP]: BlockRootSingleTxFirstRollupPrivateInputs;
  [ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP]: BlockRootEmptyTxFirstRollupPrivateInputs;
  [ProvingRequestType.BLOCK_ROOT_ROLLUP]: BlockRootRollupPrivateInputs;
  [ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP]: BlockRootSingleTxRollupPrivateInputs;
  [ProvingRequestType.BLOCK_MERGE_ROLLUP]: BlockMergeRollupPrivateInputs;
  [ProvingRequestType.CHECKPOINT_ROOT_ROLLUP]: CheckpointRootRollupPrivateInputs;
  [ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP]: CheckpointRootSingleBlockRollupPrivateInputs;
  [ProvingRequestType.CHECKPOINT_PADDING_ROLLUP]: CheckpointPaddingRollupPrivateInputs;
  [ProvingRequestType.CHECKPOINT_MERGE_ROLLUP]: CheckpointMergeRollupPrivateInputs;
  [ProvingRequestType.ROOT_ROLLUP]: RootRollupPrivateInputs;
  [ProvingRequestType.PARITY_BASE]: ParityBasePrivateInputs;
  [ProvingRequestType.PARITY_ROOT]: ParityRootPrivateInputs;
};

export const ProvingJobResult = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(ProvingRequestType.PUBLIC_VM),
    result: schemaForRecursiveProofAndVerificationKey(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED),
  }),
  z.object({
    type: z.literal(ProvingRequestType.PUBLIC_TUBE),
    result: schemaForPublicInputsAndRecursiveProof(
      PublicTubePublicInputs.schema,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    ),
  }),
  z.object({
    type: z.literal(ProvingRequestType.PRIVATE_TX_BASE_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(
      TxRollupPublicInputs.schema,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    ),
  }),
  z.object({
    type: z.literal(ProvingRequestType.PUBLIC_TX_BASE_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(
      TxRollupPublicInputs.schema,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    ),
  }),
  z.object({
    type: z.literal(ProvingRequestType.TX_MERGE_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(
      TxRollupPublicInputs.schema,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    ),
  }),
  z.object({
    type: z.literal(ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(
      BlockRollupPublicInputs.schema,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    ),
  }),
  z.object({
    type: z.literal(ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(
      BlockRollupPublicInputs.schema,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    ),
  }),
  z.object({
    type: z.literal(ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(
      BlockRollupPublicInputs.schema,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    ),
  }),
  z.object({
    type: z.literal(ProvingRequestType.BLOCK_ROOT_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(
      BlockRollupPublicInputs.schema,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    ),
  }),
  z.object({
    type: z.literal(ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(
      BlockRollupPublicInputs.schema,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    ),
  }),
  z.object({
    type: z.literal(ProvingRequestType.BLOCK_MERGE_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(
      BlockRollupPublicInputs.schema,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    ),
  }),
  z.object({
    type: z.literal(ProvingRequestType.CHECKPOINT_ROOT_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(
      CheckpointRollupPublicInputs.schema,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    ),
  }),
  z.object({
    type: z.literal(ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(
      CheckpointRollupPublicInputs.schema,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    ),
  }),
  z.object({
    type: z.literal(ProvingRequestType.CHECKPOINT_PADDING_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(
      CheckpointRollupPublicInputs.schema,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    ),
  }),
  z.object({
    type: z.literal(ProvingRequestType.CHECKPOINT_MERGE_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(
      CheckpointRollupPublicInputs.schema,
      NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
    ),
  }),
  z.object({
    type: z.literal(ProvingRequestType.ROOT_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(RootRollupPublicInputs.schema, NESTED_RECURSIVE_PROOF_LENGTH),
  }),
  z.object({
    type: z.literal(ProvingRequestType.PARITY_BASE),
    result: schemaForPublicInputsAndRecursiveProof(ParityPublicInputs.schema, RECURSIVE_PROOF_LENGTH),
  }),
  z.object({
    type: z.literal(ProvingRequestType.PARITY_ROOT),
    result: schemaForPublicInputsAndRecursiveProof(ParityPublicInputs.schema, NESTED_RECURSIVE_PROOF_LENGTH),
  }),
]);
export type ProvingJobResult = z.infer<typeof ProvingJobResult>;
export type ProvingJobResultsMap = {
  [ProvingRequestType.PUBLIC_VM]: ProofAndVerificationKey<typeof AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED>;
  [ProvingRequestType.PUBLIC_TUBE]: PublicInputsAndRecursiveProof<
    PublicTubePublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  [ProvingRequestType.PRIVATE_TX_BASE_ROLLUP]: PublicInputsAndRecursiveProof<
    TxRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  [ProvingRequestType.PUBLIC_TX_BASE_ROLLUP]: PublicInputsAndRecursiveProof<
    TxRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  [ProvingRequestType.TX_MERGE_ROLLUP]: PublicInputsAndRecursiveProof<
    TxRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  [ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP]: PublicInputsAndRecursiveProof<
    BlockRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  [ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP]: PublicInputsAndRecursiveProof<
    BlockRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  [ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP]: PublicInputsAndRecursiveProof<
    BlockRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  [ProvingRequestType.BLOCK_ROOT_ROLLUP]: PublicInputsAndRecursiveProof<
    BlockRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  [ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP]: PublicInputsAndRecursiveProof<
    BlockRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  [ProvingRequestType.BLOCK_MERGE_ROLLUP]: PublicInputsAndRecursiveProof<
    BlockRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  [ProvingRequestType.CHECKPOINT_ROOT_ROLLUP]: PublicInputsAndRecursiveProof<
    CheckpointRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  [ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP]: PublicInputsAndRecursiveProof<
    CheckpointRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  [ProvingRequestType.CHECKPOINT_PADDING_ROLLUP]: PublicInputsAndRecursiveProof<
    CheckpointRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  [ProvingRequestType.CHECKPOINT_MERGE_ROLLUP]: PublicInputsAndRecursiveProof<
    CheckpointRollupPublicInputs,
    typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH
  >;
  [ProvingRequestType.ROOT_ROLLUP]: PublicInputsAndRecursiveProof<RootRollupPublicInputs>;
  [ProvingRequestType.PARITY_BASE]: PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>;
  [ProvingRequestType.PARITY_ROOT]: PublicInputsAndRecursiveProof<
    ParityPublicInputs,
    typeof NESTED_RECURSIVE_PROOF_LENGTH
  >;
};

export type ProvingRequestResultFor<T extends ProvingRequestType> = { type: T; result: ProvingJobResultsMap[T] };

export const ProvingJobId = z.string();

export const ProofUri = z.string().brand('ProvingJobUri');
export type ProofUri = z.infer<typeof ProofUri>;

export type ProvingJobId = z.infer<typeof ProvingJobId>;
export const ProvingJob = z.object({
  id: ProvingJobId,
  type: z.nativeEnum(ProvingRequestType),
  epochNumber: z.number(),
  inputsUri: ProofUri,
});

export const makeProvingJobId = (epochNumber: number, type: ProvingRequestType, inputsHash: string) => {
  return `${epochNumber}:${ProvingRequestType[type]}:${inputsHash}`;
};

export const getEpochFromProvingJobId = (id: ProvingJobId) => {
  const components = id.split(':');
  const epochNumber = components.length < 1 ? Number.NaN : parseInt(components[0], 10);
  if (!Number.isSafeInteger(epochNumber) || epochNumber < 0) {
    throw new Error(`Proving Job ID ${id} does not contain valid epoch`);
  }
  return epochNumber;
};

export type ProvingJob = z.infer<typeof ProvingJob>;

export function makeProvingRequestResult(
  type: ProvingRequestType,
  result: ProvingJobResult['result'],
): ProvingJobResult {
  return { type, result } as ProvingJobResult;
}

export const ProvingJobFulfilledResult = z.object({
  status: z.literal('fulfilled'),
  value: ProofUri,
});
export type ProvingJobFulfilledResult = z.infer<typeof ProvingJobFulfilledResult>;

export const ProvingJobRejectedResult = z.object({
  status: z.literal('rejected'),
  reason: z.string(),
});
export type ProvingJobRejectedResult = z.infer<typeof ProvingJobRejectedResult>;

export const ProvingJobSettledResult = z.discriminatedUnion('status', [
  ProvingJobFulfilledResult,
  ProvingJobRejectedResult,
]);
export type ProvingJobSettledResult = z.infer<typeof ProvingJobSettledResult>;

export const ProvingJobStatus = z.discriminatedUnion('status', [
  z.object({ status: z.literal('in-queue') }),
  z.object({ status: z.literal('in-progress') }),
  z.object({ status: z.literal('not-found') }),
  ProvingJobFulfilledResult,
  ProvingJobRejectedResult,
]);
export type ProvingJobStatus = z.infer<typeof ProvingJobStatus>;
