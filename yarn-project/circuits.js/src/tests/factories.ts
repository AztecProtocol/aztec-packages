import { makeHalfFullTuple, makeTuple, range } from '@aztec/foundation/array';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { numToUInt32BE } from '@aztec/foundation/serialize';
import { ContractClassPublic, PrivateFunction, PublicFunction } from '@aztec/types/contracts';

import { SchnorrSignature } from '../barretenberg/index.js';
import {
  ARCHIVE_HEIGHT,
  ARGS_LENGTH,
  AggregationObject,
  AppendOnlyTreeSnapshot,
  BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  BaseRollupInputs,
  CallContext,
  CallRequest,
  CallerContext,
  CircuitType,
  CombinedAccumulatedData,
  CombinedConstantData,
  ConstantRollupData,
  ContractStorageRead,
  ContractStorageUpdateRequest,
  FUNCTION_TREE_HEIGHT,
  Fq,
  Fr,
  FunctionData,
  FunctionSelector,
  G1AffineElement,
  GrumpkinPrivateKey,
  GrumpkinScalar,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  L2ToL1Message,
  MAX_NEW_L2_TO_L1_MSGS_PER_CALL,
  MAX_NEW_L2_TO_L1_MSGS_PER_TX,
  MAX_NEW_NOTE_HASHES_PER_CALL,
  MAX_NEW_NOTE_HASHES_PER_TX,
  MAX_NEW_NULLIFIERS_PER_CALL,
  MAX_NEW_NULLIFIERS_PER_TX,
  MAX_NON_REVERTIBLE_NOTE_HASHES_PER_TX,
  MAX_NON_REVERTIBLE_NULLIFIERS_PER_TX,
  MAX_NON_REVERTIBLE_PUBLIC_CALL_STACK_LENGTH_PER_TX,
  MAX_NON_REVERTIBLE_PUBLIC_DATA_READS_PER_TX,
  MAX_NON_REVERTIBLE_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_CALL,
  MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,
  MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
  MAX_PUBLIC_DATA_READS_PER_CALL,
  MAX_PUBLIC_DATA_READS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_REVERTIBLE_NOTE_HASHES_PER_TX,
  MAX_REVERTIBLE_NULLIFIERS_PER_TX,
  MAX_REVERTIBLE_PUBLIC_CALL_STACK_LENGTH_PER_TX,
  MAX_REVERTIBLE_PUBLIC_DATA_READS_PER_TX,
  MAX_REVERTIBLE_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MembershipWitness,
  MergeRollupInputs,
  NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH,
  NULLIFIER_TREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  NUM_FIELDS_PER_SHA256,
  NUM_MSGS_PER_BASE_PARITY,
  NoteHashReadRequestMembershipWitness,
  NullifierKeyValidationRequest,
  NullifierKeyValidationRequestContext,
  NullifierLeafPreimage,
  PUBLIC_DATA_SUBTREE_SIBLING_PATH_LENGTH,
  PUBLIC_DATA_TREE_HEIGHT,
  ParityPublicInputs,
  PartialStateReference,
  Point,
  PreviousRollupData,
  PrivateAccumulatedNonRevertibleData,
  PrivateAccumulatedRevertibleData,
  PrivateCallData,
  PrivateCallStackItem,
  PrivateCircuitPublicInputs,
  PrivateKernelInnerCircuitPublicInputs,
  PrivateKernelInnerData,
  PrivateKernelTailCircuitPublicInputs,
  Proof,
  PublicAccumulatedNonRevertibleData,
  PublicAccumulatedRevertibleData,
  PublicCallData,
  PublicCallRequest,
  PublicCallStackItem,
  PublicCircuitPublicInputs,
  PublicDataRead,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
  PublicDataUpdateRequest,
  PublicKernelCircuitPrivateInputs,
  PublicKernelCircuitPublicInputs,
  PublicKernelData,
  RETURN_VALUES_LENGTH,
  ROLLUP_VK_TREE_HEIGHT,
  ReadRequest,
  ReadRequestContext,
  RollupTypes,
  RootParityInput,
  RootParityInputs,
  RootRollupInputs,
  RootRollupPublicInputs,
  SideEffect,
  SideEffectLinkedToNoteHash,
  StateDiffHints,
  StateReference,
  TxContext,
  TxRequest,
  VK_TREE_HEIGHT,
  VerificationKey,
  computeContractClassId,
  computePublicBytecodeCommitment,
  packBytecode,
} from '../index.js';
import { ContentCommitment, NUM_BYTES_PER_SHA256 } from '../structs/content_commitment.js';
import { GlobalVariables } from '../structs/global_variables.js';
import { Header } from '../structs/header.js';
import { PrivateKernelInitCircuitPrivateInputs } from '../structs/kernel/private_kernel_init_circuit_private_inputs.js';
import { PrivateKernelInnerCircuitPrivateInputs } from '../structs/kernel/private_kernel_inner_circuit_private_inputs.js';
import { RollupKernelCircuitPublicInputs } from '../structs/kernel/rollup_kernel_circuit_public_inputs.js';
import { RollupKernelData } from '../structs/kernel/rollup_kernel_data.js';

/**
 * Creates an arbitrary side effect object with the given seed.
 * @param seed - The seed to use for generating the object.
 * @returns A side effect object.
 */
export function makeNewSideEffect(seed: number): SideEffect {
  return new SideEffect(fr(seed), fr(seed + 1));
}

/**
 * Creates an arbitrary side effect object (linked to a note hash) with the given seed.
 * @param seed - The seed to use for generating the object.
 * @returns A side effect object.
 */
export function makeNewSideEffectLinkedToNoteHash(seed: number): SideEffectLinkedToNoteHash {
  return new SideEffectLinkedToNoteHash(fr(seed), fr(seed + 1), fr(seed + 2));
}

/**
 * Creates an arbitrary tx context with the given seed.
 * @param seed - The seed to use for generating the tx context.
 * @returns A tx context.
 */
export function makeTxContext(seed: number): TxContext {
  // @todo @LHerskind should probably take value for chainId as it will be verified later.
  return new TxContext(false, false, new Fr(seed), Fr.ZERO);
}

/**
 * Creates arbitrary constant data with the given seed.
 * @param seed - The seed to use for generating the constant data.
 * @returns A constant data object.
 */
export function makeConstantData(seed = 1): CombinedConstantData {
  return new CombinedConstantData(makeHeader(seed, undefined), makeTxContext(seed + 4));
}

/**
 * Creates arbitrary selector from the given seed.
 * @param seed - The seed to use for generating the selector.
 * @returns A selector.
 */
export function makeSelector(seed: number): FunctionSelector {
  return new FunctionSelector(seed);
}

function makeReadRequest(n: number): ReadRequest {
  return new ReadRequest(new Fr(BigInt(n)), n + 1);
}

