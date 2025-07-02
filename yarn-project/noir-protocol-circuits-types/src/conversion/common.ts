import {
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  PRIVATE_LOG_SIZE_IN_FIELDS,
  PUBLIC_LOG_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr, GrumpkinScalar, Point } from '@aztec/foundation/fields';
import { type Serializable, type Tuple, assertLength, mapTuple } from '@aztec/foundation/serialize';
import type { MembershipWitness } from '@aztec/foundation/trees';
import { FunctionSelector } from '@aztec/stdlib/abi';
import type { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import {
  ClaimedLengthArray,
  CountedLogHash,
  LogHash,
  OptionalNumber,
  PrivateToRollupAccumulatedData,
  PublicCallRequest,
  PublicCallRequestArrayLengths,
  ScopedCountedLogHash,
  ScopedLogHash,
} from '@aztec/stdlib/kernel';
import { PrivateLog, PublicLog } from '@aztec/stdlib/logs';
import {
  CountedL2ToL1Message,
  L2ToL1Message,
  ScopedCountedL2ToL1Message,
  ScopedL2ToL1Message,
} from '@aztec/stdlib/messaging';
import {
  AppendOnlyTreeSnapshot,
  type NullifierLeafPreimage,
  type ProtocolContractLeafPreimage,
  type PublicDataTreeLeafPreimage,
} from '@aztec/stdlib/trees';
import {
  BlockHeader,
  ContentCommitment,
  GlobalVariables,
  IncludeByTimestamp,
  PartialStateReference,
  StateReference,
  TxContext,
} from '@aztec/stdlib/tx';
import type { VerificationKeyAsFields, VkData } from '@aztec/stdlib/vks';

import type {
  AppendOnlyTreeSnapshot as AppendOnlyTreeSnapshotNoir,
  BlockHeader as BlockHeaderNoir,
  ClaimedLengthArray as ClaimedLengthArrayNoir,
  ContentCommitment as ContentCommitmentNoir,
  Counted,
  FixedLengthArray,
  FunctionSelector as FunctionSelectorNoir,
  GasFees as GasFeesNoir,
  Gas as GasNoir,
  GasSettings as GasSettingsNoir,
  GlobalVariables as GlobalVariablesNoir,
  EmbeddedCurveScalar as GrumpkinScalarNoir,
  IncludeByTimestamp as IncludeByTimestampNoir,
  L2ToL1Message as L2ToL1MessageNoir,
  LogHash as LogHashNoir,
  Log as LogNoir,
  MembershipWitness as MembershipWitnessNoir,
  AztecAddress as NoirAztecAddress,
  EthAddress as NoirEthAddress,
  Field as NoirField,
  EmbeddedCurvePoint as NoirPoint,
  NullifierLeafPreimage as NullifierLeafPreimageNoir,
  Option as OptionalNumberNoir,
  PartialStateReference as PartialStateReferenceNoir,
  PrivateToRollupAccumulatedData as PrivateToRollupAccumulatedDataNoir,
  ProtocolContractLeafPreimage as ProtocolContractLeafPreimageNoir,
  PublicCallRequestArrayLengths as PublicCallRequestArrayLengthsNoir,
  PublicCallRequest as PublicCallRequestNoir,
  PublicDataTreeLeafPreimage as PublicDataTreeLeafPreimageNoir,
  PublicDataWrite as PublicDataWriteNoir,
  PublicLog as PublicLogNoir,
  Scoped,
  StateReference as StateReferenceNoir,
  TxContext as TxContextNoir,
  VerificationKey as VerificationKeyNoir,
  VkData as VkDataNoir,
  u64,
} from '../types/index.js';

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

/**
 * Maps a bigint to a noir field.
 * @param bigInt - The bigint.
 * @returns The noir field.
 */
export function mapBigIntToNoir(bigInt: bigint): NoirField {
  return new Fr(bigInt).toString();
}

/**
 * Maps a noir field to a bigint.
 * @param field - The noir field.
 * @returns The bigint.
 */
export function mapBigIntFromNoir(field: NoirField): bigint {
  return Fr.fromHexString(field).toBigInt();
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

export function mapGasSettingsFromNoir(gasSettings: GasSettingsNoir): GasSettings {
  return new GasSettings(
    mapGasFromNoir(gasSettings.gas_limits),
    mapGasFromNoir(gasSettings.teardown_gas_limits),
    mapGasFeesFromNoir(gasSettings.max_fees_per_gas),
    mapGasFeesFromNoir(gasSettings.max_priority_fees_per_gas),
  );
}

export function mapGasSettingsToNoir(gasSettings: GasSettings): GasSettingsNoir {
  return {
    gas_limits: mapGasToNoir(gasSettings.gasLimits),
    teardown_gas_limits: mapGasToNoir(gasSettings.teardownGasLimits),
    max_fees_per_gas: mapGasFeesToNoir(gasSettings.maxFeesPerGas),
    max_priority_fees_per_gas: mapGasFeesToNoir(gasSettings.maxPriorityFeesPerGas),
  };
}

export function mapGasFeesToNoir(gasFees: GasFees): GasFeesNoir {
  return {
    fee_per_da_gas: mapBigIntToNoir(gasFees.feePerDaGas),
    fee_per_l2_gas: mapBigIntToNoir(gasFees.feePerL2Gas),
  };
}

export function mapGasFeesFromNoir(gasFees: GasFeesNoir): GasFees {
  return new GasFees(mapBigIntFromNoir(gasFees.fee_per_da_gas), mapBigIntFromNoir(gasFees.fee_per_l2_gas));
}

export function mapPrivateLogToNoir(log: PrivateLog): LogNoir<typeof PRIVATE_LOG_SIZE_IN_FIELDS> {
  return {
    fields: mapTuple(log.fields, mapFieldToNoir),
    length: mapNumberToNoir(log.emittedLength),
  };
}

export function mapPrivateLogFromNoir(log: LogNoir<typeof PRIVATE_LOG_SIZE_IN_FIELDS>) {
  return new PrivateLog(
    mapTupleFromNoir(log.fields, PRIVATE_LOG_SIZE_IN_FIELDS, mapFieldFromNoir),
    mapNumberFromNoir(log.length),
  );
}

export function mapPublicLogToNoir(log: PublicLog): PublicLogNoir {
  return {
    contract_address: mapAztecAddressToNoir(log.contractAddress),
    log: {
      fields: mapTuple(log.fields, mapFieldToNoir),
      length: mapNumberToNoir(log.emittedLength),
    },
  };
}

export function mapPublicLogFromNoir(log: PublicLogNoir) {
  return new PublicLog(
    mapAztecAddressFromNoir(log.contract_address),
    mapTupleFromNoir(log.log.fields, PUBLIC_LOG_SIZE_IN_FIELDS, mapFieldFromNoir),
    mapNumberFromNoir(log.log.length),
  );
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

export function mapTupleToNoir<T, M, N extends number>(
  tuple: Tuple<T, N>,
  mapper: (item: T) => M,
): FixedLengthArray<M, N> {
  return mapTuple(tuple, mapper) as FixedLengthArray<M, N>;
}

export function mapFieldArrayToNoir<N extends number>(
  array: Fr[],
  length: N = array.length as N,
): FixedLengthArray<string, N> {
  return mapTupleToNoir(assertLength(array, length), mapFieldToNoir);
}

export function mapClaimedLengthArrayFromNoir<T extends Serializable, N extends number, S>(
  claimedLengthArray: ClaimedLengthArrayNoir<N, S>,
  mapper: (item: S) => T,
): ClaimedLengthArray<T, N> {
  const array = mapTupleFromNoir(claimedLengthArray.array, claimedLengthArray.array.length, mapper) as Tuple<T, N>;
  const claimedLength = mapNumberFromNoir(claimedLengthArray.length);
  return new ClaimedLengthArray(array, claimedLength);
}

export function mapClaimedLengthArrayToNoir<T extends Serializable, N extends number, S>(
  claimedLengthArray: ClaimedLengthArray<T, N>,
  mapper: (item: T) => S,
): ClaimedLengthArrayNoir<N, S> {
  return {
    array: mapTupleToNoir(claimedLengthArray.array, mapper),
    length: mapNumberToNoir(claimedLengthArray.claimedLength),
  };
}

/**
 * Maps a AOT snapshot to noir.
 * @param snapshot - The stdlib AOT snapshot.
 * @returns The noir AOT snapshot.
 */
export function mapAppendOnlyTreeSnapshotFromNoir(snapshot: AppendOnlyTreeSnapshotNoir): AppendOnlyTreeSnapshot {
  return new AppendOnlyTreeSnapshot(
    mapFieldFromNoir(snapshot.root),
    mapNumberFromNoir(snapshot.next_available_leaf_index),
  );
}

/**
 * Maps a AOT snapshot from noir to the stdlib type.
 * @param snapshot - The noir AOT snapshot.
 * @returns The stdlib AOT snapshot.
 */
export function mapAppendOnlyTreeSnapshotToNoir(snapshot: AppendOnlyTreeSnapshot): AppendOnlyTreeSnapshotNoir {
  return {
    root: mapFieldToNoir(snapshot.root),
    next_available_leaf_index: mapFieldToNoir(new Fr(snapshot.nextAvailableLeafIndex)),
  };
}

/**
 * Maps a content commitment to Noir
 *
 */
export function mapContentCommitmentToNoir(contentCommitment: ContentCommitment): ContentCommitmentNoir {
  return {
    blobs_hash: mapFieldToNoir(contentCommitment.blobsHash),
    in_hash: mapFieldToNoir(contentCommitment.inHash),
    out_hash: mapFieldToNoir(contentCommitment.outHash),
  };
}

/**
 * Maps a content commitment to Noir
 *
 */
export function mapContentCommitmentFromNoir(contentCommitment: ContentCommitmentNoir): ContentCommitment {
  return new ContentCommitment(
    mapFieldFromNoir(contentCommitment.blobs_hash),
    mapFieldFromNoir(contentCommitment.in_hash),
    mapFieldFromNoir(contentCommitment.out_hash),
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

export function mapOptionalNumberToNoir(option: OptionalNumber): OptionalNumberNoir<u64> {
  return {
    _is_some: option.isSome,
    _value: mapNumberToNoir(option.value),
  };
}

export function mapOptionalNumberFromNoir(option: OptionalNumberNoir<u64>) {
  return new OptionalNumber(option._is_some, mapNumberFromNoir(option._value));
}

export function mapIncludeByTimestampToNoir(includeByTimestamp: IncludeByTimestamp): IncludeByTimestampNoir {
  return {
    _opt: {
      _is_some: includeByTimestamp.isSome,
      _value: mapBigIntToNoir(includeByTimestamp.value),
    },
  };
}

export function mapIncludeByTimestampFromNoir(includeByTimestamp: IncludeByTimestampNoir): IncludeByTimestamp {
  return new IncludeByTimestamp(includeByTimestamp._opt._is_some, mapBigIntFromNoir(includeByTimestamp._opt._value));
}

/**
 * Maps a L2 to L1 message to a noir L2 to L1 message.
 * @param message - The L2 to L1 message.
 * @returns The noir L2 to L1 message.
 */
function mapL2ToL1MessageToNoir(message: L2ToL1Message): L2ToL1MessageNoir {
  return {
    recipient: mapEthAddressToNoir(message.recipient),
    content: mapFieldToNoir(message.content),
  };
}

function mapL2ToL1MessageFromNoir(message: L2ToL1MessageNoir) {
  return new L2ToL1Message(mapEthAddressFromNoir(message.recipient), mapFieldFromNoir(message.content));
}

export function mapCountedL2ToL1MessageToNoir(message: CountedL2ToL1Message): Counted<L2ToL1MessageNoir> {
  return {
    inner: mapL2ToL1MessageToNoir(message.message),
    counter: mapNumberToNoir(message.counter),
  };
}

function mapCountedL2ToL1MessageFromNoir(message: Counted<L2ToL1MessageNoir>) {
  return new CountedL2ToL1Message(mapL2ToL1MessageFromNoir(message.inner), mapNumberFromNoir(message.counter));
}

export function mapScopedL2ToL1MessageToNoir(message: ScopedL2ToL1Message): Scoped<L2ToL1MessageNoir> {
  return {
    inner: mapL2ToL1MessageToNoir(message.message),
    contract_address: mapAztecAddressToNoir(message.contractAddress),
  };
}

export function mapScopedL2ToL1MessageFromNoir(message: Scoped<L2ToL1MessageNoir>) {
  return new ScopedL2ToL1Message(
    mapL2ToL1MessageFromNoir(message.inner),
    mapAztecAddressFromNoir(message.contract_address),
  );
}

export function mapScopedCountedL2ToL1MessageToNoir(
  message: ScopedCountedL2ToL1Message,
): Scoped<Counted<L2ToL1MessageNoir>> {
  return {
    inner: mapCountedL2ToL1MessageToNoir(message.inner),
    contract_address: mapAztecAddressToNoir(message.contractAddress),
  };
}

export function mapScopedCountedL2ToL1MessageFromNoir(message: Scoped<Counted<L2ToL1MessageNoir>>) {
  return new ScopedCountedL2ToL1Message(
    mapCountedL2ToL1MessageFromNoir(message.inner),
    mapAztecAddressFromNoir(message.contract_address),
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

export function mapPublicCallRequestFromNoir(request: PublicCallRequestNoir) {
  return new PublicCallRequest(
    mapAztecAddressFromNoir(request.msg_sender),
    mapAztecAddressFromNoir(request.contract_address),
    request.is_static_call,
    mapFieldFromNoir(request.calldata_hash),
  );
}

export function mapPublicCallRequestToNoir(request: PublicCallRequest): PublicCallRequestNoir {
  return {
    msg_sender: mapAztecAddressToNoir(request.msgSender),
    contract_address: mapAztecAddressToNoir(request.contractAddress),
    is_static_call: request.isStaticCall,
    calldata_hash: mapFieldToNoir(request.calldataHash),
  };
}

export function mapPublicCallRequestArrayLengthsToNoir(
  lengths: PublicCallRequestArrayLengths,
): PublicCallRequestArrayLengthsNoir {
  return {
    setup_calls: mapNumberToNoir(lengths.setupCalls),
    app_logic_calls: mapNumberToNoir(lengths.appLogicCalls),
    teardown_call: lengths.teardownCall,
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

export function mapVkDataToNoir<N extends number>(vkData: VkData, length: N): VkDataNoir<N> {
  return {
    vk: mapVerificationKeyToNoir<N>(vkData.vk.keyAsFields, length),
    leaf_index: mapFieldToNoir(new Fr(vkData.leafIndex)),
    sibling_path: mapTuple(vkData.siblingPath, mapFieldToNoir),
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
    block_number: mapNumberToNoir(globalVariables.blockNumber),
    slot_number: mapFieldToNoir(globalVariables.slotNumber),
    timestamp: mapBigIntToNoir(globalVariables.timestamp),
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
    mapNumberFromNoir(globalVariables.block_number),
    mapFieldFromNoir(globalVariables.slot_number),
    mapBigIntFromNoir(globalVariables.timestamp),
    mapEthAddressFromNoir(globalVariables.coinbase),
    mapAztecAddressFromNoir(globalVariables.fee_recipient),
    mapGasFeesFromNoir(globalVariables.gas_fees),
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

/**
 * Maps a nullifier leaf preimage to noir
 * @param nullifierLeafPreimage - The nullifier leaf preimage.
 * @returns The noir nullifier leaf preimage.
 */
export function mapNullifierLeafPreimageToNoir(
  nullifierLeafPreimage: NullifierLeafPreimage,
): NullifierLeafPreimageNoir {
  return {
    nullifier: mapFieldToNoir(nullifierLeafPreimage.leaf.nullifier),
    next_nullifier: mapFieldToNoir(nullifierLeafPreimage.nextKey),
    next_index: mapNumberToNoir(Number(nullifierLeafPreimage.nextIndex)),
  };
}

/**
 * Maps a leaf preimage of the public data tree to noir.
 */
export function mapPublicDataTreePreimageToNoir(preimage: PublicDataTreeLeafPreimage): PublicDataTreeLeafPreimageNoir {
  return {
    slot: mapFieldToNoir(preimage.leaf.slot),
    value: mapFieldToNoir(preimage.leaf.value),
    next_slot: mapFieldToNoir(preimage.nextKey),
    next_index: mapNumberToNoir(Number(preimage.nextIndex)),
  };
}

/**
 * Maps a protocol contract leaf preimage to noir
 * @param protocolContractPreimage - The protocol contract leaf preimage.
 * @returns The noir protocol contract leaf preimage.
 * Note: the circuit does not use next_index, so it does not exist in the noir struct.
 */
export function mapProtocolContractLeafPreimageToNoir(
  protocolContractPreimage: ProtocolContractLeafPreimage,
): ProtocolContractLeafPreimageNoir {
  return {
    address: mapFieldToNoir(protocolContractPreimage.address),
    next_address: mapFieldToNoir(protocolContractPreimage.nextAddress),
  };
}

export function mapMembershipWitnessToNoir<N extends number>(witness: MembershipWitness<N>): MembershipWitnessNoir<N> {
  const siblingPath = mapTuple(witness.siblingPath, mapFieldToNoir) as FixedLengthArray<NoirField, N>;
  return {
    leaf_index: witness.leafIndex.toString(),
    sibling_path: siblingPath,
  };
}

/**
 * Maps a LogHash to a noir LogHash.
 * @param logHash - The LogHash.
 * @returns The noir log hash.
 */
function mapLogHashToNoir(logHash: LogHash): LogHashNoir {
  return {
    value: mapFieldToNoir(logHash.value),
    length: mapNumberToNoir(logHash.length),
  };
}

/**
 * Maps a noir LogHash to a LogHash.
 * @param logHash - The noir LogHash.
 * @returns The TS log hash.
 */
function mapLogHashFromNoir(logHash: LogHashNoir): LogHash {
  return new LogHash(mapFieldFromNoir(logHash.value), mapNumberFromNoir(logHash.length));
}

export function mapCountedLogHashToNoir(logHash: CountedLogHash): Counted<LogHashNoir> {
  return {
    inner: mapLogHashToNoir(logHash.logHash),
    counter: mapNumberToNoir(logHash.counter),
  };
}

export function mapCountedLogHashFromNoir(countedLogHash: Counted<LogHashNoir>): CountedLogHash {
  return new CountedLogHash(mapLogHashFromNoir(countedLogHash.inner), mapNumberFromNoir(countedLogHash.counter));
}

/**
 * Maps a ts ScopedLogHash to a noir ScopedLogHash.
 * @param logHash - The ts LogHash.
 * @returns The noir log hash.
 */
export function mapScopedLogHashToNoir(scopedLogHash: ScopedLogHash): Scoped<LogHashNoir> {
  return {
    inner: mapLogHashToNoir(scopedLogHash.logHash),
    contract_address: mapAztecAddressToNoir(scopedLogHash.contractAddress),
  };
}

export function mapScopedCountedLogHashToNoir(logHash: ScopedCountedLogHash): Scoped<Counted<LogHashNoir>> {
  return {
    inner: mapCountedLogHashToNoir(logHash.inner),
    contract_address: mapAztecAddressToNoir(logHash.contractAddress),
  };
}

export function mapScopedCountedLogHashFromNoir(scopedCountedLogHash: Scoped<Counted<LogHashNoir>>) {
  return new ScopedCountedLogHash(
    mapCountedLogHashFromNoir(scopedCountedLogHash.inner),
    mapAztecAddressFromNoir(scopedCountedLogHash.contract_address),
  );
}

/**
 * Maps a noir ScopedLogHash to a ts ScopedLogHash.
 * @param logHash - The noir LogHash.
 * @returns The TS log hash.
 */
export function mapScopedLogHashFromNoir(scopedLogHash: Scoped<LogHashNoir>): ScopedLogHash {
  return new ScopedLogHash(
    mapLogHashFromNoir(scopedLogHash.inner),
    mapAztecAddressFromNoir(scopedLogHash.contract_address),
  );
}

export function mapPublicDataWriteToNoir(write: PublicDataWrite): PublicDataWriteNoir {
  return {
    leaf_slot: mapFieldToNoir(write.leafSlot),
    value: mapFieldToNoir(write.value),
  };
}

/**
 * Maps private to rollup accumulated data to noir to the parsed type.
 * @param privateToRollupAccumulatedData - The ts private to rollup accumulated data.
 * @returns The noir private to rollup accumulated data.
 */
export function mapPrivateToRollupAccumulatedDataToNoir(
  privateToRollupAccumulatedData: PrivateToRollupAccumulatedData,
): PrivateToRollupAccumulatedDataNoir {
  return {
    note_hashes: mapTuple(privateToRollupAccumulatedData.noteHashes, mapFieldToNoir),
    nullifiers: mapTuple(privateToRollupAccumulatedData.nullifiers, mapFieldToNoir),
    l2_to_l1_msgs: mapTuple(privateToRollupAccumulatedData.l2ToL1Msgs, mapScopedL2ToL1MessageToNoir),
    private_logs: mapTuple(privateToRollupAccumulatedData.privateLogs, mapPrivateLogToNoir),
    contract_class_logs_hashes: mapTuple(
      privateToRollupAccumulatedData.contractClassLogsHashes,
      mapScopedLogHashToNoir,
    ),
  };
}

/**
 * Maps private to rollup accumulated data from noir to the parsed type.
 * @param PrivateToRollupAccumulatedData - The noir private to rollup accumulated data.
 * @returns The parsed private to rollup accumulated data.
 */
export function mapPrivateToRollupAccumulatedDataFromNoir(
  privateToRollupAccumulatedData: PrivateToRollupAccumulatedDataNoir,
) {
  return new PrivateToRollupAccumulatedData(
    mapTupleFromNoir(privateToRollupAccumulatedData.note_hashes, MAX_NOTE_HASHES_PER_TX, mapFieldFromNoir),
    mapTupleFromNoir(privateToRollupAccumulatedData.nullifiers, MAX_NULLIFIERS_PER_TX, mapFieldFromNoir),
    mapTupleFromNoir(
      privateToRollupAccumulatedData.l2_to_l1_msgs,
      MAX_L2_TO_L1_MSGS_PER_TX,
      mapScopedL2ToL1MessageFromNoir,
    ),
    mapTupleFromNoir(privateToRollupAccumulatedData.private_logs, MAX_PRIVATE_LOGS_PER_TX, mapPrivateLogFromNoir),

    mapTupleFromNoir(
      privateToRollupAccumulatedData.contract_class_logs_hashes,
      MAX_CONTRACT_CLASS_LOGS_PER_TX,
      mapScopedLogHashFromNoir,
    ),
  );
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
