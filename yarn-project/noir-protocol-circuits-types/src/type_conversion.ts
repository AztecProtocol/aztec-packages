import {
  type AVM_PROOF_LENGTH_IN_FIELDS,
  AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  AZTEC_MAX_EPOCH_DURATION,
  AppendOnlyTreeSnapshot,
  type AvmAccumulatedData,
  type AvmCircuitPublicInputs,
  type AvmProofData,
  AztecAddress,
  BLOBS_PER_BLOCK,
  BaseOrMergeRollupPublicInputs,
  type BaseParityInputs,
  BlobPublicInputs,
  BlockBlobPublicInputs,
  BlockHeader,
  type BlockMergeRollupInputs,
  BlockRootOrBlockMergePublicInputs,
  type BlockRootRollupInputs,
  CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  CallContext,
  CombinedAccumulatedData,
  CombinedConstantData,
  ConstantRollupData,
  ContentCommitment,
  CountedPublicCallRequest,
  type EmptyBlockRootRollupInputs,
  type EmptyNestedData,
  EthAddress,
  FeeRecipient,
  Fr,
  FunctionData,
  FunctionSelector,
  Gas,
  GasFees,
  GasSettings,
  GlobalVariables,
  GrumpkinScalar,
  HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  KernelCircuitPublicInputs,
  type KeyValidationHint,
  KeyValidationRequest,
  KeyValidationRequestAndGenerator,
  L2ToL1Message,
  LogHash,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
  MaxBlockNumber,
  type MembershipWitness,
  type MergeRollupInputs,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  type NOTE_HASH_TREE_HEIGHT,
  type NULLIFIER_TREE_HEIGHT,
  NUM_BYTES_PER_SHA256,
  NoteHash,
  type NoteHashReadRequestHints,
  Nullifier,
  type NullifierLeafPreimage,
  type NullifierReadRequestHints,
  OptionalNumber,
  ParityPublicInputs,
  PartialPrivateTailPublicInputsForPublic,
  PartialPrivateTailPublicInputsForRollup,
  PartialStateReference,
  type PendingReadHint,
  Point,
  Poseidon2Sponge,
  type PreviousRollupBlockData,
  type PreviousRollupData,
  PrivateAccumulatedData,
  type PrivateBaseRollupInputs,
  type PrivateBaseStateDiffHints,
  type PrivateCallData,
  PrivateCallRequest,
  type PrivateCircuitPublicInputs,
  PrivateKernelCircuitPublicInputs,
  type PrivateKernelData,
  type PrivateKernelEmptyInputs,
  type PrivateKernelResetHints,
  PrivateKernelTailCircuitPublicInputs,
  PrivateLog,
  PrivateLogData,
  type PrivateToAvmAccumulatedData,
  type PrivateToAvmAccumulatedDataArrayLengths,
  PrivateToPublicAccumulatedData,
  type PrivateToPublicKernelCircuitPublicInputs,
  type PrivateTubeData,
  PrivateValidationRequests,
  type PublicBaseRollupInputs,
  PublicCallRequest,
  type PublicDataHint,
  type PublicDataTreeLeafPreimage,
  PublicDataWrite,
  type PublicKeys,
  type PublicTubeData,
  type RECURSIVE_PROOF_LENGTH,
  ReadRequest,
  type ReadRequestStatus,
  type RecursiveProof,
  RevertCode,
  RollupValidationRequests,
  type RootParityInput,
  type RootParityInputs,
  type RootRollupInputs,
  RootRollupPublicInputs,
  ScopedKeyValidationRequestAndGenerator,
  ScopedL2ToL1Message,
  ScopedLogHash,
  ScopedNoteHash,
  ScopedNullifier,
  ScopedPrivateLogData,
  ScopedReadRequest,
  type SettledReadHint,
  SpongeBlob,
  StateReference,
  type TUBE_PROOF_LENGTH,
  type TransientDataIndexHint,
  type TreeSnapshots,
  TxConstantData,
  TxContext,
  type TxRequest,
  type VerificationKeyAsFields,
  type VkWitnessData,
} from '@aztec/circuits.js';
import { toBufferBE, toHex } from '@aztec/foundation/bigint-buffer';
import { type Tuple, mapTuple, toTruncField } from '@aztec/foundation/serialize';

import type {
  AppendOnlyTreeSnapshot as AppendOnlyTreeSnapshotNoir,
  AvmAccumulatedData as AvmAccumulatedDataNoir,
  AvmCircuitPublicInputs as AvmCircuitPublicInputsNoir,
  AvmProofData as AvmProofDataNoir,
  BaseOrMergeRollupPublicInputs as BaseOrMergeRollupPublicInputsNoir,
  BaseParityInputs as BaseParityInputsNoir,
  BigNum,
  BlobCommitment as BlobCommitmentNoir,
  BlobPublicInputs as BlobPublicInputsNoir,
  BlockBlobPublicInputs as BlockBlobPublicInputsNoir,
  BlockHeader as BlockHeaderNoir,
  BlockMergeRollupInputs as BlockMergeRollupInputsNoir,
  BlockRootOrBlockMergePublicInputs as BlockRootOrBlockMergePublicInputsNoir,
  BlockRootRollupInputs as BlockRootRollupInputsNoir,
  CallContext as CallContextNoir,
  CombinedAccumulatedData as CombinedAccumulatedDataNoir,
  CombinedConstantData as CombinedConstantDataNoir,
  ConstantRollupData as ConstantRollupDataNoir,
  ContentCommitment as ContentCommitmentNoir,
  Counted as CountedPublicCallRequestNoir,
  EmptyBlockRootRollupInputs as EmptyBlockRootRollupInputsNoir,
  EmptyNestedCircuitPublicInputs as EmptyNestedDataNoir,
  FeeRecipient as FeeRecipientNoir,
  Field,
  FixedLengthArray,
  FunctionData as FunctionDataNoir,
  FunctionSelector as FunctionSelectorNoir,
  GasFees as GasFeesNoir,
  Gas as GasNoir,
  GasSettings as GasSettingsNoir,
  GlobalVariables as GlobalVariablesNoir,
  EmbeddedCurveScalar as GrumpkinScalarNoir,
  KernelCircuitPublicInputs as KernelCircuitPublicInputsNoir,
  KeyValidationHint as KeyValidationHintNoir,
  KeyValidationRequestAndGenerator as KeyValidationRequestAndGeneratorNoir,
  KeyValidationRequest as KeyValidationRequestsNoir,
  L2ToL1Message as L2ToL1MessageNoir,
  LogHash as LogHashNoir,
  MaxBlockNumber as MaxBlockNumberNoir,
  MembershipWitness as MembershipWitnessNoir,
  MergeRollupInputs as MergeRollupInputsNoir,
  AztecAddress as NoirAztecAddress,
  EthAddress as NoirEthAddress,
  Field as NoirField,
  EmbeddedCurvePoint as NoirPoint,
  NoteHashLeafPreimage as NoteHashLeafPreimageNoir,
  NoteHash as NoteHashNoir,
  NoteHashReadRequestHints as NoteHashReadRequestHintsNoir,
  NoteHashSettledReadHint as NoteHashSettledReadHintNoir,
  NullifierLeafPreimage as NullifierLeafPreimageNoir,
  Nullifier as NullifierNoir,
  NullifierReadRequestHints as NullifierReadRequestHintsNoir,
  NullifierSettledReadHint as NullifierSettledReadHintNoir,
  Option as OptionalNumberNoir,
  ParityPublicInputs as ParityPublicInputsNoir,
  RootParityInput as ParityRootParityInputNoir,
  PartialStateReference as PartialStateReferenceNoir,
  PendingReadHint as PendingReadHintNoir,
  Poseidon2 as Poseidon2SpongeNoir,
  PreviousRollupBlockData as PreviousRollupBlockDataNoir,
  PreviousRollupData as PreviousRollupDataNoir,
  PrivateAccumulatedData as PrivateAccumulatedDataNoir,
  PrivateBaseRollupInputs as PrivateBaseRollupInputsNoir,
  PrivateBaseStateDiffHints as PrivateBaseStateDiffHintsNoir,
  PrivateCallDataWithoutPublicInputs as PrivateCallDataWithoutPublicInputsNoir,
  PrivateCallRequest as PrivateCallRequestNoir,
  PrivateCircuitPublicInputs as PrivateCircuitPublicInputsNoir,
  PrivateKernelCircuitPublicInputs as PrivateKernelCircuitPublicInputsNoir,
  PrivateKernelDataWithoutPublicInputs as PrivateKernelDataWithoutPublicInputsNoir,
  PrivateKernelEmptyPrivateInputs as PrivateKernelEmptyPrivateInputsNoir,
  PrivateKernelResetHints as PrivateKernelResetHintsNoir,
  PrivateLogData as PrivateLogDataNoir,
  Log as PrivateLogNoir,
  PrivateToAvmAccumulatedDataArrayLengths as PrivateToAvmAccumulatedDataArrayLengthsNoir,
  PrivateToAvmAccumulatedData as PrivateToAvmAccumulatedDataNoir,
  PrivateToPublicAccumulatedData as PrivateToPublicAccumulatedDataNoir,
  PrivateToPublicKernelCircuitPublicInputs as PrivateToPublicKernelCircuitPublicInputsNoir,
  PrivateTubeData as PrivateTubeDataNoir,
  PrivateValidationRequests as PrivateValidationRequestsNoir,
  PublicBaseRollupInputs as PublicBaseRollupInputsNoir,
  PublicCallRequest as PublicCallRequestNoir,
  PublicDataHint as PublicDataHintNoir,
  PublicDataTreeLeafPreimage as PublicDataTreeLeafPreimageNoir,
  PublicDataWrite as PublicDataWriteNoir,
  PublicKeys as PublicKeysNoir,
  PublicTubeData as PublicTubeDataNoir,
  ReadRequest as ReadRequestNoir,
  ReadRequestStatus as ReadRequestStatusNoir,
  RollupValidationRequests as RollupValidationRequestsNoir,
  RootParityInputs as RootParityInputsNoir,
  RootRollupInputs as RootRollupInputsNoir,
  RootRollupParityInput as RootRollupParityInputNoir,
  RootRollupPublicInputs as RootRollupPublicInputsNoir,
  ScopedKeyValidationRequestAndGenerator as ScopedKeyValidationRequestAndGeneratorNoir,
  ScopedL2ToL1Message as ScopedL2ToL1MessageNoir,
  ScopedLogHash as ScopedLogHashNoir,
  ScopedNoteHash as ScopedNoteHashNoir,
  ScopedNullifier as ScopedNullifierNoir,
  Scoped as ScopedPrivateLogDataNoir,
  ScopedReadRequest as ScopedReadRequestNoir,
  SpongeBlob as SpongeBlobNoir,
  StateReference as StateReferenceNoir,
  TransientDataIndexHint as TransientDataIndexHintNoir,
  TreeSnapshots as TreeSnapshotsNoir,
  TxConstantData as TxConstantDataNoir,
  TxContext as TxContextNoir,
  TxRequest as TxRequestNoir,
  VerificationKey as VerificationKeyNoir,
  VkData as VkDataNoir,
} from './types/index.js';

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
  return Fr.fromHexString(field);
}

