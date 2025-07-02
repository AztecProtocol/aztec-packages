import {
  CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  type NOTE_HASH_TREE_HEIGHT,
  type NULLIFIER_TREE_HEIGHT,
  UPDATES_SHARED_MUTABLE_VALUES_LEN,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { assertLength, mapTuple } from '@aztec/foundation/serialize';
import {
  CountedPublicCallRequest,
  KeyValidationHint,
  KeyValidationRequest,
  KeyValidationRequestAndGenerator,
  NoteHash,
  type NoteHashReadRequestHints,
  Nullifier,
  type NullifierReadRequestHints,
  PaddedSideEffectAmounts,
  PaddedSideEffects,
  PartialPrivateTailPublicInputsForPublic,
  PartialPrivateTailPublicInputsForRollup,
  PendingReadHint,
  PrivateAccumulatedData,
  type PrivateCallData,
  PrivateCallRequest,
  PrivateCircuitPublicInputs,
  PrivateKernelCircuitPublicInputs,
  type PrivateKernelData,
  PrivateKernelResetHints,
  PrivateKernelTailCircuitPublicInputs,
  PrivateLogData,
  PrivateToPublicAccumulatedData,
  PrivateValidationRequests,
  type PrivateVerificationKeyHints,
  ReadRequest,
  ReadRequestAction,
  ScopedKeyValidationRequestAndGenerator,
  ScopedNoteHash,
  ScopedNullifier,
  ScopedPrivateLogData,
  ScopedReadRequest,
  SettledReadHint,
  TransientDataIndexHint,
} from '@aztec/stdlib/kernel';
import type { PublicKeys } from '@aztec/stdlib/keys';
import type { NullifierLeafPreimage } from '@aztec/stdlib/trees';
import { CallContext, FunctionData, TxConstantData, TxRequest } from '@aztec/stdlib/tx';

import type {
  CallContext as CallContextNoir,
  Counted,
  FixedLengthArray,
  FunctionData as FunctionDataNoir,
  KeyValidationHint as KeyValidationHintNoir,
  KeyValidationRequestAndGenerator as KeyValidationRequestAndGeneratorNoir,
  KeyValidationRequest as KeyValidationRequestsNoir,
  NoteHashLeafPreimage as NoteHashLeafPreimageNoir,
  NoteHash as NoteHashNoir,
  NoteHashReadRequestHints as NoteHashReadRequestHintsNoir,
  NoteHashSettledReadHint as NoteHashSettledReadHintNoir,
  Nullifier as NullifierNoir,
  NullifierReadRequestHints as NullifierReadRequestHintsNoir,
  NullifierSettledReadHint as NullifierSettledReadHintNoir,
  PaddedSideEffectAmounts as PaddedSideEffectAmountsNoir,
  PaddedSideEffects as PaddedSideEffectsNoir,
  PendingReadHint as PendingReadHintNoir,
  PrivateAccumulatedData as PrivateAccumulatedDataNoir,
  PrivateCallDataWithoutPublicInputs as PrivateCallDataWithoutPublicInputsNoir,
  PrivateCallRequest as PrivateCallRequestNoir,
  PrivateCircuitPublicInputs as PrivateCircuitPublicInputsNoir,
  PrivateKernelCircuitPublicInputs as PrivateKernelCircuitPublicInputsNoir,
  PrivateKernelDataWithoutPublicInputs as PrivateKernelDataWithoutPublicInputsNoir,
  PrivateKernelResetHints as PrivateKernelResetHintsNoir,
  PrivateLogData as PrivateLogDataNoir,
  PrivateToPublicAccumulatedData as PrivateToPublicAccumulatedDataNoir,
  PrivateToPublicKernelCircuitPublicInputs as PrivateToPublicKernelCircuitPublicInputsNoir,
  PrivateToRollupKernelCircuitPublicInputs as PrivateToRollupKernelCircuitPublicInputsNoir,
  PrivateValidationRequests as PrivateValidationRequestsNoir,
  PrivateVerificationKeyHints as PrivateVerificationKeyHintsNoir,
  PublicCallRequest as PublicCallRequestNoir,
  PublicKeys as PublicKeysNoir,
  ReadRequestAction as ReadRequestActionNoir,
  ReadRequest as ReadRequestNoir,
  Scoped,
  ScopedKeyValidationRequestAndGenerator as ScopedKeyValidationRequestAndGeneratorNoir,
  ScopedNoteHash as ScopedNoteHashNoir,
  ScopedNullifier as ScopedNullifierNoir,
  ScopedReadRequest as ScopedReadRequestNoir,
  TransientDataIndexHint as TransientDataIndexHintNoir,
  TxConstantData as TxConstantDataNoir,
  TxRequest as TxRequestNoir,
} from '../types/index.js';
import {
  mapAztecAddressFromNoir,
  mapAztecAddressToNoir,
  mapBigIntFromNoir,
  mapClaimedLengthArrayFromNoir,
  mapClaimedLengthArrayToNoir,
  mapCountedL2ToL1MessageToNoir,
  mapCountedLogHashToNoir,
  mapFieldFromNoir,
  mapFieldToNoir,
  mapFunctionSelectorFromNoir,
  mapFunctionSelectorToNoir,
  mapGasFromNoir,
  mapGrumpkinScalarToNoir,
  mapHeaderFromNoir,
  mapHeaderToNoir,
  mapIncludeByTimestampOptionFromNoir,
  mapIncludeByTimestampOptionToNoir,
  mapMembershipWitnessToNoir,
  mapNullifierLeafPreimageToNoir,
  mapNumberFromNoir,
  mapNumberToNoir,
  mapOptionalNumberFromNoir,
  mapOptionalNumberToNoir,
  mapPointFromNoir,
  mapPointToNoir,
  mapPrivateLogFromNoir,
  mapPrivateLogToNoir,
  mapPrivateToRollupAccumulatedDataFromNoir,
  mapProtocolContractLeafPreimageToNoir,
  mapPublicCallRequestFromNoir,
  mapPublicCallRequestToNoir,
  mapPublicDataTreePreimageToNoir,
  mapScopedCountedL2ToL1MessageFromNoir,
  mapScopedCountedL2ToL1MessageToNoir,
  mapScopedCountedLogHashFromNoir,
  mapScopedCountedLogHashToNoir,
  mapScopedL2ToL1MessageFromNoir,
  mapScopedLogHashFromNoir,
  mapTupleFromNoir,
  mapTxContextFromNoir,
  mapTxContextToNoir,
  mapVerificationKeyToNoir,
  mapVkDataToNoir,
  mapWrappedFieldToNoir,
} from './common.js';

/* eslint-disable camelcase */

/**
 * Maps a function data to a noir function data.
 * @param functionData - The function data.
 * @returns The noir function data.
 */
export function mapFunctionDataToNoir(functionData: FunctionData): FunctionDataNoir {
  return {
    selector: mapFunctionSelectorToNoir(functionData.selector),
    is_private: functionData.isPrivate,
  };
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
    salt: mapFieldToNoir(txRequest.salt),
  };
}

