/* eslint-disable */
// GENERATED FILE DO NOT EDIT
import { Buffer } from 'buffer';
import { callCbind } from './cbind.js';
import { CircuitsWasm } from '../wasm/index.js';
import {
  FixedArray,
  Address,
  Fr,
  Fq,
  AffineElement,
  NativeAggregationState,
  NewContractData,
  FunctionData,
  OptionallyRevealedData,
  AccumulatedData,
  HistoricTreeRoots,
  ContractDeploymentData,
  TxContext,
  ConstantData,
  PublicInputs,
  Proof,
  VerificationKeyData,
  PreviousKernelData,
} from './types.js';
export interface IAffineElement {
  x: Fq;
  y: Fq;
}
export interface INativeAggregationState {
  p0: AffineElement;
  p1: AffineElement;
  publicInputs: Fr[];
  proofWitnessIndices: number[];
  hasData: boolean;
}
export interface INewContractData {
  contractAddress: Address;
  portalContractAddress: Address;
  functionTreeRoot: Fr;
}
export interface IFunctionData {
  functionSelector: number;
  isPrivate: boolean;
  isConstructor: boolean;
}
export interface IOptionallyRevealedData {
  callStackItemHash: Fr;
  functionData: FunctionData;
  emittedEvents: FixedArray<Fr, 4>;
  portalContractAddress: Address;
  payFeeFromL1: boolean;
  payFeeFromPublicL2: boolean;
  calledFromL1: boolean;
  calledFromPublicL2: boolean;
}
export interface IAccumulatedData {
  aggregationObject: NativeAggregationState;
  privateCallCount: Fr;
  newCommitments: FixedArray<Fr, 4>;
  newNullifiers: FixedArray<Fr, 4>;
  privateCallStack: FixedArray<Fr, 8>;
  publicCallStack: FixedArray<Fr, 8>;
  l1MsgStack: FixedArray<Fr, 4>;
  newContracts: FixedArray<NewContractData, 1>;
  optionallyRevealedData: FixedArray<OptionallyRevealedData, 4>;
}
export interface IHistoricTreeRoots {
  privateDataTreeRoot: Fr;
  nullifierTreeRoot: Fr;
  contractTreeRoot: Fr;
  privateKernelVkTreeRoot: Fr;
}
export interface IContractDeploymentData {
  constructorVkHash: Fr;
  functionTreeRoot: Fr;
  contractAddressSalt: Fr;
  portalContractAddress: Address;
}
export interface ITxContext {
  isFeePaymentTx: boolean;
  isRebatePaymentTx: boolean;
  isContractDeploymentTx: boolean;
  contractDeploymentData: ContractDeploymentData;
}
export interface IConstantData {
  historicTreeRoots: HistoricTreeRoots;
  txContext: TxContext;
}
export interface IPublicInputs {
  end: AccumulatedData;
  constants: ConstantData;
  isPrivate: boolean;
}
export interface IVerificationKeyData {
  composerType: number;
  circuitSize: number;
  numPublicInputs: number;
  commitments: Record<string, AffineElement>;
  containsRecursiveProof: boolean;
  recursiveProofPublicInputIndices: number[];
}
export interface IPreviousKernelData {
  publicInputs: PublicInputs;
  proof: Proof;
  vk: VerificationKeyData;
  vkIndex: number;
  vkPath: FixedArray<Fr, 3>;
}
export function abisComputeContractAddress(
  wasm: CircuitsWasm,
  arg0: Address,
  arg1: Fr,
  arg2: Fr,
  arg3: Fr,
): Promise<Address> {
  return callCbind(wasm, 'abis__compute_contract_address', [arg0, arg1, arg2, arg3]);
}
export function privateKernelDummyPreviousKernel(wasm: CircuitsWasm): Promise<PreviousKernelData> {
  return callCbind(wasm, 'private_kernel__dummy_previous_kernel', []);
}