function makeReadRequestContext(n: number): ReadRequestContext {
  return new ReadRequestContext(new Fr(BigInt(n)), n + 1, AztecAddress.fromBigInt(BigInt(n + 2)));
}

/**
 * Creates arbitrary NullifierKeyValidationRequest from the given seed.
 * @param seed - The seed to use for generating the NullifierKeyValidationRequest.
 * @returns A NullifierKeyValidationRequest.
 */
function makeNullifierKeyValidationRequest(seed: number): NullifierKeyValidationRequest {
  return new NullifierKeyValidationRequest(makePoint(seed), makeGrumpkinPrivateKey(seed + 2));
}

/**
 * Creates arbitrary NullifierKeyValidationRequestContext from the given seed.
 * @param seed - The seed to use for generating the NullifierKeyValidationRequestContext.
 * @returns A NullifierKeyValidationRequestContext.
 */
function makeNullifierKeyValidationRequestContext(seed: number): NullifierKeyValidationRequestContext {
  return new NullifierKeyValidationRequestContext(
    makePoint(seed),
    makeGrumpkinPrivateKey(seed + 2),
    makeAztecAddress(seed + 4),
  );
}

/**
 * Creates arbitrary public data update request.
 * @param seed - The seed to use for generating the public data update request.
 * @returns A public data update request.
 */
export function makePublicDataUpdateRequest(seed = 1): PublicDataUpdateRequest {
  return new PublicDataUpdateRequest(fr(seed), fr(seed + 1));
}

/**
 * Creates empty public data update request.
 * @returns An empty public data update request.
 */
export function makeEmptyPublicDataUpdateRequest(): PublicDataUpdateRequest {
  return new PublicDataUpdateRequest(fr(0), fr(0));
}

/**
 * Creates arbitrary public data read.
 * @param seed - The seed to use for generating the public data read.
 * @returns A public data read.
 */
export function makePublicDataRead(seed = 1): PublicDataRead {
  return new PublicDataRead(fr(seed), fr(seed + 1));
}

/**
 * Creates empty public data read.
 * @returns An empty public data read.
 */
export function makeEmptyPublicDataRead(): PublicDataRead {
  return new PublicDataRead(fr(0), fr(0));
}

/**
 * Creates arbitrary contract storage update request.
 * @param seed - The seed to use for generating the contract storage update request.
 * @returns A contract storage update request.
 */
export function makeContractStorageUpdateRequest(seed = 1): ContractStorageUpdateRequest {
  return new ContractStorageUpdateRequest(fr(seed), fr(seed + 1));
}

/**
 * Creates arbitrary contract storage read.
 * @param seed - The seed to use for generating the contract storage read.
 * @returns A contract storage read.
 */
export function makeContractStorageRead(seed = 1): ContractStorageRead {
  return new ContractStorageRead(fr(seed), fr(seed + 1));
}

/**
 * Creates arbitrary accumulated data.
 * @param seed - The seed to use for generating the accumulated data.
 * @returns An accumulated data.
 */
export function makeCombinedAccumulatedData(seed = 1, full = false): CombinedAccumulatedData {
  const tupleGenerator = full ? makeTuple : makeHalfFullTuple;

  return new CombinedAccumulatedData(
    tupleGenerator(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, sideEffectFromNumber, seed + 0x80),
    tupleGenerator(MAX_NULLIFIER_READ_REQUESTS_PER_TX, makeReadRequestContext, seed + 0x90),
    tupleGenerator(
      MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_TX,
      makeNullifierKeyValidationRequestContext,
      seed + 0x100,
    ),
    tupleGenerator(MAX_NEW_NOTE_HASHES_PER_TX, sideEffectFromNumber, seed + 0x120),
    tupleGenerator(MAX_NEW_NULLIFIERS_PER_TX, sideEffectLinkedFromNumber, seed + 0x200),
    tupleGenerator(MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX, makeCallRequest, seed + 0x400),
    tupleGenerator(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, makeCallRequest, seed + 0x500),
    tupleGenerator(MAX_NEW_L2_TO_L1_MSGS_PER_TX, fr, seed + 0x600),
    tupleGenerator(2, fr, seed + 0x700), // encrypted logs hash
    tupleGenerator(2, fr, seed + 0x800), // unencrypted logs hash
    fr(seed + 0x900), // encrypted_log_preimages_length
    fr(seed + 0xa00), // unencrypted_log_preimages_length
    tupleGenerator(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, makePublicDataUpdateRequest, seed + 0xd00),
    tupleGenerator(MAX_PUBLIC_DATA_READS_PER_TX, makePublicDataRead, seed + 0xe00),
  );
}

/**
 * Creates arbitrary accumulated data.
 * @param seed - The seed to use for generating the accumulated data.
 * @returns An accumulated data.
 */
export function makeCombinedAccumulatedRevertibleData(seed = 1, full = false): PublicAccumulatedRevertibleData {
  const tupleGenerator = full ? makeTuple : makeHalfFullTuple;

  return new PublicAccumulatedRevertibleData(
    tupleGenerator(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, sideEffectFromNumber, seed + 0x80),
    tupleGenerator(MAX_NULLIFIER_READ_REQUESTS_PER_TX, makeReadRequestContext, seed + 0x90),
    tupleGenerator(
      MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_TX,
      makeNullifierKeyValidationRequestContext,
      seed + 0x100,
    ),
    tupleGenerator(MAX_REVERTIBLE_NOTE_HASHES_PER_TX, sideEffectFromNumber, seed + 0x120),
    tupleGenerator(MAX_REVERTIBLE_NULLIFIERS_PER_TX, sideEffectLinkedFromNumber, seed + 0x200),
    tupleGenerator(MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX, makeCallRequest, seed + 0x400),
    tupleGenerator(MAX_REVERTIBLE_PUBLIC_CALL_STACK_LENGTH_PER_TX, makeCallRequest, seed + 0x500),
    tupleGenerator(MAX_NEW_L2_TO_L1_MSGS_PER_TX, fr, seed + 0x600),
    tupleGenerator(2, fr, seed + 0x700), // encrypted logs hash
    tupleGenerator(2, fr, seed + 0x800), // unencrypted logs hash
    fr(seed + 0x900), // encrypted_log_preimages_length
    fr(seed + 0xa00), // unencrypted_log_preimages_length
    tupleGenerator(MAX_REVERTIBLE_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, makePublicDataUpdateRequest, seed + 0xd00),
    tupleGenerator(MAX_REVERTIBLE_PUBLIC_DATA_READS_PER_TX, makePublicDataRead, seed + 0xe00),
  );
}

/**
 * Creates arbitrary final accumulated data.
 * @param seed - The seed to use for generating the final accumulated data.
 * @returns A final accumulated data.
 */