function mapNoteHashToNoir(noteHash: NoteHash): NoteHashNoir {
  return {
    value: mapFieldToNoir(noteHash.value),
    counter: mapNumberToNoir(noteHash.counter),
  };
}

function mapNoteHashFromNoir(noteHash: NoteHashNoir) {
  return new NoteHash(mapFieldFromNoir(noteHash.value), mapNumberFromNoir(noteHash.counter));
}

function mapScopedNoteHashToNoir(noteHash: ScopedNoteHash): ScopedNoteHashNoir {
  return {
    note_hash: mapNoteHashToNoir(noteHash.noteHash),
    contract_address: mapAztecAddressToNoir(noteHash.contractAddress),
  };
}

function mapScopedNoteHashFromNoir(noteHash: ScopedNoteHashNoir) {
  return new ScopedNoteHash(
    mapNoteHashFromNoir(noteHash.note_hash),
    mapAztecAddressFromNoir(noteHash.contract_address),
  );
}

function mapNullifierToNoir(nullifier: Nullifier): NullifierNoir {
  return {
    value: mapFieldToNoir(nullifier.value),
    counter: mapNumberToNoir(nullifier.counter),
    note_hash: mapFieldToNoir(nullifier.noteHash),
  };
}

function mapNullifierFromNoir(nullifier: NullifierNoir) {
  return new Nullifier(
    mapFieldFromNoir(nullifier.value),
    mapNumberFromNoir(nullifier.counter),
    mapFieldFromNoir(nullifier.note_hash),
  );
}

function mapScopedNullifierToNoir(nullifier: ScopedNullifier): ScopedNullifierNoir {
  return {
    nullifier: mapNullifierToNoir(nullifier.nullifier),
    contract_address: mapAztecAddressToNoir(nullifier.contractAddress),
  };
}

function mapScopedNullifierFromNoir(nullifier: ScopedNullifierNoir) {
  return new ScopedNullifier(
    mapNullifierFromNoir(nullifier.nullifier),
    mapAztecAddressFromNoir(nullifier.contract_address),
  );
}

function mapPrivateLogDataToNoir(data: PrivateLogData): PrivateLogDataNoir {
  return {
    log: mapPrivateLogToNoir(data.log),
    note_hash_counter: mapNumberToNoir(data.noteHashCounter),
    counter: mapNumberToNoir(data.counter),
  };
}

function mapPrivateLogDataFromNoir(data: PrivateLogDataNoir) {
  return new PrivateLogData(
    mapPrivateLogFromNoir(data.log),
    mapNumberFromNoir(data.note_hash_counter),
    mapNumberFromNoir(data.counter),
  );
}

