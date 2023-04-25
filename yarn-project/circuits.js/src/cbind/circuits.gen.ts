
/* eslint-disable */
// GENERATED FILE DO NOT EDIT
import { Buffer } from "buffer";
import { callCbind } from './cbind.js';
import { CircuitsWasm } from '../wasm/index.js';

// Utility types
export type FixedArray<T, L extends number> = [T, ...T[]] & { length: L };

export function toAffineElement(o: any) {
  if (o.x === undefined) { throw new Error("Expected x in AffineElement deserialization"); }
  if (o.y === undefined) { throw new Error("Expected y in AffineElement deserialization"); };
  return AffineElement.from({
  x: toField(o.x),
  y: toField(o.y),});
  }
export function toNativeAggregationState(o: any) {
  if (o.P0 === undefined) { throw new Error("Expected P0 in NativeAggregationState deserialization"); }
  if (o.P1 === undefined) { throw new Error("Expected P1 in NativeAggregationState deserialization"); }
  if (o.public_inputs === undefined) { throw new Error("Expected public_inputs in NativeAggregationState deserialization"); }
  if (o.proof_witness_indices === undefined) { throw new Error("Expected proof_witness_indices in NativeAggregationState deserialization"); }
  if (o.has_data === undefined) { throw new Error("Expected has_data in NativeAggregationState deserialization"); };
  return NativeAggregationState.from({
  P0: toAffineElement(o.P0),
  P1: toAffineElement(o.P1),
  publicInputs: toField[](o.public_inputs),
  proofWitnessIndices: tonumber[](o.proof_witness_indices),
  hasData: toboolean(o.has_data),});
  }
export function toNewContractData(o: any) {
  if (o.contract_address === undefined) { throw new Error("Expected contract_address in NewContractData deserialization"); }
  if (o.portal_contract_address === undefined) { throw new Error("Expected portal_contract_address in NewContractData deserialization"); }
  if (o.function_tree_root === undefined) { throw new Error("Expected function_tree_root in NewContractData deserialization"); };
  return NewContractData.from({
  contractAddress: toAztecAddress(o.contract_address),
  portalContractAddress: toAztecAddress(o.portal_contract_address),
  functionTreeRoot: toField(o.function_tree_root),});
  }
export function toFunctionData(o: any) {
  if (o.function_selector === undefined) { throw new Error("Expected function_selector in FunctionData deserialization"); }
  if (o.is_private === undefined) { throw new Error("Expected is_private in FunctionData deserialization"); }
  if (o.is_constructor === undefined) { throw new Error("Expected is_constructor in FunctionData deserialization"); };
  return FunctionData.from({
  functionSelector: tonumber(o.function_selector),
  isPrivate: toboolean(o.is_private),
  isConstructor: toboolean(o.is_constructor),});
  }
export function toOptionallyRevealedData(o: any) {
  if (o.call_stack_item_hash === undefined) { throw new Error("Expected call_stack_item_hash in OptionallyRevealedData deserialization"); }
  if (o.function_data === undefined) { throw new Error("Expected function_data in OptionallyRevealedData deserialization"); }
  if (o.emitted_events === undefined) { throw new Error("Expected emitted_events in OptionallyRevealedData deserialization"); }
  if (o.portal_contract_address === undefined) { throw new Error("Expected portal_contract_address in OptionallyRevealedData deserialization"); }
  if (o.pay_fee_from_l1 === undefined) { throw new Error("Expected pay_fee_from_l1 in OptionallyRevealedData deserialization"); }
  if (o.pay_fee_from_public_l2 === undefined) { throw new Error("Expected pay_fee_from_public_l2 in OptionallyRevealedData deserialization"); }
  if (o.called_from_l1 === undefined) { throw new Error("Expected called_from_l1 in OptionallyRevealedData deserialization"); }
  if (o.called_from_public_l2 === undefined) { throw new Error("Expected called_from_public_l2 in OptionallyRevealedData deserialization"); };
  return OptionallyRevealedData.from({
  callStackItemHash: toField(o.call_stack_item_hash),
  functionData: toFunctionData(o.function_data),
  emittedEvents: toFixedArray<Field, 4>(o.emitted_events),
  portalContractAddress: toAztecAddress(o.portal_contract_address),
  payFeeFromL1: toboolean(o.pay_fee_from_l1),
  payFeeFromPublicL2: toboolean(o.pay_fee_from_public_l2),
  calledFromL1: toboolean(o.called_from_l1),
  calledFromPublicL2: toboolean(o.called_from_public_l2),});
  }
