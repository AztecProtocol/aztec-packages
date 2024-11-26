import {
  AVM_PROOF_LENGTH_IN_FIELDS,
  AvmCircuitInputs,
  BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  BlockMergeRollupInputs,
  BlockRootOrBlockMergePublicInputs,
  BlockRootRollupInputs,
  EmptyBlockRootRollupInputs,
  KernelCircuitPublicInputs,
  MergeRollupInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  ParityPublicInputs,
  PrivateBaseRollupInputs,
  PrivateKernelEmptyInputData,
  PublicBaseRollupInputs,
  RECURSIVE_PROOF_LENGTH,
  RecursiveProof,
  RootParityInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
  TUBE_PROOF_LENGTH,
  TubeInputs,
  VerificationKeyData,
} from '@aztec/circuits.js';
import { type ZodFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { type CircuitName } from '../stats/index.js';

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

function schemaForPublicInputsAndRecursiveProof<T extends object>(
  inputs: ZodFor<T>,
  proofSize = NESTED_RECURSIVE_PROOF_LENGTH,
): ZodFor<PublicInputsAndRecursiveProof<T>> {
  return z.object({
    inputs,
    proof: RecursiveProof.schemaFor(proofSize),
    verificationKey: VerificationKeyData.schema,
  }) as ZodFor<PublicInputsAndRecursiveProof<T>>;
}

export function makePublicInputsAndRecursiveProof<T, N extends number = typeof NESTED_RECURSIVE_PROOF_LENGTH>(
  inputs: T,
  proof: RecursiveProof<N>,
  verificationKey: VerificationKeyData,
): PublicInputsAndRecursiveProof<T, N> {
  return { inputs, proof, verificationKey };
}

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
  /** Recursive Client IVC verification to connect private to public or rollup */
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

export type AvmProvingRequest = z.infer<typeof AvmProvingRequestSchema>;

export type ProvingRequest = z.infer<typeof ProvingRequestSchema>;

export const AvmProvingRequestSchema = z.object({
  type: z.literal(ProvingRequestType.PUBLIC_VM),
  inputs: AvmCircuitInputs.schema,
});

export const ProvingRequestSchema = z.discriminatedUnion('type', [
  AvmProvingRequestSchema,
  z.object({ type: z.literal(ProvingRequestType.BASE_PARITY), inputs: BaseParityInputs.schema }),
  z.object({ type: z.literal(ProvingRequestType.ROOT_PARITY), inputs: RootParityInputs.schema }),
  z.object({ type: z.literal(ProvingRequestType.PRIVATE_BASE_ROLLUP), inputs: PrivateBaseRollupInputs.schema }),
  z.object({ type: z.literal(ProvingRequestType.PUBLIC_BASE_ROLLUP), inputs: PublicBaseRollupInputs.schema }),
  z.object({ type: z.literal(ProvingRequestType.MERGE_ROLLUP), inputs: MergeRollupInputs.schema }),
  z.object({ type: z.literal(ProvingRequestType.BLOCK_ROOT_ROLLUP), inputs: BlockRootRollupInputs.schema }),
  z.object({ type: z.literal(ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP), inputs: EmptyBlockRootRollupInputs.schema }),
  z.object({ type: z.literal(ProvingRequestType.BLOCK_MERGE_ROLLUP), inputs: BlockMergeRollupInputs.schema }),
  z.object({ type: z.literal(ProvingRequestType.ROOT_ROLLUP), inputs: RootRollupInputs.schema }),
  z.object({ type: z.literal(ProvingRequestType.PRIVATE_KERNEL_EMPTY), inputs: PrivateKernelEmptyInputData.schema }),
  z.object({ type: z.literal(ProvingRequestType.TUBE_PROOF), inputs: TubeInputs.schema }),
]);

export type JobId = z.infer<typeof JobIdSchema>;

export const JobIdSchema = z.string();

export type ProvingJob<T extends ProvingRequest> = { id: JobId; request: T };

export const ProvingJobSchema = z.object({ id: JobIdSchema, request: ProvingRequestSchema });

type ProvingRequestResultsMap = {
  [ProvingRequestType.PRIVATE_KERNEL_EMPTY]: PublicInputsAndRecursiveProof<KernelCircuitPublicInputs>;
  [ProvingRequestType.PUBLIC_VM]: ProofAndVerificationKey<typeof AVM_PROOF_LENGTH_IN_FIELDS>;
  [ProvingRequestType.PRIVATE_BASE_ROLLUP]: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>;
  [ProvingRequestType.PUBLIC_BASE_ROLLUP]: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>;
  [ProvingRequestType.MERGE_ROLLUP]: PublicInputsAndRecursiveProof<BaseOrMergeRollupPublicInputs>;
  [ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP]: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>;
  [ProvingRequestType.BLOCK_ROOT_ROLLUP]: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>;
  [ProvingRequestType.BLOCK_MERGE_ROLLUP]: PublicInputsAndRecursiveProof<BlockRootOrBlockMergePublicInputs>;
  [ProvingRequestType.ROOT_ROLLUP]: PublicInputsAndRecursiveProof<RootRollupPublicInputs>;
  [ProvingRequestType.BASE_PARITY]: PublicInputsAndRecursiveProof<ParityPublicInputs, typeof RECURSIVE_PROOF_LENGTH>;
  [ProvingRequestType.ROOT_PARITY]: PublicInputsAndRecursiveProof<
    ParityPublicInputs,
    typeof NESTED_RECURSIVE_PROOF_LENGTH
  >;
  [ProvingRequestType.TUBE_PROOF]: ProofAndVerificationKey<typeof TUBE_PROOF_LENGTH>;
};

export type ProvingRequestResultFor<T extends ProvingRequestType> = { type: T; result: ProvingRequestResultsMap[T] };

export type ProvingRequestResult = {
  [K in keyof ProvingRequestResultsMap]: { type: K; result: ProvingRequestResultsMap[K] };
}[keyof ProvingRequestResultsMap];

export function makeProvingRequestResult(
  type: ProvingRequestType,
  result: ProvingRequestResult['result'],
): ProvingRequestResult {
  return { type, result } as ProvingRequestResult;
}

export const ProvingRequestResultSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(ProvingRequestType.PRIVATE_KERNEL_EMPTY),
    result: schemaForPublicInputsAndRecursiveProof(KernelCircuitPublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.PUBLIC_VM),
    result: schemaForRecursiveProofAndVerificationKey(AVM_PROOF_LENGTH_IN_FIELDS),
  }),
  z.object({
    type: z.literal(ProvingRequestType.PRIVATE_BASE_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(BaseOrMergeRollupPublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.PUBLIC_BASE_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(BaseOrMergeRollupPublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.MERGE_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(BaseOrMergeRollupPublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(BlockRootOrBlockMergePublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.BLOCK_ROOT_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(BlockRootOrBlockMergePublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.BLOCK_MERGE_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(BlockRootOrBlockMergePublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.ROOT_ROLLUP),
    result: schemaForPublicInputsAndRecursiveProof(RootRollupPublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.BASE_PARITY),
    result: schemaForPublicInputsAndRecursiveProof(ParityPublicInputs.schema, RECURSIVE_PROOF_LENGTH),
  }),
  z.object({
    type: z.literal(ProvingRequestType.ROOT_PARITY),
    result: schemaForPublicInputsAndRecursiveProof(ParityPublicInputs.schema, NESTED_RECURSIVE_PROOF_LENGTH),
  }),
  z.object({
    type: z.literal(ProvingRequestType.TUBE_PROOF),
    result: schemaForRecursiveProofAndVerificationKey(TUBE_PROOF_LENGTH),
  }),
]) satisfies ZodFor<ProvingRequestResult>;

export const V2ProvingJobId = z.string().brand('ProvingJobId');
export type V2ProvingJobId = z.infer<typeof V2ProvingJobId>;

export const V2ProvingJob = z.discriminatedUnion('type', [
  z.object({
    id: V2ProvingJobId,
    blockNumber: z.number(),
    type: z.literal(ProvingRequestType.PUBLIC_VM),
    inputs: AvmCircuitInputs.schema,
  }),
  z.object({
    id: V2ProvingJobId,
    blockNumber: z.number(),
    type: z.literal(ProvingRequestType.BASE_PARITY),
    inputs: BaseParityInputs.schema,
  }),
  z.object({
    id: V2ProvingJobId,
    blockNumber: z.number(),
    type: z.literal(ProvingRequestType.ROOT_PARITY),
    inputs: RootParityInputs.schema,
  }),
  z.object({
    id: V2ProvingJobId,
    blockNumber: z.number(),
    type: z.literal(ProvingRequestType.PRIVATE_BASE_ROLLUP),
    inputs: PrivateBaseRollupInputs.schema,
  }),
  z.object({
    id: V2ProvingJobId,
    blockNumber: z.number(),
    type: z.literal(ProvingRequestType.PUBLIC_BASE_ROLLUP),
    inputs: PublicBaseRollupInputs.schema,
  }),
  z.object({
    id: V2ProvingJobId,
    blockNumber: z.number(),
    type: z.literal(ProvingRequestType.MERGE_ROLLUP),
    inputs: MergeRollupInputs.schema,
  }),
  z.object({
    id: V2ProvingJobId,
    blockNumber: z.number(),
    type: z.literal(ProvingRequestType.BLOCK_ROOT_ROLLUP),
    inputs: BlockRootRollupInputs.schema,
  }),
  z.object({
    id: V2ProvingJobId,
    blockNumber: z.number(),
    type: z.literal(ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP),
    inputs: EmptyBlockRootRollupInputs.schema,
  }),
  z.object({
    id: V2ProvingJobId,
    blockNumber: z.number(),
    type: z.literal(ProvingRequestType.BLOCK_MERGE_ROLLUP),
    inputs: BlockMergeRollupInputs.schema,
  }),
  z.object({
    id: V2ProvingJobId,
    blockNumber: z.number(),
    type: z.literal(ProvingRequestType.ROOT_ROLLUP),
    inputs: RootRollupInputs.schema,
  }),
  z.object({
    id: V2ProvingJobId,
    blockNumber: z.number(),
    type: z.literal(ProvingRequestType.PRIVATE_KERNEL_EMPTY),
    inputs: PrivateKernelEmptyInputData.schema,
  }),
  z.object({
    id: V2ProvingJobId,
    blockNumber: z.number(),
    type: z.literal(ProvingRequestType.TUBE_PROOF),
    inputs: TubeInputs.schema,
  }),
]);
export type V2ProvingJob = z.infer<typeof V2ProvingJob>;

export const V2ProofOutput = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(ProvingRequestType.PRIVATE_KERNEL_EMPTY),
    value: schemaForPublicInputsAndRecursiveProof(KernelCircuitPublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.PUBLIC_VM),
    value: schemaForRecursiveProofAndVerificationKey(AVM_PROOF_LENGTH_IN_FIELDS),
  }),
  z.object({
    type: z.literal(ProvingRequestType.PRIVATE_BASE_ROLLUP),
    value: schemaForPublicInputsAndRecursiveProof(BaseOrMergeRollupPublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.PUBLIC_BASE_ROLLUP),
    value: schemaForPublicInputsAndRecursiveProof(BaseOrMergeRollupPublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.MERGE_ROLLUP),
    value: schemaForPublicInputsAndRecursiveProof(BaseOrMergeRollupPublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP),
    value: schemaForPublicInputsAndRecursiveProof(BlockRootOrBlockMergePublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.BLOCK_ROOT_ROLLUP),
    value: schemaForPublicInputsAndRecursiveProof(BlockRootOrBlockMergePublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.BLOCK_MERGE_ROLLUP),
    value: schemaForPublicInputsAndRecursiveProof(BlockRootOrBlockMergePublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.ROOT_ROLLUP),
    value: schemaForPublicInputsAndRecursiveProof(RootRollupPublicInputs.schema),
  }),
  z.object({
    type: z.literal(ProvingRequestType.BASE_PARITY),
    value: schemaForPublicInputsAndRecursiveProof(ParityPublicInputs.schema, RECURSIVE_PROOF_LENGTH),
  }),
  z.object({
    type: z.literal(ProvingRequestType.ROOT_PARITY),
    value: schemaForPublicInputsAndRecursiveProof(ParityPublicInputs.schema, NESTED_RECURSIVE_PROOF_LENGTH),
  }),
  z.object({
    type: z.literal(ProvingRequestType.TUBE_PROOF),
    value: schemaForRecursiveProofAndVerificationKey(TUBE_PROOF_LENGTH),
  }),
]);

export type V2ProofOutput = z.infer<typeof V2ProofOutput>;

export const V2ProvingJobStatus = z.discriminatedUnion('status', [
  z.object({ status: z.literal('in-queue') }),
  z.object({ status: z.literal('in-progress') }),
  z.object({ status: z.literal('not-found') }),
  z.object({ status: z.literal('resolved'), value: V2ProofOutput }),
  z.object({ status: z.literal('rejected'), error: z.string() }),
]);
export type V2ProvingJobStatus = z.infer<typeof V2ProvingJobStatus>;

export const V2ProvingJobResult = z.union([z.object({ value: V2ProofOutput }), z.object({ error: z.string() })]);
export type V2ProvingJobResult = z.infer<typeof V2ProvingJobResult>;
