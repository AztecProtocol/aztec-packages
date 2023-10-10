import {
  AztecAddress,
  CallContext,
  ContractDeploymentData,
  EthAddress,
  Fr,
  FunctionData,
  FunctionSelector,
  HistoricBlockData,
  MembershipWitness,
  Point,
  PrivateCallData,
  PrivateCallStackItem,
  PrivateCircuitPublicInputs,
  PrivateKernelInputsInit,
  ReadRequestMembershipWitness,
  TxContext,
  TxRequest,
} from '@aztec/circuits.js';

import {
  CallContext as CallContextNoir,
  ContractDeploymentData as ContractDeploymentDataNoir,
  FunctionData as FunctionDataNoir,
  FunctionSelector as FunctionSelectorNoir,
  HistoricalBlockData as HistoricalBlockDataNoir,
  MembershipWitness as MembershipWitnessNoir,
  Address as NoirAztecAddress,
  EthAddress as NoirEthAddress,
  Field as NoirField,
  Point as NoirPoint,
  PrivateCallData as PrivateCallDataNoir,
  PrivateCallStackItem as PrivateCallStackItemNoir,
  PrivateCircuitPublicInputs as PrivateCircuitPublicInputsNoir,
  PrivateKernelInputsInit as PrivateKernelInputsInitNoir,
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
function mapFieldToNoir(field: Fr): NoirField {
  return field.toString();
}

/**
 * Maps a point to a noir point.
 * @param point - The point.
 * @returns The noir point.
 */
function mapPointToNoir(point: Point): NoirPoint {
  return {
    x: mapFieldToNoir(point.x),
    y: mapFieldToNoir(point.y),
  };
}

/**
 * Maps an aztec address to a noir aztec address.
 * @param address - The address.
 * @returns The noir aztec address.
 */
function mapAztecAddressToNoir(address: AztecAddress): NoirAztecAddress {
  return {
    inner: mapFieldToNoir(address.toField()),
  };
}

/**
 * Maps an eth address to a noir eth address.
 * @param address - The address.
 * @returns The noir eth address.
 */
function mapEthAddressToNoir(address: EthAddress): NoirEthAddress {
  return {
    inner: mapFieldToNoir(address.toField()),
  };
}

/**
 * Maps a contract deployment data to a noir contract deployment data.
 * @param data - The data.
 * @returns The noir contract deployment data.
 */
function mapContractDeploymentDataToNoir(data: ContractDeploymentData): ContractDeploymentDataNoir {
  return {
    deployer_public_key: mapPointToNoir(data.deployerPublicKey),
    constructor_vk_hash: mapFieldToNoir(data.constructorVkHash),
    function_tree_root: mapFieldToNoir(data.functionTreeRoot),
    contract_address_salt: mapFieldToNoir(data.contractAddressSalt),
    portal_contract_address: mapEthAddressToNoir(data.portalContractAddress),
  };
}

/**
 * Maps a tx context to a noir tx context.
 * @param txContext - The tx context.
 * @returns The noir tx context.
 */
function mapTxContextToNoir(txContext: TxContext): TxContextNoir {
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
 * Maps a function selector to a noir function selector.
 * @param functionSelector - The function selector.
 * @returns The noir function selector.
 */
function mapFunctionSelectorToNoir(functionSelector: FunctionSelector): FunctionSelectorNoir {
  return {
    inner: mapFieldToNoir(functionSelector.toField()),
  };
}

/**
 * Maps a function data to a noir function data.
 * @param functionData - The function data.
 * @returns The noir function data.
 */
function mapFunctionDataToNoir(functionData: FunctionData): FunctionDataNoir {
  return {
    selector: mapFunctionSelectorToNoir(functionData.selector),
    is_internal: functionData.isInternal,
    is_private: functionData.isPrivate,
    is_constructor: functionData.isConstructor,
  };
}

/**
 * Maps a tx request to a noir tx request.
 * @param txRequest - The tx request.
 * @returns The noir tx request.
 */
function mapTxRequestToNoir(txRequest: TxRequest): TxRequestNoir {
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
function mapCallContextToNoir(callContext: CallContext): CallContextNoir {
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
function mapHistoricalBlockDataToNoir(historicalBlockData: HistoricBlockData): HistoricalBlockDataNoir {
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
 * Maps private circuit public inputs to noir private circuit public inputs.
 * @param privateCircuitPublicInputs - The private circuit public inputs.
 * @returns The noir private circuit public inputs.
 */
function mapPrivateCircuitPublicInputsToNoir(
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
function mapPrivateCallStackItemToNoir(privateCallStackItem: PrivateCallStackItem): PrivateCallStackItemNoir {
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
function mapMembershipWitnessToNoir<N extends number>(membershipWitness: MembershipWitness<N>): MembershipWitnessNoir {
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
function mapReadRequestMembershipWitnessToNoir(
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
function mapPrivateCallDataToNoir(privateCallData: PrivateCallData): PrivateCallDataNoir {
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
