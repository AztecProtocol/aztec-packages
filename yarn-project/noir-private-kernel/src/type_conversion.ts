import {
  AggregationObject,
  AztecAddress,
  CallContext,
  CombinedAccumulatedData,
  CombinedConstantData,
  ContractDeploymentData,
  EthAddress,
  Fr,
  FunctionData,
  FunctionSelector,
  HistoricBlockData,
  KernelCircuitPublicInputs,
  MAX_NEW_COMMITMENTS_PER_TX,
  MAX_NEW_CONTRACTS_PER_TX,
  MAX_NEW_L2_TO_L1_MSGS_PER_TX,
  MAX_NEW_NULLIFIERS_PER_TX,
  MAX_OPTIONALLY_REVEALED_DATA_LENGTH_PER_TX,
  MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
  MAX_PUBLIC_DATA_READS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_READ_REQUESTS_PER_TX,
  MembershipWitness,
  NewContractData,
  OptionallyRevealedData,
  Point,
  PrivateCallData,
  PrivateCallStackItem,
  PrivateCircuitPublicInputs,
  PrivateKernelInputsInit,
  PublicDataRead,
  PublicDataUpdateRequest,
  ReadRequestMembershipWitness,
  TxContext,
  TxRequest,
} from '@aztec/circuits.js';
import { Tuple } from '@aztec/foundation/serialize';

import {
  CallContext as CallContextNoir,
  CombinedAccumulatedData as CombinedAccumulatedDataNoir,
  CombinedConstantData as CombinedConstantDataNoir,
  ContractDeploymentData as ContractDeploymentDataNoir,
  FunctionData as FunctionDataNoir,
  FunctionSelector as FunctionSelectorNoir,
  HistoricalBlockData as HistoricalBlockDataNoir,
  KernelCircuitPublicInputs as KernelCircuitPublicInputsNoir,
  MembershipWitness as MembershipWitnessNoir,
  NewContractData as NewContractDataNoir,
  Address as NoirAztecAddress,
  EthAddress as NoirEthAddress,
  Field as NoirField,
  Point as NoirPoint,
  OptionallyRevealedData as OptionallyRevealedDataNoir,
  PrivateCallData as PrivateCallDataNoir,
  PrivateCallStackItem as PrivateCallStackItemNoir,
  PrivateCircuitPublicInputs as PrivateCircuitPublicInputsNoir,
  PrivateKernelInputsInit as PrivateKernelInputsInitNoir,
  PublicDataRead as PublicDataReadNoir,
  PublicDataUpdateRequest as PublicDataUpdateRequestNoir,
  ReadRequestMembershipWitness as ReadRequestMembershipWitnessNoir,
  TxContext as TxContextNoir,
  TxRequest as TxRequestNoir,
} from './types/private_kernel_init_types.js';

/* eslint-disable camelcase */

/**
 * Maps a field to a noir field.
 * @param field - The field.
 * @returns The noir field.
 */
export function mapFieldToNoir(field: Fr): NoirField {
  return field.toString();
}

/**
 * Maps a noir field to a fr.
 * @param field - The noir field.
 * @returns The fr.
 */
export function mapFieldFromNoir(field: NoirField): Fr {
  return Fr.fromString(field);
}

/**
 * Maps a point to a noir point.
 * @param point - The point.
 * @returns The noir point.
 */
export function mapPointToNoir(point: Point): NoirPoint {
  return {
    x: mapFieldToNoir(point.x),
    y: mapFieldToNoir(point.y),
  };
}

/**
 * Maps a noir point to a point.
 * @param point - The noir point.
 * @returns The point.
 */
export function mapPointFromNoir(point: NoirPoint): Point {
  return new Point(mapFieldFromNoir(point.x), mapFieldFromNoir(point.y));
}

/**
 * Maps an aztec address to a noir aztec address.
 * @param address - The address.
 * @returns The noir aztec address.
 */
export function mapAztecAddressToNoir(address: AztecAddress): NoirAztecAddress {
  return {
    inner: mapFieldToNoir(address.toField()),
  };
}

/**
 * Maps a noir aztec address to an aztec address.
 * @param address - The noir aztec address.
 * @returns The aztec address.
 */
