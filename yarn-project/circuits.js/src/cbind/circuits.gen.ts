
/* eslint-disable */
// GENERATED FILE DO NOT EDIT
import { Buffer } from "buffer";
import { callCbind } from './cbind.js';
import { CircuitsWasm } from '../wasm/index.js';

// Utility types
export type FixedArray<T, L extends number> = [T, ...T[]] & { length: L };

// Aliases (TODO strong typing?)
export type AztecAddressBuf = Buffer;
export type FieldBuf = Buffer;

export interface IAffineElement {
  x: FieldBuf;
  y: FieldBuf;
}
export interface INativeAggregationState {
  P0: IAffineElement;
  P1: IAffineElement;
  publicInputs: FieldBuf[];
  proofWitnessIndices: number[];
  hasData: boolean;
}
export interface INewContractData {
  contractAddress: AztecAddressBuf;
  portalContractAddress: AztecAddressBuf;
  functionTreeRoot: FieldBuf;
}
export interface IFunctionData {
  functionSelector: number;
  isPrivate: boolean;
  isConstructor: boolean;
}
export interface IOptionallyRevealedData {
  callStackItemHash: FieldBuf;
  functionData: IFunctionData;
  emittedEvents: FixedArray<FieldBuf, 4>;
  portalContractAddress: AztecAddressBuf;
  payFeeFromL1: boolean;
  payFeeFromPublicL2: boolean;
  calledFromL1: boolean;
  calledFromPublicL2: boolean;
}
export interface IAccumulatedData {
  aggregationObject: INativeAggregationState;
  privateCallCount: FieldBuf;
  newCommitments: FixedArray<FieldBuf, 4>;
  newNullifiers: FixedArray<FieldBuf, 4>;
  privateCallStack: FixedArray<FieldBuf, 8>;
  publicCallStack: FixedArray<FieldBuf, 8>;
  l1MsgStack: FixedArray<FieldBuf, 4>;
  newContracts: FixedArray<INewContractData, 1>;
  optionallyRevealedData: FixedArray<IOptionallyRevealedData, 4>;
}
export interface IHistoricTreeRoots {
  privateDataTreeRoot: FieldBuf;
  nullifierTreeRoot: FieldBuf;
  contractTreeRoot: FieldBuf;
  privateKernelVkTreeRoot: FieldBuf;
}
export interface IContractDeploymentData {
  constructorVkHash: FieldBuf;
  functionTreeRoot: FieldBuf;
  contractAddressSalt: FieldBuf;
  portalContractAddress: AztecAddressBuf;
}
export interface ITxContext {
  isFeePaymentTx: boolean;
  isRebatePaymentTx: boolean;
  isContractDeploymentTx: boolean;
  contractDeploymentData: IContractDeploymentData;
}
export interface IConstantData {
  historicTreeRoots: IHistoricTreeRoots;
  txContext: ITxContext;
}
export interface IPublicInputs {
  end: IAccumulatedData;
  constants: IConstantData;
  isPrivate: boolean;
}
export interface IProof {
  proofData: Buffer;
}
export interface IVerificationKeyData {
  composerType: number;
  circuitSize: number;
  numPublicInputs: number;
  commitments: Record<string, IAffineElement>;
  containsRecursiveProof: boolean;
  recursiveProofPublicInputIndices: number[];
}
export interface IPreviousKernelData {
  publicInputs: IPublicInputs;
  proof: IProof;
  vk: IVerificationKeyData;
  vkIndex: number;
  vkPath: FixedArray<FieldBuf, 3>;
}
export function abisComputeContractAddress(wasm: CircuitsWasm, arg0: AztecAddressBuf, arg1: FieldBuf, arg2: FieldBuf, arg3: FieldBuf): Promise<AztecAddressBuf> {
  return callCbind(wasm, 'abis__compute_contract_address', [arg0, arg1, arg2, arg3]);
}
export function privateKernelDummyPreviousKernel(wasm: CircuitsWasm, ): Promise<IPreviousKernelData> {
  return callCbind(wasm, 'private_kernel__dummy_previous_kernel', []);
}