function mapScopedPrivateLogDataToNoir(data: ScopedPrivateLogData): Scoped<PrivateLogDataNoir> {
  return {
    inner: mapPrivateLogDataToNoir(data.inner),
    contract_address: mapAztecAddressToNoir(data.contractAddress),
  };
}

function mapScopedPrivateLogDataFromNoir(data: Scoped<PrivateLogDataNoir>) {
  return new ScopedPrivateLogData(
    mapPrivateLogDataFromNoir(data.inner),
    mapAztecAddressFromNoir(data.contract_address),
  );
}

/**
 * Maps a noir ReadRequest to ReadRequest.
 * @param readRequest - The noir ReadRequest.
 * @returns The TS ReadRequest.
 */
function mapReadRequestFromNoir(readRequest: ReadRequestNoir): ReadRequest {
  return new ReadRequest(mapFieldFromNoir(readRequest.value), mapNumberFromNoir(readRequest.counter));
}

function mapScopedReadRequestToNoir(scopedReadRequest: ScopedReadRequest): ScopedReadRequestNoir {
  return {
    read_request: mapReadRequestToNoir(scopedReadRequest.readRequest),
    contract_address: mapAztecAddressToNoir(scopedReadRequest.contractAddress),
  };
}

/**
 * Maps a noir ReadRequest to ReadRequest.
 * @param readRequest - The noir ReadRequest.
 * @returns The TS ReadRequest.
 */
export function mapScopedReadRequestFromNoir(scoped: ScopedReadRequestNoir): ScopedReadRequest {
  return new ScopedReadRequest(
    mapReadRequestFromNoir(scoped.read_request),
    mapAztecAddressFromNoir(scoped.contract_address),
  );
}

/**
 * Maps a KeyValidationRequest to a noir KeyValidationRequest.
 * @param request - The KeyValidationRequest.
 * @returns The noir KeyValidationRequest.
 */
export function mapKeyValidationRequestToNoir(request: KeyValidationRequest): KeyValidationRequestsNoir {
  return {
    pk_m: mapPointToNoir(request.pkM),
    sk_app: mapFieldToNoir(request.skApp),
  };
}

export function mapKeyValidationRequestAndGeneratorToNoir(
  request: KeyValidationRequestAndGenerator,
): KeyValidationRequestAndGeneratorNoir {
  return {
    request: mapKeyValidationRequestToNoir(request.request),
    sk_app_generator: mapFieldToNoir(request.skAppGenerator),
  };
}

/**
 * Maps a noir KeyValidationRequest to KeyValidationRequest.
 * @param request - The noir KeyValidationRequest.
 * @returns The TS KeyValidationRequest.
 */
function mapKeyValidationRequestFromNoir(request: KeyValidationRequestsNoir): KeyValidationRequest {
  return new KeyValidationRequest(mapPointFromNoir(request.pk_m), mapFieldFromNoir(request.sk_app));
}

function mapKeyValidationRequestAndGeneratorFromNoir(
  request: KeyValidationRequestAndGeneratorNoir,
): KeyValidationRequestAndGenerator {
  return new KeyValidationRequestAndGenerator(
    mapKeyValidationRequestFromNoir(request.request),
    mapFieldFromNoir(request.sk_app_generator),
  );
}

function mapScopedKeyValidationRequestAndGeneratorToNoir(
  request: ScopedKeyValidationRequestAndGenerator,
): ScopedKeyValidationRequestAndGeneratorNoir {
  return {
    request: mapKeyValidationRequestAndGeneratorToNoir(request.request),
    contract_address: mapAztecAddressToNoir(request.contractAddress),
  };
}

function mapScopedKeyValidationRequestAndGeneratorFromNoir(
  request: ScopedKeyValidationRequestAndGeneratorNoir,
): ScopedKeyValidationRequestAndGenerator {
  return new ScopedKeyValidationRequestAndGenerator(
    mapKeyValidationRequestAndGeneratorFromNoir(request.request),
    mapAztecAddressFromNoir(request.contract_address),
  );
}

/**
 * Maps a call context to a noir call context.
 * @param callContext - The call context.
 * @returns The noir call context.
 */
export function mapCallContextFromNoir(callContext: CallContextNoir): CallContext {
  return new CallContext(
    mapAztecAddressFromNoir(callContext.msg_sender),
    mapAztecAddressFromNoir(callContext.contract_address),
    mapFunctionSelectorFromNoir(callContext.function_selector),
    callContext.is_static_call,
  );
}

/**
 * Maps a call context to a noir call context.
 * @param callContext - The call context.
 * @returns The noir call context.
 */
export function mapCallContextToNoir(callContext: CallContext): CallContextNoir {
  return {
    msg_sender: mapAztecAddressToNoir(callContext.msgSender),
    contract_address: mapAztecAddressToNoir(callContext.contractAddress),
    function_selector: mapFunctionSelectorToNoir(callContext.functionSelector),
    is_static_call: callContext.isStaticCall,
  };
}

