import { MEGA_VK_LENGTH_IN_FIELDS, UPDATES_DELAYED_PUBLIC_MUTABLE_VALUES_LEN } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { type Bufferable, assertLength, mapTuple } from '@aztec/foundation/serialize';
import {
  CountedPublicCallRequest,
  KeyValidationHint,
  KeyValidationRequest,
  KeyValidationRequestAndGenerator,
  NoteHash,
  Nullifier,
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
  PrivateValidationRequests,
  type PrivateVerificationKeyHints,
  ReadRequest,
  ReadRequestAction,
  ReadRequestResetHints,
  ScopedKeyValidationRequestAndGenerator,
  ScopedNoteHash,
  ScopedNullifier,
  ScopedPrivateLogData,
  ScopedReadRequest,
  SettledReadHint,
  TransientDataSquashingHint,
} from '@aztec/stdlib/kernel';
import type { PublicKeys } from '@aztec/stdlib/keys';
import { CallContext, FunctionData, TxRequest } from '@aztec/stdlib/tx';

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
  Nullifier as NullifierNoir,
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
  PrivateToPublicKernelCircuitPublicInputs as PrivateToPublicKernelCircuitPublicInputsNoir,
  PrivateToRollupKernelCircuitPublicInputs as PrivateToRollupKernelCircuitPublicInputsNoir,
  PrivateValidationRequests as PrivateValidationRequestsNoir,
  PrivateVerificationKeyHints as PrivateVerificationKeyHintsNoir,
  PublicCallRequest as PublicCallRequestNoir,
  PublicKeys as PublicKeysNoir,
  ReadRequestAction as ReadRequestActionNoir,
  ReadRequestHints as ReadRequestHintsNoir,
  ReadRequest as ReadRequestNoir,
  Scoped,
  ScopedKeyValidationRequestAndGenerator as ScopedKeyValidationRequestAndGeneratorNoir,
  ScopedNoteHash as ScopedNoteHashNoir,
  ScopedNullifier as ScopedNullifierNoir,
  ScopedReadRequest as ScopedReadRequestNoir,
  SettledReadHint as SettledReadHintNoir,
  TransientDataSquashingHint as TransientDataSquashingHintNoir,
  TxRequest as TxRequestNoir,
} from '../types/index.js';
import {
  mapAztecAddressFromNoir,
  mapAztecAddressToNoir,
  mapBigIntFromNoir,
  mapBlockHeaderToNoir,
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
  mapPrivateToPublicAccumulatedDataFromNoir,
  mapPrivateToRollupAccumulatedDataFromNoir,
  mapPrivateTxConstantDataFromNoir,
  mapPrivateTxConstantDataToNoir,
  mapPublicCallRequestFromNoir,
  mapPublicCallRequestToNoir,
  mapPublicDataTreePreimageToNoir,
  mapScopedCountedL2ToL1MessageFromNoir,
  mapScopedCountedL2ToL1MessageToNoir,
  mapScopedCountedLogHashFromNoir,
  mapScopedCountedLogHashToNoir,
  mapTxConstantDataFromNoir,
  mapTxContextToNoir,
  mapU64FromNoir,
  mapU64ToNoir,
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
    anchor_block_header: mapBlockHeaderToNoir(privateCircuitPublicInputs.anchorBlockHeader),
    tx_context: mapTxContextToNoir(privateCircuitPublicInputs.txContext),
    min_revertible_side_effect_counter: mapFieldToNoir(privateCircuitPublicInputs.minRevertibleSideEffectCounter),
    is_fee_payer: privateCircuitPublicInputs.isFeePayer,
    include_by_timestamp: mapU64ToNoir(privateCircuitPublicInputs.includeByTimestamp),
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
  const updatedClassIdDelayedPublicMutableValuesFields = assertLength(
    privateVerificationKeyHints.updatedClassIdHints.updatedClassIdValues.toFields(),
    UPDATES_DELAYED_PUBLIC_MUTABLE_VALUES_LEN,
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
    updated_class_id_witness: mapMembershipWitnessToNoir(
      privateVerificationKeyHints.updatedClassIdHints.updatedClassIdWitness,
    ),
    updated_class_id_leaf: mapPublicDataTreePreimageToNoir(
      privateVerificationKeyHints.updatedClassIdHints.updatedClassIdLeaf,
    ),
    updated_class_id_delayed_public_mutable_values: mapTuple(
      updatedClassIdDelayedPublicMutableValuesFields,
      mapFieldToNoir,
    ),
  };
}

/**
 * Maps a private call data to a noir private call data.
 * @param privateCallData - The private call data.
 * @returns The noir private call data.
 */
export function mapPrivateCallDataToNoir(privateCallData: PrivateCallData): PrivateCallDataWithoutPublicInputsNoir {
  return {
    vk: mapVerificationKeyToNoir(privateCallData.vk, MEGA_VK_LENGTH_IN_FIELDS),
    verification_key_hints: mapPrivateVerificationKeyHintsToNoir(privateCallData.verificationKeyHints),
  };
}

