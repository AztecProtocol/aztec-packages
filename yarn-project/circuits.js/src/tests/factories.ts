import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { mapTuple, numToUInt32BE } from '@aztec/foundation/serialize';

import { randomBytes } from 'crypto';

import { computeCallStackItemHash, computeContractAddressFromPartial } from '../abis/abis.js';
import { Grumpkin, SchnorrSignature } from '../barretenberg/index.js';
import {
  ARGS_LENGTH,
  AggregationObject,
  AppendOnlyTreeSnapshot,
  BaseOrMergeRollupPublicInputs,
  BaseRollupInputs,
  CONTRACT_TREE_HEIGHT,
  CONTRACT_TREE_ROOTS_TREE_HEIGHT,
  CallContext,
  CircuitType,
  CircuitsWasm,
  CombinedAccumulatedData,
  CombinedConstantData,
  CombinedHistoricTreeRoots,
  ConstantBaseRollupData,
  ContractDeploymentData,
  ContractStorageRead,
  ContractStorageUpdateRequest,
  FUNCTION_TREE_HEIGHT,
  Fq,
  Fr,
  FunctionData,
  G1AffineElement,
  KernelCircuitPublicInputs,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  L1_TO_L2_MSG_TREE_ROOTS_TREE_HEIGHT,
  MAX_NEW_COMMITMENTS_PER_CALL,
  MAX_NEW_COMMITMENTS_PER_TX,
  MAX_NEW_CONTRACTS_PER_TX,
  MAX_NEW_L2_TO_L1_MSGS_PER_CALL,
  MAX_NEW_L2_TO_L1_MSGS_PER_TX,
  MAX_NEW_NULLIFIERS_PER_CALL,
  MAX_NEW_NULLIFIERS_PER_TX,
  MAX_OPTIONALLY_REVEALED_DATA_LENGTH_PER_TX,
  MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL,
  MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
  MAX_PUBLIC_DATA_READS_PER_CALL,
  MAX_PUBLIC_DATA_READS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_READ_REQUESTS_PER_CALL,
  MAX_READ_REQUESTS_PER_TX,
  MembershipWitness,
  MergeRollupInputs,
  NULLIFIER_TREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_FIELDS_PER_SHA256,
  NewContractData,
  NullifierLeafPreimage,
  OptionallyRevealedData,
  PRIVATE_DATA_TREE_HEIGHT,
  PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
  Point,
  PreviousKernelData,
  PreviousRollupData,
  PrivateCallData,
  PrivateCallStackItem,
  PrivateCircuitPublicInputs,
  PrivateHistoricTreeRoots,
  PrivateKernelInputsInit,
  PrivateKernelInputsInner,
  Proof,
  PublicCallData,
  PublicCallRequest,
  PublicCallStackItem,
  PublicCircuitPublicInputs,
  PublicDataRead,
  PublicDataUpdateRequest,
  PublicKernelInputs,
  RETURN_VALUES_LENGTH,
  ROLLUP_VK_TREE_HEIGHT,
  ReadRequestMembershipWitness,
  RollupTypes,
  RootRollupInputs,
  RootRollupPublicInputs,
  TxContext,
  TxRequest,
  VK_TREE_HEIGHT,
  VerificationKey,
  WitnessedPublicCallData,
  makeHalfFullTuple,
  makeTuple,
  range,
} from '../index.js';
import { GlobalVariables } from '../structs/global_variables.js';

/**
 * Creates an arbitrary tx context with the given seed.
 * @param seed - The seed to use for generating the tx context.
 * @returns A tx context.
 */
export function makeTxContext(seed: number): TxContext {
  // @todo @LHerskind should probably take value for chainId as it will be verified later.
  // @todo @LHerskind should probably take value for version as it will be verified later.
  return new TxContext(false, false, true, makeContractDeploymentData(seed), Fr.ZERO, Fr.ZERO);
}

/**
 * Creates an arbitrary private historic tree roots object with the given seed.
 * @param seed - The seed to use for generating the private historic tree roots.
 * @returns A private historic tree roots object.
 */