function mapPrivateCallRequestFromNoir(callRequest: PrivateCallRequestNoir) {
  return new PrivateCallRequest(
    mapCallContextFromNoir(callRequest.call_context),
    mapFieldFromNoir(callRequest.args_hash),
    mapFieldFromNoir(callRequest.returns_hash),
    mapNumberFromNoir(callRequest.start_side_effect_counter),
    mapNumberFromNoir(callRequest.end_side_effect_counter),
  );
}

function mapPrivateCallRequestToNoir(callRequest: PrivateCallRequest): PrivateCallRequestNoir {
  return {
    call_context: mapCallContextToNoir(callRequest.callContext),
    args_hash: mapFieldToNoir(callRequest.argsHash),
    returns_hash: mapFieldToNoir(callRequest.returnsHash),
    start_side_effect_counter: mapNumberToNoir(callRequest.startSideEffectCounter),
    end_side_effect_counter: mapNumberToNoir(callRequest.endSideEffectCounter),
  };
}

function mapCountedPublicCallRequestFromNoir(request: Counted<PublicCallRequestNoir>) {
  return new CountedPublicCallRequest(mapPublicCallRequestFromNoir(request.inner), mapNumberFromNoir(request.counter));
}

function mapCountedPublicCallRequestToNoir(request: CountedPublicCallRequest): Counted<PublicCallRequestNoir> {
  return {
    inner: mapPublicCallRequestToNoir(request.inner),
    counter: mapNumberToNoir(request.counter),
  };
}

/**
 * Maps a ReadRequest to a noir ReadRequest.
 * @param readRequest - The read request.
 * @returns The noir ReadRequest.
 */
function mapReadRequestToNoir(readRequest: ReadRequest): ReadRequestNoir {
  return {
    value: mapFieldToNoir(readRequest.value),
    counter: mapNumberToNoir(readRequest.counter),
  };
}

function mapPrivateValidationRequestsToNoir(requests: PrivateValidationRequests): PrivateValidationRequestsNoir {
  return {
    note_hash_read_requests: mapClaimedLengthArrayToNoir(requests.noteHashReadRequests, mapScopedReadRequestToNoir),
    nullifier_read_requests: mapClaimedLengthArrayToNoir(requests.nullifierReadRequests, mapScopedReadRequestToNoir),
    scoped_key_validation_requests_and_generators: mapClaimedLengthArrayToNoir(
      requests.scopedKeyValidationRequestsAndGenerators,
      mapScopedKeyValidationRequestAndGeneratorToNoir,
    ),
    split_counter: mapOptionalNumberToNoir(requests.splitCounter),
  };
}

function mapPrivateValidationRequestsFromNoir(requests: PrivateValidationRequestsNoir) {
  return new PrivateValidationRequests(
    mapClaimedLengthArrayFromNoir(requests.note_hash_read_requests, mapScopedReadRequestFromNoir),
    mapClaimedLengthArrayFromNoir(requests.nullifier_read_requests, mapScopedReadRequestFromNoir),
    mapClaimedLengthArrayFromNoir(
      requests.scoped_key_validation_requests_and_generators,
      mapScopedKeyValidationRequestAndGeneratorFromNoir,
    ),
    mapOptionalNumberFromNoir(requests.split_counter),
  );
}

export function mapPrivateAccumulatedDataFromNoir(
  privateAccumulatedData: PrivateAccumulatedDataNoir,
): PrivateAccumulatedData {
  return new PrivateAccumulatedData(
    mapClaimedLengthArrayFromNoir(privateAccumulatedData.note_hashes, mapScopedNoteHashFromNoir),
    mapClaimedLengthArrayFromNoir(privateAccumulatedData.nullifiers, mapScopedNullifierFromNoir),
    mapClaimedLengthArrayFromNoir(privateAccumulatedData.l2_to_l1_msgs, mapScopedCountedL2ToL1MessageFromNoir),
    mapClaimedLengthArrayFromNoir(privateAccumulatedData.private_logs, mapScopedPrivateLogDataFromNoir),
    mapClaimedLengthArrayFromNoir(privateAccumulatedData.contract_class_logs_hashes, mapScopedCountedLogHashFromNoir),
    mapClaimedLengthArrayFromNoir(privateAccumulatedData.public_call_requests, mapCountedPublicCallRequestFromNoir),
    mapClaimedLengthArrayFromNoir(privateAccumulatedData.private_call_stack, mapPrivateCallRequestFromNoir),
  );
}