export function mapAztecAddressFromNoir(address: NoirAztecAddress): AztecAddress {
  return AztecAddress.fromField(mapFieldFromNoir(address.inner));
}

/**
 * Maps an eth address to a noir eth address.
 * @param address - The address.
 * @returns The noir eth address.
 */
export function mapEthAddressToNoir(address: EthAddress): NoirEthAddress {
  return {
    inner: mapFieldToNoir(address.toField()),
  };
}

/**
 * Maps a noir eth address to an eth address.
 * @param address - The noir eth address.
 * @returns The eth address.
 */
export function mapEthAddressFromNoir(address: NoirEthAddress): EthAddress {
  return EthAddress.fromField(mapFieldFromNoir(address.inner));
}

/**
 * Maps a contract deployment data to a noir contract deployment data.
 * @param data - The data.
 * @returns The noir contract deployment data.
 */
export function mapContractDeploymentDataToNoir(data: ContractDeploymentData): ContractDeploymentDataNoir {
  return {
    deployer_public_key: mapPointToNoir(data.deployerPublicKey),
    constructor_vk_hash: mapFieldToNoir(data.constructorVkHash),
    function_tree_root: mapFieldToNoir(data.functionTreeRoot),
    contract_address_salt: mapFieldToNoir(data.contractAddressSalt),
    portal_contract_address: mapEthAddressToNoir(data.portalContractAddress),
  };
}

/**
 * Maps a noir contract deployment data to a contract deployment data.
 * @param data - The noir data.
 * @returns The contract deployment data.
 */
export function mapContractDeploymentDataFromNoir(data: ContractDeploymentDataNoir): ContractDeploymentData {
  return new ContractDeploymentData(
    mapPointFromNoir(data.deployer_public_key),
    mapFieldFromNoir(data.constructor_vk_hash),
    mapFieldFromNoir(data.function_tree_root),
    mapFieldFromNoir(data.contract_address_salt),
    mapEthAddressFromNoir(data.portal_contract_address),
  );
}

/**
 * Maps a tx context to a noir tx context.
 * @param txContext - The tx context.
 * @returns The noir tx context.
 */
export function mapTxContextToNoir(txContext: TxContext): TxContextNoir {
  return {
    is_fee_payment_tx: txContext.isFeePaymentTx,
    is_rebate_payment_tx: txContext.isRebatePaymentTx,
    is_contract_deployment_tx: txContext.isContractDeploymentTx,
    contract_deployment_data: mapContractDeploymentDataToNoir(txContext.contractDeploymentData),
    chain_id: mapFieldToNoir(txContext.chainId),
    version: mapFieldToNoir(txContext.version),
  };
}

/**
 * Maps a noir tx context to a tx context.
 * @param txContext - The noir tx context.
 * @returns The tx context.
 */
export function mapTxContextFromNoir(txContext: TxContextNoir): TxContext {
  return new TxContext(
    txContext.is_fee_payment_tx,
    txContext.is_rebate_payment_tx,
    txContext.is_contract_deployment_tx,
    mapContractDeploymentDataFromNoir(txContext.contract_deployment_data),
    mapFieldFromNoir(txContext.chain_id),
    mapFieldFromNoir(txContext.version),
  );
}

/**
 * Maps a function selector to a noir function selector.
 * @param functionSelector - The function selector.
 * @returns The noir function selector.
 */
export function mapFunctionSelectorToNoir(functionSelector: FunctionSelector): FunctionSelectorNoir {
  return {
    inner: mapFieldToNoir(functionSelector.toField()),
  };
}

/**
 * Maps a noir function selector to a function selector.
 * @param functionSelector - The noir function selector.
 * @returns The function selector.
 */
export function mapFunctionSelectorFromNoir(functionSelector: FunctionSelectorNoir): FunctionSelector {
  return FunctionSelector.fromField(mapFieldFromNoir(functionSelector.inner));
}

/**
 * Maps a function data to a noir function data.
 * @param functionData - The function data.
 * @returns The noir function data.
 */
export function mapFunctionDataToNoir(functionData: FunctionData): FunctionDataNoir {
  return {
    selector: mapFunctionSelectorToNoir(functionData.selector),
    is_internal: functionData.isInternal,
    is_private: functionData.isPrivate,
    is_constructor: functionData.isConstructor,
  };
}