export function toAccumulatedData(o: any) {
  if (o.aggregation_object === undefined) { throw new Error("Expected aggregation_object in AccumulatedData deserialization"); }
  if (o.private_call_count === undefined) { throw new Error("Expected private_call_count in AccumulatedData deserialization"); }
  if (o.new_commitments === undefined) { throw new Error("Expected new_commitments in AccumulatedData deserialization"); }
  if (o.new_nullifiers === undefined) { throw new Error("Expected new_nullifiers in AccumulatedData deserialization"); }
  if (o.private_call_stack === undefined) { throw new Error("Expected private_call_stack in AccumulatedData deserialization"); }
  if (o.public_call_stack === undefined) { throw new Error("Expected public_call_stack in AccumulatedData deserialization"); }
  if (o.l1_msg_stack === undefined) { throw new Error("Expected l1_msg_stack in AccumulatedData deserialization"); }
  if (o.new_contracts === undefined) { throw new Error("Expected new_contracts in AccumulatedData deserialization"); }
  if (o.optionally_revealed_data === undefined) { throw new Error("Expected optionally_revealed_data in AccumulatedData deserialization"); };
  return AccumulatedData.from({
  aggregationObject: toNativeAggregationState(o.aggregation_object),
  privateCallCount: toField(o.private_call_count),
  newCommitments: toFixedArray<Field, 4>(o.new_commitments),
  newNullifiers: toFixedArray<Field, 4>(o.new_nullifiers),
  privateCallStack: toFixedArray<Field, 8>(o.private_call_stack),
  publicCallStack: toFixedArray<Field, 8>(o.public_call_stack),
  l1MsgStack: toFixedArray<Field, 4>(o.l1_msg_stack),
  newContracts: toFixedArray<NewContractData, 1>(o.new_contracts),
  optionallyRevealedData: toFixedArray<OptionallyRevealedData, 4>(o.optionally_revealed_data),});
  }
export function toHistoricTreeRoots(o: any) {
  if (o.private_data_tree_root === undefined) { throw new Error("Expected private_data_tree_root in HistoricTreeRoots deserialization"); }
  if (o.nullifier_tree_root === undefined) { throw new Error("Expected nullifier_tree_root in HistoricTreeRoots deserialization"); }
  if (o.contract_tree_root === undefined) { throw new Error("Expected contract_tree_root in HistoricTreeRoots deserialization"); }
  if (o.private_kernel_vk_tree_root === undefined) { throw new Error("Expected private_kernel_vk_tree_root in HistoricTreeRoots deserialization"); };
  return HistoricTreeRoots.from({
  privateDataTreeRoot: toField(o.private_data_tree_root),
  nullifierTreeRoot: toField(o.nullifier_tree_root),
  contractTreeRoot: toField(o.contract_tree_root),
  privateKernelVkTreeRoot: toField(o.private_kernel_vk_tree_root),});
  }
export function toContractDeploymentData(o: any) {
  if (o.constructor_vk_hash === undefined) { throw new Error("Expected constructor_vk_hash in ContractDeploymentData deserialization"); }
  if (o.function_tree_root === undefined) { throw new Error("Expected function_tree_root in ContractDeploymentData deserialization"); }
  if (o.contract_address_salt === undefined) { throw new Error("Expected contract_address_salt in ContractDeploymentData deserialization"); }
  if (o.portal_contract_address === undefined) { throw new Error("Expected portal_contract_address in ContractDeploymentData deserialization"); };
  return ContractDeploymentData.from({
  constructorVkHash: toField(o.constructor_vk_hash),
  functionTreeRoot: toField(o.function_tree_root),
  contractAddressSalt: toField(o.contract_address_salt),
  portalContractAddress: toAztecAddress(o.portal_contract_address),});
  }