export function mapPrivateAccumulatedDataToNoir(data: PrivateAccumulatedData): PrivateAccumulatedDataNoir {
  return {
    note_hashes: mapClaimedLengthArrayToNoir(data.noteHashes, mapScopedNoteHashToNoir),
    nullifiers: mapClaimedLengthArrayToNoir(data.nullifiers, mapScopedNullifierToNoir),
    l2_to_l1_msgs: mapClaimedLengthArrayToNoir(data.l2ToL1Msgs, mapScopedCountedL2ToL1MessageToNoir),
    private_logs: mapClaimedLengthArrayToNoir(data.privateLogs, mapScopedPrivateLogDataToNoir),
    contract_class_logs_hashes: mapClaimedLengthArrayToNoir(
      data.contractClassLogsHashes,
      mapScopedCountedLogHashToNoir,
    ),
    public_call_requests: mapClaimedLengthArrayToNoir(data.publicCallRequests, mapCountedPublicCallRequestToNoir),
    private_call_stack: mapClaimedLengthArrayToNoir(data.privateCallStack, mapPrivateCallRequestToNoir),
  };
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
    returns_hash: mapFieldToNoir(privateCircuitPublicInputs.returnsHash),
    note_hash_read_requests: mapClaimedLengthArrayToNoir(
      privateCircuitPublicInputs.noteHashReadRequests,
      mapReadRequestToNoir,
    ),
    nullifier_read_requests: mapClaimedLengthArrayToNoir(
      privateCircuitPublicInputs.nullifierReadRequests,
      mapReadRequestToNoir,
    ),
    key_validation_requests_and_generators: mapClaimedLengthArrayToNoir(
      privateCircuitPublicInputs.keyValidationRequestsAndGenerators,
      mapKeyValidationRequestAndGeneratorToNoir,
    ),
    note_hashes: mapClaimedLengthArrayToNoir(privateCircuitPublicInputs.noteHashes, mapNoteHashToNoir),
    nullifiers: mapClaimedLengthArrayToNoir(privateCircuitPublicInputs.nullifiers, mapNullifierToNoir),
    private_call_requests: mapClaimedLengthArrayToNoir(
      privateCircuitPublicInputs.privateCallRequests,
      mapPrivateCallRequestToNoir,
    ),
    public_call_requests: mapClaimedLengthArrayToNoir(
      privateCircuitPublicInputs.publicCallRequests,
      mapCountedPublicCallRequestToNoir,
    ),
    public_teardown_call_request: mapPublicCallRequestToNoir(privateCircuitPublicInputs.publicTeardownCallRequest),
    l2_to_l1_msgs: mapClaimedLengthArrayToNoir(privateCircuitPublicInputs.l2ToL1Msgs, mapCountedL2ToL1MessageToNoir),
    private_logs: mapClaimedLengthArrayToNoir(privateCircuitPublicInputs.privateLogs, mapPrivateLogDataToNoir),
    contract_class_logs_hashes: mapClaimedLengthArrayToNoir(
      privateCircuitPublicInputs.contractClassLogsHashes,
      mapCountedLogHashToNoir,
    ),
    start_side_effect_counter: mapFieldToNoir(privateCircuitPublicInputs.startSideEffectCounter),
    end_side_effect_counter: mapFieldToNoir(privateCircuitPublicInputs.endSideEffectCounter),
    historical_header: mapHeaderToNoir(privateCircuitPublicInputs.historicalHeader),
    tx_context: mapTxContextToNoir(privateCircuitPublicInputs.txContext),
    min_revertible_side_effect_counter: mapFieldToNoir(privateCircuitPublicInputs.minRevertibleSideEffectCounter),
    is_fee_payer: privateCircuitPublicInputs.isFeePayer,
    include_by_timestamp: mapIncludeByTimestampOptionToNoir(privateCircuitPublicInputs.includeByTimestamp),
  };
}

export function mapPublicKeysToNoir(publicKeys: PublicKeys): PublicKeysNoir {
  return {
    npk_m: {
      inner: mapPointToNoir(publicKeys.masterNullifierPublicKey),
    },
    ivpk_m: {
      inner: mapPointToNoir(publicKeys.masterIncomingViewingPublicKey),
    },
    ovpk_m: {
      inner: mapPointToNoir(publicKeys.masterOutgoingViewingPublicKey),
    },
    tpk_m: {
      inner: mapPointToNoir(publicKeys.masterTaggingPublicKey),
    },
  };
}

/**
 * Maps a noir function data to a function data.
 * @param functionData - The noir function data.
 * @returns The function data.
 */
export function mapFunctionDataFromNoir(functionData: FunctionDataNoir): FunctionData {
  return new FunctionData(mapFunctionSelectorFromNoir(functionData.selector), functionData.is_private);
}