export function mapPrivateKernelCircuitPublicInputsFromNoir(
  inputs: PrivateKernelCircuitPublicInputsNoir,
): PrivateKernelCircuitPublicInputs {
  return new PrivateKernelCircuitPublicInputs(
    mapPrivateTxConstantDataFromNoir(inputs.constants),
    mapFieldFromNoir(inputs.min_revertible_side_effect_counter),
    mapPrivateValidationRequestsFromNoir(inputs.validation_requests),
    mapPrivateAccumulatedDataFromNoir(inputs.end),
    mapPublicCallRequestFromNoir(inputs.public_teardown_call_request),
    mapAztecAddressFromNoir(inputs.fee_payer),
    mapU64FromNoir(inputs.include_by_timestamp),
    inputs.is_private_only,
    mapFieldFromNoir(inputs.claimed_first_nullifier),
  );
}

export function mapPrivateKernelCircuitPublicInputsToNoir(
  inputs: PrivateKernelCircuitPublicInputs,
): PrivateKernelCircuitPublicInputsNoir {
  return {
    constants: mapPrivateTxConstantDataToNoir(inputs.constants),
    validation_requests: mapPrivateValidationRequestsToNoir(inputs.validationRequests),
    end: mapPrivateAccumulatedDataToNoir(inputs.end),
    min_revertible_side_effect_counter: mapFieldToNoir(inputs.minRevertibleSideEffectCounter),
    public_teardown_call_request: mapPublicCallRequestToNoir(inputs.publicTeardownCallRequest),
    fee_payer: mapAztecAddressToNoir(inputs.feePayer),
    include_by_timestamp: mapU64ToNoir(inputs.includeByTimestamp),
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
    vk_data: mapVkDataToNoir(privateKernelInnerData.vkData, MEGA_VK_LENGTH_IN_FIELDS),
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

function mapTransientDataSquashingHintToNoir(indexHint: TransientDataSquashingHint): TransientDataSquashingHintNoir {
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

function mapSettledReadHintToNoir<TREE_HEIGHT extends number, LEAF_PREIMAGE extends Bufferable, LEAF_PREIMAGE_NOIR>(
  hint: SettledReadHint<TREE_HEIGHT, LEAF_PREIMAGE>,
  mapLeafPreimageToNoir: (preimage: LEAF_PREIMAGE) => LEAF_PREIMAGE_NOIR,
): SettledReadHintNoir<LEAF_PREIMAGE_NOIR> {
  return {
    read_request_index: mapNumberToNoir(hint.readRequestIndex),
    // Hard code the size to 40 because it's only used in noir for trees of height 40, so it's not generated with a generic.
    membership_witness: mapMembershipWitnessToNoir(
      hint.membershipWitness,
    ) as SettledReadHintNoir<LEAF_PREIMAGE_NOIR>['membership_witness'],
    leaf_preimage: mapLeafPreimageToNoir(hint.leafPreimage),
  };
}

function mapReadRequestHintsToNoir<
  READ_REQUEST_LEN extends number,
  PENDING_READ_HINTS_LEN extends number,
  SETTLED_READ_HINTS_LEN extends number,
  TREE_HEIGHT extends number,
  LEAF_PREIMAGE extends Bufferable,
  LEAF_PREIMAGE_NOIR,
>(
  hints: ReadRequestResetHints<
    READ_REQUEST_LEN,
    PENDING_READ_HINTS_LEN,
    SETTLED_READ_HINTS_LEN,
    TREE_HEIGHT,
    LEAF_PREIMAGE
  >,
  mapLeafPreimageToNoir: (preimage: LEAF_PREIMAGE) => LEAF_PREIMAGE_NOIR,
): ReadRequestHintsNoir<PENDING_READ_HINTS_LEN, SETTLED_READ_HINTS_LEN, LEAF_PREIMAGE_NOIR> {
  return {
    read_request_actions: mapTuple(hints.readRequestActions, mapReadRequestActionToNoir) as ReadRequestHintsNoir<
      READ_REQUEST_LEN,
      PENDING_READ_HINTS_LEN,
      LEAF_PREIMAGE_NOIR
    >['read_request_actions'],
    pending_read_hints: hints.pendingReadHints.map(mapPendingReadHintToNoir) as FixedLengthArray<
      PendingReadHintNoir,
      PENDING_READ_HINTS_LEN
    >,
    settled_read_hints: hints.settledReadHints.map(h =>
      mapSettledReadHintToNoir(h, mapLeafPreimageToNoir),
    ) as FixedLengthArray<SettledReadHintNoir<LEAF_PREIMAGE_NOIR>, SETTLED_READ_HINTS_LEN>,
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
    note_hash_read_request_hints: mapReadRequestHintsToNoir(
      inputs.noteHashReadRequestHints,
      mapNoteHashLeafPreimageToNoir,
    ),
    nullifier_read_request_hints: mapReadRequestHintsToNoir(
      inputs.nullifierReadRequestHints,
      mapNullifierLeafPreimageToNoir,
    ),
    key_validation_hints: mapTuple(inputs.keyValidationHints, mapKeyValidationHintToNoir) as FixedLengthArray<
      KeyValidationHintNoir,
      KEY_VALIDATION_HINTS_LEN
    >,
    transient_data_squashing_hints: inputs.transientDataSquashingHints.map(
      mapTransientDataSquashingHintToNoir,
    ) as FixedLengthArray<TransientDataSquashingHintNoir, TRANSIENT_DATA_HINTS_LEN>,
    min_revertible_side_effect_counter: mapNumberToNoir(inputs.validationRequestsSplitCounter),
  };
}