/**
 * Maps a noir function data to a function data.
 * @param functionData - The noir function data.
 * @returns The function data.
 */
export function mapFunctionDataFromNoir(functionData: FunctionDataNoir): FunctionData {
  return new FunctionData(
    mapFunctionSelectorFromNoir(functionData.selector),
    functionData.is_internal,
    functionData.is_private,
    functionData.is_constructor,
  );
}

/**
 * Maps a tx request to a noir tx request.
 * @param txRequest - The tx request.
 * @returns The noir tx request.
 */
export function mapTxRequestToNoir(txRequest: TxRequest): TxRequestNoir {
  return {
    origin: mapAztecAddressToNoir(txRequest.origin),
    args_hash: mapFieldToNoir(txRequest.argsHash),
    tx_context: mapTxContextToNoir(txRequest.txContext),
    function_data: mapFunctionDataToNoir(txRequest.functionData),
  };
}

/**
 * Maps a call context to a noir call context.
 * @param callContext - The call context.
 * @returns The noir call context.
 */
export function mapCallContextToNoir(callContext: CallContext): CallContextNoir {
  return {
    msg_sender: mapAztecAddressToNoir(callContext.msgSender),
    storage_contract_address: mapAztecAddressToNoir(callContext.storageContractAddress),
    portal_contract_address: mapEthAddressToNoir(callContext.portalContractAddress),
    function_selector: mapFunctionSelectorToNoir(callContext.functionSelector),
    is_delegate_call: callContext.isDelegateCall,
    is_static_call: callContext.isStaticCall,
    is_contract_deployment: callContext.isContractDeployment,
  };
}

/**
 * Maps a historical block data to a noir historical block data.
 * @param historicalBlockData - The historical block data.
 * @returns The noir historical block data.
 */
export function mapHistoricalBlockDataToNoir(historicalBlockData: HistoricBlockData): HistoricalBlockDataNoir {
  return {
    blocks_tree_root: mapFieldToNoir(historicalBlockData.blocksTreeRoot),
    block: {
      private_data_tree_root: mapFieldToNoir(historicalBlockData.privateDataTreeRoot),
      nullifier_tree_root: mapFieldToNoir(historicalBlockData.nullifierTreeRoot),
      contract_tree_root: mapFieldToNoir(historicalBlockData.contractTreeRoot),
      l1_to_l2_data_tree_root: mapFieldToNoir(historicalBlockData.l1ToL2MessagesTreeRoot),
      public_data_tree_root: mapFieldToNoir(historicalBlockData.publicDataTreeRoot),
      global_variables_hash: mapFieldToNoir(historicalBlockData.globalVariablesHash),
    },
    private_kernel_vk_tree_root: mapFieldToNoir(historicalBlockData.privateKernelVkTreeRoot),
  };
}

/**
 * Maps a noir historical block data to a historical block data.
 * @param historicalBlockData - The noir historical block data.
 * @returns The historical block data.
 */
export function mapHistoricalBlockDataFromNoir(historicalBlockData: HistoricalBlockDataNoir): HistoricBlockData {
  return new HistoricBlockData(
    mapFieldFromNoir(historicalBlockData.block.private_data_tree_root),
    mapFieldFromNoir(historicalBlockData.block.nullifier_tree_root),
    mapFieldFromNoir(historicalBlockData.block.contract_tree_root),
    mapFieldFromNoir(historicalBlockData.block.l1_to_l2_data_tree_root),
    mapFieldFromNoir(historicalBlockData.blocks_tree_root),
    mapFieldFromNoir(historicalBlockData.private_kernel_vk_tree_root),
    mapFieldFromNoir(historicalBlockData.block.public_data_tree_root),
    mapFieldFromNoir(historicalBlockData.block.global_variables_hash),
  );
}

/**
 * Maps private circuit public inputs to noir private circuit public inputs.
 * @param privateCircuitPublicInputs - The private circuit public inputs.
 * @returns The noir private circuit public inputs.
 */