/** Maps a field to a noir wrapped field type (ie any type implemented as struct with an inner Field). */
export function mapWrappedFieldToNoir(field: Fr): { inner: NoirField } {
  return { inner: mapFieldToNoir(field) };
}

/** Maps a noir wrapped field type (ie any type implemented as struct with an inner Field) to a typescript field. */
export function mapWrappedFieldFromNoir(wrappedField: { inner: NoirField }): Fr {
  return mapFieldFromNoir(wrappedField.inner);
}

/**
 * Maps a number coming from noir.
 * @param number - The field representing the number.
 * @returns The number
 */
export function mapNumberFromNoir(number: NoirField): number {
  return Number(Fr.fromHexString(number).toBigInt());
}

export function mapNumberToNoir(number: number): NoirField {
  return new Fr(BigInt(number)).toString();
}

/**
 * Maps a BigNum coming to/from noir.
 * TODO(): Is BigInt the best way to represent this?
 * @param number - The BigNum representing the number.
 * @returns The number
 */
export function mapBLS12BigNumFromNoir(bignum: BigNum): bigint {
  // TODO(Miranda): there's gotta be a better way to convert this
  const paddedLimbs = [
    `0x` + bignum.limbs[2].substring(2).padStart(4, '0'),
    bignum.limbs[1].substring(2).padStart(30, '0'),
    bignum.limbs[0].substring(2).padStart(30, '0'),
  ];
  return BigInt(paddedLimbs[0].concat(paddedLimbs[1], paddedLimbs[2]));
}

export function mapBLS12BigNumToNoir(number: bigint): BigNum {
  const hex = toHex(number, true);
  return {
    limbs: ['0x' + hex.substring(36), '0x' + hex.substring(6, 36), hex.substring(0, 6)],
  };
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
    is_infinite: point.isInfinite,
  };
}

/**
 * Maps a noir point to a point.
 * @param point - The noir point.
 * @returns The point.
 */
export function mapPointFromNoir(point: NoirPoint): Point {
  return new Point(mapFieldFromNoir(point.x), mapFieldFromNoir(point.y), point.is_infinite);
}

/**
 * Maps a GrumpkinScalar to a noir GrumpkinScalar.
 * @param privateKey - The GrumpkinScalar.
 * @returns The noir GrumpkinScalar.
 */
export function mapGrumpkinScalarToNoir(privateKey: GrumpkinScalar): GrumpkinScalarNoir {
  return {
    hi: mapFieldToNoir(privateKey.hi),
    lo: mapFieldToNoir(privateKey.lo),
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
    request_index: mapNumberToNoir(hint.requestIndex),
  };
}

/**
 * Maps a noir GrumpkinScalar to a GrumpkinScalar.
 * @param privateKey - The noir GrumpkinScalar.
 * @returns The GrumpkinScalar.
 */
