// TODO: Can be deleted once circuits.gen.ts is gone.
// Type mappings for cbinds
// Can either export things directly or handle
// naming differences with the 'as' syntax
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { Fr } from '@aztec/foundation/fields';
import { Tuple } from '@aztec/foundation/serialize';

import { MembershipWitness } from '../structs/membership_witness.js';

/**
 * Alias for msgpack which expects a MembershipWitness + N name.
 */
export class MembershipWitness20 extends MembershipWitness<20> {
  constructor(
    /**
     * Index of a leaf in the Merkle tree.
     */
    leafIndex: Fr,
    /**
     * Sibling path of the leaf in the Merkle tree.
     */
    siblingPath: Tuple<Fr, 20>,
  ) {
    super(20, leafIndex.toBigInt(), siblingPath);
  }
}

/**
 * Alias for msgpack which expects a MembershipWitness + N name.
 */
export class MembershipWitness16 extends MembershipWitness<16> {
  constructor(
    /**
     * Index of a leaf in the Merkle tree.
     */
    leafIndex: Fr,
    /**
     * Sibling path of the leaf in the Merkle tree.
     */
    siblingPath: Tuple<Fr, 16>,
  ) {
    super(16, leafIndex.toBigInt(), siblingPath);
  }
}

/**
 * Coerce a variety of types to a buffer.
 * Makes msgpack output easier to manage as this can handle a few cases.
 * @param bufferable - The value to coerce.
 */
export function toBuffer(bufferable: { toBuffer(): Buffer } | bigint | Buffer) {
  if (typeof bufferable === 'bigint') {
    return toBufferBE(bufferable, 32);
  } else if (bufferable instanceof Buffer) {
    return bufferable;
  } else {
    return bufferable.toBuffer();
  }
}

export {
  AggregationObject as NativeAggregationState,
  AztecAddress as Address,
  VerificationKey as VerificationKeyData,
  Fr,
  Fq,
  G1AffineElement,
  NewContractData,
  FunctionData,
  OptionallyRevealedData,
  PublicDataRead,
  PublicDataUpdateRequest,
  ReadRequestMembershipWitness,
  CombinedAccumulatedData,
  FinalAccumulatedData,
  HistoricBlockData,
  ContractDeploymentData,
  TxContext,
  CombinedConstantData,
  CompleteAddress,
  KernelCircuitPublicInputs,
  KernelCircuitPublicInputsFinal,
  Proof,
  PreviousKernelData,
  CallContext,
  ContractStorageUpdateRequest,
  ContractStorageRead,
  PublicCircuitPublicInputs,
  PublicCallStackItem,
  PublicCallData,
  PublicKernelInputs,
  CircuitError,
  Point,
  Coordinate,
  GlobalVariables,
  PrivateKernelInputsOrdering,
  PrivateCallData,
  PrivateCallStackItem,
  PrivateCircuitPublicInputs,
  PrivateKernelInputsInit,
  PrivateKernelInputsInner,
  TxRequest,
  PreviousRollupData,
  AppendOnlyTreeSnapshot,
  BaseRollupInputs,
  NullifierLeafPreimage,
  BaseOrMergeRollupPublicInputs,
  ConstantRollupData,
  MergeRollupInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
} from '../structs/index.js';
export { FunctionSelector } from '@aztec/foundation/abi';