export function mapPrivateCircuitPublicInputsToNoir(
  privateCircuitPublicInputs: PrivateCircuitPublicInputs,
): PrivateCircuitPublicInputsNoir {
  return {
    call_context: mapCallContextToNoir(privateCircuitPublicInputs.callContext),
    args_hash: mapFieldToNoir(privateCircuitPublicInputs.argsHash),
    return_values: privateCircuitPublicInputs.returnValues.map(mapFieldToNoir),
    read_requests: privateCircuitPublicInputs.readRequests.map(mapFieldToNoir),
    new_commitments: privateCircuitPublicInputs.newCommitments.map(mapFieldToNoir),
    new_nullifiers: privateCircuitPublicInputs.newNullifiers.map(mapFieldToNoir),
    nullified_commitments: privateCircuitPublicInputs.nullifiedCommitments.map(mapFieldToNoir),
    private_call_stack: privateCircuitPublicInputs.privateCallStack.map(mapFieldToNoir),
    public_call_stack: privateCircuitPublicInputs.publicCallStack.map(mapFieldToNoir),
    new_l2_to_l1_msgs: privateCircuitPublicInputs.newL2ToL1Msgs.map(mapFieldToNoir),
    encrypted_logs_hash: privateCircuitPublicInputs.encryptedLogsHash.map(mapFieldToNoir),
    unencrypted_logs_hash: privateCircuitPublicInputs.unencryptedLogsHash.map(mapFieldToNoir),
    encrypted_log_preimages_length: mapFieldToNoir(privateCircuitPublicInputs.encryptedLogPreimagesLength),
    unencrypted_log_preimages_length: mapFieldToNoir(privateCircuitPublicInputs.unencryptedLogPreimagesLength),
    historical_block_data: mapHistoricalBlockDataToNoir(privateCircuitPublicInputs.historicBlockData),
    contract_deployment_data: mapContractDeploymentDataToNoir(privateCircuitPublicInputs.contractDeploymentData),
    chain_id: mapFieldToNoir(privateCircuitPublicInputs.chainId),
    version: mapFieldToNoir(privateCircuitPublicInputs.version),
  };
}

/**
 * Maps a private call stack item to a noir private call stack item.
 * @param privateCallStackItem - The private call stack item.
 * @returns The noir private call stack item.
 */
export function mapPrivateCallStackItemToNoir(privateCallStackItem: PrivateCallStackItem): PrivateCallStackItemNoir {
  return {
    inner: {
      contract_address: mapAztecAddressToNoir(privateCallStackItem.contractAddress),
      public_inputs: mapPrivateCircuitPublicInputsToNoir(privateCallStackItem.publicInputs),
      is_execution_request: privateCallStackItem.isExecutionRequest,
      function_data: mapFunctionDataToNoir(privateCallStackItem.functionData),
    },
  };
}

/**
 * Maps a membership witness to a noir membership witness.
 * @param membershipWitness - The membership witness.
 * @returns The noir membership witness.
 */
export function mapMembershipWitnessToNoir<N extends number>(
  membershipWitness: MembershipWitness<N>,
): MembershipWitnessNoir {
  return {
    leaf_index: membershipWitness.leafIndex.toString(),
    sibling_path: membershipWitness.siblingPath.map(mapFieldToNoir),
  };
}

/**
 * Maps a read request membership witness to a noir read request membership witness.
 * @param readRequestMembershipWitness - The read request membership witness.
 * @returns The noir read request membership witness.
 */
export function mapReadRequestMembershipWitnessToNoir(
  readRequestMembershipWitness: ReadRequestMembershipWitness,
): ReadRequestMembershipWitnessNoir {
  return {
    leaf_index: mapFieldToNoir(readRequestMembershipWitness.leafIndex),
    sibling_path: readRequestMembershipWitness.siblingPath.map(mapFieldToNoir),
    is_transient: readRequestMembershipWitness.isTransient,
    hint_to_commitment: mapFieldToNoir(readRequestMembershipWitness.hintToCommitment),
  };
}

/**
 * Maps a private call data to a noir private call data.
 * @param privateCallData - The private call data.
 * @returns The noir private call data.
 */