export function makeFinalAccumulatedData(seed = 1, full = false): PrivateAccumulatedRevertibleData {
  const tupleGenerator = full ? makeTuple : makeHalfFullTuple;

  return new PrivateAccumulatedRevertibleData(
    tupleGenerator(MAX_REVERTIBLE_NOTE_HASHES_PER_TX, sideEffectFromNumber, seed + 0x100),
    tupleGenerator(MAX_REVERTIBLE_NULLIFIERS_PER_TX, sideEffectLinkedFromNumber, seed + 0x200),
    tupleGenerator(MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX, makeCallRequest, seed + 0x400),
    tupleGenerator(MAX_REVERTIBLE_PUBLIC_CALL_STACK_LENGTH_PER_TX, makeCallRequest, seed + 0x500),
    tupleGenerator(MAX_NEW_L2_TO_L1_MSGS_PER_TX, fr, seed + 0x600),
    tupleGenerator(2, fr, seed + 0x700), // encrypted logs hash
    tupleGenerator(2, fr, seed + 0x800), // unencrypted logs hash
    fr(seed + 0x900), // encrypted_log_preimages_length
    fr(seed + 0xa00), // unencrypted_log_preimages_length
  );
}

/**
 * Creates arbitrary accumulated data for a Tx's non-revertible side effects.
 * @param seed - The seed to use for generating the data.
 * @returns An instance of AccumulatedNonRevertibleData.
 */
export function makeAccumulatedNonRevertibleData(seed = 1, full = false): PrivateAccumulatedNonRevertibleData {
  const tupleGenerator = full ? makeTuple : makeHalfFullTuple;

  return new PrivateAccumulatedNonRevertibleData(
    tupleGenerator(MAX_NON_REVERTIBLE_NOTE_HASHES_PER_TX, sideEffectFromNumber, seed + 0x101),
    tupleGenerator(MAX_NON_REVERTIBLE_NULLIFIERS_PER_TX, sideEffectLinkedFromNumber, seed + 0x201),
    tupleGenerator(MAX_NON_REVERTIBLE_PUBLIC_CALL_STACK_LENGTH_PER_TX, makeCallRequest, seed + 0x501),
  );
}

export function makeCombinedAccumulatedNonRevertibleData(seed = 1, full = false): PublicAccumulatedNonRevertibleData {
  const tupleGenerator = full ? makeTuple : makeHalfFullTuple;

  return new PublicAccumulatedNonRevertibleData(
    tupleGenerator(MAX_NULLIFIER_READ_REQUESTS_PER_TX, makeReadRequestContext, seed + 0x91),
    tupleGenerator(MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_TX, makeReadRequestContext, seed + 0x95),
    tupleGenerator(MAX_NON_REVERTIBLE_NOTE_HASHES_PER_TX, sideEffectFromNumber, seed + 0x101),
    tupleGenerator(MAX_NON_REVERTIBLE_NULLIFIERS_PER_TX, sideEffectLinkedFromNumber, seed + 0x201),
    tupleGenerator(MAX_NON_REVERTIBLE_PUBLIC_CALL_STACK_LENGTH_PER_TX, makeCallRequest, seed + 0x501),
    tupleGenerator(MAX_NON_REVERTIBLE_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, makePublicDataUpdateRequest, seed + 0x601),
    tupleGenerator(MAX_NON_REVERTIBLE_PUBLIC_DATA_READS_PER_TX, makePublicDataRead, seed + 0x701),
  );
}

/**
 * Creates arbitrary aggregation object.
 * @param seed - The seed to use for generating the aggregation object.
 * @returns An aggregation object.
 */
export function makeAggregationObject(seed = 1): AggregationObject {
  return new AggregationObject(
    new G1AffineElement(new Fq(BigInt(seed)), new Fq(BigInt(seed + 1))),
    new G1AffineElement(new Fq(BigInt(seed + 0x100)), new Fq(BigInt(seed + 0x101))),
    makeTuple(4, fr, seed + 2),
    range(6, seed + 6),
  );
}

/**
 * Creates arbitrary call context.
 * @param seed - The seed to use for generating the call context.
 * @param storageContractAddress - The storage contract address set on the call context.
 * @returns A call context.
 */
export function makeCallContext(seed = 0, storageContractAddress = makeAztecAddress(seed + 1)): CallContext {
  return new CallContext(
    makeAztecAddress(seed),
    storageContractAddress,
    makeEthAddress(seed + 2),
    makeSelector(seed + 3),
    false,
    false,
    0,
  );
}

/**
 * Creates arbitrary public circuit public inputs.
 * @param seed - The seed to use for generating the public circuit public inputs.
 * @param storageContractAddress - The storage contract address set on the call context.
 * @returns Public circuit public inputs.
 */
export function makePublicCircuitPublicInputs(
  seed = 0,
  storageContractAddress?: AztecAddress,
  full = false,
): PublicCircuitPublicInputs {
  const tupleGenerator = full ? makeTuple : makeHalfFullTuple;

  return new PublicCircuitPublicInputs(
    makeCallContext(seed, storageContractAddress),
    fr(seed + 0x100),
    tupleGenerator(RETURN_VALUES_LENGTH, fr, seed + 0x200),
    tupleGenerator(MAX_NULLIFIER_READ_REQUESTS_PER_CALL, makeReadRequest, seed + 0x400),
    tupleGenerator(MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL, makeReadRequest, seed + 0x420),
    tupleGenerator(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL, makeContractStorageUpdateRequest, seed + 0x400),
    tupleGenerator(MAX_PUBLIC_DATA_READS_PER_CALL, makeContractStorageRead, seed + 0x500),
    tupleGenerator(MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL, fr, seed + 0x600),
    tupleGenerator(MAX_NEW_NOTE_HASHES_PER_CALL, makeNewSideEffect, seed + 0x700),
    tupleGenerator(MAX_NEW_NULLIFIERS_PER_CALL, makeNewSideEffectLinkedToNoteHash, seed + 0x800),
    tupleGenerator(MAX_NEW_L2_TO_L1_MSGS_PER_CALL, makeL2ToL1Message, seed + 0x900),
    fr(seed + 0xa00),
    fr(seed + 0xa01),
    tupleGenerator(2, fr, seed + 0x901),
    fr(seed + 0x902),
    makeHeader(seed + 0xa00, undefined),
    makeAztecAddress(seed + 0xb01),
    false, // reverted
  );
}

/**
 * Creates arbitrary public kernel circuit public inputs.
 * @param seed - The seed to use for generating the kernel circuit public inputs.
 * @returns Public kernel circuit public inputs.
 */