export function mapPrivateVerificationKeyHintsToNoir(
  privateVerificationKeyHints: PrivateVerificationKeyHints,
): PrivateVerificationKeyHintsNoir {
  const updatedClassIdSharedMutableValuesFields = assertLength(
    privateVerificationKeyHints.updatedClassIdHints.updatedClassIdValues.toFields(),
    UPDATES_SHARED_MUTABLE_VALUES_LEN,
  );

  return {
    function_leaf_membership_witness: mapMembershipWitnessToNoir(
      privateVerificationKeyHints.functionLeafMembershipWitness,
    ),
    contract_class_artifact_hash: mapFieldToNoir(privateVerificationKeyHints.contractClassArtifactHash),
    contract_class_public_bytecode_commitment: mapFieldToNoir(
      privateVerificationKeyHints.contractClassPublicBytecodeCommitment,
    ),
    public_keys: mapPublicKeysToNoir(privateVerificationKeyHints.publicKeys),
    salted_initialization_hash: mapWrappedFieldToNoir(privateVerificationKeyHints.saltedInitializationHash),
    protocol_contract_membership_witness: mapMembershipWitnessToNoir(
      privateVerificationKeyHints.protocolContractMembershipWitness,
    ),
    protocol_contract_leaf: mapProtocolContractLeafPreimageToNoir(privateVerificationKeyHints.protocolContractLeaf),
    updated_class_id_witness: mapMembershipWitnessToNoir(
      privateVerificationKeyHints.updatedClassIdHints.updatedClassIdWitness,
    ),
    updated_class_id_leaf: mapPublicDataTreePreimageToNoir(
      privateVerificationKeyHints.updatedClassIdHints.updatedClassIdLeaf,
    ),
    updated_class_id_shared_mutable_values: mapTuple(updatedClassIdSharedMutableValuesFields, mapFieldToNoir),
  };
}

/**
 * Maps a private call data to a noir private call data.
 * @param privateCallData - The private call data.
 * @returns The noir private call data.
 */
export function mapPrivateCallDataToNoir(privateCallData: PrivateCallData): PrivateCallDataWithoutPublicInputsNoir {
  return {
    vk: mapVerificationKeyToNoir(privateCallData.vk, CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS),
    verification_key_hints: mapPrivateVerificationKeyHintsToNoir(privateCallData.verificationKeyHints),
  };
}

function mapTxConstantDataFromNoir(data: TxConstantDataNoir) {
  return new TxConstantData(
    mapHeaderFromNoir(data.historical_header),
    mapTxContextFromNoir(data.tx_context),
    mapFieldFromNoir(data.vk_tree_root),
    mapFieldFromNoir(data.protocol_contract_tree_root),
  );
}

function mapTxConstantDataToNoir(data: TxConstantData): TxConstantDataNoir {
  return {
    historical_header: mapHeaderToNoir(data.historicalHeader),
    tx_context: mapTxContextToNoir(data.txContext),
    vk_tree_root: mapFieldToNoir(data.vkTreeRoot),
    protocol_contract_tree_root: mapFieldToNoir(data.protocolContractTreeRoot),
  };
}

export function mapPrivateKernelCircuitPublicInputsFromNoir(
  inputs: PrivateKernelCircuitPublicInputsNoir,
): PrivateKernelCircuitPublicInputs {
  return new PrivateKernelCircuitPublicInputs(
    mapTxConstantDataFromNoir(inputs.constants),
    mapFieldFromNoir(inputs.min_revertible_side_effect_counter),
    mapPrivateValidationRequestsFromNoir(inputs.validation_requests),
    mapPrivateAccumulatedDataFromNoir(inputs.end),
    mapPublicCallRequestFromNoir(inputs.public_teardown_call_request),
    mapAztecAddressFromNoir(inputs.fee_payer),
    mapIncludeByTimestampOptionFromNoir(inputs.include_by_timestamp),
    inputs.is_private_only,
    mapFieldFromNoir(inputs.claimed_first_nullifier),
  );
}

export function mapPrivateKernelCircuitPublicInputsToNoir(
  inputs: PrivateKernelCircuitPublicInputs,
): PrivateKernelCircuitPublicInputsNoir {
  return {
    constants: mapTxConstantDataToNoir(inputs.constants),
    validation_requests: mapPrivateValidationRequestsToNoir(inputs.validationRequests),
    end: mapPrivateAccumulatedDataToNoir(inputs.end),
    min_revertible_side_effect_counter: mapFieldToNoir(inputs.minRevertibleSideEffectCounter),
    public_teardown_call_request: mapPublicCallRequestToNoir(inputs.publicTeardownCallRequest),
    fee_payer: mapAztecAddressToNoir(inputs.feePayer),
    include_by_timestamp: mapIncludeByTimestampOptionToNoir(inputs.includeByTimestamp),
    is_private_only: inputs.isPrivateOnly,
    claimed_first_nullifier: mapFieldToNoir(inputs.claimedFirstNullifier),
  };
}

/**
 * Maps a private kernel inner data to a noir private kernel inner data.
 * @param privateKernelInnerData - The private kernel inner data.
 * @returns The noir private kernel inner data.
 */
