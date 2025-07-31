import type { L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import { Fr, Point } from '@aztec/foundation/fields';
import type { FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress, ContractInstance } from '@aztec/stdlib/contract';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import type { ContractClassLog, IndexedTaggingSecret } from '@aztec/stdlib/logs';
import type { Note, NoteStatus } from '@aztec/stdlib/note';
import { type MerkleTreeId, type NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import type { BlockHeader } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import type { MessageLoadOracleInputs } from './message_load_oracle_inputs.js';

/**
 * Information about a note needed during execution.
 */
export interface NoteData {
  /** The note. */
  note: Note;
  /** The contract address of the note. */
  contractAddress: AztecAddress;
  /** The storage slot of the note. */
  storageSlot: Fr;
  /** The nonce of the note. */
  noteNonce: Fr;
  /** A hash of the note. */
  noteHash: Fr;
  /** The corresponding nullifier of the note. Undefined for pending notes. */
  siloedNullifier?: Fr;
  /** The note's leaf index in the note hash tree. Undefined for pending notes. */
  index?: bigint;
}

class OracleMethodNotAvailableError extends Error {
  constructor(methodName: string) {
    super(`Oracle method ${methodName} is not available.`);
  }
}

/**
 * Oracle with typed parameters and typed return values.
 * Methods that require read and/or write will have to be implemented based on the context (public, private, or view)
 * and are unavailable by default.
 *
 * Oracle methods are now prefixed to clearly indicate their availability:
 * - avm*: AVM oracles (transpiled to avm opcodes, handled by txe during public_context testing)
 * - txe*: TXE oracles (only available in txe top level context, manage environment state)
 * - pxe*: PXE oracles (stateful operations like notify_created_note)
 * - utility*: Utility oracles (typically don't need private execution, like blockNumber)
 */
export abstract class TypedOracle {
  utilityGetRandomField(): Fr {
    throw new OracleMethodNotAvailableError('utilityGetRandomField');
  }

  pxeStoreInExecutionCache(_values: Fr[], _hash: Fr): void {
    throw new OracleMethodNotAvailableError('pxeStoreInExecutionCache');
  }

  pxeLoadFromExecutionCache(_hash: Fr): Promise<Fr[]> {
    return Promise.reject(new OracleMethodNotAvailableError('pxeLoadFromExecutionCache'));
  }

  utilityGetBlockNumber(): Promise<number> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetBlockNumber'));
  }

  utilityGetTimestamp(): Promise<UInt64> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetTimestamp'));
  }

  utilityGetContractAddress(): Promise<AztecAddress> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetContractAddress'));
  }

  utilityGetChainId(): Promise<Fr> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetChainId'));
  }

  utilityGetVersion(): Promise<Fr> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetVersion'));
  }

  utilityGetKeyValidationRequest(_pkMHash: Fr): Promise<KeyValidationRequest> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetKeyValidationRequest'));
  }

  utilityGetContractInstance(_address: AztecAddress): Promise<ContractInstance> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetContractInstance'));
  }

  utilityGetMembershipWitness(_blockNumber: number, _treeId: MerkleTreeId, _leafValue: Fr): Promise<Fr[] | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetMembershipWitness'));
  }

  utilityGetNullifierMembershipWitness(
    _blockNumber: number,
    _nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetNullifierMembershipWitness'));
  }

  utilityGetPublicDataWitness(_blockNumber: number, _leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetPublicDataWitness'));
  }

  utilityGetLowNullifierMembershipWitness(
    _blockNumber: number,
    _nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetLowNullifierMembershipWitness'));
  }

  utilityGetBlockHeader(_blockNumber: number): Promise<BlockHeader | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetBlockHeader'));
  }

  utilityGetCompleteAddress(_account: AztecAddress): Promise<CompleteAddress> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetCompleteAddress'));
  }

  utilityGetAuthWitness(_messageHash: Fr): Promise<Fr[] | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetAuthWitness'));
  }

  utilityGetNotes(
    _storageSlot: Fr,
    _numSelects: number,
    _selectByIndexes: number[],
    _selectByOffsets: number[],
    _selectByLengths: number[],
    _selectValues: Fr[],
    _selectComparators: number[],
    _sortByIndexes: number[],
    _sortByOffsets: number[],
    _sortByLengths: number[],
    _sortOrder: number[],
    _limit: number,
    _offset: number,
    _status: NoteStatus,
  ): Promise<NoteData[]> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetNotes'));
  }

  pxeNotifyCreatedNote(
    _storageSlot: Fr,
    _noteTypeId: NoteSelector,
    _note: Fr[],
    _noteHash: Fr,
    _counter: number,
  ): void {
    throw new OracleMethodNotAvailableError('pxeNotifyCreatedNote');
  }

  pxeNotifyNullifiedNote(_innerNullifier: Fr, _noteHash: Fr, _counter: number): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('pxeNotifyNullifiedNote'));
  }

  pxeNotifyCreatedNullifier(_innerNullifier: Fr): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('pxeNotifyCreatedNullifier'));
  }

  utilityCheckNullifierExists(_innerNullifier: Fr): Promise<boolean> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityCheckNullifierExists'));
  }

  utilityGetL1ToL2MembershipWitness(
    _contractAddress: AztecAddress,
    _messageHash: Fr,
    _secret: Fr,
  ): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetL1ToL2MembershipWitness'));
  }

  utilityStorageRead(
    _contractAddress: AztecAddress,
    _startStorageSlot: Fr,
    _blockNumber: number,
    _numberOfElements: number,
  ): Promise<Fr[]> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityStorageRead'));
  }

  // TODO(benesjan): This is an AVM oracle. Should this be nuked?
  storageWrite(_startStorageSlot: Fr, _values: Fr[]): Promise<Fr[]> {
    return Promise.reject(new OracleMethodNotAvailableError('storageWrite'));
  }

  pxeNotifyCreatedContractClassLog(_log: ContractClassLog, _counter: number): void {
    throw new OracleMethodNotAvailableError('pxeNotifyCreatedContractClassLog');
  }

  pxeCallPrivateFunction(
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _argsHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<{ endSideEffectCounter: Fr; returnsHash: Fr }> {
    return Promise.reject(new OracleMethodNotAvailableError('pxeCallPrivateFunction'));
  }

  pxeNotifyEnqueuedPublicFunctionCall(
    _targetContractAddress: AztecAddress,
    _calldataHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('pxeNotifyEnqueuedPublicFunctionCall'));
  }

  pxeNotifySetPublicTeardownFunctionCall(
    _targetContractAddress: AztecAddress,
    _calldataHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('pxeNotifySetPublicTeardownFunctionCall'));
  }

  pxeNotifySetMinRevertibleSideEffectCounter(_minRevertibleSideEffectCounter: number): Promise<void> {
    throw new OracleMethodNotAvailableError('pxeNotifySetMinRevertibleSideEffectCounter');
  }

  utilityDebugLog(_message: string, _fields: Fr[]): void {
    throw new OracleMethodNotAvailableError('utilityDebugLog');
  }

  utilityGetIndexedTaggingSecretAsSender(
    _sender: AztecAddress,
    _recipient: AztecAddress,
  ): Promise<IndexedTaggingSecret> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetIndexedTaggingSecretAsSender'));
  }

  pxeIncrementAppTaggingSecretIndexAsSender(_sender: AztecAddress, _recipient: AztecAddress): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('pxeIncrementAppTaggingSecretIndexAsSender'));
  }

  utilityFetchTaggedLogs(_pendingTaggedLogArrayBaseSlot: Fr): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityFetchTaggedLogs'));
  }

  utilityValidateEnqueuedNotesAndEvents(
    _contractAddress: AztecAddress,
    _noteValidationRequestsArrayBaseSlot: Fr,
    _eventValidationRequestsArrayBaseSlot: Fr,
  ): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityValidateEnqueuedNotesAndEvents'));
  }

  utilityBulkRetrieveLogs(
    _contractAddress: AztecAddress,
    _logRetrievalRequestsArrayBaseSlot: Fr,
    _logRetrievalResponsesArrayBaseSlot: Fr,
  ): Promise<void> {
    throw new OracleMethodNotAvailableError('utilityBulkRetrieveLogs');
  }

  utilityStoreCapsule(_contractAddress: AztecAddress, _key: Fr, _capsule: Fr[]): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityStoreCapsule'));
  }

  utilityLoadCapsule(_contractAddress: AztecAddress, _key: Fr): Promise<Fr[] | null> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityLoadCapsule'));
  }

  utilityDeleteCapsule(_contractAddress: AztecAddress, _key: Fr): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityDeleteCapsule'));
  }

  utilityCopyCapsule(_contractAddress: AztecAddress, _srcKey: Fr, _dstKey: Fr, _numEntries: number): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityCopyCapsule'));
  }

  utilityAes128Decrypt(_ciphertext: Buffer, _iv: Buffer, _symKey: Buffer): Promise<Buffer> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityAes128Decrypt'));
  }

  utilityGetSharedSecret(_address: AztecAddress, _ephPk: Point): Promise<Point> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityGetSharedSecret'));
  }

  utilityEmitOffchainEffect(_data: Fr[]): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('utilityEmitOffchainEffect'));
  }

  pxeGetSenderForTags(): Promise<AztecAddress | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError('pxeGetSenderForTags'));
  }

  pxeSetSenderForTags(_senderForTags: AztecAddress): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('pxeSetSenderForTags'));
  }
}
