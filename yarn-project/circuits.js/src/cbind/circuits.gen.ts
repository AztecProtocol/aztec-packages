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

export function toAffineElement(o: any): AffineElement {
  if (o.x === undefined) {
    throw new Error('Expected x in AffineElement deserialization');
  }
  if (o.y === undefined) {
    throw new Error('Expected y in AffineElement deserialization');
  }
  return AffineElement.from({
    x: Fq.fromBuffer(o.x),
    y: Fq.fromBuffer(o.y),
  });
}

export function fromAffineElement(o: AffineElement): any {
  if (o.x === undefined) {
    throw new Error('Expected x in AffineElement serialization');
  }
  if (o.y === undefined) {
    throw new Error('Expected y in AffineElement serialization');
  }
  return {
    x: o.x.toBuffer(),
    y: o.y.toBuffer(),
  };
}

export interface INativeAggregationState {
  p0: AffineElement;
  p1: AffineElement;
  publicInputs: Fr[];
  proofWitnessIndices: number[];
  hasData: boolean;
}

export function toNativeAggregationState(o: any): NativeAggregationState {
  if (o.P0 === undefined) {
    throw new Error('Expected P0 in NativeAggregationState deserialization');
  }
  if (o.P1 === undefined) {
    throw new Error('Expected P1 in NativeAggregationState deserialization');
  }
  if (o.public_inputs === undefined) {
    throw new Error('Expected public_inputs in NativeAggregationState deserialization');
  }
  if (o.proof_witness_indices === undefined) {
    throw new Error('Expected proof_witness_indices in NativeAggregationState deserialization');
  }
  if (o.has_data === undefined) {
    throw new Error('Expected has_data in NativeAggregationState deserialization');
  }
  return NativeAggregationState.from({
    p0: toAffineElement(o.P0),
    p1: toAffineElement(o.P1),
    publicInputs: o.public_inputs.map((v: any) => Fr.fromBuffer(v)),
    proofWitnessIndices: o.proof_witness_indices.map((v: any) => v),
    hasData: o.has_data,
  });
}

export function fromNativeAggregationState(o: NativeAggregationState): any {
  if (o.p0 === undefined) {
    throw new Error('Expected p0 in NativeAggregationState serialization');
  }
  if (o.p1 === undefined) {
    throw new Error('Expected p1 in NativeAggregationState serialization');
  }
  if (o.publicInputs === undefined) {
    throw new Error('Expected publicInputs in NativeAggregationState serialization');
  }
  if (o.proofWitnessIndices === undefined) {
    throw new Error('Expected proofWitnessIndices in NativeAggregationState serialization');
  }
  if (o.hasData === undefined) {
    throw new Error('Expected hasData in NativeAggregationState serialization');
  }
  return {
    P0: toAffineElement(o.p0),
    P1: toAffineElement(o.p1),
    public_inputs: o.publicInputs.map((v: any) => v.toBuffer()),
    proof_witness_indices: o.proofWitnessIndices.map((v: any) => v),
    has_data: o.hasData,
  };
}

export interface INewContractData {
  contractAddress: Address;
  portalContractAddress: Address;
  functionTreeRoot: Fr;
}

export function toNewContractData(o: any): NewContractData {
  if (o.contract_address === undefined) {
    throw new Error('Expected contract_address in NewContractData deserialization');
  }
  if (o.portal_contract_address === undefined) {
    throw new Error('Expected portal_contract_address in NewContractData deserialization');
  }
  if (o.function_tree_root === undefined) {
    throw new Error('Expected function_tree_root in NewContractData deserialization');
  }
  return NewContractData.from({
    contractAddress: Address.fromBuffer(o.contract_address),
    portalContractAddress: Address.fromBuffer(o.portal_contract_address),
    functionTreeRoot: Fr.fromBuffer(o.function_tree_root),
  });
}

export function fromNewContractData(o: NewContractData): any {
  if (o.contractAddress === undefined) {
    throw new Error('Expected contractAddress in NewContractData serialization');
  }
  if (o.portalContractAddress === undefined) {
    throw new Error('Expected portalContractAddress in NewContractData serialization');
  }
  if (o.functionTreeRoot === undefined) {
    throw new Error('Expected functionTreeRoot in NewContractData serialization');
  }
  return {
    contract_address: o.contractAddress.toBuffer(),
    portal_contract_address: o.portalContractAddress.toBuffer(),
    function_tree_root: o.functionTreeRoot.toBuffer(),
  };
}