export function mapPrivateKernelDataToNoir(
  privateKernelInnerData: PrivateKernelData,
): PrivateKernelDataWithoutPublicInputsNoir {
  return {
    vk_data: mapVkDataToNoir(privateKernelInnerData.vkData, CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  };
}

export function mapPrivateKernelTailCircuitPublicInputsForRollupFromNoir(
  inputs: PrivateToRollupKernelCircuitPublicInputsNoir,
): PrivateKernelTailCircuitPublicInputs {
  const forRollup = new PartialPrivateTailPublicInputsForRollup(mapPrivateToRollupAccumulatedDataFromNoir(inputs.end));
  return new PrivateKernelTailCircuitPublicInputs(
    mapTxConstantDataFromNoir(inputs.constants),
    mapGasFromNoir(inputs.gas_used),
    mapAztecAddressFromNoir(inputs.fee_payer),
    mapBigIntFromNoir(inputs.include_by_timestamp),
    undefined,
    forRollup,
  );
}

export function mapPrivateToPublicAccumulatedDataFromNoir(data: PrivateToPublicAccumulatedDataNoir) {
  return new PrivateToPublicAccumulatedData(
    mapTupleFromNoir(data.note_hashes, MAX_NOTE_HASHES_PER_TX, mapFieldFromNoir),
    mapTupleFromNoir(data.nullifiers, MAX_NULLIFIERS_PER_TX, mapFieldFromNoir),
    mapTupleFromNoir(data.l2_to_l1_msgs, MAX_L2_TO_L1_MSGS_PER_TX, mapScopedL2ToL1MessageFromNoir),
    mapTupleFromNoir(data.private_logs, MAX_PRIVATE_LOGS_PER_TX, mapPrivateLogFromNoir),
    mapTupleFromNoir(data.contract_class_logs_hashes, MAX_CONTRACT_CLASS_LOGS_PER_TX, mapScopedLogHashFromNoir),
    mapTupleFromNoir(data.public_call_requests, MAX_ENQUEUED_CALLS_PER_TX, mapPublicCallRequestFromNoir),
  );
}

export function mapPrivateKernelTailCircuitPublicInputsForPublicFromNoir(
  inputs: PrivateToPublicKernelCircuitPublicInputsNoir,
): PrivateKernelTailCircuitPublicInputs {
  const forPublic = new PartialPrivateTailPublicInputsForPublic(
    mapPrivateToPublicAccumulatedDataFromNoir(inputs.non_revertible_accumulated_data),
    mapPrivateToPublicAccumulatedDataFromNoir(inputs.revertible_accumulated_data),
    mapPublicCallRequestFromNoir(inputs.public_teardown_call_request),
  );
  return new PrivateKernelTailCircuitPublicInputs(
    mapTxConstantDataFromNoir(inputs.constants),
    mapGasFromNoir(inputs.gas_used),
    mapAztecAddressFromNoir(inputs.fee_payer),
    mapBigIntFromNoir(inputs.include_by_timestamp),
    forPublic,
  );
}

export function mapPaddedSideEffectsToNoir(paddedSideEffects: PaddedSideEffects): PaddedSideEffectsNoir {
  return {
    note_hashes: mapTuple(paddedSideEffects.noteHashes, mapFieldToNoir),
    nullifiers: mapTuple(paddedSideEffects.nullifiers, mapFieldToNoir),
    private_logs: mapTuple(paddedSideEffects.privateLogs, mapPrivateLogToNoir),
  };
}

export function mapPaddedSideEffectAmountsToNoir(
  paddedSideEffectAmounts: PaddedSideEffectAmounts,
): PaddedSideEffectAmountsNoir {
  return {
    non_revertible_note_hashes: mapNumberToNoir(paddedSideEffectAmounts.nonRevertibleNoteHashes),
    revertible_note_hashes: mapNumberToNoir(paddedSideEffectAmounts.revertibleNoteHashes),
    non_revertible_nullifiers: mapNumberToNoir(paddedSideEffectAmounts.nonRevertibleNullifiers),
    revertible_nullifiers: mapNumberToNoir(paddedSideEffectAmounts.revertibleNullifiers),
    non_revertible_private_logs: mapNumberToNoir(paddedSideEffectAmounts.nonRevertiblePrivateLogs),
    revertible_private_logs: mapNumberToNoir(paddedSideEffectAmounts.revertiblePrivateLogs),
  };
}

function mapTransientDataIndexHintToNoir(indexHint: TransientDataIndexHint): TransientDataIndexHintNoir {
  return {
    nullifier_index: mapNumberToNoir(indexHint.nullifierIndex),
    note_hash_index: mapNumberToNoir(indexHint.noteHashIndex),
  };
}

function mapReadRequestActionToNoir(readRequestAction: ReadRequestAction): ReadRequestActionNoir {
  return {
    action: mapNumberToNoir(readRequestAction.action),
    hint_index: mapNumberToNoir(readRequestAction.hintIndex),
  };
}

function mapPendingReadHintToNoir(hint: PendingReadHint): PendingReadHintNoir {
  return {
    read_request_index: mapNumberToNoir(hint.readRequestIndex),
    pending_value_index: mapNumberToNoir(hint.pendingValueIndex),
  };
}

function mapNoteHashLeafPreimageToNoir(noteHashLeafValue: Fr): NoteHashLeafPreimageNoir {
  return {
    value: mapFieldToNoir(noteHashLeafValue),
  };
}

function mapNoteHashSettledReadHintToNoir(
  hint: SettledReadHint<typeof NOTE_HASH_TREE_HEIGHT, Fr>,
): NoteHashSettledReadHintNoir {
  return {
    read_request_index: mapNumberToNoir(hint.readRequestIndex),
    membership_witness: mapMembershipWitnessToNoir(hint.membershipWitness),
    leaf_preimage: mapNoteHashLeafPreimageToNoir(hint.leafPreimage),
  };
}

function mapNullifierSettledReadHintToNoir(
  hint: SettledReadHint<typeof NULLIFIER_TREE_HEIGHT, NullifierLeafPreimage>,
): NullifierSettledReadHintNoir {
  return {
    read_request_index: mapNumberToNoir(hint.readRequestIndex),
    membership_witness: mapMembershipWitnessToNoir(hint.membershipWitness),
    leaf_preimage: mapNullifierLeafPreimageToNoir(hint.leafPreimage),
  };
}

function mapNoteHashReadRequestHintsToNoir<PENDING extends number, SETTLED extends number>(
  hints: NoteHashReadRequestHints<PENDING, SETTLED>,
): NoteHashReadRequestHintsNoir<PENDING, SETTLED> {
  return {
    read_request_actions: mapTuple(hints.readRequestActions, mapReadRequestActionToNoir),
    pending_read_hints: hints.pendingReadHints.map(mapPendingReadHintToNoir) as FixedLengthArray<
      PendingReadHintNoir,
      PENDING
    >,
    settled_read_hints: hints.settledReadHints.map(mapNoteHashSettledReadHintToNoir) as FixedLengthArray<
      NoteHashSettledReadHintNoir,
      SETTLED
    >,
  };
}

function mapNullifierReadRequestHintsToNoir<PENDING extends number, SETTLED extends number>(
  hints: NullifierReadRequestHints<PENDING, SETTLED>,
): NullifierReadRequestHintsNoir<PENDING, SETTLED> {
  return {
    read_request_actions: mapTuple(hints.readRequestActions, mapReadRequestActionToNoir),
    pending_read_hints: hints.pendingReadHints.map(mapPendingReadHintToNoir) as FixedLengthArray<
      PendingReadHintNoir,
      PENDING
    >,
    settled_read_hints: hints.settledReadHints.map(settledHint =>
      mapNullifierSettledReadHintToNoir(
        settledHint as SettledReadHint<typeof NULLIFIER_TREE_HEIGHT, NullifierLeafPreimage>,
      ),
    ) as FixedLengthArray<NullifierSettledReadHintNoir, SETTLED>,
  };
}

/**
 * Maps a KeyValidationHint to noir.
 * @param hint - The key validation hint.
 * @returns The key validation hint mapped to noir types.
 */
export function mapKeyValidationHintToNoir(hint: KeyValidationHint): KeyValidationHintNoir {
  return {
    sk_m: mapGrumpkinScalarToNoir(hint.skM),
  };
}

export function mapPrivateKernelResetHintsToNoir<
  NH_RR_PENDING extends number,
  NH_RR_SETTLED extends number,
  NLL_RR_PENDING extends number,
  NLL_RR_SETTLED extends number,
  KEY_VALIDATION_HINTS_LEN extends number,
  TRANSIENT_DATA_HINTS_LEN extends number,
>(
  inputs: PrivateKernelResetHints<
    NH_RR_PENDING,
    NH_RR_SETTLED,
    NLL_RR_PENDING,
    NLL_RR_SETTLED,
    KEY_VALIDATION_HINTS_LEN,
    TRANSIENT_DATA_HINTS_LEN
  >,
): PrivateKernelResetHintsNoir<
  NH_RR_PENDING,
  NH_RR_SETTLED,
  NLL_RR_PENDING,
  NLL_RR_SETTLED,
  KEY_VALIDATION_HINTS_LEN,
  TRANSIENT_DATA_HINTS_LEN
> {
  return {
    note_hash_read_request_hints: mapNoteHashReadRequestHintsToNoir(inputs.noteHashReadRequestHints),
    nullifier_read_request_hints: mapNullifierReadRequestHintsToNoir(inputs.nullifierReadRequestHints),
    key_validation_hints: mapTuple(inputs.keyValidationHints, mapKeyValidationHintToNoir) as FixedLengthArray<
      KeyValidationHintNoir,
      KEY_VALIDATION_HINTS_LEN
    >,
    transient_data_index_hints: inputs.transientDataIndexHints.map(mapTransientDataIndexHintToNoir) as FixedLengthArray<
      TransientDataIndexHintNoir,
      TRANSIENT_DATA_HINTS_LEN
    >,
    validation_requests_split_counter: mapNumberToNoir(inputs.validationRequestsSplitCounter),
  };
}
