import {
  ARGS_LENGTH,
  AggregationObject,
  AztecAddress,
  CallContext,
  CallRequest,
  CallerContext,
  CombinedConstantData,
  EthAddress,
  Fq,
  Fr,
  FunctionData,
  FunctionSelector,
  G1AffineElement,
  Point,
  PrivateKernelTailCircuitPublicInputs,
  PublicCallRequest,
  SideEffect,
  SideEffectLinkedToNoteHash,
  TxContext,
  ValidationRequests,
} from '@aztec/circuits.js';
import { makePublicAccumulatedData } from '@aztec/circuits.js/testing';
import { makeTuple, range } from '@aztec/foundation/array';

import { makeHeader } from './l2_block_code_to_purge.js';

/**
 * Creates arbitrary private kernel tail circuit public inputs.
 * @param seed - The seed to use for generating the kernel circuit public inputs.
 * @returns Private kernel tail circuit public inputs.
 */
export function makePrivateKernelTailCircuitPublicInputs(seed = 1, full = true): PrivateKernelTailCircuitPublicInputs {
  return new PrivateKernelTailCircuitPublicInputs(
    makeAggregationObject(seed),
    ValidationRequests.empty(),
    makePublicAccumulatedData(seed + 0x100, full),
    makePublicAccumulatedData(seed + 0x200, full),
    makeConstantData(seed + 0x300),
    false,
  );
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

/**
 * Makes arbitrary call stack item.
 * @param seed - The seed to use for generating the call stack item.
 * @returns A call stack item.
 */
export function makeCallRequest(seed = 1): CallRequest {
  return new CallRequest(fr(seed), makeAztecAddress(seed + 0x1), makeCallerContext(seed + 0x2), fr(0), fr(0));
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
 * Makes arbitrary call stack item.
 * @param seed - The seed to use for generating the call stack item.
 * @returns A call stack item.
 */
export function makeCallerContext(seed = 1): CallerContext {
  return new CallerContext(makeAztecAddress(seed), makeAztecAddress(seed + 0x1));
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
 * Creates arbitrary constant data with the given seed.
 * @param seed - The seed to use for generating the constant data.
 * @returns A constant data object.
 */
export function makeConstantData(seed = 1): CombinedConstantData {
  return new CombinedConstantData(makeHeader(seed, undefined), makeTxContext(seed + 4));
}

/**
 * Creates an arbitrary tx context with the given seed.
 * @param seed - The seed to use for generating the tx context.
 * @returns A tx context.
 */
export function makeTxContext(_seed: number): TxContext {
  // @todo @LHerskind should probably take value for chainId as it will be verified later.
  return new TxContext(false, false, Fr.ZERO, Fr.ZERO);
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
 * Creates arbitrary selector from the given seed.
 * @param seed - The seed to use for generating the selector.
 * @returns A selector.
 */
export function makeSelector(seed: number): FunctionSelector {
  return new FunctionSelector(seed);
}