export function makePublicKernelCircuitPublicInputs(
  seed = 1,
  fullAccumulatedData = true,
): PublicKernelCircuitPublicInputs {
  return new PublicKernelCircuitPublicInputs(
    makeAggregationObject(seed),
    makeCombinedAccumulatedNonRevertibleData(seed, fullAccumulatedData),
    makeCombinedAccumulatedRevertibleData(seed, fullAccumulatedData),
    makeConstantData(seed + 0x100),
    true,
    true,
    true,
    false,
  );
}

/**
 * Creates arbitrary public kernel circuit public inputs.
 * @param seed - The seed to use for generating the kernel circuit public inputs.
 * @returns Public kernel circuit public inputs.
 */
export function makeRollupKernelCircuitPublicInputs(
  seed = 1,
  fullAccumulatedData = true,
): RollupKernelCircuitPublicInputs {
  return new RollupKernelCircuitPublicInputs(
    makeAggregationObject(seed),
    makeCombinedAccumulatedData(seed, fullAccumulatedData),
    makeConstantData(seed + 0x100),
  );
}
/**
 * Creates arbitrary private kernel inner circuit public inputs.
 * @param seed - The seed to use for generating the kernel circuit public inputs.
 * @returns Private kernel circuit public inputs.
 */
export function makePrivateKernelInnerCircuitPublicInputs(
  seed = 1,
  full = true,
): PrivateKernelInnerCircuitPublicInputs {
  return new PrivateKernelInnerCircuitPublicInputs(
    makeAggregationObject(seed),
    fr(seed + 0x100),
    makeCombinedAccumulatedData(seed, full),
    makeConstantData(seed + 0x100),
    true,
  );
}

/**
 * Creates arbitrary private kernel tail circuit public inputs.
 * @param seed - The seed to use for generating the kernel circuit public inputs.
 * @returns Private kernel tail circuit public inputs.
 */
export function makePrivateKernelTailCircuitPublicInputs(seed = 1, full = true): PrivateKernelTailCircuitPublicInputs {
  return new PrivateKernelTailCircuitPublicInputs(
    makeAggregationObject(seed),
    makeAccumulatedNonRevertibleData(seed + 0x100, full),
    makeFinalAccumulatedData(seed + 0x200, full),
    makeConstantData(seed + 0x300),
    true,
    true,
    true,
  );
}

/**
 * Creates a public call request for testing.
 * @param seed - The seed.
 * @returns Public call request.
 */
export function makePublicCallRequest(seed = 1): PublicCallRequest {
  const childCallContext = makeCallContext(seed + 0x2, makeAztecAddress(seed));
  const parentCallContext = CallContext.from({
    msgSender: makeAztecAddress(seed + 0x3),
    storageContractAddress: childCallContext.msgSender,
    portalContractAddress: makeEthAddress(seed + 2),
    functionSelector: makeSelector(seed + 3),
    isStaticCall: false,
    isDelegateCall: false,
    sideEffectCounter: 0,
  });
  return new PublicCallRequest(
    makeAztecAddress(seed),
    new FunctionData(makeSelector(seed + 0x1), false, false, false),
    childCallContext,
    parentCallContext,
    makeTuple(ARGS_LENGTH, fr, seed + 0x10),
  );
}

/**
 * Creates a uint8 vector of a given size filled with a given value.
 * @param size - The size of the vector.
 * @param fill - The value to fill the vector with.
 * @returns A uint8 vector.
 */
export function makeDynamicSizeBuffer(size: number, fill: number) {
  return new Proof(Buffer.alloc(size, fill));
}

/**
 * Creates arbitrary/mocked membership witness where the sibling paths is an array of fields in an ascending order starting from `start`.
 * @param size - The size of the membership witness.
 * @param start - The start of the membership witness.
 * @returns A membership witness.
 */
export function makeMembershipWitness<N extends number>(size: N, start: number): MembershipWitness<N> {
  return new MembershipWitness(size, BigInt(start), makeTuple(size, fr, start));
}

/**
 * Creates arbitrary/mocked membership witness where the sibling paths is an array of fields in an ascending order starting from `start`.
 * @param start - The start of the membership witness.
 * @returns A non-transient read request membership witness.
 */
export function makeNoteHashReadRequestMembershipWitness(start: number): NoteHashReadRequestMembershipWitness {
  return new NoteHashReadRequestMembershipWitness(
    new Fr(start),
    makeTuple(NOTE_HASH_TREE_HEIGHT, fr, start + 1),
    false,
    new Fr(0),
  );
}

/**
 * Creates empty membership witness where the sibling paths is an array of fields filled with zeros.
 * @param start - The start of the membership witness.
 * @returns Non-transient empty read request membership witness.
 */
export function makeEmptyNoteHashReadRequestMembershipWitness(): NoteHashReadRequestMembershipWitness {
  return new NoteHashReadRequestMembershipWitness(
    new Fr(0),
    makeTuple(NOTE_HASH_TREE_HEIGHT, Fr.zero),
    false,
    new Fr(0),
  );
}

/**
 * Creates arbitrary/mocked verification key.
 * @returns A verification key.
 */
export function makeVerificationKey(): VerificationKey {
  return new VerificationKey(
    CircuitType.STANDARD,
    101, // arbitrary
    102, // arbitrary
    {
      A: new G1AffineElement(new Fq(0x200), new Fq(0x300)),
    },
    /* recursive proof */ true,
    range(5, 400),
  );
}

/**
 * Creates an arbitrary point in a curve.
 * @param seed - Seed to generate the point values.
 * @returns A point.
 */
export function makePoint(seed = 1): Point {
  return new Point(fr(seed), fr(seed + 1));
}

/**
 * Creates an arbitrary grumpkin private key.
 * @param seed - Seed to generate the values.
 * @returns A GrumpkinPrivateKey.
 */
export function makeGrumpkinPrivateKey(seed = 1): GrumpkinPrivateKey {
  return GrumpkinScalar.fromHighLow(fr(seed), fr(seed + 1));
}

/**
 * Makes arbitrary public kernel data.
 * @param seed - The seed to use for generating the previous kernel data.
 * @param kernelPublicInputs - The public kernel public inputs to use for generating the public kernel data.
 * @returns A previous kernel data.
 */
export function makePublicKernelData(seed = 1, kernelPublicInputs?: PublicKernelCircuitPublicInputs): PublicKernelData {
  return new PublicKernelData(
    kernelPublicInputs ?? makePublicKernelCircuitPublicInputs(seed, true),
    new Proof(Buffer.alloc(16, seed + 0x80)),
    makeVerificationKey(),
    0x42,
    makeTuple(VK_TREE_HEIGHT, fr, 0x1000),
  );
}

/**
 * Makes arbitrary public kernel data.
 * @param seed - The seed to use for generating the previous kernel data.
 * @param kernelPublicInputs - The public kernel public inputs to use for generating the public kernel data.
 * @returns A previous kernel data.
 */