export interface IFunctionData {
  functionSelector: number;
  isPrivate: boolean;
  isConstructor: boolean;
}

export function toFunctionData(o: any): FunctionData {
  if (o.function_selector === undefined) {
    throw new Error('Expected function_selector in FunctionData deserialization');
  }
  if (o.is_private === undefined) {
    throw new Error('Expected is_private in FunctionData deserialization');
  }
  if (o.is_constructor === undefined) {
    throw new Error('Expected is_constructor in FunctionData deserialization');
  }
  return FunctionData.from({
    functionSelector: o.function_selector,
    isPrivate: o.is_private,
    isConstructor: o.is_constructor,
  });
}

export function fromFunctionData(o: FunctionData): any {
  if (o.functionSelector === undefined) {
    throw new Error('Expected functionSelector in FunctionData serialization');
  }
  if (o.isPrivate === undefined) {
    throw new Error('Expected isPrivate in FunctionData serialization');
  }
  if (o.isConstructor === undefined) {
    throw new Error('Expected isConstructor in FunctionData serialization');
  }
  return {
    function_selector: o.functionSelector,
    is_private: o.isPrivate,
    is_constructor: o.isConstructor,
  };
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

export function toOptionallyRevealedData(o: any): OptionallyRevealedData {
  if (o.call_stack_item_hash === undefined) {
    throw new Error('Expected call_stack_item_hash in OptionallyRevealedData deserialization');
  }
  if (o.function_data === undefined) {
    throw new Error('Expected function_data in OptionallyRevealedData deserialization');
  }
  if (o.emitted_events === undefined) {
    throw new Error('Expected emitted_events in OptionallyRevealedData deserialization');
  }
  if (o.portal_contract_address === undefined) {
    throw new Error('Expected portal_contract_address in OptionallyRevealedData deserialization');
  }
  if (o.pay_fee_from_l1 === undefined) {
    throw new Error('Expected pay_fee_from_l1 in OptionallyRevealedData deserialization');
  }
  if (o.pay_fee_from_public_l2 === undefined) {
    throw new Error('Expected pay_fee_from_public_l2 in OptionallyRevealedData deserialization');
  }
  if (o.called_from_l1 === undefined) {
    throw new Error('Expected called_from_l1 in OptionallyRevealedData deserialization');
  }
  if (o.called_from_public_l2 === undefined) {
    throw new Error('Expected called_from_public_l2 in OptionallyRevealedData deserialization');
  }
  return OptionallyRevealedData.from({
    callStackItemHash: Fr.fromBuffer(o.call_stack_item_hash),
    functionData: toFunctionData(o.function_data),
    emittedEvents: o.emitted_events.map((v: any) => Fr.fromBuffer(v)),
    portalContractAddress: Address.fromBuffer(o.portal_contract_address),
    payFeeFromL1: o.pay_fee_from_l1,
    payFeeFromPublicL2: o.pay_fee_from_public_l2,
    calledFromL1: o.called_from_l1,
    calledFromPublicL2: o.called_from_public_l2,
  });
}

export function fromOptionallyRevealedData(o: OptionallyRevealedData): any {
  if (o.callStackItemHash === undefined) {
    throw new Error('Expected callStackItemHash in OptionallyRevealedData serialization');
  }
  if (o.functionData === undefined) {
    throw new Error('Expected functionData in OptionallyRevealedData serialization');
  }
  if (o.emittedEvents === undefined) {
    throw new Error('Expected emittedEvents in OptionallyRevealedData serialization');
  }
  if (o.portalContractAddress === undefined) {
    throw new Error('Expected portalContractAddress in OptionallyRevealedData serialization');
  }
  if (o.payFeeFromL1 === undefined) {
    throw new Error('Expected payFeeFromL1 in OptionallyRevealedData serialization');
  }
  if (o.payFeeFromPublicL2 === undefined) {
    throw new Error('Expected payFeeFromPublicL2 in OptionallyRevealedData serialization');
  }
  if (o.calledFromL1 === undefined) {
    throw new Error('Expected calledFromL1 in OptionallyRevealedData serialization');
  }
  if (o.calledFromPublicL2 === undefined) {
    throw new Error('Expected calledFromPublicL2 in OptionallyRevealedData serialization');
  }
  return {
    call_stack_item_hash: o.callStackItemHash.toBuffer(),
    function_data: toFunctionData(o.functionData),
    emitted_events: o.emittedEvents.map((v: any) => v.toBuffer()),
    portal_contract_address: o.portalContractAddress.toBuffer(),
    pay_fee_from_l1: o.payFeeFromL1,
    pay_fee_from_public_l2: o.payFeeFromPublicL2,
    called_from_l1: o.calledFromL1,
    called_from_public_l2: o.calledFromPublicL2,
  };
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

export function toAccumulatedData(o: any): AccumulatedData {
  if (o.aggregation_object === undefined) {
    throw new Error('Expected aggregation_object in AccumulatedData deserialization');
  }
  if (o.private_call_count === undefined) {
    throw new Error('Expected private_call_count in AccumulatedData deserialization');
  }
  if (o.new_commitments === undefined) {
    throw new Error('Expected new_commitments in AccumulatedData deserialization');
  }
  if (o.new_nullifiers === undefined) {
    throw new Error('Expected new_nullifiers in AccumulatedData deserialization');
  }
  if (o.private_call_stack === undefined) {
    throw new Error('Expected private_call_stack in AccumulatedData deserialization');
  }
  if (o.public_call_stack === undefined) {
    throw new Error('Expected public_call_stack in AccumulatedData deserialization');
  }
  if (o.l1_msg_stack === undefined) {
    throw new Error('Expected l1_msg_stack in AccumulatedData deserialization');
  }
  if (o.new_contracts === undefined) {
    throw new Error('Expected new_contracts in AccumulatedData deserialization');
  }
  if (o.optionally_revealed_data === undefined) {
    throw new Error('Expected optionally_revealed_data in AccumulatedData deserialization');
  }
  return AccumulatedData.from({
    aggregationObject: toNativeAggregationState(o.aggregation_object),
    privateCallCount: Fr.fromBuffer(o.private_call_count),
    newCommitments: o.new_commitments.map((v: any) => Fr.fromBuffer(v)),
    newNullifiers: o.new_nullifiers.map((v: any) => Fr.fromBuffer(v)),
    privateCallStack: o.private_call_stack.map((v: any) => Fr.fromBuffer(v)),
    publicCallStack: o.public_call_stack.map((v: any) => Fr.fromBuffer(v)),
    l1MsgStack: o.l1_msg_stack.map((v: any) => Fr.fromBuffer(v)),
    newContracts: o.new_contracts.map((v: any) => toNewContractData(v)),
    optionallyRevealedData: o.optionally_revealed_data.map((v: any) => toOptionallyRevealedData(v)),
  });
}

export function fromAccumulatedData(o: AccumulatedData): any {
  if (o.aggregationObject === undefined) {
    throw new Error('Expected aggregationObject in AccumulatedData serialization');
  }
  if (o.privateCallCount === undefined) {
    throw new Error('Expected privateCallCount in AccumulatedData serialization');
  }
  if (o.newCommitments === undefined) {
    throw new Error('Expected newCommitments in AccumulatedData serialization');
  }
  if (o.newNullifiers === undefined) {
    throw new Error('Expected newNullifiers in AccumulatedData serialization');
  }
  if (o.privateCallStack === undefined) {
    throw new Error('Expected privateCallStack in AccumulatedData serialization');
  }
  if (o.publicCallStack === undefined) {
    throw new Error('Expected publicCallStack in AccumulatedData serialization');
  }
  if (o.l1MsgStack === undefined) {
    throw new Error('Expected l1MsgStack in AccumulatedData serialization');
  }
  if (o.newContracts === undefined) {
    throw new Error('Expected newContracts in AccumulatedData serialization');
  }
  if (o.optionallyRevealedData === undefined) {
    throw new Error('Expected optionallyRevealedData in AccumulatedData serialization');
  }
  return {
    aggregation_object: toNativeAggregationState(o.aggregationObject),
    private_call_count: o.privateCallCount.toBuffer(),
    new_commitments: o.newCommitments.map((v: any) => v.toBuffer()),
    new_nullifiers: o.newNullifiers.map((v: any) => v.toBuffer()),
    private_call_stack: o.privateCallStack.map((v: any) => v.toBuffer()),
    public_call_stack: o.publicCallStack.map((v: any) => v.toBuffer()),
    l1_msg_stack: o.l1MsgStack.map((v: any) => v.toBuffer()),
    new_contracts: o.newContracts.map((v: any) => toNewContractData(v)),
    optionally_revealed_data: o.optionallyRevealedData.map((v: any) => toOptionallyRevealedData(v)),
  };
}

export interface IHistoricTreeRoots {
  privateDataTreeRoot: Fr;
  nullifierTreeRoot: Fr;
  contractTreeRoot: Fr;
  privateKernelVkTreeRoot: Fr;
}

export function toHistoricTreeRoots(o: any): HistoricTreeRoots {
  if (o.private_data_tree_root === undefined) {
    throw new Error('Expected private_data_tree_root in HistoricTreeRoots deserialization');
  }
  if (o.nullifier_tree_root === undefined) {
    throw new Error('Expected nullifier_tree_root in HistoricTreeRoots deserialization');
  }
  if (o.contract_tree_root === undefined) {
    throw new Error('Expected contract_tree_root in HistoricTreeRoots deserialization');
  }
  if (o.private_kernel_vk_tree_root === undefined) {
    throw new Error('Expected private_kernel_vk_tree_root in HistoricTreeRoots deserialization');
  }
  return HistoricTreeRoots.from({
    privateDataTreeRoot: Fr.fromBuffer(o.private_data_tree_root),
    nullifierTreeRoot: Fr.fromBuffer(o.nullifier_tree_root),
    contractTreeRoot: Fr.fromBuffer(o.contract_tree_root),
    privateKernelVkTreeRoot: Fr.fromBuffer(o.private_kernel_vk_tree_root),
  });
}

export function fromHistoricTreeRoots(o: HistoricTreeRoots): any {
  if (o.privateDataTreeRoot === undefined) {
    throw new Error('Expected privateDataTreeRoot in HistoricTreeRoots serialization');
  }
  if (o.nullifierTreeRoot === undefined) {
    throw new Error('Expected nullifierTreeRoot in HistoricTreeRoots serialization');
  }
  if (o.contractTreeRoot === undefined) {
    throw new Error('Expected contractTreeRoot in HistoricTreeRoots serialization');
  }
  if (o.privateKernelVkTreeRoot === undefined) {
    throw new Error('Expected privateKernelVkTreeRoot in HistoricTreeRoots serialization');
  }
  return {
    private_data_tree_root: o.privateDataTreeRoot.toBuffer(),
    nullifier_tree_root: o.nullifierTreeRoot.toBuffer(),
    contract_tree_root: o.contractTreeRoot.toBuffer(),
    private_kernel_vk_tree_root: o.privateKernelVkTreeRoot.toBuffer(),
  };
}

export interface IContractDeploymentData {
  constructorVkHash: Fr;
  functionTreeRoot: Fr;
  contractAddressSalt: Fr;
  portalContractAddress: Address;
}

export function toContractDeploymentData(o: any): ContractDeploymentData {
  if (o.constructor_vk_hash === undefined) {
    throw new Error('Expected constructor_vk_hash in ContractDeploymentData deserialization');
  }
  if (o.function_tree_root === undefined) {
    throw new Error('Expected function_tree_root in ContractDeploymentData deserialization');
  }
  if (o.contract_address_salt === undefined) {
    throw new Error('Expected contract_address_salt in ContractDeploymentData deserialization');
  }
  if (o.portal_contract_address === undefined) {
    throw new Error('Expected portal_contract_address in ContractDeploymentData deserialization');
  }
  return ContractDeploymentData.from({
    constructorVkHash: Fr.fromBuffer(o.constructor_vk_hash),
    functionTreeRoot: Fr.fromBuffer(o.function_tree_root),
    contractAddressSalt: Fr.fromBuffer(o.contract_address_salt),
    portalContractAddress: Address.fromBuffer(o.portal_contract_address),
  });
}

export function fromContractDeploymentData(o: ContractDeploymentData): any {
  if (o.constructorVkHash === undefined) {
    throw new Error('Expected constructorVkHash in ContractDeploymentData serialization');
  }
  if (o.functionTreeRoot === undefined) {
    throw new Error('Expected functionTreeRoot in ContractDeploymentData serialization');
  }
  if (o.contractAddressSalt === undefined) {
    throw new Error('Expected contractAddressSalt in ContractDeploymentData serialization');
  }
  if (o.portalContractAddress === undefined) {
    throw new Error('Expected portalContractAddress in ContractDeploymentData serialization');
  }
  return {
    constructor_vk_hash: o.constructorVkHash.toBuffer(),
    function_tree_root: o.functionTreeRoot.toBuffer(),
    contract_address_salt: o.contractAddressSalt.toBuffer(),
    portal_contract_address: o.portalContractAddress.toBuffer(),
  };
}

export interface ITxContext {
  isFeePaymentTx: boolean;
  isRebatePaymentTx: boolean;
  isContractDeploymentTx: boolean;
  contractDeploymentData: ContractDeploymentData;
}

export function toTxContext(o: any): TxContext {
  if (o.is_fee_payment_tx === undefined) {
    throw new Error('Expected is_fee_payment_tx in TxContext deserialization');
  }
  if (o.is_rebate_payment_tx === undefined) {
    throw new Error('Expected is_rebate_payment_tx in TxContext deserialization');
  }
  if (o.is_contract_deployment_tx === undefined) {
    throw new Error('Expected is_contract_deployment_tx in TxContext deserialization');
  }
  if (o.contract_deployment_data === undefined) {
    throw new Error('Expected contract_deployment_data in TxContext deserialization');
  }
  return TxContext.from({
    isFeePaymentTx: o.is_fee_payment_tx,
    isRebatePaymentTx: o.is_rebate_payment_tx,
    isContractDeploymentTx: o.is_contract_deployment_tx,
    contractDeploymentData: toContractDeploymentData(o.contract_deployment_data),
  });
}

export function fromTxContext(o: TxContext): any {
  if (o.isFeePaymentTx === undefined) {
    throw new Error('Expected isFeePaymentTx in TxContext serialization');
  }
  if (o.isRebatePaymentTx === undefined) {
    throw new Error('Expected isRebatePaymentTx in TxContext serialization');
  }
  if (o.isContractDeploymentTx === undefined) {
    throw new Error('Expected isContractDeploymentTx in TxContext serialization');
  }
  if (o.contractDeploymentData === undefined) {
    throw new Error('Expected contractDeploymentData in TxContext serialization');
  }
  return {
    is_fee_payment_tx: o.isFeePaymentTx,
    is_rebate_payment_tx: o.isRebatePaymentTx,
    is_contract_deployment_tx: o.isContractDeploymentTx,
    contract_deployment_data: toContractDeploymentData(o.contractDeploymentData),
  };
}

export interface IConstantData {
  historicTreeRoots: HistoricTreeRoots;
  txContext: TxContext;
}

export function toConstantData(o: any): ConstantData {
  if (o.historic_tree_roots === undefined) {
    throw new Error('Expected historic_tree_roots in ConstantData deserialization');
  }
  if (o.tx_context === undefined) {
    throw new Error('Expected tx_context in ConstantData deserialization');
  }
  return ConstantData.from({
    historicTreeRoots: toHistoricTreeRoots(o.historic_tree_roots),
    txContext: toTxContext(o.tx_context),
  });
}

export function fromConstantData(o: ConstantData): any {
  if (o.historicTreeRoots === undefined) {
    throw new Error('Expected historicTreeRoots in ConstantData serialization');
  }
  if (o.txContext === undefined) {
    throw new Error('Expected txContext in ConstantData serialization');
  }
  return {
    historic_tree_roots: toHistoricTreeRoots(o.historicTreeRoots),
    tx_context: toTxContext(o.txContext),
  };
}

export interface IPublicInputs {
  end: AccumulatedData;
  constants: ConstantData;
  isPrivate: boolean;
}

export function toPublicInputs(o: any): PublicInputs {
  if (o.end === undefined) {
    throw new Error('Expected end in PublicInputs deserialization');
  }
  if (o.constants === undefined) {
    throw new Error('Expected constants in PublicInputs deserialization');
  }
  if (o.is_private === undefined) {
    throw new Error('Expected is_private in PublicInputs deserialization');
  }
  return PublicInputs.from({
    end: toAccumulatedData(o.end),
    constants: toConstantData(o.constants),
    isPrivate: o.is_private,
  });
}

export function fromPublicInputs(o: PublicInputs): any {
  if (o.end === undefined) {
    throw new Error('Expected end in PublicInputs serialization');
  }
  if (o.constants === undefined) {
    throw new Error('Expected constants in PublicInputs serialization');
  }
  if (o.isPrivate === undefined) {
    throw new Error('Expected isPrivate in PublicInputs serialization');
  }
  return {
    end: toAccumulatedData(o.end),
    constants: toConstantData(o.constants),
    is_private: o.isPrivate,
  };
}

export interface IVerificationKeyData {
  composerType: number;
  circuitSize: number;
  numPublicInputs: number;
  commitments: Record<string, AffineElement>;
  containsRecursiveProof: boolean;
  recursiveProofPublicInputIndices: number[];
}

export function toVerificationKeyData(o: any): VerificationKeyData {
  if (o.composer_type === undefined) {
    throw new Error('Expected composer_type in VerificationKeyData deserialization');
  }
  if (o.circuit_size === undefined) {
    throw new Error('Expected circuit_size in VerificationKeyData deserialization');
  }
  if (o.num_public_inputs === undefined) {
    throw new Error('Expected num_public_inputs in VerificationKeyData deserialization');
  }
  if (o.commitments === undefined) {
    throw new Error('Expected commitments in VerificationKeyData deserialization');
  }
  if (o.contains_recursive_proof === undefined) {
    throw new Error('Expected contains_recursive_proof in VerificationKeyData deserialization');
  }
  if (o.recursive_proof_public_input_indices === undefined) {
    throw new Error('Expected recursive_proof_public_input_indices in VerificationKeyData deserialization');
  }
  return VerificationKeyData.from({
    composerType: o.composer_type,
    circuitSize: o.circuit_size,
    numPublicInputs: o.num_public_inputs,
    commitments: o.commitments,
    containsRecursiveProof: o.contains_recursive_proof,
    recursiveProofPublicInputIndices: o.recursive_proof_public_input_indices.map((v: any) => v),
  });
}

export function fromVerificationKeyData(o: VerificationKeyData): any {
  if (o.composerType === undefined) {
    throw new Error('Expected composerType in VerificationKeyData serialization');
  }
  if (o.circuitSize === undefined) {
    throw new Error('Expected circuitSize in VerificationKeyData serialization');
  }
  if (o.numPublicInputs === undefined) {
    throw new Error('Expected numPublicInputs in VerificationKeyData serialization');
  }
  if (o.commitments === undefined) {
    throw new Error('Expected commitments in VerificationKeyData serialization');
  }
  if (o.containsRecursiveProof === undefined) {
    throw new Error('Expected containsRecursiveProof in VerificationKeyData serialization');
  }
  if (o.recursiveProofPublicInputIndices === undefined) {
    throw new Error('Expected recursiveProofPublicInputIndices in VerificationKeyData serialization');
  }
  return {
    composer_type: o.composerType,
    circuit_size: o.circuitSize,
    num_public_inputs: o.numPublicInputs,
    commitments: o.commitments,
    contains_recursive_proof: o.containsRecursiveProof,
    recursive_proof_public_input_indices: o.recursiveProofPublicInputIndices.map((v: any) => v),
  };
}

export interface IPreviousKernelData {
  publicInputs: PublicInputs;
  proof: Proof;
  vk: VerificationKeyData;
  vkIndex: number;
  vkPath: FixedArray<Fr, 3>;
}

export function toPreviousKernelData(o: any): PreviousKernelData {
  if (o.public_inputs === undefined) {
    throw new Error('Expected public_inputs in PreviousKernelData deserialization');
  }
  if (o.proof === undefined) {
    throw new Error('Expected proof in PreviousKernelData deserialization');
  }
  if (o.vk === undefined) {
    throw new Error('Expected vk in PreviousKernelData deserialization');
  }
  if (o.vk_index === undefined) {
    throw new Error('Expected vk_index in PreviousKernelData deserialization');
  }
  if (o.vk_path === undefined) {
    throw new Error('Expected vk_path in PreviousKernelData deserialization');
  }
  return PreviousKernelData.from({
    publicInputs: toPublicInputs(o.public_inputs),
    proof: Proof.fromBuffer(o.proof),
    vk: toVerificationKeyData(o.vk),
    vkIndex: o.vk_index,
    vkPath: o.vk_path.map((v: any) => Fr.fromBuffer(v)),
  });
}

export function fromPreviousKernelData(o: PreviousKernelData): any {
  if (o.publicInputs === undefined) {
    throw new Error('Expected publicInputs in PreviousKernelData serialization');
  }
  if (o.proof === undefined) {
    throw new Error('Expected proof in PreviousKernelData serialization');
  }
  if (o.vk === undefined) {
    throw new Error('Expected vk in PreviousKernelData serialization');
  }
  if (o.vkIndex === undefined) {
    throw new Error('Expected vkIndex in PreviousKernelData serialization');
  }
  if (o.vkPath === undefined) {
    throw new Error('Expected vkPath in PreviousKernelData serialization');
  }
  return {
    public_inputs: toPublicInputs(o.publicInputs),
    proof: o.proof.toBuffer(),
    vk: toVerificationKeyData(o.vk),
    vk_index: o.vkIndex,
    vk_path: o.vkPath.map((v: any) => v.toBuffer()),
  };
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