export function mapPrivateCallDataToNoir(privateCallData: PrivateCallData): PrivateCallDataNoir {
  return {
    call_stack_item: mapPrivateCallStackItemToNoir(privateCallData.callStackItem),
    private_call_stack_preimages: privateCallData.privateCallStackPreimages.map(mapPrivateCallStackItemToNoir),
    proof: {},
    vk: {},
    function_leaf_membership_witness: mapMembershipWitnessToNoir(privateCallData.functionLeafMembershipWitness),
    contract_leaf_membership_witness: mapMembershipWitnessToNoir(privateCallData.contractLeafMembershipWitness),
    read_request_membership_witnesses: privateCallData.readRequestMembershipWitnesses.map(
      mapReadRequestMembershipWitnessToNoir,
    ),
    //TODO this seems like the wrong type in circuits.js
    portal_contract_address: mapEthAddressToNoir(EthAddress.fromField(privateCallData.portalContractAddress)),
    acir_hash: mapFieldToNoir(privateCallData.acirHash),
  };
}

/**
 * Maps an array from noir types to a tuple of parsed types.
 * @param noirArray - The noir array.
 * @param length - The length of the tuple.
 * @param mapper - The mapper function applied to each element.
 * @returns The tuple.
 */
export function mapTupleFromNoir<T, N extends number, M>(
  noirArray: T[],
  length: N,
  mapper: (item: T) => M,
): Tuple<M, N> {
  if (noirArray.length != length) {
    throw new Error(`Expected ${length} items, got ${noirArray.length}`);
  }
  return Array.from({ length }, (_, idx) => mapper(noirArray[idx])) as Tuple<M, N>;
}

/**
 * Maps optionally revealed data from noir to the parsed type.
 * @param optionallyRevealedData - The noir optionally revealed data.
 * @returns The parsed optionally revealed data.
 */
export function mapOptionallyRevealedDataFromNoir(
  optionallyRevealedData: OptionallyRevealedDataNoir,
): OptionallyRevealedData {
  return new OptionallyRevealedData(
    mapFieldFromNoir(optionallyRevealedData.call_stack_item_hash),
    mapFunctionDataFromNoir(optionallyRevealedData.function_data),
    mapFieldFromNoir(optionallyRevealedData.vk_hash),
    mapEthAddressFromNoir(optionallyRevealedData.portal_contract_address),
    optionallyRevealedData.pay_fee_from_l1,
    optionallyRevealedData.pay_fee_from_public_l2,
    optionallyRevealedData.called_from_l1,
    optionallyRevealedData.called_from_public_l2,
  );
}

/**
 * Maps new contract data from noir to the parsed type.
 * @param newContractData - The noir new contract data.
 * @returns The parsed new contract data.
 */
export function mapNewContractDataFromNoir(newContractData: NewContractDataNoir): NewContractData {
  return new NewContractData(
    mapAztecAddressFromNoir(newContractData.contract_address),
    mapEthAddressFromNoir(newContractData.portal_contract_address),
    mapFieldFromNoir(newContractData.function_tree_root),
  );
}

/**
 * Maps public data update request from noir to the parsed type.
 * @param publicDataUpdateRequest - The noir public data update request.
 * @returns The parsed public data update request.
 */
export function mapPublicDataUpdateRequestFromNoir(
  publicDataUpdateRequest: PublicDataUpdateRequestNoir,
): PublicDataUpdateRequest {
  return new PublicDataUpdateRequest(
    mapFieldFromNoir(publicDataUpdateRequest.leaf_index),
    mapFieldFromNoir(publicDataUpdateRequest.old_value),
    mapFieldFromNoir(publicDataUpdateRequest.new_value),
  );
}

/**
 * Maps public data read from noir to the parsed type.
 * @param publicDataRead - The noir public data read.
 * @returns The parsed public data read.
 */
export function mapPublicDataReadFromNoir(publicDataRead: PublicDataReadNoir): PublicDataRead {
  return new PublicDataRead(mapFieldFromNoir(publicDataRead.leaf_index), mapFieldFromNoir(publicDataRead.value));
}

/**
 * Maps combined accumulated data from noir to the parsed type.
 * @param combinedAccumulatedData - The noir combined accumulated data.
 * @returns The parsed combined accumulated data.
 */