export function mapGrumpkinScalarFromNoir(privateKey: GrumpkinScalarNoir): GrumpkinScalar {
  return GrumpkinScalar.fromHighLow(mapFieldFromNoir(privateKey.hi), mapFieldFromNoir(privateKey.lo));
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
 * Maps a tx context to a noir tx context.
 * @param txContext - The tx context.
 * @returns The noir tx context.
 */
export function mapTxContextToNoir(txContext: TxContext): TxContextNoir {
  return {
    chain_id: mapFieldToNoir(txContext.chainId),
    version: mapFieldToNoir(txContext.version),
    gas_settings: mapGasSettingsToNoir(txContext.gasSettings),
  };
}

/**
 * Maps a noir tx context to a tx context.
 * @param txContext - The noir tx context.
 * @returns The tx context.
 */
export function mapTxContextFromNoir(txContext: TxContextNoir): TxContext {
  return new TxContext(
    mapFieldFromNoir(txContext.chain_id),
    mapFieldFromNoir(txContext.version),
    mapGasSettingsFromNoir(txContext.gas_settings),
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
    is_private: functionData.isPrivate,
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

export function mapGasSettingsFromNoir(gasSettings: GasSettingsNoir): GasSettings {
  return new GasSettings(
    mapGasFromNoir(gasSettings.gas_limits),
    mapGasFromNoir(gasSettings.teardown_gas_limits),
    mapGasFeesFromNoir(gasSettings.max_fees_per_gas),
  );
}

export function mapGasSettingsToNoir(gasSettings: GasSettings): GasSettingsNoir {
  return {
    gas_limits: mapGasToNoir(gasSettings.gasLimits),
    teardown_gas_limits: mapGasToNoir(gasSettings.teardownGasLimits),
    max_fees_per_gas: mapGasFeesToNoir(gasSettings.maxFeesPerGas),
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

function mapPublicCallRequestFromNoir(request: PublicCallRequestNoir) {
  return new PublicCallRequest(
    mapAztecAddressFromNoir(request.msg_sender),
    mapAztecAddressFromNoir(request.contract_address),
    mapFunctionSelectorFromNoir(request.function_selector),
    request.is_static_call,
    mapFieldFromNoir(request.args_hash),
  );
}

function mapPublicCallRequestToNoir(request: PublicCallRequest): PublicCallRequestNoir {
  return {
    msg_sender: mapAztecAddressToNoir(request.msgSender),
    contract_address: mapAztecAddressToNoir(request.contractAddress),
    function_selector: mapFunctionSelectorToNoir(request.functionSelector),
    is_static_call: request.isStaticCall,
    args_hash: mapFieldToNoir(request.argsHash),
  };
}

function mapCountedPublicCallRequestFromNoir(request: CountedPublicCallRequestNoir) {
  return new CountedPublicCallRequest(mapPublicCallRequestFromNoir(request.inner), mapNumberFromNoir(request.counter));
}

function mapCountedPublicCallRequestToNoir(request: CountedPublicCallRequest): CountedPublicCallRequestNoir {
  return {
    inner: mapPublicCallRequestToNoir(request.inner),
    counter: mapNumberToNoir(request.counter),
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

function mapPrivateLogToNoir(log: PrivateLog): PrivateLogNoir {
  return {
    fields: mapTuple(log.fields, mapFieldToNoir),
  };
}

function mapPrivateLogFromNoir(log: PrivateLogNoir) {
  return new PrivateLog(mapTupleFromNoir(log.fields, log.fields.length, mapFieldFromNoir));
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

function mapScopedPrivateLogDataToNoir(data: ScopedPrivateLogData): ScopedPrivateLogDataNoir {
  return {
    inner: mapPrivateLogDataToNoir(data.inner),
    contract_address: mapAztecAddressToNoir(data.contractAddress),
  };
}

function mapScopedPrivateLogDataFromNoir(data: ScopedPrivateLogDataNoir) {
  return new ScopedPrivateLogData(
    mapPrivateLogDataFromNoir(data.inner),
    mapAztecAddressFromNoir(data.contract_address),
  );
}

/**
 * Maps a LogHash to a noir LogHash.
 * @param logHash - The LogHash.
 * @returns The noir log hash.
 */
function mapLogHashToNoir(logHash: LogHash): LogHashNoir {
  return {
    value: mapFieldToNoir(logHash.value),
    counter: mapNumberToNoir(logHash.counter),
    length: mapFieldToNoir(logHash.length),
  };
}

/**
 * Maps a noir LogHash to a LogHash.
 * @param logHash - The noir LogHash.
 * @returns The TS log hash.
 */
function mapLogHashFromNoir(logHash: LogHashNoir): LogHash {
  return new LogHash(
    mapFieldFromNoir(logHash.value),
    mapNumberFromNoir(logHash.counter),
    mapFieldFromNoir(logHash.length),
  );
}

/**
 * Maps a ts ScopedLogHash to a noir ScopedLogHash.
 * @param logHash - The ts LogHash.
 * @returns The noir log hash.
 */
function mapScopedLogHashToNoir(scopedLogHash: ScopedLogHash): ScopedLogHashNoir {
  return {
    log_hash: mapLogHashToNoir(scopedLogHash.logHash),
    contract_address: mapAztecAddressToNoir(scopedLogHash.contractAddress),
  };
}

/**
 * Maps a noir ScopedLogHash to a ts ScopedLogHash.
 * @param logHash - The noir LogHash.
 * @returns The TS log hash.
 */
function mapScopedLogHashFromNoir(scopedLogHash: ScopedLogHashNoir): ScopedLogHash {
  return new ScopedLogHash(
    mapLogHashFromNoir(scopedLogHash.log_hash),
    mapAztecAddressFromNoir(scopedLogHash.contract_address),
  );
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
 * Maps a L2 to L1 message to a noir L2 to L1 message.
 * @param message - The L2 to L1 message.
 * @returns The noir L2 to L1 message.
 */
export function mapL2ToL1MessageToNoir(message: L2ToL1Message): L2ToL1MessageNoir {
  return {
    recipient: mapEthAddressToNoir(message.recipient),
    content: mapFieldToNoir(message.content),
    counter: mapNumberToNoir(message.counter),
  };
}

function mapL2ToL1MessageFromNoir(message: L2ToL1MessageNoir) {
  return new L2ToL1Message(
    mapEthAddressFromNoir(message.recipient),
    mapFieldFromNoir(message.content),
    mapNumberFromNoir(message.counter),
  );
}

function mapScopedL2ToL1MessageFromNoir(message: ScopedL2ToL1MessageNoir) {
  return new ScopedL2ToL1Message(
    mapL2ToL1MessageFromNoir(message.message),
    mapAztecAddressFromNoir(message.contract_address),
  );
}

function mapScopedL2ToL1MessageToNoir(message: ScopedL2ToL1Message): ScopedL2ToL1MessageNoir {
  return {
    message: mapL2ToL1MessageToNoir(message.message),
    contract_address: mapAztecAddressToNoir(message.contractAddress),
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
    max_block_number: mapMaxBlockNumberToNoir(privateCircuitPublicInputs.maxBlockNumber),
    call_context: mapCallContextToNoir(privateCircuitPublicInputs.callContext),
    args_hash: mapFieldToNoir(privateCircuitPublicInputs.argsHash),
    returns_hash: mapFieldToNoir(privateCircuitPublicInputs.returnsHash),
    note_hash_read_requests: mapTuple(privateCircuitPublicInputs.noteHashReadRequests, mapReadRequestToNoir),
    nullifier_read_requests: mapTuple(privateCircuitPublicInputs.nullifierReadRequests, mapReadRequestToNoir),
    key_validation_requests_and_generators: mapTuple(
      privateCircuitPublicInputs.keyValidationRequestsAndGenerators,
      mapKeyValidationRequestAndGeneratorToNoir,
    ),
    note_hashes: mapTuple(privateCircuitPublicInputs.noteHashes, mapNoteHashToNoir),
    nullifiers: mapTuple(privateCircuitPublicInputs.nullifiers, mapNullifierToNoir),
    private_call_requests: mapTuple(privateCircuitPublicInputs.privateCallRequests, mapPrivateCallRequestToNoir),
    public_call_requests: mapTuple(privateCircuitPublicInputs.publicCallRequests, mapCountedPublicCallRequestToNoir),
    public_teardown_call_request: mapPublicCallRequestToNoir(privateCircuitPublicInputs.publicTeardownCallRequest),
    l2_to_l1_msgs: mapTuple(privateCircuitPublicInputs.l2ToL1Msgs, mapL2ToL1MessageToNoir),
    private_logs: mapTuple(privateCircuitPublicInputs.privateLogs, mapPrivateLogDataToNoir),
    contract_class_logs_hashes: mapTuple(privateCircuitPublicInputs.contractClassLogsHashes, mapLogHashToNoir),
    start_side_effect_counter: mapFieldToNoir(privateCircuitPublicInputs.startSideEffectCounter),
    end_side_effect_counter: mapFieldToNoir(privateCircuitPublicInputs.endSideEffectCounter),
    historical_header: mapHeaderToNoir(privateCircuitPublicInputs.historicalHeader),
    tx_context: mapTxContextToNoir(privateCircuitPublicInputs.txContext),
    min_revertible_side_effect_counter: mapFieldToNoir(privateCircuitPublicInputs.minRevertibleSideEffectCounter),
    is_fee_payer: privateCircuitPublicInputs.isFeePayer,
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
    function_leaf_membership_witness: mapMembershipWitnessToNoir(privateCallData.functionLeafMembershipWitness),
    contract_class_artifact_hash: mapFieldToNoir(privateCallData.contractClassArtifactHash),
    contract_class_public_bytecode_commitment: mapFieldToNoir(privateCallData.contractClassPublicBytecodeCommitment),
    public_keys: mapPublicKeysToNoir(privateCallData.publicKeys),
    salted_initialization_hash: mapWrappedFieldToNoir(privateCallData.saltedInitializationHash),
    protocol_contract_sibling_path: mapTuple(privateCallData.protocolContractSiblingPath, mapFieldToNoir),
    acir_hash: mapFieldToNoir(privateCallData.acirHash),
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

export function mapRevertCodeFromNoir(revertCode: NoirField): RevertCode {
  return RevertCode.fromField(mapFieldFromNoir(revertCode));
}

export function mapRevertCodeToNoir(revertCode: RevertCode): NoirField {
  return mapFieldToNoir(revertCode.toField());
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
 * Maps a SHA256 hash from noir to the parsed type.
 * @param hash - The hash as it is represented in Noir (1 fields).
 * @returns The hash represented as a 31 bytes long buffer.
 */
export function mapSha256HashFromNoir(hash: Field): Buffer {
  return toBufferBE(mapFieldFromNoir(hash).toBigInt(), NUM_BYTES_PER_SHA256);
}

/**
 * Maps a sha256 to the representation used in noir.
 * @param hash - The hash represented as a 32 bytes long buffer.
 * @returns The hash as it is represented in Noir (1 field, truncated).
 */
export function mapSha256HashToNoir(hash: Buffer): Field {
  return mapFieldToNoir(toTruncField(hash));
}

function mapPublicDataWriteFromNoir(write: PublicDataWriteNoir) {
  return new PublicDataWrite(mapFieldFromNoir(write.leaf_slot), mapFieldFromNoir(write.value));
}

function mapPublicDataWriteToNoir(write: PublicDataWrite): PublicDataWriteNoir {
  return {
    leaf_slot: mapFieldToNoir(write.leafSlot),
    value: mapFieldToNoir(write.value),
  };
}

function mapReadRequestStatusToNoir(readRequestStatus: ReadRequestStatus): ReadRequestStatusNoir {
  return {
    state: mapNumberToNoir(readRequestStatus.state),
    hint_index: mapNumberToNoir(readRequestStatus.hintIndex),
  };
}

function mapPendingReadHintToNoir(hint: PendingReadHint): PendingReadHintNoir {
  return {
    read_request_index: mapNumberToNoir(hint.readRequestIndex),
    pending_value_index: mapNumberToNoir(hint.pendingValueIndex),
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
    read_request_statuses: mapTuple(hints.readRequestStatuses, mapReadRequestStatusToNoir),
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
    read_request_statuses: mapTuple(hints.readRequestStatuses, mapReadRequestStatusToNoir),
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

function mapPublicDataHintToNoir(hint: PublicDataHint): PublicDataHintNoir {
  return {
    leaf_slot: mapFieldToNoir(hint.leafSlot),
    value: mapFieldToNoir(hint.value),
    membership_witness: mapMembershipWitnessToNoir(hint.membershipWitness),
    leaf_preimage: mapPublicDataTreePreimageToNoir(hint.leafPreimage),
  };
}

function mapOptionalNumberToNoir(option: OptionalNumber): OptionalNumberNoir {
  return {
    _is_some: option.isSome,
    _value: mapNumberToNoir(option.value),
  };
}

function mapOptionalNumberFromNoir(option: OptionalNumberNoir) {
  return new OptionalNumber(option._is_some, mapNumberFromNoir(option._value));
}

function mapPrivateValidationRequestsToNoir(requests: PrivateValidationRequests): PrivateValidationRequestsNoir {
  return {
    for_rollup: mapRollupValidationRequestsToNoir(requests.forRollup),
    note_hash_read_requests: mapTuple(requests.noteHashReadRequests, mapScopedReadRequestToNoir),
    nullifier_read_requests: mapTuple(requests.nullifierReadRequests, mapScopedReadRequestToNoir),
    scoped_key_validation_requests_and_generators: mapTuple(
      requests.scopedKeyValidationRequestsAndGenerators,
      mapScopedKeyValidationRequestAndGeneratorToNoir,
    ),
    split_counter: mapOptionalNumberToNoir(requests.splitCounter),
  };
}

function mapPrivateValidationRequestsFromNoir(requests: PrivateValidationRequestsNoir) {
  return new PrivateValidationRequests(
    mapRollupValidationRequestsFromNoir(requests.for_rollup),
    mapTupleFromNoir(
      requests.note_hash_read_requests,
      MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
      mapScopedReadRequestFromNoir,
    ),
    mapTupleFromNoir(
      requests.nullifier_read_requests,
      MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      mapScopedReadRequestFromNoir,
    ),
    mapTupleFromNoir(
      requests.scoped_key_validation_requests_and_generators,
      MAX_KEY_VALIDATION_REQUESTS_PER_TX,
      mapScopedKeyValidationRequestAndGeneratorFromNoir,
    ),
    mapOptionalNumberFromNoir(requests.split_counter),
  );
}

export function mapPrivateAccumulatedDataFromNoir(
  privateAccumulatedData: PrivateAccumulatedDataNoir,
): PrivateAccumulatedData {
  return new PrivateAccumulatedData(
    mapTupleFromNoir(privateAccumulatedData.note_hashes, MAX_NOTE_HASHES_PER_TX, mapScopedNoteHashFromNoir),
    mapTupleFromNoir(privateAccumulatedData.nullifiers, MAX_NULLIFIERS_PER_TX, mapScopedNullifierFromNoir),
    mapTupleFromNoir(privateAccumulatedData.l2_to_l1_msgs, MAX_L2_TO_L1_MSGS_PER_TX, mapScopedL2ToL1MessageFromNoir),
    mapTupleFromNoir(privateAccumulatedData.private_logs, MAX_PRIVATE_LOGS_PER_TX, mapScopedPrivateLogDataFromNoir),
    mapTupleFromNoir(
      privateAccumulatedData.contract_class_logs_hashes,
      MAX_CONTRACT_CLASS_LOGS_PER_TX,
      mapScopedLogHashFromNoir,
    ),
    mapTupleFromNoir(
      privateAccumulatedData.public_call_requests,
      MAX_ENQUEUED_CALLS_PER_TX,
      mapCountedPublicCallRequestFromNoir,
    ),
    mapTupleFromNoir(
      privateAccumulatedData.private_call_stack,
      MAX_PRIVATE_CALL_STACK_LENGTH_PER_TX,
      mapPrivateCallRequestFromNoir,
    ),
  );
}

export function mapPrivateAccumulatedDataToNoir(data: PrivateAccumulatedData): PrivateAccumulatedDataNoir {
  return {
    note_hashes: mapTuple(data.noteHashes, mapScopedNoteHashToNoir),
    nullifiers: mapTuple(data.nullifiers, mapScopedNullifierToNoir),
    l2_to_l1_msgs: mapTuple(data.l2ToL1Msgs, mapScopedL2ToL1MessageToNoir),
    private_logs: mapTuple(data.privateLogs, mapScopedPrivateLogDataToNoir),
    contract_class_logs_hashes: mapTuple(data.contractClassLogsHashes, mapScopedLogHashToNoir),
    public_call_requests: mapTuple(data.publicCallRequests, mapCountedPublicCallRequestToNoir),
    private_call_stack: mapTuple(data.privateCallStack, mapPrivateCallRequestToNoir),
  };
}

export function mapGasFromNoir(gasUsed: GasNoir): Gas {
  return Gas.from({
    daGas: mapNumberFromNoir(gasUsed.da_gas),
    l2Gas: mapNumberFromNoir(gasUsed.l2_gas),
  });
}

export function mapGasToNoir(gasUsed: Gas): GasNoir {
  return {
    da_gas: mapNumberToNoir(gasUsed.daGas),
    l2_gas: mapNumberToNoir(gasUsed.l2Gas),
  };
}

export function mapRollupValidationRequestsToNoir(
  rollupValidationRequests: RollupValidationRequests,
): RollupValidationRequestsNoir {
  return {
    max_block_number: mapMaxBlockNumberToNoir(rollupValidationRequests.maxBlockNumber),
  };
}

export function mapRollupValidationRequestsFromNoir(
  rollupValidationRequests: RollupValidationRequestsNoir,
): RollupValidationRequests {
  return new RollupValidationRequests(mapMaxBlockNumberFromNoir(rollupValidationRequests.max_block_number));
}

export function mapMaxBlockNumberToNoir(maxBlockNumber: MaxBlockNumber): MaxBlockNumberNoir {
  return {
    _opt: {
      _is_some: maxBlockNumber.isSome,
      _value: mapFieldToNoir(maxBlockNumber.value),
    },
  };
}

export function mapMaxBlockNumberFromNoir(maxBlockNumber: MaxBlockNumberNoir): MaxBlockNumber {
  return new MaxBlockNumber(maxBlockNumber._opt._is_some, mapFieldFromNoir(maxBlockNumber._opt._value));
}

function mapPrivateToPublicAccumulatedDataFromNoir(data: PrivateToPublicAccumulatedDataNoir) {
  return new PrivateToPublicAccumulatedData(
    mapTupleFromNoir(data.note_hashes, MAX_NOTE_HASHES_PER_TX, mapFieldFromNoir),
    mapTupleFromNoir(data.nullifiers, MAX_NULLIFIERS_PER_TX, mapFieldFromNoir),
    mapTupleFromNoir(data.l2_to_l1_msgs, MAX_L2_TO_L1_MSGS_PER_TX, mapScopedL2ToL1MessageFromNoir),
    mapTupleFromNoir(data.private_logs, MAX_PRIVATE_LOGS_PER_TX, mapPrivateLogFromNoir),
    mapTupleFromNoir(data.contract_class_logs_hashes, MAX_CONTRACT_CLASS_LOGS_PER_TX, mapScopedLogHashFromNoir),
    mapTupleFromNoir(data.public_call_requests, MAX_ENQUEUED_CALLS_PER_TX, mapPublicCallRequestFromNoir),
  );
}

function mapPrivateToPublicAccumulatedDataToNoir(
  data: PrivateToPublicAccumulatedData,
): PrivateToPublicAccumulatedDataNoir {
  return {
    note_hashes: mapTuple(data.noteHashes, mapFieldToNoir),
    nullifiers: mapTuple(data.nullifiers, mapFieldToNoir),
    l2_to_l1_msgs: mapTuple(data.l2ToL1Msgs, mapScopedL2ToL1MessageToNoir),
    private_logs: mapTuple(data.privateLogs, mapPrivateLogToNoir),
    contract_class_logs_hashes: mapTuple(data.contractClassLogsHashes, mapScopedLogHashToNoir),
    public_call_requests: mapTuple(data.publicCallRequests, mapPublicCallRequestToNoir),
  };
}

function mapPrivateToAvmAccumulatedDataToNoir(data: PrivateToAvmAccumulatedData): PrivateToAvmAccumulatedDataNoir {
  return {
    note_hashes: mapTuple(data.noteHashes, mapFieldToNoir),
    nullifiers: mapTuple(data.nullifiers, mapFieldToNoir),
    l2_to_l1_msgs: mapTuple(data.l2ToL1Msgs, mapScopedL2ToL1MessageToNoir),
  };
}

function mapPrivateToAvmAccumulatedDataArrayLengthsToNoir(
  data: PrivateToAvmAccumulatedDataArrayLengths,
): PrivateToAvmAccumulatedDataArrayLengthsNoir {
  return {
    note_hashes: mapNumberToNoir(data.noteHashes),
    nullifiers: mapNumberToNoir(data.nullifiers),
    l2_to_l1_msgs: mapNumberToNoir(data.l2ToL1Msgs),
  };
}

function mapAvmAccumulatedDataToNoir(data: AvmAccumulatedData): AvmAccumulatedDataNoir {
  return {
    note_hashes: mapTuple(data.noteHashes, mapFieldToNoir),
    nullifiers: mapTuple(data.nullifiers, mapFieldToNoir),
    l2_to_l1_msgs: mapTuple(data.l2ToL1Msgs, mapScopedL2ToL1MessageToNoir),
    unencrypted_logs_hashes: mapTuple(data.unencryptedLogsHashes, mapScopedLogHashToNoir),
    public_data_writes: mapTuple(data.publicDataWrites, mapPublicDataWriteToNoir),
  };
}

/**
 * Maps combined accumulated data from noir to the parsed type.
 * @param combinedAccumulatedData - The noir combined accumulated data.
 * @returns The parsed combined accumulated data.
 */
export function mapCombinedAccumulatedDataFromNoir(combinedAccumulatedData: CombinedAccumulatedDataNoir) {
  return new CombinedAccumulatedData(
    mapTupleFromNoir(combinedAccumulatedData.note_hashes, MAX_NOTE_HASHES_PER_TX, mapFieldFromNoir),
    mapTupleFromNoir(combinedAccumulatedData.nullifiers, MAX_NULLIFIERS_PER_TX, mapFieldFromNoir),
    mapTupleFromNoir(combinedAccumulatedData.l2_to_l1_msgs, MAX_L2_TO_L1_MSGS_PER_TX, mapScopedL2ToL1MessageFromNoir),
    mapTupleFromNoir(combinedAccumulatedData.private_logs, MAX_PRIVATE_LOGS_PER_TX, mapPrivateLogFromNoir),
    mapTupleFromNoir(
      combinedAccumulatedData.unencrypted_logs_hashes,
      MAX_UNENCRYPTED_LOGS_PER_TX,
      mapScopedLogHashFromNoir,
    ),
    mapTupleFromNoir(
      combinedAccumulatedData.contract_class_logs_hashes,
      MAX_CONTRACT_CLASS_LOGS_PER_TX,
      mapScopedLogHashFromNoir,
    ),
    mapFieldFromNoir(combinedAccumulatedData.unencrypted_log_preimages_length),
    mapFieldFromNoir(combinedAccumulatedData.contract_class_log_preimages_length),
    mapTupleFromNoir(
      combinedAccumulatedData.public_data_writes,
      MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      mapPublicDataWriteFromNoir,
    ),
  );
}

export function mapCombinedAccumulatedDataToNoir(
  combinedAccumulatedData: CombinedAccumulatedData,
): CombinedAccumulatedDataNoir {
  return {
    note_hashes: mapTuple(combinedAccumulatedData.noteHashes, mapFieldToNoir),
    nullifiers: mapTuple(combinedAccumulatedData.nullifiers, mapFieldToNoir),
    l2_to_l1_msgs: mapTuple(combinedAccumulatedData.l2ToL1Msgs, mapScopedL2ToL1MessageToNoir),
    private_logs: mapTuple(combinedAccumulatedData.privateLogs, mapPrivateLogToNoir),
    unencrypted_logs_hashes: mapTuple(combinedAccumulatedData.unencryptedLogsHashes, mapScopedLogHashToNoir),
    contract_class_logs_hashes: mapTuple(combinedAccumulatedData.contractClassLogsHashes, mapScopedLogHashToNoir),
    unencrypted_log_preimages_length: mapFieldToNoir(combinedAccumulatedData.unencryptedLogPreimagesLength),
    contract_class_log_preimages_length: mapFieldToNoir(combinedAccumulatedData.contractClassLogPreimagesLength),
    public_data_writes: mapTuple(combinedAccumulatedData.publicDataWrites, mapPublicDataWriteToNoir),
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

function mapCombinedConstantDataFromNoir(combinedConstantData: CombinedConstantDataNoir): CombinedConstantData {
  return new CombinedConstantData(
    mapHeaderFromNoir(combinedConstantData.historical_header),
    mapTxContextFromNoir(combinedConstantData.tx_context),
    mapFieldFromNoir(combinedConstantData.vk_tree_root),
    mapFieldFromNoir(combinedConstantData.protocol_contract_tree_root),
    mapGlobalVariablesFromNoir(combinedConstantData.global_variables),
  );
}

function mapCombinedConstantDataToNoir(combinedConstantData: CombinedConstantData): CombinedConstantDataNoir {
  return {
    historical_header: mapHeaderToNoir(combinedConstantData.historicalHeader),
    tx_context: mapTxContextToNoir(combinedConstantData.txContext),
    vk_tree_root: mapFieldToNoir(combinedConstantData.vkTreeRoot),
    protocol_contract_tree_root: mapFieldToNoir(combinedConstantData.protocolContractTreeRoot),
    global_variables: mapGlobalVariablesToNoir(combinedConstantData.globalVariables),
  };
}

export function mapPrivateToPublicKernelCircuitPublicInputsToNoir(
  inputs: PrivateToPublicKernelCircuitPublicInputs,
): PrivateToPublicKernelCircuitPublicInputsNoir {
  return {
    constants: mapTxConstantDataToNoir(inputs.constants),
    rollup_validation_requests: mapRollupValidationRequestsToNoir(inputs.rollupValidationRequests),
    non_revertible_accumulated_data: mapPrivateToPublicAccumulatedDataToNoir(inputs.nonRevertibleAccumulatedData),
    revertible_accumulated_data: mapPrivateToPublicAccumulatedDataToNoir(inputs.revertibleAccumulatedData),
    public_teardown_call_request: mapPublicCallRequestToNoir(inputs.publicTeardownCallRequest),
    gas_used: mapGasToNoir(inputs.gasUsed),
    fee_payer: mapAztecAddressToNoir(inputs.feePayer),
  };
}

export function mapKernelCircuitPublicInputsFromNoir(inputs: KernelCircuitPublicInputsNoir) {
  return new KernelCircuitPublicInputs(
    mapRollupValidationRequestsFromNoir(inputs.rollup_validation_requests),
    mapCombinedAccumulatedDataFromNoir(inputs.end),
    mapCombinedConstantDataFromNoir(inputs.constants),
    mapPartialStateReferenceFromNoir(inputs.start_state),
    mapRevertCodeFromNoir(inputs.revert_code),
    mapGasFromNoir(inputs.gas_used),
    mapAztecAddressFromNoir(inputs.fee_payer),
  );
}

export function mapKernelCircuitPublicInputsToNoir(inputs: KernelCircuitPublicInputs): KernelCircuitPublicInputsNoir {
  return {
    rollup_validation_requests: mapRollupValidationRequestsToNoir(inputs.rollupValidationRequests),
    constants: mapCombinedConstantDataToNoir(inputs.constants),
    end: mapCombinedAccumulatedDataToNoir(inputs.end),
    start_state: mapPartialStateReferenceToNoir(inputs.startState),
    revert_code: mapRevertCodeToNoir(inputs.revertCode),
    gas_used: mapGasToNoir(inputs.gasUsed),
    fee_payer: mapAztecAddressToNoir(inputs.feePayer),
  };
}

export function mapVerificationKeyToNoir<N extends number>(
  key: VerificationKeyAsFields,
  length: N,
): VerificationKeyNoir<N> {
  if (key.key.length !== length) {
    throw new Error(`Expected ${length} fields, got ${key.key.length}`);
  }
  return {
    key: key.key.map(mapFieldToNoir) as FixedLengthArray<NoirField, N>,
    hash: mapFieldToNoir(key.hash),
  };
}

function mapVkWitnessDataToNoir<N extends number>(vkData: VkWitnessData, length: N): VkDataNoir<N> {
  return {
    vk: mapVerificationKeyToNoir<N>(vkData.vk.keyAsFields, length),
    vk_index: mapFieldToNoir(new Fr(vkData.vkIndex)),
    vk_path: mapTuple(vkData.vkPath, mapFieldToNoir),
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
    inputs.is_private_only,
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
    is_private_only: inputs.isPrivateOnly,
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
    vk: mapVerificationKeyToNoir(privateKernelInnerData.vk, CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS),
    vk_index: mapFieldToNoir(new Fr(privateKernelInnerData.vkIndex)),
    vk_path: mapTuple(privateKernelInnerData.vkPath, mapFieldToNoir),
  };
}

export function mapPrivateKernelTailCircuitPublicInputsForRollupFromNoir(
  inputs: KernelCircuitPublicInputsNoir,
): PrivateKernelTailCircuitPublicInputs {
  const forRollup = new PartialPrivateTailPublicInputsForRollup(mapCombinedAccumulatedDataFromNoir(inputs.end));
  return new PrivateKernelTailCircuitPublicInputs(
    mapTxConstantDataFromNoir(inputs.constants),
    mapRollupValidationRequestsFromNoir(inputs.rollup_validation_requests),
    mapGasFromNoir(inputs.gas_used),
    mapAztecAddressFromNoir(inputs.fee_payer),
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
    mapRollupValidationRequestsFromNoir(inputs.rollup_validation_requests),
    mapGasFromNoir(inputs.gas_used),
    mapAztecAddressFromNoir(inputs.fee_payer),
    forPublic,
  );
}

function mapTransientDataIndexHintToNoir(indexHint: TransientDataIndexHint): TransientDataIndexHintNoir {
  return {
    nullifier_index: mapNumberToNoir(indexHint.nullifierIndex),
    note_hash_index: mapNumberToNoir(indexHint.noteHashIndex),
  };
}

export function mapPrivateKernelResetHintsToNoir<
  NH_RR_PENDING extends number,
  NH_RR_SETTLED extends number,
  NLL_RR_PENDING extends number,
  NLL_RR_SETTLED extends number,
  KEY_VALIDATION_REQUESTS extends number,
  NUM_TRANSIENT_DATA_HINTS extends number,
>(
  inputs: PrivateKernelResetHints<
    NH_RR_PENDING,
    NH_RR_SETTLED,
    NLL_RR_PENDING,
    NLL_RR_SETTLED,
    KEY_VALIDATION_REQUESTS,
    NUM_TRANSIENT_DATA_HINTS
  >,
): PrivateKernelResetHintsNoir<
  NH_RR_PENDING,
  NH_RR_SETTLED,
  NLL_RR_PENDING,
  NLL_RR_SETTLED,
  KEY_VALIDATION_REQUESTS,
  NUM_TRANSIENT_DATA_HINTS
> {
  return {
    note_hash_read_request_hints: mapNoteHashReadRequestHintsToNoir(inputs.noteHashReadRequestHints),
    nullifier_read_request_hints: mapNullifierReadRequestHintsToNoir(inputs.nullifierReadRequestHints),
    key_validation_hints: inputs.keyValidationHints.map(mapKeyValidationHintToNoir) as FixedLengthArray<
      KeyValidationHintNoir,
      KEY_VALIDATION_REQUESTS
    >,
    transient_data_index_hints: inputs.transientDataIndexHints.map(mapTransientDataIndexHintToNoir) as FixedLengthArray<
      TransientDataIndexHintNoir,
      NUM_TRANSIENT_DATA_HINTS
    >,
    validation_requests_split_counter: mapNumberToNoir(inputs.validationRequestsSplitCounter),
  };
}

/**
 * Maps global variables to the noir type.
 * @param globalVariables - The global variables.
 * @returns The noir global variables.
 */
export function mapGlobalVariablesToNoir(globalVariables: GlobalVariables): GlobalVariablesNoir {
  return {
    chain_id: mapFieldToNoir(globalVariables.chainId),
    version: mapFieldToNoir(globalVariables.version),
    block_number: mapFieldToNoir(globalVariables.blockNumber),
    slot_number: mapFieldToNoir(globalVariables.slotNumber),
    timestamp: mapFieldToNoir(globalVariables.timestamp),
    coinbase: mapEthAddressToNoir(globalVariables.coinbase),
    fee_recipient: mapAztecAddressToNoir(globalVariables.feeRecipient),
    gas_fees: mapGasFeesToNoir(globalVariables.gasFees),
  };
}

/**
 * Maps global variables from the noir type.
 * @param globalVariables - The noir global variables.
 * @returns The global variables.
 */
export function mapGlobalVariablesFromNoir(globalVariables: GlobalVariablesNoir): GlobalVariables {
  return new GlobalVariables(
    mapFieldFromNoir(globalVariables.chain_id),
    mapFieldFromNoir(globalVariables.version),
    mapFieldFromNoir(globalVariables.block_number),
    mapFieldFromNoir(globalVariables.slot_number),
    mapFieldFromNoir(globalVariables.timestamp),
    mapEthAddressFromNoir(globalVariables.coinbase),
    mapAztecAddressFromNoir(globalVariables.fee_recipient),
    mapGasFeesFromNoir(globalVariables.gas_fees),
  );
}

export function mapGasFeesToNoir(gasFees: GasFees): GasFeesNoir {
  return {
    fee_per_da_gas: mapFieldToNoir(gasFees.feePerDaGas),
    fee_per_l2_gas: mapFieldToNoir(gasFees.feePerL2Gas),
  };
}

export function mapGasFeesFromNoir(gasFees: GasFeesNoir): GasFees {
  return new GasFees(mapFieldFromNoir(gasFees.fee_per_da_gas), mapFieldFromNoir(gasFees.fee_per_l2_gas));
}

export function mapFeeRecipientToNoir(feeRecipient: FeeRecipient): FeeRecipientNoir {
  return {
    recipient: mapEthAddressToNoir(feeRecipient.recipient),
    value: mapFieldToNoir(feeRecipient.value),
  };
}

export function mapFeeRecipientFromNoir(feeRecipient: FeeRecipientNoir): FeeRecipient {
  return new FeeRecipient(mapEthAddressFromNoir(feeRecipient.recipient), mapFieldFromNoir(feeRecipient.value));
}

/**
 * Maps poseidon sponge to noir.
 * @param sponge - The circuits.js poseidon sponge.
 * @returns The noir poseidon sponge.
 */
export function mapPoseidon2SpongeToNoir(sponge: Poseidon2Sponge): Poseidon2SpongeNoir {
  return {
    cache: mapTuple(sponge.cache, mapFieldToNoir),
    state: mapTuple(sponge.state, mapFieldToNoir),
    cache_size: mapNumberToNoir(sponge.cacheSize),
    squeeze_mode: sponge.squeezeMode,
  };
}

/**
 * Maps poseidon sponge from noir.
 * @param sponge - The noir poseidon sponge.
 * @returns The circuits.js poseidon sponge.
 */
export function mapPoseidon2SpongeFromNoir(sponge: Poseidon2SpongeNoir): Poseidon2Sponge {
  return new Poseidon2Sponge(
    mapTupleFromNoir(sponge.cache, 3, mapFieldFromNoir),
    mapTupleFromNoir(sponge.state, 4, mapFieldFromNoir),
    mapNumberFromNoir(sponge.cache_size),
    sponge.squeeze_mode,
  );
}

/**
 * Maps sponge blob to noir.
 * @param spongeBlob - The circuits.js sponge blob.
 * @returns The noir sponge blob.
 */
export function mapSpongeBlobToNoir(spongeBlob: SpongeBlob): SpongeBlobNoir {
  return {
    sponge: mapPoseidon2SpongeToNoir(spongeBlob.sponge),
    fields: mapNumberToNoir(spongeBlob.fields),
    expected_fields: mapNumberToNoir(spongeBlob.expectedFields),
  };
}

/**
 * Maps sponge blob from noir.
 * @param spongeBlob - The noir sponge blob.
 * @returns The circuits.js sponge blob.
 */
export function mapSpongeBlobFromNoir(spongeBlob: SpongeBlobNoir): SpongeBlob {
  return new SpongeBlob(
    mapPoseidon2SpongeFromNoir(spongeBlob.sponge),
    mapNumberFromNoir(spongeBlob.fields),
    mapNumberFromNoir(spongeBlob.expected_fields),
  );
}

/**
 * Maps blob commitment to noir.
 * @param commitment - The circuits.js commitment.
 * @returns The noir commitment.
 */
export function mapBlobCommitmentToNoir(commitment: [Fr, Fr]): BlobCommitmentNoir {
  return {
    inner: mapTuple(commitment, mapFieldToNoir),
  };
}

/**
 * Maps blob public inputs to noir.
 * @param blobPublicInputs - The circuits.js blob public inputs.
 * @returns The noir blob public inputs.
 */
export function mapBlobPublicInputsToNoir(blobPublicInputs: BlobPublicInputs): BlobPublicInputsNoir {
  return {
    z: mapFieldToNoir(blobPublicInputs.z),
    y: mapBLS12BigNumToNoir(blobPublicInputs.y),
    kzg_commitment: mapBlobCommitmentToNoir(blobPublicInputs.kzgCommitment),
  };
}

/**
 * Maps blob public inputs from noir.
 * @param blobPublicInputs - The noir blob public inputs.
 * @returns The circuits.js blob public inputs.
 */
export function mapBlobPublicInputsFromNoir(blobPublicInputs: BlobPublicInputsNoir): BlobPublicInputs {
  return new BlobPublicInputs(
    mapFieldFromNoir(blobPublicInputs.z),
    mapBLS12BigNumFromNoir(blobPublicInputs.y),
    mapTupleFromNoir(blobPublicInputs.kzg_commitment.inner, 2, mapFieldFromNoir),
  );
}

/**
 * Maps block blob public inputs to noir.
 * @param blockBlobPublicInputs - The circuits.js block blob public inputs.
 * @returns The noir block blob public inputs.
 */
export function mapBlockBlobPublicInputsToNoir(
  blockBlobPublicInputs: BlockBlobPublicInputs,
): BlockBlobPublicInputsNoir {
  return {
    inner: mapTuple(blockBlobPublicInputs.inner, mapBlobPublicInputsToNoir),
  };
}

/**
 * Maps block blob public inputs from noir.
 * @param blockBlobPublicInputs - The noir block blob public inputs.
 * @returns The circuits.js block blob public inputs.
 */
export function mapBlockBlobPublicInputsFromNoir(
  blockBlobPublicInputs: BlockBlobPublicInputsNoir,
): BlockBlobPublicInputs {
  return new BlockBlobPublicInputs(
    mapTupleFromNoir(blockBlobPublicInputs.inner, BLOBS_PER_BLOCK, mapBlobPublicInputsFromNoir),
  );
}

/**
 * Maps a constant rollup data to a noir constant rollup data.
 * @param constantRollupData - The circuits.js constant rollup data.
 * @returns The noir constant rollup data.
 */
export function mapConstantRollupDataToNoir(constantRollupData: ConstantRollupData): ConstantRollupDataNoir {
  return {
    last_archive: mapAppendOnlyTreeSnapshotToNoir(constantRollupData.lastArchive),
    vk_tree_root: mapFieldToNoir(constantRollupData.vkTreeRoot),
    protocol_contract_tree_root: mapFieldToNoir(constantRollupData.protocolContractTreeRoot),
    global_variables: mapGlobalVariablesToNoir(constantRollupData.globalVariables),
  };
}

/**
 * Maps a constant rollup data from noir to the circuits.js type.
 * @param constantRollupData - The noir constant rollup data.
 * @returns The circuits.js constant rollup data.
 */
export function mapConstantRollupDataFromNoir(constantRollupData: ConstantRollupDataNoir): ConstantRollupData {
  return new ConstantRollupData(
    mapAppendOnlyTreeSnapshotFromNoir(constantRollupData.last_archive),
    mapFieldFromNoir(constantRollupData.vk_tree_root),
    mapFieldFromNoir(constantRollupData.protocol_contract_tree_root),
    mapGlobalVariablesFromNoir(constantRollupData.global_variables),
  );
}

/**
 * Maps a base or merge rollup public inputs to a noir base or merge rollup public inputs.
 * @param baseOrMergeRollupPublicInputs - The base or merge rollup public inputs.
 * @returns The noir base or merge rollup public inputs.
 */
export function mapBaseOrMergeRollupPublicInputsToNoir(
  baseOrMergeRollupPublicInputs: BaseOrMergeRollupPublicInputs,
): BaseOrMergeRollupPublicInputsNoir {
  return {
    rollup_type: mapFieldToNoir(new Fr(baseOrMergeRollupPublicInputs.rollupType)),
    num_txs: mapFieldToNoir(new Fr(baseOrMergeRollupPublicInputs.numTxs)),
    constants: mapConstantRollupDataToNoir(baseOrMergeRollupPublicInputs.constants),
    start: mapPartialStateReferenceToNoir(baseOrMergeRollupPublicInputs.start),
    end: mapPartialStateReferenceToNoir(baseOrMergeRollupPublicInputs.end),
    start_sponge_blob: mapSpongeBlobToNoir(baseOrMergeRollupPublicInputs.startSpongeBlob),
    end_sponge_blob: mapSpongeBlobToNoir(baseOrMergeRollupPublicInputs.endSpongeBlob),
    out_hash: mapFieldToNoir(baseOrMergeRollupPublicInputs.outHash),
    accumulated_fees: mapFieldToNoir(baseOrMergeRollupPublicInputs.accumulatedFees),
    accumulated_mana_used: mapFieldToNoir(baseOrMergeRollupPublicInputs.accumulatedManaUsed),
  };
}

/**
 * Maps block root or block merge rollup public inputs to a noir block root or block merge rollup public inputs.
 * @param blockRootOrBlockMergePublicInputs - The block root or block merge rollup public inputs.
 * @returns The noir block root or block merge rollup public inputs.
 */
export function mapBlockRootOrBlockMergePublicInputsToNoir(
  blockRootOrBlockMergePublicInputs: BlockRootOrBlockMergePublicInputs,
): BlockRootOrBlockMergePublicInputsNoir {
  return {
    previous_archive: mapAppendOnlyTreeSnapshotToNoir(blockRootOrBlockMergePublicInputs.previousArchive),
    new_archive: mapAppendOnlyTreeSnapshotToNoir(blockRootOrBlockMergePublicInputs.newArchive),
    previous_block_hash: mapFieldToNoir(blockRootOrBlockMergePublicInputs.previousBlockHash),
    end_block_hash: mapFieldToNoir(blockRootOrBlockMergePublicInputs.endBlockHash),
    start_global_variables: mapGlobalVariablesToNoir(blockRootOrBlockMergePublicInputs.startGlobalVariables),
    end_global_variables: mapGlobalVariablesToNoir(blockRootOrBlockMergePublicInputs.endGlobalVariables),
    out_hash: mapFieldToNoir(blockRootOrBlockMergePublicInputs.outHash),
    fees: mapTuple(blockRootOrBlockMergePublicInputs.fees, mapFeeRecipientToNoir),
    vk_tree_root: mapFieldToNoir(blockRootOrBlockMergePublicInputs.vkTreeRoot),
    protocol_contract_tree_root: mapFieldToNoir(blockRootOrBlockMergePublicInputs.protocolContractTreeRoot),
    prover_id: mapFieldToNoir(blockRootOrBlockMergePublicInputs.proverId),
    blob_public_inputs: mapTuple(blockRootOrBlockMergePublicInputs.blobPublicInputs, mapBlockBlobPublicInputsToNoir),
  };
}

function mapAvmCircuitPublicInputsToNoir(inputs: AvmCircuitPublicInputs): AvmCircuitPublicInputsNoir {
  return {
    global_variables: mapGlobalVariablesToNoir(inputs.globalVariables),
    start_tree_snapshots: mapTreeSnapshotsToNoir(inputs.startTreeSnapshots),
    start_gas_used: mapGasToNoir(inputs.startGasUsed),
    gas_settings: mapGasSettingsToNoir(inputs.gasSettings),
    fee_payer: mapAztecAddressToNoir(inputs.feePayer),
    public_setup_call_requests: mapTuple(inputs.publicSetupCallRequests, mapPublicCallRequestToNoir),
    public_app_logic_call_requests: mapTuple(inputs.publicAppLogicCallRequests, mapPublicCallRequestToNoir),
    public_teardown_call_request: mapPublicCallRequestToNoir(inputs.publicTeardownCallRequest),
    previous_non_revertible_accumulated_data_array_lengths: mapPrivateToAvmAccumulatedDataArrayLengthsToNoir(
      inputs.previousNonRevertibleAccumulatedDataArrayLengths,
    ),
    previous_revertible_accumulated_data_array_lengths: mapPrivateToAvmAccumulatedDataArrayLengthsToNoir(
      inputs.previousRevertibleAccumulatedDataArrayLengths,
    ),
    previous_non_revertible_accumulated_data: mapPrivateToAvmAccumulatedDataToNoir(
      inputs.previousNonRevertibleAccumulatedData,
    ),
    previous_revertible_accumulated_data: mapPrivateToAvmAccumulatedDataToNoir(
      inputs.previousRevertibleAccumulatedData,
    ),
    end_tree_snapshots: mapTreeSnapshotsToNoir(inputs.endTreeSnapshots),
    end_gas_used: mapGasToNoir(inputs.endGasUsed),
    accumulated_data: mapAvmAccumulatedDataToNoir(inputs.accumulatedData),
    transaction_fee: mapFieldToNoir(inputs.transactionFee),
    reverted: inputs.reverted,
  };
}

/**
 * Maps a base or merge rollup public inputs from noir to the circuits.js type.
 * @param baseOrMergeRollupPublicInputs - The noir base or merge rollup public inputs.
 * @returns The circuits.js base or merge rollup public inputs.
 */
export function mapBaseOrMergeRollupPublicInputsFromNoir(
  baseOrMergeRollupPublicInputs: BaseOrMergeRollupPublicInputsNoir,
): BaseOrMergeRollupPublicInputs {
  return new BaseOrMergeRollupPublicInputs(
    mapNumberFromNoir(baseOrMergeRollupPublicInputs.rollup_type),
    mapNumberFromNoir(baseOrMergeRollupPublicInputs.num_txs),
    mapConstantRollupDataFromNoir(baseOrMergeRollupPublicInputs.constants),
    mapPartialStateReferenceFromNoir(baseOrMergeRollupPublicInputs.start),
    mapPartialStateReferenceFromNoir(baseOrMergeRollupPublicInputs.end),
    mapSpongeBlobFromNoir(baseOrMergeRollupPublicInputs.start_sponge_blob),
    mapSpongeBlobFromNoir(baseOrMergeRollupPublicInputs.end_sponge_blob),
    mapFieldFromNoir(baseOrMergeRollupPublicInputs.out_hash),
    mapFieldFromNoir(baseOrMergeRollupPublicInputs.accumulated_fees),
    mapFieldFromNoir(baseOrMergeRollupPublicInputs.accumulated_mana_used),
  );
}

/**
 * Maps a block root or block merge rollup public inputs from noir to the circuits.js type.
 * @param blockRootOrBlockMergePublicInputs - The noir lock root or block merge  rollup public inputs.
 * @returns The circuits.js block root or block merge  rollup public inputs.
 */
export function mapBlockRootOrBlockMergePublicInputsFromNoir(
  blockRootOrBlockMergePublicInputs: BlockRootOrBlockMergePublicInputsNoir,
): BlockRootOrBlockMergePublicInputs {
  return new BlockRootOrBlockMergePublicInputs(
    mapAppendOnlyTreeSnapshotFromNoir(blockRootOrBlockMergePublicInputs.previous_archive),
    mapAppendOnlyTreeSnapshotFromNoir(blockRootOrBlockMergePublicInputs.new_archive),
    mapFieldFromNoir(blockRootOrBlockMergePublicInputs.previous_block_hash),
    mapFieldFromNoir(blockRootOrBlockMergePublicInputs.end_block_hash),
    mapGlobalVariablesFromNoir(blockRootOrBlockMergePublicInputs.start_global_variables),
    mapGlobalVariablesFromNoir(blockRootOrBlockMergePublicInputs.end_global_variables),
    mapFieldFromNoir(blockRootOrBlockMergePublicInputs.out_hash),
    mapTupleFromNoir(blockRootOrBlockMergePublicInputs.fees, AZTEC_MAX_EPOCH_DURATION, mapFeeRecipientFromNoir),
    mapFieldFromNoir(blockRootOrBlockMergePublicInputs.vk_tree_root),
    mapFieldFromNoir(blockRootOrBlockMergePublicInputs.protocol_contract_tree_root),
    mapFieldFromNoir(blockRootOrBlockMergePublicInputs.prover_id),
    mapTupleFromNoir(
      blockRootOrBlockMergePublicInputs.blob_public_inputs,
      AZTEC_MAX_EPOCH_DURATION,
      mapBlockBlobPublicInputsFromNoir,
    ),
  );
}

/**
 * Maps a previous rollup data from the circuits.js type to noir.
 * @param previousRollupData - The circuits.js previous rollup data.
 * @returns The noir previous rollup data.
 */
export function mapPreviousRollupDataToNoir(previousRollupData: PreviousRollupData): PreviousRollupDataNoir {
  return {
    base_or_merge_rollup_public_inputs: mapBaseOrMergeRollupPublicInputsToNoir(
      previousRollupData.baseOrMergeRollupPublicInputs,
    ),
    proof: mapRecursiveProofToNoir(previousRollupData.proof),
    vk: mapVerificationKeyToNoir(previousRollupData.vk, HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
    vk_witness: {
      leaf_index: mapFieldToNoir(new Fr(previousRollupData.vkWitness.leafIndex)),
      sibling_path: mapTuple(previousRollupData.vkWitness.siblingPath, mapFieldToNoir),
    },
  };
}

/**
 * Maps a previous rollup data from the circuits.js type to noir.
 * @param previousRollupData - The circuits.js previous rollup data.
 * @returns The noir previous rollup data.
 */
export function mapPreviousRollupBlockDataToNoir(
  previousRollupData: PreviousRollupBlockData,
): PreviousRollupBlockDataNoir {
  return {
    block_root_or_block_merge_public_inputs: mapBlockRootOrBlockMergePublicInputsToNoir(
      previousRollupData.blockRootOrBlockMergePublicInputs,
    ),
    proof: mapRecursiveProofToNoir(previousRollupData.proof),
    vk: mapVerificationKeyToNoir(previousRollupData.vk, HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
    vk_witness: {
      leaf_index: mapFieldToNoir(new Fr(previousRollupData.vkWitness.leafIndex)),
      sibling_path: mapTuple(previousRollupData.vkWitness.siblingPath, mapFieldToNoir),
    },
  };
}

/**
 * Maps a AOT snapshot to noir.
 * @param snapshot - The circuits.js AOT snapshot.
 * @returns The noir AOT snapshot.
 */
export function mapAppendOnlyTreeSnapshotFromNoir(snapshot: AppendOnlyTreeSnapshotNoir): AppendOnlyTreeSnapshot {
  return new AppendOnlyTreeSnapshot(
    mapFieldFromNoir(snapshot.root),
    mapNumberFromNoir(snapshot.next_available_leaf_index),
  );
}

/**
 * Maps a AOT snapshot from noir to the circuits.js type.
 * @param snapshot - The noir AOT snapshot.
 * @returns The circuits.js AOT snapshot.
 */
export function mapAppendOnlyTreeSnapshotToNoir(snapshot: AppendOnlyTreeSnapshot): AppendOnlyTreeSnapshotNoir {
  return {
    root: mapFieldToNoir(snapshot.root),
    next_available_leaf_index: mapFieldToNoir(new Fr(snapshot.nextAvailableLeafIndex)),
  };
}

export function mapRootRollupParityInputToNoir(
  rootParityInput: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
): RootRollupParityInputNoir {
  return {
    proof: mapRecursiveProofToNoir(rootParityInput.proof),
    verification_key: mapVerificationKeyToNoir(rootParityInput.verificationKey, HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
    vk_path: mapTuple(rootParityInput.vkPath, mapFieldToNoir),
    public_inputs: mapParityPublicInputsToNoir(rootParityInput.publicInputs),
  };
}

/**
 * Maps the block root rollup inputs to noir.
 * @param rootRollupInputs - The circuits.js block root rollup inputs.
 * @returns The noir block root rollup inputs.
 */
export function mapBlockRootRollupInputsToNoir(rootRollupInputs: BlockRootRollupInputs): BlockRootRollupInputsNoir {
  return {
    previous_rollup_data: mapTuple(rootRollupInputs.previousRollupData, mapPreviousRollupDataToNoir),
    l1_to_l2_roots: mapRootRollupParityInputToNoir(rootRollupInputs.l1ToL2Roots),
    l1_to_l2_messages: mapTuple(rootRollupInputs.newL1ToL2Messages, mapFieldToNoir),
    l1_to_l2_message_subtree_sibling_path: mapTuple(
      rootRollupInputs.newL1ToL2MessageTreeRootSiblingPath,
      mapFieldToNoir,
    ),
    start_l1_to_l2_message_tree_snapshot: mapAppendOnlyTreeSnapshotToNoir(
      rootRollupInputs.startL1ToL2MessageTreeSnapshot,
    ),
    start_archive_snapshot: mapAppendOnlyTreeSnapshotToNoir(rootRollupInputs.startArchiveSnapshot),
    new_archive_sibling_path: mapTuple(rootRollupInputs.newArchiveSiblingPath, mapFieldToNoir),
    previous_block_hash: mapFieldToNoir(rootRollupInputs.previousBlockHash),
    prover_id: mapFieldToNoir(rootRollupInputs.proverId),
    // @ts-expect-error - below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
    blobs_fields: mapTuple(rootRollupInputs.blobFields, mapFieldToNoir),
    blob_commitments: mapTuple(rootRollupInputs.blobCommitments, mapBlobCommitmentToNoir),
    blobs_hash: mapFieldToNoir(rootRollupInputs.blobsHash),
  };
}

/**
 * Maps the empty block root rollup inputs to noir.
 * @param rootRollupInputs - The circuits.js block root rollup inputs.
 * @returns The noir block root rollup inputs.
 */
export function mapEmptyBlockRootRollupInputsToNoir(
  rootRollupInputs: EmptyBlockRootRollupInputs,
): EmptyBlockRootRollupInputsNoir {
  return {
    archive: mapAppendOnlyTreeSnapshotToNoir(rootRollupInputs.archive),
    block_hash: mapFieldToNoir(rootRollupInputs.blockHash),
    global_variables: mapGlobalVariablesToNoir(rootRollupInputs.globalVariables),
    vk_tree_root: mapFieldToNoir(rootRollupInputs.vkTreeRoot),
    protocol_contract_tree_root: mapFieldToNoir(rootRollupInputs.protocolContractTreeRoot),
    prover_id: mapFieldToNoir(rootRollupInputs.proverId),
  };
}

/**
 * Maps the root rollup inputs to noir.
 * @param rootRollupInputs - The circuits.js root rollup inputs.
 * @returns The noir root rollup inputs.
 */
export function mapRootRollupInputsToNoir(rootRollupInputs: RootRollupInputs): RootRollupInputsNoir {
  return {
    previous_rollup_data: mapTuple(rootRollupInputs.previousRollupData, mapPreviousRollupBlockDataToNoir),
    prover_id: mapFieldToNoir(rootRollupInputs.proverId),
  };
}

export function mapRecursiveProofToNoir<PROOF_LENGTH extends number>(proof: RecursiveProof<PROOF_LENGTH>) {
  return {
    fields: mapTuple(proof.proof, mapFieldToNoir) as FixedLengthArray<string, PROOF_LENGTH>,
  };
}

export function mapRootParityInputToNoir(
  rootParityInput: RootParityInput<typeof RECURSIVE_PROOF_LENGTH>,
): ParityRootParityInputNoir {
  return {
    proof: mapRecursiveProofToNoir(rootParityInput.proof),
    verification_key: mapVerificationKeyToNoir(rootParityInput.verificationKey, HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
    vk_path: mapTuple(rootParityInput.vkPath, mapFieldToNoir),
    public_inputs: mapParityPublicInputsToNoir(rootParityInput.publicInputs),
  };
}

export function mapParityPublicInputsToNoir(parityPublicInputs: ParityPublicInputs): ParityPublicInputsNoir {
  return {
    sha_root: mapFieldToNoir(parityPublicInputs.shaRoot),
    converted_root: mapFieldToNoir(parityPublicInputs.convertedRoot),
    vk_tree_root: mapFieldToNoir(parityPublicInputs.vkTreeRoot),
  };
}

/**
 * Maps a root rollup public inputs from noir.
 * @param rootRollupPublicInputs - The noir root rollup public inputs.
 * @returns The circuits.js root rollup public inputs.
 */
export function mapRootRollupPublicInputsFromNoir(
  rootRollupPublicInputs: RootRollupPublicInputsNoir,
): RootRollupPublicInputs {
  return new RootRollupPublicInputs(
    mapAppendOnlyTreeSnapshotFromNoir(rootRollupPublicInputs.previous_archive),
    mapAppendOnlyTreeSnapshotFromNoir(rootRollupPublicInputs.end_archive),
    mapFieldFromNoir(rootRollupPublicInputs.previous_block_hash),
    mapFieldFromNoir(rootRollupPublicInputs.end_block_hash),
    mapFieldFromNoir(rootRollupPublicInputs.end_timestamp),
    mapFieldFromNoir(rootRollupPublicInputs.end_block_number),
    mapFieldFromNoir(rootRollupPublicInputs.out_hash),
    mapTupleFromNoir(rootRollupPublicInputs.fees, AZTEC_MAX_EPOCH_DURATION, mapFeeRecipientFromNoir),
    mapFieldFromNoir(rootRollupPublicInputs.vk_tree_root),
    mapFieldFromNoir(rootRollupPublicInputs.protocol_contract_tree_root),
    mapFieldFromNoir(rootRollupPublicInputs.prover_id),
    mapTupleFromNoir(
      rootRollupPublicInputs.blob_public_inputs,
      AZTEC_MAX_EPOCH_DURATION,
      mapBlockBlobPublicInputsFromNoir,
    ),
  );
}

/**
 * Maps a parity public inputs from noir.
 * @param parityPublicInputs - The noir parity public inputs.
 * @returns The circuits.js parity public inputs.
 */
export function mapParityPublicInputsFromNoir(parityPublicInputs: ParityPublicInputsNoir): ParityPublicInputs {
  return new ParityPublicInputs(
    mapFieldFromNoir(parityPublicInputs.sha_root),
    mapFieldFromNoir(parityPublicInputs.converted_root),
    mapFieldFromNoir(parityPublicInputs.vk_tree_root),
  );
}

/**
 * Maps a block header to Noir
 * @param header - The block header.
 * @returns BlockHeader.
 */
export function mapHeaderToNoir(header: BlockHeader): BlockHeaderNoir {
  return {
    last_archive: mapAppendOnlyTreeSnapshotToNoir(header.lastArchive),
    content_commitment: mapContentCommitmentToNoir(header.contentCommitment),
    state: mapStateReferenceToNoir(header.state),
    global_variables: mapGlobalVariablesToNoir(header.globalVariables),
    total_fees: mapFieldToNoir(header.totalFees),
    total_mana_used: mapFieldToNoir(header.totalManaUsed),
  };
}

/**
 * Maps a block header from Noir.
 * @param header - The block header.
 * @returns BlockHeader.
 */
export function mapHeaderFromNoir(header: BlockHeaderNoir): BlockHeader {
  return new BlockHeader(
    mapAppendOnlyTreeSnapshotFromNoir(header.last_archive),
    mapContentCommitmentFromNoir(header.content_commitment),
    mapStateReferenceFromNoir(header.state),
    mapGlobalVariablesFromNoir(header.global_variables),
    mapFieldFromNoir(header.total_fees),
    mapFieldFromNoir(header.total_mana_used),
  );
}

/**
 * Maps a content commitment to Noir
 *
 */
export function mapContentCommitmentToNoir(contentCommitment: ContentCommitment): ContentCommitmentNoir {
  return {
    num_txs: mapFieldToNoir(contentCommitment.numTxs),
    blobs_hash: mapSha256HashToNoir(contentCommitment.blobsHash),
    in_hash: mapSha256HashToNoir(contentCommitment.inHash),
    out_hash: mapSha256HashToNoir(contentCommitment.outHash),
  };
}

/**
 * Maps a content commitment to Noir
 *
 */
export function mapContentCommitmentFromNoir(contentCommitment: ContentCommitmentNoir): ContentCommitment {
  return new ContentCommitment(
    mapFieldFromNoir(contentCommitment.num_txs),
    mapSha256HashFromNoir(contentCommitment.blobs_hash),
    mapSha256HashFromNoir(contentCommitment.in_hash),
    mapSha256HashFromNoir(contentCommitment.out_hash),
  );
}

/**
 * Maps state reference to Noir.
 * @param stateReference - The state reference.
 * @returns Noir representation of state reference.
 */
export function mapStateReferenceToNoir(stateReference: StateReference): StateReferenceNoir {
  return {
    l1_to_l2_message_tree: mapAppendOnlyTreeSnapshotToNoir(stateReference.l1ToL2MessageTree),
    partial: mapPartialStateReferenceToNoir(stateReference.partial),
  };
}

/**
 * Maps state reference from Noir.
 * @param stateReference - The state reference.
 * @returns State reference
 */
export function mapStateReferenceFromNoir(stateReference: StateReferenceNoir): StateReference {
  return new StateReference(
    mapAppendOnlyTreeSnapshotFromNoir(stateReference.l1_to_l2_message_tree),
    mapPartialStateReferenceFromNoir(stateReference.partial),
  );
}

/**
 * Maps partial state reference from Noir.
 * @param partialStateReference - The state reference.
 * @returns Partial state reference
 */
export function mapPartialStateReferenceFromNoir(
  partialStateReference: PartialStateReferenceNoir,
): PartialStateReference {
  return new PartialStateReference(
    mapAppendOnlyTreeSnapshotFromNoir(partialStateReference.note_hash_tree),
    mapAppendOnlyTreeSnapshotFromNoir(partialStateReference.nullifier_tree),
    mapAppendOnlyTreeSnapshotFromNoir(partialStateReference.public_data_tree),
  );
}

function mapTreeSnapshotsToNoir(snapshots: TreeSnapshots): TreeSnapshotsNoir {
  return {
    l1_to_l2_message_tree: mapAppendOnlyTreeSnapshotToNoir(snapshots.l1ToL2MessageTree),
    note_hash_tree: mapAppendOnlyTreeSnapshotToNoir(snapshots.noteHashTree),
    nullifier_tree: mapAppendOnlyTreeSnapshotToNoir(snapshots.nullifierTree),
    public_data_tree: mapAppendOnlyTreeSnapshotToNoir(snapshots.publicDataTree),
  };
}

// function mapTreeSnapshotsFromNoir(snapshots: TreeSnapshotsNoir) {
//   return new TreeSnapshots(
//     mapAppendOnlyTreeSnapshotFromNoir(snapshots.l1_to_l2_message_tree),
//     mapAppendOnlyTreeSnapshotFromNoir(snapshots.note_hash_tree),
//     mapAppendOnlyTreeSnapshotFromNoir(snapshots.nullifier_tree),
//     mapAppendOnlyTreeSnapshotFromNoir(snapshots.public_data_tree),
//   );
// }

/**
 * Maps the merge rollup inputs to noir.
 * @param mergeRollupInputs - The circuits.js merge rollup inputs.
 * @returns The noir merge rollup inputs.
 */
export function mapMergeRollupInputsToNoir(mergeRollupInputs: MergeRollupInputs): MergeRollupInputsNoir {
  return {
    previous_rollup_data: mapTuple(mergeRollupInputs.previousRollupData, mapPreviousRollupDataToNoir),
  };
}

/**
 * Maps the block merge rollup inputs to noir.
 * @param mergeRollupInputs - The circuits.js block merge rollup inputs.
 * @returns The noir block merge rollup inputs.
 */
export function mapBlockMergeRollupInputsToNoir(mergeRollupInputs: BlockMergeRollupInputs): BlockMergeRollupInputsNoir {
  return {
    previous_rollup_data: mapTuple(mergeRollupInputs.previousRollupData, mapPreviousRollupBlockDataToNoir),
  };
}

function mapNoteHashLeafPreimageToNoir(noteHashLeafValue: Fr): NoteHashLeafPreimageNoir {
  return {
    value: mapFieldToNoir(noteHashLeafValue),
  };
}

/**
 * Maps a nullifier leaf preimage to noir
 * @param nullifierLeafPreimage - The nullifier leaf preimage.
 * @returns The noir nullifier leaf preimage.
 */
export function mapNullifierLeafPreimageToNoir(
  nullifierLeafPreimage: NullifierLeafPreimage,
): NullifierLeafPreimageNoir {
  return {
    nullifier: mapFieldToNoir(nullifierLeafPreimage.nullifier),
    next_nullifier: mapFieldToNoir(nullifierLeafPreimage.nextNullifier),
    next_index: mapNumberToNoir(Number(nullifierLeafPreimage.nextIndex)),
  };
}

function mapMembershipWitnessToNoir<N extends number>(witness: MembershipWitness<N>): MembershipWitnessNoir<N> {
  const siblingPath = mapTuple(witness.siblingPath, mapFieldToNoir) as FixedLengthArray<NoirField, N>;
  return {
    leaf_index: witness.leafIndex.toString(),
    sibling_path: siblingPath,
  };
}

/**
 * Maps a leaf preimage of the public data tree to noir.
 */
export function mapPublicDataTreePreimageToNoir(preimage: PublicDataTreeLeafPreimage): PublicDataTreeLeafPreimageNoir {
  return {
    slot: mapFieldToNoir(preimage.slot),
    value: mapFieldToNoir(preimage.value),
    next_slot: mapFieldToNoir(preimage.nextSlot),
    next_index: mapNumberToNoir(Number(preimage.nextIndex)),
  };
}

/**
 * Maps a partial state reference to a noir partial state reference.
 * @param partialStateReference - The partial state reference.
 * @returns The noir partial state reference.
 */
export function mapPartialStateReferenceToNoir(
  partialStateReference: PartialStateReference,
): PartialStateReferenceNoir {
  return {
    note_hash_tree: mapAppendOnlyTreeSnapshotToNoir(partialStateReference.noteHashTree),
    nullifier_tree: mapAppendOnlyTreeSnapshotToNoir(partialStateReference.nullifierTree),
    public_data_tree: mapAppendOnlyTreeSnapshotToNoir(partialStateReference.publicDataTree),
  };
}

/**
 * Maps private base state diff hints to a noir state diff hints.
 * @param hints - The state diff hints.
 * @returns The noir state diff hints.
 */
export function mapPrivateBaseStateDiffHintsToNoir(hints: PrivateBaseStateDiffHints): PrivateBaseStateDiffHintsNoir {
  return {
    nullifier_predecessor_preimages: mapTuple(hints.nullifierPredecessorPreimages, mapNullifierLeafPreimageToNoir),
    nullifier_predecessor_membership_witnesses: mapTuple(
      hints.nullifierPredecessorMembershipWitnesses,
      (witness: MembershipWitness<typeof NULLIFIER_TREE_HEIGHT>) => mapMembershipWitnessToNoir(witness),
    ),
    sorted_nullifiers: mapTuple(hints.sortedNullifiers, mapFieldToNoir),
    sorted_nullifier_indexes: mapTuple(hints.sortedNullifierIndexes, (index: number) => mapNumberToNoir(index)),
    note_hash_subtree_sibling_path: mapTuple(hints.noteHashSubtreeSiblingPath, mapFieldToNoir),
    nullifier_subtree_sibling_path: mapTuple(hints.nullifierSubtreeSiblingPath, mapFieldToNoir),
    fee_write_low_leaf_preimage: mapPublicDataTreePreimageToNoir(hints.feeWriteLowLeafPreimage),
    fee_write_low_leaf_membership_witness: mapMembershipWitnessToNoir(hints.feeWriteLowLeafMembershipWitness),
    fee_write_sibling_path: mapTuple(hints.feeWriteSiblingPath, mapFieldToNoir),
  };
}

/**
 * Maps base parity inputs to noir.
 * @param inputs - The circuits.js base parity inputs.
 * @returns The noir base parity inputs.
 */
export function mapBaseParityInputsToNoir(inputs: BaseParityInputs): BaseParityInputsNoir {
  return {
    msgs: mapTuple(inputs.msgs, mapFieldToNoir),
    vk_tree_root: mapFieldToNoir(inputs.vkTreeRoot),
  };
}

/**
 * Maps root parity inputs to noir.
 * @param inputs - The circuits.js root parity inputs.
 * @returns The noir root parity inputs.
 */
export function mapRootParityInputsToNoir(inputs: RootParityInputs): RootParityInputsNoir {
  return {
    children: mapTuple(inputs.children, mapRootParityInputToNoir),
  };
}

function mapPrivateTubeDataToNoir(data: PrivateTubeData): PrivateTubeDataNoir {
  return {
    public_inputs: mapKernelCircuitPublicInputsToNoir(data.publicInputs),
    proof: mapRecursiveProofToNoir<typeof TUBE_PROOF_LENGTH>(data.proof),
    vk_data: mapVkWitnessDataToNoir(data.vkData, HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  };
}

/**
 * Maps the inputs to the base rollup to noir.
 * @param input - The circuits.js base rollup inputs.
 * @returns The noir base rollup inputs.
 */
export function mapPrivateBaseRollupInputsToNoir(inputs: PrivateBaseRollupInputs): PrivateBaseRollupInputsNoir {
  return {
    tube_data: mapPrivateTubeDataToNoir(inputs.tubeData),
    start: mapPartialStateReferenceToNoir(inputs.hints.start),
    start_sponge_blob: mapSpongeBlobToNoir(inputs.hints.startSpongeBlob),
    state_diff_hints: mapPrivateBaseStateDiffHintsToNoir(inputs.hints.stateDiffHints),

    archive_root_membership_witness: mapMembershipWitnessToNoir(inputs.hints.archiveRootMembershipWitness),
    constants: mapConstantRollupDataToNoir(inputs.hints.constants),
    fee_payer_fee_juice_balance_read_hint: mapPublicDataHintToNoir(inputs.hints.feePayerFeeJuiceBalanceReadHint),
  };
}

function mapPublicTubeDataToNoir(data: PublicTubeData): PublicTubeDataNoir {
  return {
    public_inputs: mapPrivateToPublicKernelCircuitPublicInputsToNoir(data.publicInputs),
    proof: mapRecursiveProofToNoir<typeof TUBE_PROOF_LENGTH>(data.proof),
    vk_data: mapVkWitnessDataToNoir(data.vkData, HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  };
}

function mapAvmProofDataToNoir(data: AvmProofData): AvmProofDataNoir {
  return {
    public_inputs: mapAvmCircuitPublicInputsToNoir(data.publicInputs),
    proof: mapRecursiveProofToNoir<typeof AVM_PROOF_LENGTH_IN_FIELDS>(data.proof),
    vk_data: mapVkWitnessDataToNoir(data.vkData, AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  };
}

export function mapPublicBaseRollupInputsToNoir(inputs: PublicBaseRollupInputs): PublicBaseRollupInputsNoir {
  return {
    tube_data: mapPublicTubeDataToNoir(inputs.tubeData),
    avm_proof_data: mapAvmProofDataToNoir(inputs.avmProofData),
    start_sponge_blob: mapSpongeBlobToNoir(inputs.hints.startSpongeBlob),
    archive_root_membership_witness: mapMembershipWitnessToNoir(inputs.hints.archiveRootMembershipWitness),
    constants: mapConstantRollupDataToNoir(inputs.hints.constants),
  };
}

export function mapEmptyKernelInputsToNoir(inputs: PrivateKernelEmptyInputs): PrivateKernelEmptyPrivateInputsNoir {
  return {
    empty_nested: mapEmptyNestedDataToNoir(inputs.emptyNested),
    historical_header: mapHeaderToNoir(inputs.header),
    chain_id: mapFieldToNoir(inputs.chainId),
    version: mapFieldToNoir(inputs.version),
    vk_tree_root: mapFieldToNoir(inputs.vkTreeRoot),
    protocol_contract_tree_root: mapFieldToNoir(inputs.protocolContractTreeRoot),
  };
}

function mapEmptyNestedDataToNoir(inputs: EmptyNestedData): EmptyNestedDataNoir {
  return {
    proof: mapRecursiveProofToNoir(inputs.proof),
    vk: mapVerificationKeyToNoir(inputs.vk, HONK_VERIFICATION_KEY_LENGTH_IN_FIELDS),
  };
}