export function makeRollupKernelData(seed = 1, kernelPublicInputs?: RollupKernelCircuitPublicInputs): RollupKernelData {
  return new RollupKernelData(
    kernelPublicInputs ?? makeRollupKernelCircuitPublicInputs(seed, true),
    new Proof(Buffer.alloc(16, seed + 0x80)),
    makeVerificationKey(),
    0x42,
    makeTuple(VK_TREE_HEIGHT, fr, 0x1000),
  );
}

/**
 * Makes arbitrary previous kernel data.
 * @param seed - The seed to use for generating the previous kernel data.
 * @param inputs - The kernel public inputs to use for generating the private kernel inner data.
 * @returns A previous kernel data.
 */
export function makePrivateKernelInnerData(
  seed = 1,
  inputs?: PrivateKernelInnerCircuitPublicInputs,
): PrivateKernelInnerData {
  return new PrivateKernelInnerData(
    inputs ?? makePrivateKernelInnerCircuitPublicInputs(seed, true),
    new Proof(Buffer.alloc(16, seed + 0x80)),
    makeVerificationKey(),
    0x42,
    makeTuple(VK_TREE_HEIGHT, fr, 0x1000),
  );
}

/**
 * Makes arbitrary proof.
 * @param seed - The seed to use for generating/mocking the proof.
 * @returns A proof.
 */
export function makeProof(seed = 1) {
  return makeDynamicSizeBuffer(16, seed);
}

/**
 * Makes arbitrary private kernel init private inputs
 * @param seed - The seed to use for generating the private kernel inputs.
 * @returns Private kernel init private inputs.
 */
export function makePrivateKernelInitCircuitPrivateInputs(seed = 1): PrivateKernelInitCircuitPrivateInputs {
  return new PrivateKernelInitCircuitPrivateInputs(makeTxRequest(seed), makePrivateCallData(seed + 0x1000));
}

/**
 * Makes arbitrary private kernel inner private inputs
 * @param seed - The seed to use for generating the private kernel inputs.
 * @returns Private kernel inner private inputs.
 */
export function makePrivateKernelInnerCircuitPrivateInputs(seed = 1): PrivateKernelInnerCircuitPrivateInputs {
  return new PrivateKernelInnerCircuitPrivateInputs(
    makePrivateKernelInnerData(seed),
    makePrivateCallData(seed + 0x1000),
  );
}

/**
 * Makes arbitrary call stack item.
 * @param seed - The seed to use for generating the call stack item.
 * @returns A call stack item.
 */
export function makeCallerContext(seed = 1): CallerContext {
  return new CallerContext(makeAztecAddress(seed), makeAztecAddress(seed + 0x1));
}

/**
 * Makes arbitrary call stack item.
 * @param seed - The seed to use for generating the call stack item.
 * @returns A call stack item.
 */
export function makeCallRequest(seed = 1): CallRequest {
  return new CallRequest(fr(seed), makeAztecAddress(seed + 0x1), makeCallerContext(seed + 0x2), fr(0), fr(0));
}

/**
 * Makes arbitrary public call stack item.
 * @param seed - The seed to use for generating the public call stack item.
 * @returns A public call stack item.
 */
export function makePublicCallStackItem(seed = 1, full = false): PublicCallStackItem {
  const callStackItem = new PublicCallStackItem(
    makeAztecAddress(seed),
    // in the public kernel, function can't be a constructor or private
    new FunctionData(makeSelector(seed + 0x1), false, false, false),
    makePublicCircuitPublicInputs(seed + 0x10, undefined, full),
    false,
  );
  callStackItem.publicInputs.callContext.storageContractAddress = callStackItem.contractAddress;
  return callStackItem;
}

/**
 * Makes arbitrary public call data.
 * @param seed - The seed to use for generating the public call data.
 * @returns A public call data.
 */
export function makePublicCallData(seed = 1, full = false): PublicCallData {
  const publicCallData = new PublicCallData(
    makePublicCallStackItem(seed, full),
    makeTuple(MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL, makeCallRequest, seed + 0x300),
    makeProof(),
    fr(seed + 1),
    fr(seed + 2),
  );

  return publicCallData;
}

/**
 * Makes arbitrary public kernel inputs.
 * @param seed - The seed to use for generating the public kernel inputs.
 * @returns Public kernel inputs.
 */
export function makePublicKernelCircuitPrivateInputs(seed = 1): PublicKernelCircuitPrivateInputs {
  return new PublicKernelCircuitPrivateInputs(makePublicKernelData(seed), makePublicCallData(seed + 0x1000));
}

/**
 * Makes arbitrary public kernel private inputs.
 * @param seed - The seed to use for generating the public kernel inputs.
 * @param tweak - An optional function to tweak the output before computing hashes.
 * @returns Public kernel inputs.
 */
export function makePublicKernelInputsWithTweak(
  seed = 1,
  tweak?: (publicKernelInputs: PublicKernelCircuitPrivateInputs) => void,
): PublicKernelCircuitPrivateInputs {
  const kernelCircuitPublicInputs = makePublicKernelCircuitPublicInputs(seed, false);
  const previousKernel = makePublicKernelData(seed, kernelCircuitPublicInputs);
  const publicCall = makePublicCallData(seed + 0x1000);
  const publicKernelInputs = new PublicKernelCircuitPrivateInputs(previousKernel, publicCall);
  if (tweak) {
    tweak(publicKernelInputs);
  }
  // Set the call stack item for this circuit iteration at the top of the call stack
  publicKernelInputs.previousKernel.publicInputs.end.publicCallStack[MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX - 1] =
    new CallRequest(
      publicCall.callStackItem.hash(),
      publicCall.callStackItem.publicInputs.callContext.msgSender,
      makeCallerContext(seed + 0x100),
      Fr.ZERO,
      Fr.ZERO,
    );
  return publicKernelInputs;
}

/**
 * Makes arbitrary tx request.
 * @param seed - The seed to use for generating the tx request.
 * @returns A tx request.
 */
export function makeTxRequest(seed = 1): TxRequest {
  return TxRequest.from({
    origin: makeAztecAddress(seed),
    functionData: new FunctionData(makeSelector(seed + 0x100), false, true, true),
    argsHash: fr(seed + 0x200),
    txContext: makeTxContext(seed + 0x400),
  });
}

/**
 * Makes arbitrary private call data.
 * @param seed - The seed to use for generating the private call data.
 * @returns A private call data.
 */