export function makePrivateHistoricTreeRoots(seed: number): PrivateHistoricTreeRoots {
  return new PrivateHistoricTreeRoots(fr(seed), fr(seed + 1), fr(seed + 2), fr(seed + 3), fr(seed + 4));
}

/**
 * Creates an arbitrary combined historic tree roots object from the given seed.
 * Note: "Combined" indicates that it's the combined output of both private and public circuit flows.
 * @param seed - The seed to use for generating the combined historic tree roots.
 * @returns A combined historic tree roots object.
 */
export function makeCombinedHistoricTreeRoots(seed: number): CombinedHistoricTreeRoots {
  return new CombinedHistoricTreeRoots(makePrivateHistoricTreeRoots(seed));
}

/**
 * Creates arbitrary constant data with the given seed.
 * @param seed - The seed to use for generating the constant data.
 * @returns A constant data object.
 */
export function makeConstantData(seed = 1): CombinedConstantData {
  return new CombinedConstantData(makeCombinedHistoricTreeRoots(seed), makeTxContext(seed + 4));
}

/**
 * Creates arbitrary selector from the given seed.
 * @param seed - The seed to use for generating the selector.
 * @returns A selector.
 */
export function makeSelector(seed: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(seed, 0);
  return buffer;
}

/**
 * Creates arbitrary public data update request.
 * @param seed - The seed to use for generating the public data update request.
 * @returns A public data update request.
 */
export function makePublicDataUpdateRequest(seed = 1): PublicDataUpdateRequest {
  return new PublicDataUpdateRequest(fr(seed), fr(seed + 1), fr(seed + 2));
}

/**
 * Creates empty public data update request.
 * @returns An empty public data update request.
 */