export function toTxContext(o: any) {
  if (o.is_fee_payment_tx === undefined) { throw new Error("Expected is_fee_payment_tx in TxContext deserialization"); }
  if (o.is_rebate_payment_tx === undefined) { throw new Error("Expected is_rebate_payment_tx in TxContext deserialization"); }
  if (o.is_contract_deployment_tx === undefined) { throw new Error("Expected is_contract_deployment_tx in TxContext deserialization"); }
  if (o.contract_deployment_data === undefined) { throw new Error("Expected contract_deployment_data in TxContext deserialization"); };
  return TxContext.from({
  isFeePaymentTx: toboolean(o.is_fee_payment_tx),
  isRebatePaymentTx: toboolean(o.is_rebate_payment_tx),
  isContractDeploymentTx: toboolean(o.is_contract_deployment_tx),
  contractDeploymentData: toContractDeploymentData(o.contract_deployment_data),});
  }
export function toConstantData(o: any) {
  if (o.historic_tree_roots === undefined) { throw new Error("Expected historic_tree_roots in ConstantData deserialization"); }
  if (o.tx_context === undefined) { throw new Error("Expected tx_context in ConstantData deserialization"); };
  return ConstantData.from({
  historicTreeRoots: toHistoricTreeRoots(o.historic_tree_roots),
  txContext: toTxContext(o.tx_context),});
  }
export function toPublicInputs(o: any) {
  if (o.end === undefined) { throw new Error("Expected end in PublicInputs deserialization"); }
  if (o.constants === undefined) { throw new Error("Expected constants in PublicInputs deserialization"); }
  if (o.is_private === undefined) { throw new Error("Expected is_private in PublicInputs deserialization"); };
  return PublicInputs.from({
  end: toAccumulatedData(o.end),
  constants: toConstantData(o.constants),
  isPrivate: toboolean(o.is_private),});
  }
export function toProof(o: any) {
  if (o.proof_data === undefined) { throw new Error("Expected proof_data in Proof deserialization"); };
  return Proof.from({
  proofData: toBuffer(o.proof_data),});
  }
export function toVerificationKeyData(o: any) {
  if (o.composer_type === undefined) { throw new Error("Expected composer_type in VerificationKeyData deserialization"); }
  if (o.circuit_size === undefined) { throw new Error("Expected circuit_size in VerificationKeyData deserialization"); }
  if (o.num_public_inputs === undefined) { throw new Error("Expected num_public_inputs in VerificationKeyData deserialization"); }
  if (o.commitments === undefined) { throw new Error("Expected commitments in VerificationKeyData deserialization"); }
  if (o.contains_recursive_proof === undefined) { throw new Error("Expected contains_recursive_proof in VerificationKeyData deserialization"); }
  if (o.recursive_proof_public_input_indices === undefined) { throw new Error("Expected recursive_proof_public_input_indices in VerificationKeyData deserialization"); };
  return VerificationKeyData.from({
  composerType: tonumber(o.composer_type),
  circuitSize: tonumber(o.circuit_size),
  numPublicInputs: tonumber(o.num_public_inputs),
  commitments: toRecord<string, AffineElement>(o.commitments),
  containsRecursiveProof: toboolean(o.contains_recursive_proof),
  recursiveProofPublicInputIndices: tonumber[](o.recursive_proof_public_input_indices),});
  }
export function toPreviousKernelData(o: any) {
  if (o.public_inputs === undefined) { throw new Error("Expected public_inputs in PreviousKernelData deserialization"); }
  if (o.proof === undefined) { throw new Error("Expected proof in PreviousKernelData deserialization"); }
  if (o.vk === undefined) { throw new Error("Expected vk in PreviousKernelData deserialization"); }
  if (o.vk_index === undefined) { throw new Error("Expected vk_index in PreviousKernelData deserialization"); }
  if (o.vk_path === undefined) { throw new Error("Expected vk_path in PreviousKernelData deserialization"); };
  return PreviousKernelData.from({
  publicInputs: toPublicInputs(o.public_inputs),
  proof: toProof(o.proof),
  vk: toVerificationKeyData(o.vk),
  vkIndex: tonumber(o.vk_index),
  vkPath: toFixedArray<Field, 3>(o.vk_path),});
  }
export function abisComputeContractAddress(wasm: CircuitsWasm, arg0: AztecAddress, arg1: Field, arg2: Field, arg3: Field): Promise<AztecAddress> {
  return callCbind(wasm, 'abis__compute_contract_address', [arg0, arg1, arg2, arg3]);
}
export function privateKernelDummyPreviousKernel(wasm: CircuitsWasm, ): Promise<PreviousKernelData> {
  return callCbind(wasm, 'private_kernel__dummy_previous_kernel', []);
}