export function makePrivateCallData(seed = 1): PrivateCallData {
  return PrivateCallData.from({
    callStackItem: makePrivateCallStackItem(seed),
    privateCallStack: makeTuple(MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, makeCallRequest, seed + 0x10),
    publicCallStack: makeTuple(MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL, makeCallRequest, seed + 0x20),
    proof: new Proof(Buffer.alloc(16).fill(seed + 0x50)),
    vk: makeVerificationKey(),
    contractClassArtifactHash: fr(seed + 0x70),
    contractClassPublicBytecodeCommitment: fr(seed + 0x71),
    publicKeysHash: fr(seed + 0x72),
    saltedInitializationHash: fr(seed + 0x73),
    functionLeafMembershipWitness: makeMembershipWitness(FUNCTION_TREE_HEIGHT, seed + 0x30),
    noteHashReadRequestMembershipWitnesses: makeTuple(
      MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
      makeNoteHashReadRequestMembershipWitness,
      seed + 0x70,
    ),
    portalContractAddress: makeEthAddress(seed + 0x40).toField(),
    acirHash: fr(seed + 0x60),
  });
}

/**
 * Makes arbitrary private call stack item.
 * @param seed - The seed to use for generating the private call stack item.
 * @returns A private call stack item.
 */
export function makePrivateCallStackItem(seed = 1): PrivateCallStackItem {
  return new PrivateCallStackItem(
    makeAztecAddress(seed),
    new FunctionData(makeSelector(seed + 0x1), false, true, true),
    makePrivateCircuitPublicInputs(seed + 0x10),
  );
}

/**
 * Makes arbitrary private circuit public inputs.
 * @param seed - The seed to use for generating the private circuit public inputs.
 * @returns A private circuit public inputs.
 */
export function makePrivateCircuitPublicInputs(seed = 0): PrivateCircuitPublicInputs {
  return PrivateCircuitPublicInputs.from({
    callContext: new CallContext(
      makeAztecAddress(seed + 1),
      makeAztecAddress(seed + 2),
      new EthAddress(numToUInt32BE(seed + 3, /* eth address is 20 bytes */ 20)),
      makeSelector(seed + 4),
      true,
      true,
      0,
    ),
    argsHash: fr(seed + 0x100),
    returnValues: makeTuple(RETURN_VALUES_LENGTH, fr, seed + 0x200),
    minRevertibleSideEffectCounter: fr(0),
    noteHashReadRequests: makeTuple(MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, sideEffectFromNumber, seed + 0x300),
    nullifierReadRequests: makeTuple(MAX_NULLIFIER_READ_REQUESTS_PER_CALL, makeReadRequest, seed + 0x310),
    nullifierKeyValidationRequests: makeTuple(
      MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_CALL,
      makeNullifierKeyValidationRequest,
      seed + 0x320,
    ),
    newNoteHashes: makeTuple(MAX_NEW_NOTE_HASHES_PER_CALL, sideEffectFromNumber, seed + 0x400),
    newNullifiers: makeTuple(MAX_NEW_NULLIFIERS_PER_CALL, sideEffectLinkedFromNumber, seed + 0x500),
    privateCallStackHashes: makeTuple(MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, fr, seed + 0x600),
    publicCallStackHashes: makeTuple(MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL, fr, seed + 0x700),
    newL2ToL1Msgs: makeTuple(MAX_NEW_L2_TO_L1_MSGS_PER_CALL, makeL2ToL1Message, seed + 0x800),
    startSideEffectCounter: fr(seed + 0x849),
    endSideEffectCounter: fr(seed + 0x850),
    encryptedLogsHash: makeTuple(NUM_FIELDS_PER_SHA256, fr, seed + 0x900),
    unencryptedLogsHash: makeTuple(NUM_FIELDS_PER_SHA256, fr, seed + 0xa00),
    encryptedLogPreimagesLength: fr(seed + 0xb00),
    unencryptedLogPreimagesLength: fr(seed + 0xc00),
    historicalHeader: makeHeader(seed + 0xd00, undefined),
    chainId: fr(seed + 0x1400),
    version: fr(seed + 0x1500),
  });
}

/**
 * Makes global variables.
 * @param seed - The seed to use for generating the global variables.
 * @param blockNumber - The block number to use for generating the global variables.
 * If blockNumber is undefined, it will be set to seed + 2.
 * @returns Global variables.
 */
export function makeGlobalVariables(seed = 1, blockNumber: number | undefined = undefined): GlobalVariables {
  if (blockNumber !== undefined) {
    return new GlobalVariables(
      fr(seed),
      fr(seed + 1),
      fr(blockNumber),
      fr(seed + 3),
      EthAddress.fromField(fr(seed + 4)),
      AztecAddress.fromField(fr(seed + 5)),
    );
  }
  return new GlobalVariables(
    fr(seed),
    fr(seed + 1),
    fr(seed + 2),
    fr(seed + 3),
    EthAddress.fromField(fr(seed + 4)),
    AztecAddress.fromField(fr(seed + 5)),
  );
}

/**
 * Makes constant base rollup data.
 * @param seed - The seed to use for generating the constant base rollup data.
 * @param blockNumber - The block number to use for generating the global variables.
 * @returns A constant base rollup data.
 */
export function makeConstantBaseRollupData(
  seed = 1,
  globalVariables: GlobalVariables | undefined = undefined,
): ConstantRollupData {
  return ConstantRollupData.from({
    lastArchive: makeAppendOnlyTreeSnapshot(seed + 0x300),
    privateKernelVkTreeRoot: fr(seed + 0x401),
    publicKernelVkTreeRoot: fr(seed + 0x402),
    baseRollupVkHash: fr(seed + 0x403),
    mergeRollupVkHash: fr(seed + 0x404),
    globalVariables: globalVariables ?? makeGlobalVariables(seed + 0x405),
  });
}

/**
 * Makes arbitrary append only tree snapshot.
 * @param seed - The seed to use for generating the append only tree snapshot.
 * @returns An append only tree snapshot.
 */
export function makeAppendOnlyTreeSnapshot(seed = 1): AppendOnlyTreeSnapshot {
  return new AppendOnlyTreeSnapshot(fr(seed), seed);
}

/**
 * Makes arbitrary eth address.
 * @param seed - The seed to use for generating the eth address.
 * @returns An eth address.
 */
export function makeEthAddress(seed = 1): EthAddress {
  return EthAddress.fromField(fr(seed));
}

/**
 * Creates a buffer of a given size filled with a given value.
 * @param size - The size of the buffer to create.
 * @param fill - The value to fill the buffer with.
 * @returns A buffer of a given size filled with a given value.
 */
export function makeBytes(size = 32, fill = 1): Buffer {
  return Buffer.alloc(size, fill);
}

/**
 * Makes arbitrary aztec address.
 * @param seed - The seed to use for generating the aztec address.
 * @returns An aztec address.
 */
export function makeAztecAddress(seed = 1): AztecAddress {
  return AztecAddress.fromField(fr(seed));
}

/**
 * Makes arbitrary Schnorr signature.
 * @param seed - The seed to use for generating the Schnorr signature.
 * @returns A Schnorr signature.
 */