export function makeEmptyPublicDataUpdateRequest(): PublicDataUpdateRequest {
  return new PublicDataUpdateRequest(fr(0), fr(0), fr(0));
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
  return new ContractStorageUpdateRequest(fr(seed), fr(seed + 1), fr(seed + 2));
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
 * Creates empty accumulated data.
 * @param seed - The seed to use for generating the accumulated data.
 * @returns An empty accumulated data.
 */
export function makeEmptyAccumulatedData(seed = 1, full = false): CombinedAccumulatedData {
  const tupleGenerator = full ? makeTuple : makeHalfFullTuple;

  return new CombinedAccumulatedData(
    makeAggregationObject(seed),
    tupleGenerator(MAX_READ_REQUESTS_PER_TX, fr, seed + 0x80),
    tupleGenerator(MAX_READ_REQUESTS_PER_TX, i => makeReadRequestMembershipWitness(i * 123), seed + 0x90),
    tupleGenerator(MAX_NEW_COMMITMENTS_PER_TX, fr, seed + 0x100),
    tupleGenerator(MAX_NEW_NULLIFIERS_PER_TX, fr, seed + 0x200),
    tupleGenerator(MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX, Fr.zero), // private call stack must be empty
    tupleGenerator(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, fr, seed + 0x400),
    tupleGenerator(MAX_NEW_L2_TO_L1_MSGS_PER_TX, fr, seed + 0x500),
    tupleGenerator(2, fr, seed + 0x600), // encrypted logs hash
    tupleGenerator(2, fr, seed + 0x700), // unencrypted logs hash
    fr(seed + 0x800), // encrypted_log_preimages_length
    fr(seed + 0x900), // unencrypted_log_preimages_length
    tupleGenerator(MAX_NEW_CONTRACTS_PER_TX, makeNewContractData, seed + 0xa00),
    tupleGenerator(MAX_OPTIONALLY_REVEALED_DATA_LENGTH_PER_TX, makeOptionallyRevealedData, seed + 0xb00),
    tupleGenerator(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, makeEmptyPublicDataUpdateRequest, seed + 0xc00),
    tupleGenerator(MAX_PUBLIC_DATA_READS_PER_TX, makeEmptyPublicDataRead, seed + 0xd00),
  );
}

/**
 * Creates arbitrary accumulated data.
 * @param seed - The seed to use for generating the accumulated data.
 * @returns An accumulated data.
 */
export function makeAccumulatedData(seed = 1, full = false): CombinedAccumulatedData {
  const tupleGenerator = full ? makeTuple : makeHalfFullTuple;

  return new CombinedAccumulatedData(
    makeAggregationObject(seed),
    tupleGenerator(MAX_READ_REQUESTS_PER_TX, fr, seed + 0x80),
    tupleGenerator(MAX_READ_REQUESTS_PER_TX, i => makeReadRequestMembershipWitness(i * 123), seed + 0x90),
    tupleGenerator(MAX_NEW_COMMITMENTS_PER_TX, fr, seed + 0x100),
    tupleGenerator(MAX_NEW_NULLIFIERS_PER_TX, fr, seed + 0x200),
    tupleGenerator(MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX, fr, seed + 0x300),
    tupleGenerator(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, fr, seed + 0x400),
    tupleGenerator(MAX_NEW_L2_TO_L1_MSGS_PER_TX, fr, seed + 0x500),
    tupleGenerator(2, fr, seed + 0x600), // encrypted logs hash
    tupleGenerator(2, fr, seed + 0x700), // unencrypted logs hash
    fr(seed + 0x800), // encrypted_log_preimages_length
    fr(seed + 0x900), // unencrypted_log_preimages_length
    tupleGenerator(MAX_NEW_CONTRACTS_PER_TX, makeNewContractData, seed + 0xa00),
    tupleGenerator(MAX_OPTIONALLY_REVEALED_DATA_LENGTH_PER_TX, makeOptionallyRevealedData, seed + 0xb00),
    tupleGenerator(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, makePublicDataUpdateRequest, seed + 0xc00),
    tupleGenerator(MAX_PUBLIC_DATA_READS_PER_TX, makePublicDataRead, seed + 0xd00),
  );
}

/**
 * Creates arbitrary contract data.
 * @param seed - The seed to use for generating the contract data.
 * @returns A contract data.
 */
export function makeNewContractData(seed = 1): NewContractData {
  return new NewContractData(makeAztecAddress(seed), makeEthAddress(seed + 1), fr(seed + 2));
}

/**
 * Creates arbitrary optionally revealed data.
 * @param seed - The seed to use for generating the optionally revealed data.
 * @returns An optionally revealed data.
 */
export function makeOptionallyRevealedData(seed = 1): OptionallyRevealedData {
  return new OptionallyRevealedData(
    fr(seed),
    new FunctionData(makeSelector(seed + 1), true, true),
    fr(seed + 2),
    makeEthAddress(seed + 3),
    true,
    false,
    true,
    false,
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
  return new CallContext(makeAztecAddress(seed), storageContractAddress, makeEthAddress(seed + 2), false, false, false);
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
    tupleGenerator(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL, makeContractStorageUpdateRequest, seed + 0x400),
    tupleGenerator(MAX_PUBLIC_DATA_READS_PER_CALL, makeContractStorageRead, seed + 0x500),
    tupleGenerator(MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL, fr, seed + 0x600),
    tupleGenerator(MAX_NEW_COMMITMENTS_PER_CALL, fr, seed + 0x700),
    tupleGenerator(MAX_NEW_NULLIFIERS_PER_CALL, fr, seed + 0x800),
    tupleGenerator(MAX_NEW_L2_TO_L1_MSGS_PER_CALL, fr, seed + 0x900),
    tupleGenerator(2, fr, seed + 0x901),
    fr(seed + 0x902),
    fr(seed + 0xa00),
    makeAztecAddress(seed + 0xb01),
  );
}

/**
 * Creates empty kernel circuit public inputs.
 * @param seed - The seed to use for generating the kernel circuit public inputs.
 * @returns Empty kernel circuit public inputs.
 */
export function makeEmptyKernelPublicInputs(seed = 1): KernelCircuitPublicInputs {
  return new KernelCircuitPublicInputs(makeEmptyAccumulatedData(seed), makeConstantData(seed + 0x100), true);
}

/**
 * Creates arbitrary kernel circuit public inputs.
 * @param seed - The seed to use for generating the kernel circuit public inputs.
 * @returns Kernel circuit public inputs.
 */
export function makeKernelPublicInputs(seed = 1): KernelCircuitPublicInputs {
  return new KernelCircuitPublicInputs(makeAccumulatedData(seed, true), makeConstantData(seed + 0x100), true);
}

/**
 * Creates a public call request for testing.
 * @param seed - The seed.
 * @returns Public call request.
 */
export function makePublicCallRequest(seed = 1): PublicCallRequest {
  return new PublicCallRequest(
    makeAztecAddress(seed),
    new FunctionData(makeSelector(seed + 0x1), false, false),
    makeCallContext(seed + 0x2),
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
export function makeReadRequestMembershipWitness(start: number): ReadRequestMembershipWitness {
  return new ReadRequestMembershipWitness(
    new Fr(start),
    makeTuple(PRIVATE_DATA_TREE_HEIGHT, fr, start + 1),
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
      A: new G1AffineElement(fr(0x200), fr(0x300)),
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
 * Makes arbitrary previous kernel data.
 * @param seed - The seed to use for generating the previous kernel data.
 * @param kernelPublicInputs - The kernel public inputs to use for generating the previous kernel data.
 * @returns A previous kernel data.
 */
export function makePreviousKernelData(seed = 1, kernelPublicInputs?: KernelCircuitPublicInputs): PreviousKernelData {
  return new PreviousKernelData(
    kernelPublicInputs ?? makeKernelPublicInputs(seed),
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
 * Makes arbitrary private kernel inputs - initial call.
 * @param seed - The seed to use for generating the private kernel inputs.
 * @returns Private kernel inputs.
 */
export function makePrivateKernelInputsInit(seed = 1): PrivateKernelInputsInit {
  return new PrivateKernelInputsInit(makeTxRequest(seed), makePrivateCallData(seed + 0x1000));
}

/**
 * Makes arbitrary private kernel inputs - inner call.
 * @param seed - The seed to use for generating the private kernel inputs.
 * @returns Private kernel inputs.
 */
export function makePrivateKernelInputsInner(seed = 1): PrivateKernelInputsInner {
  return new PrivateKernelInputsInner(makePreviousKernelData(seed), makePrivateCallData(seed + 0x1000));
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
    new FunctionData(makeSelector(seed + 0x1), false, false),
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
export async function makePublicCallData(seed = 1, full = false): Promise<PublicCallData> {
  const publicCallData = new PublicCallData(
    makePublicCallStackItem(seed, full),
    makeTuple(MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL, makePublicCallStackItem, seed + 0x300),
    makeProof(),
    fr(seed + 1),
    fr(seed + 2),
  );
  // publicCallStack should be a hash of the preimages:
  const wasm = await CircuitsWasm.get();
  publicCallData.callStackItem.publicInputs.publicCallStack = mapTuple(
    publicCallData.publicCallStackPreimages,
    preimage => computeCallStackItemHash(wasm!, preimage),
  );

  // one kernel circuit call can have several methods in call stack. But all of them should have the same msg.sender - set these correctly in the preimages!
  for (let i = 0; i < publicCallData.publicCallStackPreimages.length; i++) {
    const isDelegateCall = publicCallData.publicCallStackPreimages[i].publicInputs.callContext.isDelegateCall;
    publicCallData.publicCallStackPreimages[i].publicInputs.callContext.msgSender = isDelegateCall
      ? publicCallData.callStackItem.publicInputs.callContext.msgSender
      : publicCallData.callStackItem.contractAddress;
  }

  // set the storage address for each call on the stack (handle delegatecall case)
  for (let i = 0; i < publicCallData.publicCallStackPreimages.length; i++) {
    const isDelegateCall = publicCallData.publicCallStackPreimages[i].publicInputs.callContext.isDelegateCall;
    publicCallData.publicCallStackPreimages[i].publicInputs.callContext.storageContractAddress = isDelegateCall
      ? publicCallData.callStackItem.publicInputs.callContext.storageContractAddress
      : publicCallData.publicCallStackPreimages[i].contractAddress;
  }

  return publicCallData;
}

/**
 * Makes arbitrary witnessed public call data.
 * @param seed - The seed to use for generating the witnessed public call data.
 * @returns A witnessed public call data.
 */
export async function makeWitnessedPublicCallData(seed = 1): Promise<WitnessedPublicCallData> {
  return new WitnessedPublicCallData(
    await makePublicCallData(seed),
    range(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, seed + 0x100).map(x =>
      makeMembershipWitness(PUBLIC_DATA_TREE_HEIGHT, x),
    ),
    makeTuple(MAX_PUBLIC_DATA_READS_PER_TX, x => makeMembershipWitness(PUBLIC_DATA_TREE_HEIGHT, x), seed + 0x200),
    fr(seed + 0x300),
  );
}

/**
 * Makes arbitrary public kernel inputs.
 * @param seed - The seed to use for generating the public kernel inputs.
 * @returns Public kernel inputs.
 */
export async function makePublicKernelInputs(seed = 1): Promise<PublicKernelInputs> {
  return new PublicKernelInputs(makePreviousKernelData(seed), await makePublicCallData(seed + 0x1000));
}

/**
 * Makes arbitrary public kernel inputs with empty output.
 * @param seed - The seed to use for generating the public kernel inputs.
 * @returns Public kernel inputs.
 */
export async function makePublicKernelInputsWithEmptyOutput(seed = 1): Promise<PublicKernelInputs> {
  const kernelCircuitPublicInputs = makeEmptyKernelPublicInputs(seed);
  const publicKernelInputs = new PublicKernelInputs(
    makePreviousKernelData(seed, kernelCircuitPublicInputs),
    await makePublicCallData(seed + 0x1000),
  );
  //Set the call stack item for this circuit iteration at the top of the call stack
  const wasm = await CircuitsWasm.get();
  publicKernelInputs.previousKernel.publicInputs.end.publicCallStack[MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX - 1] =
    computeCallStackItemHash(wasm, publicKernelInputs.publicCall.callStackItem);
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
    functionData: new FunctionData(makeSelector(seed + 0x100), true, true),
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
    privateCallStackPreimages: makeTuple(MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, makePrivateCallStackItem, seed + 0x10),
    proof: new Proof(Buffer.alloc(16).fill(seed + 0x50)),
    vk: makeVerificationKey(),
    functionLeafMembershipWitness: makeMembershipWitness(FUNCTION_TREE_HEIGHT, seed + 0x30),
    contractLeafMembershipWitness: makeMembershipWitness(CONTRACT_TREE_HEIGHT, seed + 0x20),
    readRequestMembershipWitnesses: range(MAX_READ_REQUESTS_PER_CALL, seed + 0x70).map(x =>
      makeReadRequestMembershipWitness(x),
    ),
    portalContractAddress: makeEthAddress(seed + 0x40),
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
    new FunctionData(makeSelector(seed + 0x1), true, true),
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
      true,
      true,
      true,
    ),
    argsHash: fr(seed + 0x100),
    returnValues: makeTuple(RETURN_VALUES_LENGTH, fr, seed + 0x200),
    readRequests: makeTuple(MAX_READ_REQUESTS_PER_CALL, fr, seed + 0x300),
    newCommitments: makeTuple(MAX_NEW_COMMITMENTS_PER_CALL, fr, seed + 0x400),
    newNullifiers: makeTuple(MAX_NEW_NULLIFIERS_PER_CALL, fr, seed + 0x500),
    privateCallStack: makeTuple(MAX_PRIVATE_CALL_STACK_LENGTH_PER_CALL, fr, seed + 0x600),
    publicCallStack: makeTuple(MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL, fr, seed + 0x700),
    newL2ToL1Msgs: makeTuple(MAX_NEW_L2_TO_L1_MSGS_PER_CALL, fr, seed + 0x800),
    encryptedLogsHash: makeTuple(NUM_FIELDS_PER_SHA256, fr, seed + 0x900),
    unencryptedLogsHash: makeTuple(NUM_FIELDS_PER_SHA256, fr, seed + 0xa00),
    encryptedLogPreimagesLength: fr(seed + 0xb00),
    unencryptedLogPreimagesLength: fr(seed + 0xc00),
    historicContractTreeRoot: fr(seed + 0xd00),
    historicPrivateDataTreeRoot: fr(seed + 0xe00),
    historicPrivateNullifierTreeRoot: fr(seed + 0xf00),
    historicL1ToL2MessagesTreeRoot: fr(seed + 0x1000),
    contractDeploymentData: makeContractDeploymentData(),
    chainId: fr(seed + 0x1100),
    version: fr(seed + 0x1200),
  });
}

/**
 * Makes arbitrary contract deployment data.
 * @param seed - The seed to use for generating the contract deployment data.
 * @returns A contract deployment data.
 */
export function makeContractDeploymentData(seed = 1) {
  return new ContractDeploymentData(
    makePoint(seed),
    fr(seed + 1),
    fr(seed + 2),
    fr(seed + 3),
    makeEthAddress(seed + 4),
  );
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
    return new GlobalVariables(fr(seed), fr(seed + 1), fr(blockNumber), fr(seed + 3));
  }
  return new GlobalVariables(fr(seed), fr(seed + 1), fr(seed + 2), fr(seed + 3));
}

/**
 * Makes constant base rollup data.
 * @param seed - The seed to use for generating the constant base rollup data.
 * @param blockNumber - The block number to use for generating the global variables.
 * @returns A constant base rollup data.
 */
export function makeConstantBaseRollupData(
  seed = 1,
  blockNumber: number | undefined = undefined,
): ConstantBaseRollupData {
  return ConstantBaseRollupData.from({
    startTreeOfHistoricPrivateDataTreeRootsSnapshot: makeAppendOnlyTreeSnapshot(seed),
    startTreeOfHistoricContractTreeRootsSnapshot: makeAppendOnlyTreeSnapshot(seed + 0x100),
    startTreeOfHistoricL1ToL2MsgTreeRootsSnapshot: makeAppendOnlyTreeSnapshot(seed + 0x200),
    privateKernelVkTreeRoot: fr(seed + 0x301),
    publicKernelVkTreeRoot: fr(seed + 0x302),
    baseRollupVkHash: fr(seed + 0x303),
    mergeRollupVkHash: fr(seed + 0x304),
    globalVariables: makeGlobalVariables(seed + 0x305, blockNumber),
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
  return new EthAddress(Buffer.alloc(20, seed));
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
  return new AztecAddress(fr(seed).toBuffer());
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
  blockNumber: number | undefined = undefined,
): BaseOrMergeRollupPublicInputs {
  return new BaseOrMergeRollupPublicInputs(
    RollupTypes.Base,
    new Fr(0n),
    makeAggregationObject(seed + 0x100),
    makeConstantBaseRollupData(seed + 0x200, blockNumber),
    makeAppendOnlyTreeSnapshot(seed + 0x300),
    makeAppendOnlyTreeSnapshot(seed + 0x400),
    makeAppendOnlyTreeSnapshot(seed + 0x500),
    makeAppendOnlyTreeSnapshot(seed + 0x600),
    makeAppendOnlyTreeSnapshot(seed + 0x700),
    makeAppendOnlyTreeSnapshot(seed + 0x800),
    fr(seed + 0x900),
    fr(seed + 0x1000),
    [fr(seed + 0x901), fr(seed + 0x902)],
  );
}

/**
 * Makes arbitrary previous rollup data.
 * @param seed - The seed to use for generating the previous rollup data.
 * @param blockNumber - The block number to use for generating the previous rollup data.
 * @returns A previous rollup data.
 */
export function makePreviousRollupData(seed = 0, blockNumber: number | undefined = undefined): PreviousRollupData {
  return new PreviousRollupData(
    makeBaseOrMergeRollupPublicInputs(seed, blockNumber),
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
export function makeRootRollupInputs(seed = 0, blockNumber: number | undefined = undefined): RootRollupInputs {
  return new RootRollupInputs(
    [makePreviousRollupData(seed, blockNumber), makePreviousRollupData(seed + 0x1000, blockNumber)],
    makeTuple(PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT, fr, 0x2000),
    makeTuple(CONTRACT_TREE_ROOTS_TREE_HEIGHT, fr, 0x2100),
    makeTuple(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, fr, 0x2100),
    makeTuple(L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH, fr, 0x2100),
    makeTuple(L1_TO_L2_MSG_TREE_ROOTS_TREE_HEIGHT, fr, 0x2100),
    makeAppendOnlyTreeSnapshot(seed + 0x2200),
    makeAppendOnlyTreeSnapshot(seed + 0x2300),
  );
}

/**
 * Makes root rollup public inputs.
 * @param seed - The seed to use for generating the root rollup public inputs.
 * @param blockNumber - The block number to use for generating the root rollup public inputs.
 * if blockNumber is undefined, it will be set to seed + 2.
 * @returns A root rollup public inputs.
 */
export function makeRootRollupPublicInputs(
  seed = 0,
  blockNumber: number | undefined = undefined,
): RootRollupPublicInputs {
  return RootRollupPublicInputs.from({
    endAggregationObject: makeAggregationObject(seed),
    globalVariables: makeGlobalVariables((seed += 0x100), blockNumber),
    startPrivateDataTreeSnapshot: makeAppendOnlyTreeSnapshot((seed += 0x100)),
    endPrivateDataTreeSnapshot: makeAppendOnlyTreeSnapshot((seed += 0x100)),
    startNullifierTreeSnapshot: makeAppendOnlyTreeSnapshot((seed += 0x100)),
    endNullifierTreeSnapshot: makeAppendOnlyTreeSnapshot((seed += 0x100)),
    startContractTreeSnapshot: makeAppendOnlyTreeSnapshot((seed += 0x100)),
    endContractTreeSnapshot: makeAppendOnlyTreeSnapshot((seed += 0x100)),
    startPublicDataTreeRoot: fr((seed += 0x100)),
    endPublicDataTreeRoot: fr((seed += 0x100)),
    startTreeOfHistoricPrivateDataTreeRootsSnapshot: makeAppendOnlyTreeSnapshot((seed += 0x100)),
    endTreeOfHistoricPrivateDataTreeRootsSnapshot: makeAppendOnlyTreeSnapshot((seed += 0x100)),
    startTreeOfHistoricContractTreeRootsSnapshot: makeAppendOnlyTreeSnapshot((seed += 0x100)),
    endTreeOfHistoricContractTreeRootsSnapshot: makeAppendOnlyTreeSnapshot((seed += 0x100)),
    startL1ToL2MessageTreeSnapshot: makeAppendOnlyTreeSnapshot((seed += 0x100)),
    endL1ToL2MessageTreeSnapshot: makeAppendOnlyTreeSnapshot((seed += 0x100)),
    startTreeOfHistoricL1ToL2MessageTreeRootsSnapshot: makeAppendOnlyTreeSnapshot((seed += 0x100)),
    endTreeOfHistoricL1ToL2MessageTreeRootsSnapshot: makeAppendOnlyTreeSnapshot((seed += 0x100)),
    calldataHash: [new Fr(1n), new Fr(2n)],
    l1ToL2MessagesHash: [new Fr(3n), new Fr(4n)],
  });
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
 * Makes arbitrary base rollup inputs.
 * @param seed - The seed to use for generating the base rollup inputs.
 * @returns A base rollup inputs.
 */
export function makeBaseRollupInputs(seed = 0): BaseRollupInputs {
  const kernelData: [PreviousKernelData, PreviousKernelData] = [
    makePreviousKernelData(seed + 0x100),
    makePreviousKernelData(seed + 0x200),
  ];

  const startPrivateDataTreeSnapshot = makeAppendOnlyTreeSnapshot(seed + 0x100);
  const startNullifierTreeSnapshot = makeAppendOnlyTreeSnapshot(seed + 0x200);
  const startContractTreeSnapshot = makeAppendOnlyTreeSnapshot(seed + 0x300);
  const startPublicDataTreeRoot = fr(seed + 0x400);

  const lowNullifierLeafPreimages = range(2 * MAX_NEW_NULLIFIERS_PER_TX, seed + 0x1000).map(
    x => new NullifierLeafPreimage(fr(x), fr(x + 0x100), x + 0x200),
  );

  const lowNullifierMembershipWitness = range(2 * MAX_NEW_NULLIFIERS_PER_TX, seed + 0x2000).map(x =>
    makeMembershipWitness(NULLIFIER_TREE_HEIGHT, x),
  );

  const newCommitmentsSubtreeSiblingPath = range(
    PRIVATE_DATA_TREE_HEIGHT - BaseRollupInputs.PRIVATE_DATA_SUBTREE_HEIGHT,
    seed + 0x3000,
  ).map(x => fr(x));

  const newNullifiersSubtreeSiblingPath = range(
    NULLIFIER_TREE_HEIGHT - BaseRollupInputs.NULLIFIER_SUBTREE_HEIGHT,
    seed + 0x4000,
  ).map(x => fr(x));

  const newContractsSubtreeSiblingPath = range(
    CONTRACT_TREE_HEIGHT - BaseRollupInputs.CONTRACT_SUBTREE_HEIGHT,
    seed + 0x5000,
  ).map(x => fr(x));

  const newPublicDataUpdateRequestsSiblingPaths = range(2 * MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, seed + 0x6000).map(
    x => range(PUBLIC_DATA_TREE_HEIGHT, x).map(fr),
  );

  const newPublicDataReadsSiblingPaths = range(2 * MAX_PUBLIC_DATA_READS_PER_TX, seed + 0x6000).map(x =>
    range(PUBLIC_DATA_TREE_HEIGHT, x).map(fr),
  );

  const historicPrivateDataTreeRootMembershipWitnesses: BaseRollupInputs['historicPrivateDataTreeRootMembershipWitnesses'] =
    [
      makeMembershipWitness(PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT, seed + 0x6000),
      makeMembershipWitness(PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT, seed + 0x7000),
    ];

  const historicContractsTreeRootMembershipWitnesses: BaseRollupInputs['historicContractsTreeRootMembershipWitnesses'] =
    [
      makeMembershipWitness(CONTRACT_TREE_ROOTS_TREE_HEIGHT, seed + 0x8000),
      makeMembershipWitness(CONTRACT_TREE_ROOTS_TREE_HEIGHT, seed + 0x9000),
    ];
  const historicL1ToL2MsgTreeRootMembershipWitnesses: BaseRollupInputs['historicL1ToL2MsgTreeRootMembershipWitnesses'] =
    [
      makeMembershipWitness(L1_TO_L2_MSG_TREE_ROOTS_TREE_HEIGHT, seed + 0xa000),
      makeMembershipWitness(L1_TO_L2_MSG_TREE_ROOTS_TREE_HEIGHT, seed + 0xb000),
    ];

  const constants = makeConstantBaseRollupData(0x100);

  return BaseRollupInputs.from({
    kernelData,
    lowNullifierMembershipWitness,
    startPrivateDataTreeSnapshot,
    startNullifierTreeSnapshot,
    startContractTreeSnapshot,
    startPublicDataTreeRoot,
    lowNullifierLeafPreimages,
    newCommitmentsSubtreeSiblingPath,
    newNullifiersSubtreeSiblingPath,
    newContractsSubtreeSiblingPath,
    newPublicDataUpdateRequestsSiblingPaths,
    newPublicDataReadsSiblingPaths,
    historicPrivateDataTreeRootMembershipWitnesses,
    historicContractsTreeRootMembershipWitnesses,
    historicL1ToL2MsgTreeRootMembershipWitnesses,
    constants,
  });
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
 * Computes a valid address, partial address, and public key out of a private key.
 * @param privateKey - A private encryption key (optional, will use a random one if not set).
 * @returns A valid address, partial address, and public key.
 */
export async function makeAddressWithPreimagesFromPrivateKey(privateKey?: Buffer) {
  privateKey = privateKey ?? randomBytes(32);
  const wasm = await CircuitsWasm.get();
  const grumpkin = new Grumpkin(wasm);
  const publicKey = Point.fromBuffer(grumpkin.mul(Grumpkin.generator, privateKey));
  const partialAddress = Fr.random();
  const address = computeContractAddressFromPartial(wasm, publicKey, partialAddress);
  return { address, partialAddress, publicKey, privateKey };
}