export function mapCombinedAccumulatedDataFromNoir(
  combinedAccumulatedData: CombinedAccumulatedDataNoir,
): CombinedAccumulatedData {
  return new CombinedAccumulatedData(
    // TODO aggregation object
    AggregationObject.makeFake(),
    mapTupleFromNoir(combinedAccumulatedData.read_requests, MAX_READ_REQUESTS_PER_TX, mapFieldFromNoir),
    mapTupleFromNoir(combinedAccumulatedData.new_commitments, MAX_NEW_COMMITMENTS_PER_TX, mapFieldFromNoir),
    mapTupleFromNoir(combinedAccumulatedData.new_nullifiers, MAX_NEW_NULLIFIERS_PER_TX, mapFieldFromNoir),
    mapTupleFromNoir(combinedAccumulatedData.nullified_commitments, MAX_NEW_NULLIFIERS_PER_TX, mapFieldFromNoir),
    mapTupleFromNoir(
      combinedAccumulatedData.private_call_stack,
      MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
      mapFieldFromNoir,
    ),
    mapTupleFromNoir(combinedAccumulatedData.public_call_stack, MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, mapFieldFromNoir),
    mapTupleFromNoir(combinedAccumulatedData.new_l2_to_l1_msgs, MAX_NEW_L2_TO_L1_MSGS_PER_TX, mapFieldFromNoir),
    mapTupleFromNoir(combinedAccumulatedData.encrypted_logs_hash, 2, mapFieldFromNoir),
    mapTupleFromNoir(combinedAccumulatedData.unencrypted_logs_hash, 2, mapFieldFromNoir),
    mapFieldFromNoir(combinedAccumulatedData.encrypted_log_preimages_length),
    mapFieldFromNoir(combinedAccumulatedData.unencrypted_log_preimages_length),
    mapTupleFromNoir(combinedAccumulatedData.new_contracts, MAX_NEW_CONTRACTS_PER_TX, mapNewContractDataFromNoir),
    mapTupleFromNoir(
      combinedAccumulatedData.optionally_revealed_data,
      MAX_OPTIONALLY_REVEALED_DATA_LENGTH_PER_TX,
      mapOptionallyRevealedDataFromNoir,
    ),
    mapTupleFromNoir(
      combinedAccumulatedData.public_data_update_requests,
      MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      mapPublicDataUpdateRequestFromNoir,
    ),
    mapTupleFromNoir(
      combinedAccumulatedData.public_data_reads,
      MAX_PUBLIC_DATA_READS_PER_TX,
      mapPublicDataReadFromNoir,
    ),
  );
}

/**
 * Maps combined constant data from noir to the parsed type.
 * @param combinedConstantData - The noir combined constant data.
 * @returns The parsed combined constant data.
 */
export function mapCombinedConstantDataFromNoir(combinedConstantData: CombinedConstantDataNoir): CombinedConstantData {
  return new CombinedConstantData(
    mapHistoricalBlockDataFromNoir(combinedConstantData.block_data),
    mapTxContextFromNoir(combinedConstantData.tx_context),
  );
}

/**
 * Maps the inputs to the private kernel init to the noir representation.
 * @param privateKernelInputsInit - The inputs to the private kernel init.
 * @returns The noir representation of those inputs.
 */
export function mapPrivateKernelInputsInitToNoir(
  privateKernelInputsInit: PrivateKernelInputsInit,
): PrivateKernelInputsInitNoir {
  return {
    tx_request: mapTxRequestToNoir(privateKernelInputsInit.txRequest),
    private_call: mapPrivateCallDataToNoir(privateKernelInputsInit.privateCall),
  };
}

/**
 * Maps a private circuit public inputs from noir to the circuits.js type.
 * @param kernelCircuitPublicInputs - The noir private circuit public inputs.
 * @returns The circuits.js private circuit public inputs.
 */
export function mapKernelCircuitPublicInputsFromNoir(
  kernelCircuitPublicInputs: KernelCircuitPublicInputsNoir,
): KernelCircuitPublicInputs {
  return new KernelCircuitPublicInputs(
    mapCombinedAccumulatedDataFromNoir(kernelCircuitPublicInputs.end),
    mapCombinedConstantDataFromNoir(kernelCircuitPublicInputs.constants),
    kernelCircuitPublicInputs.is_private,
  );
}