export function makeSchnorrSignature(seed = 1): SchnorrSignature {
  return new SchnorrSignature(Buffer.alloc(SchnorrSignature.SIZE, seed));
}

/**
 * Makes arbitrary base or merge rollup circuit public inputs.
 * @param seed - The seed to use for generating the base rollup circuit public inputs.
 * @param blockNumber - The block number to use for generating the base rollup circuit public inputs.
 * @returns A base or merge rollup circuit public inputs.
 */
export function makeBaseOrMergeRollupPublicInputs(
  seed = 0,
  globalVariables: GlobalVariables | undefined = undefined,
): BaseOrMergeRollupPublicInputs {
  return new BaseOrMergeRollupPublicInputs(
    RollupTypes.Base,
    new Fr(0n),
    makeAggregationObject(seed + 0x100),
    makeConstantBaseRollupData(seed + 0x200, globalVariables),
    makePartialStateReference(seed + 0x300),
    makePartialStateReference(seed + 0x400),
    [fr(seed + 0x901), fr(seed + 0x902)],
    [fr(seed + 0x903), fr(seed + 0x904)],
  );
}

/**
 * Makes arbitrary previous rollup data.
 * @param seed - The seed to use for generating the previous rollup data.
 * @param globalVariables - The global variables to use when generating the previous rollup data.
 * @returns A previous rollup data.
 */
export function makePreviousRollupData(
  seed = 0,
  globalVariables: GlobalVariables | undefined = undefined,
): PreviousRollupData {
  return new PreviousRollupData(
    makeBaseOrMergeRollupPublicInputs(seed, globalVariables),
    makeDynamicSizeBuffer(16, seed + 0x50),
    makeVerificationKey(),
    seed + 0x110,
    makeMembershipWitness(ROLLUP_VK_TREE_HEIGHT, seed + 0x120),
  );
}

/**
 * Makes root rollup inputs.
 * @param seed - The seed to use for generating the root rollup inputs.
 * @param blockNumber - The block number to use for generating the root rollup inputs.
 * @returns A root rollup inputs.
 */
export function makeRootRollupInputs(seed = 0, globalVariables?: GlobalVariables): RootRollupInputs {
  return new RootRollupInputs(
    [makePreviousRollupData(seed, globalVariables), makePreviousRollupData(seed + 0x1000, globalVariables)],
    makeRootParityInput(seed + 0x2000),
    makeTuple(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, fr, 0x2100),
    makeTuple(L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH, fr, 0x2100),
    makeAppendOnlyTreeSnapshot(seed + 0x2200),
    makeAppendOnlyTreeSnapshot(seed + 0x2200),
    makeTuple(ARCHIVE_HEIGHT, fr, 0x2400),
  );
}

export function makeRootParityInput(seed = 0): RootParityInput {
  return new RootParityInput(makeProof(seed), makeParityPublicInputs(seed + 0x100));
}

export function makeParityPublicInputs(seed = 0): ParityPublicInputs {
  return new ParityPublicInputs(
    makeAggregationObject(seed),
    toBufferBE(BigInt(seed + 0x200), 32),
    new Fr(BigInt(seed + 0x300)),
  );
}

export function makeBaseParityInputs(seed = 0): BaseParityInputs {
  return new BaseParityInputs(makeTuple(NUM_MSGS_PER_BASE_PARITY, fr, seed + 0x3000));
}

export function makeRootParityInputs(seed = 0): RootParityInputs {
  return new RootParityInputs(makeTuple(NUM_BASE_PARITY_PER_ROOT_PARITY, makeRootParityInput, seed + 0x4000));
}

/**
 * Makes root rollup public inputs.
 * @param seed - The seed to use for generating the root rollup public inputs.
 * @param blockNumber - The block number to use in the global variables of a header.
 * @returns A root rollup public inputs.
 */
export function makeRootRollupPublicInputs(
  seed = 0,
  blockNumber: number | undefined = undefined,
): RootRollupPublicInputs {
  return RootRollupPublicInputs.from({
    aggregationObject: makeAggregationObject(seed),
    archive: makeAppendOnlyTreeSnapshot(seed + 0x100),
    header: makeHeader(seed + 0x200, blockNumber),
    l1ToL2MessagesHash: [new Fr(3n), new Fr(4n)],
  });
}

/**
 * Makes content commitment
 */
export function makeContentCommitment(seed = 0, txsEffectsHash: Buffer | undefined = undefined): ContentCommitment {
  return new ContentCommitment(
    new Fr(seed),
    txsEffectsHash ?? toBufferBE(BigInt(seed + 0x100), NUM_BYTES_PER_SHA256),
    toBufferBE(BigInt(seed + 0x200), NUM_BYTES_PER_SHA256),
    toBufferBE(BigInt(seed + 0x300), NUM_BYTES_PER_SHA256),
  );
}

/**
 * Makes header.
 */
export function makeHeader(
  seed = 0,
  blockNumber: number | undefined = undefined,
  txsEffectsHash: Buffer | undefined = undefined,
): Header {
  return new Header(
    makeAppendOnlyTreeSnapshot(seed + 0x100),
    makeContentCommitment(seed + 0x200, txsEffectsHash),
    makeStateReference(seed + 0x600),
    makeGlobalVariables((seed += 0x700), blockNumber),
  );
}

/**
 * Makes arbitrary state reference.
 * @param seed - The seed to use for generating the state reference.
 * @returns A state reference.
 */
export function makeStateReference(seed = 0): StateReference {
  return new StateReference(makeAppendOnlyTreeSnapshot(seed), makePartialStateReference(seed + 1));
}

/**
 * Makes arbitrary L2 to L1 message.
 * @param seed - The seed to use for generating the state reference.
 * @returns L2 to L1 message.
 */
export function makeL2ToL1Message(seed = 0): L2ToL1Message {
  const recipient = EthAddress.fromField(new Fr(seed));
  const content = new Fr(seed + 1);

  return new L2ToL1Message(recipient, content);
}

/**
 * Makes arbitrary partial state reference.
 * @param seed - The seed to use for generating the partial state reference.
 * @returns A partial state reference.
 */
export function makePartialStateReference(seed = 0): PartialStateReference {
  return new PartialStateReference(
    makeAppendOnlyTreeSnapshot(seed),
    makeAppendOnlyTreeSnapshot(seed + 1),
    makeAppendOnlyTreeSnapshot(seed + 2),
  );
}

/**
 * Makes arbitrary merge rollup inputs.
 * @param seed - The seed to use for generating the merge rollup inputs.
 * @returns A merge rollup inputs.
 */
export function makeMergeRollupInputs(seed = 0): MergeRollupInputs {
  return new MergeRollupInputs([makePreviousRollupData(seed), makePreviousRollupData(seed + 0x1000)]);
}

/**
 * Makes arbitrary public data tree leaves.
 * @param seed - The seed to use for generating the public data tree leaf.
 * @returns A public data tree leaf.
 */
export function makePublicDataTreeLeaf(seed = 0): PublicDataTreeLeaf {
  return new PublicDataTreeLeaf(new Fr(seed), new Fr(seed + 1));
}

/**
 * Makes arbitrary public data tree leaf preimages.
 * @param seed - The seed to use for generating the public data tree leaf preimage.
 * @returns A public data tree leaf preimage.
 */
export function makePublicDataTreeLeafPreimage(seed = 0): PublicDataTreeLeafPreimage {
  return new PublicDataTreeLeafPreimage(new Fr(seed), new Fr(seed + 1), new Fr(seed + 2), BigInt(seed + 3));
}

/**
 * Creates an instance of StateDiffHints with arbitrary values based on the provided seed.
 * @param seed - The seed to use for generating the hints.
 * @returns A StateDiffHints object.
 */
export function makeStateDiffHints(seed = 1): StateDiffHints {
  const nullifierPredecessorPreimages = makeTuple(
    MAX_NEW_NULLIFIERS_PER_TX,
    x => new NullifierLeafPreimage(fr(x), fr(x + 0x100), BigInt(x + 0x200)),
    seed + 0x1000,
  );

  const nullifierPredecessorMembershipWitnesses = makeTuple(
    MAX_NEW_NULLIFIERS_PER_TX,
    x => makeMembershipWitness(NULLIFIER_TREE_HEIGHT, x),
    seed + 0x2000,
  );

  const sortedNullifiers = makeTuple(MAX_NEW_NULLIFIERS_PER_TX, fr, seed + 0x3000);

  const sortedNullifierIndexes = makeTuple(MAX_NEW_NULLIFIERS_PER_TX, i => i, seed + 0x4000);

  const noteHashSubtreeSiblingPath = makeTuple(NOTE_HASH_SUBTREE_SIBLING_PATH_LENGTH, fr, seed + 0x5000);

  const nullifierSubtreeSiblingPath = makeTuple(NULLIFIER_SUBTREE_SIBLING_PATH_LENGTH, fr, seed + 0x6000);

  const publicDataSiblingPath = makeTuple(PUBLIC_DATA_SUBTREE_SIBLING_PATH_LENGTH, fr, 0x8000);

  return new StateDiffHints(
    nullifierPredecessorPreimages,
    nullifierPredecessorMembershipWitnesses,
    sortedNullifiers,
    sortedNullifierIndexes,
    noteHashSubtreeSiblingPath,
    nullifierSubtreeSiblingPath,
    publicDataSiblingPath,
  );
}

/**
 * Makes arbitrary base rollup inputs.
 * @param seed - The seed to use for generating the base rollup inputs.
 * @returns A base rollup inputs.
 */
export function makeBaseRollupInputs(seed = 0): BaseRollupInputs {
  const kernelData = makeRollupKernelData(seed);

  const start = makePartialStateReference(seed + 0x100);

  const stateDiffHints = makeStateDiffHints(seed + 0x600);

  const sortedPublicDataWrites = makeTuple(
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    makePublicDataTreeLeaf,
    seed + 0x8000,
  );

  const sortedPublicDataWritesIndexes = makeTuple(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, i => i, 0);

  const lowPublicDataWritesPreimages = makeTuple(
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    makePublicDataTreeLeafPreimage,
    seed + 0x8200,
  );

  const lowPublicDataWritesMembershipWitnesses = makeTuple(
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
    i => makeMembershipWitness(PUBLIC_DATA_TREE_HEIGHT, i),
    seed + 0x8400,
  );

  const publicDataReadsPreimages = makeTuple(
    MAX_PUBLIC_DATA_READS_PER_TX,
    makePublicDataTreeLeafPreimage,
    seed + 0x8800,
  );

  const publicDataReadsMembershipWitnesses = makeTuple(
    MAX_PUBLIC_DATA_READS_PER_TX,
    i => makeMembershipWitness(PUBLIC_DATA_TREE_HEIGHT, i),
    seed + 0x8a00,
  );

  const archiveRootMembershipWitness = makeMembershipWitness(ARCHIVE_HEIGHT, seed + 0x9000);

  const constants = makeConstantBaseRollupData(0x100);

  return BaseRollupInputs.from({
    kernelData,
    start,
    stateDiffHints,
    sortedPublicDataWrites,
    sortedPublicDataWritesIndexes,
    lowPublicDataWritesPreimages,
    lowPublicDataWritesMembershipWitnesses,
    publicDataReadsPreimages,
    publicDataReadsMembershipWitnesses,
    archiveRootMembershipWitness,
    constants,
  });
}

export function makeContractClassPublic(seed = 0): ContractClassPublic {
  const artifactHash = fr(seed + 1);
  const publicFunctions = makeTuple(3, makeContractClassPublicFunction, seed + 2);
  const privateFunctionsRoot = fr(seed + 3);
  const packedBytecode = packBytecode(publicFunctions);
  const publicBytecodeCommitment = computePublicBytecodeCommitment(packedBytecode);
  const id = computeContractClassId({ artifactHash, privateFunctionsRoot, publicBytecodeCommitment });
  return {
    id,
    artifactHash,
    packedBytecode,
    privateFunctionsRoot,
    publicFunctions,
    version: 1,
  };
}

function makeContractClassPublicFunction(seed = 0): PublicFunction {
  return {
    selector: FunctionSelector.fromField(fr(seed + 1)),
    bytecode: makeBytes(100, seed + 2),
    isInternal: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function makeContractClassPrivateFunction(seed = 0): PrivateFunction {
  return {
    selector: FunctionSelector.fromField(fr(seed + 1)),
    vkHash: fr(seed + 2),
    isInternal: false,
  };
}

/**
 * TODO: Since the max value check is currently disabled this function is pointless. Should it be removed?
 * Test only. Easy to identify big endian field serialize.
 * @param n - The number.
 * @returns The field.
 */
export function fr(n: number): Fr {
  return new Fr(BigInt(n));
}

/**
 * Test only. Easy to identify big endian side-effect serialize.
 * @param n - The number.
 * @returns The SideEffect instance.
 */
export function sideEffectFromNumber(n: number): SideEffect {
  return new SideEffect(new Fr(BigInt(n)), Fr.zero());
}

/**
 * Test only. Easy to identify big endian side-effect serialize.
 * @param n - The number.
 * @returns The SideEffect instance.
 */
export function sideEffectLinkedFromNumber(n: number): SideEffectLinkedToNoteHash {
  return new SideEffectLinkedToNoteHash(new Fr(BigInt(n)), Fr.zero(), Fr.zero());
}
