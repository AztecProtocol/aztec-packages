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

import type { UtilityContext } from '../noir-structs/utility_context.js';
import type { MessageLoadOracleInputs } from './message_load_oracle_inputs.js';

/**
 * Information about a note needed during execution.
 */
export interface NoteData {
  /** The actual note content (the fields of the Noir #[note] struct). */
  note: Note;
  /** The address of the contract that owns the note. */
  contractAddress: AztecAddress;
  /** The storage slot of the note. */
  storageSlot: Fr;
  /** The nonce injected into the note hash preimage by kernels. */
  noteNonce: Fr;
  /** A hash of the note as it gets stored in the note hash tree. */
  noteHash: Fr;
  /** The corresponding nullifier of the note. Undefined for pending notes. */
  siloedNullifier?: Fr;
  /** The note's leaf index in the note hash tree. Undefined for pending notes. */
  index?: bigint;
}

class OracleMethodNotAvailableError extends Error {
  constructor(className: string, methodName: string) {
    super(`Oracle method ${methodName} is not implemented in handler ${className}.`);
  }
}

/**
 * Oracle with typed parameters and typed return values.
 * Methods that require read and/or write will have to be implemented based on the context (public, private, or view)
 * and are unavailable by default.
 */
export abstract class TypedOracle {
  constructor(protected className: string) {}

  utilityAssertCompatibleOracleVersion(_version: number): void {
    throw new OracleMethodNotAvailableError(this.className, 'utilityAssertCompatibleOracleVersion');
  }

  utilityGetRandomField(): Fr {
    throw new OracleMethodNotAvailableError(this.className, 'utilityGetRandomField');
  }

  privateStoreInExecutionCache(_values: Fr[], _hash: Fr): void {
    throw new OracleMethodNotAvailableError(this.className, 'privateStoreInExecutionCache');
  }

  privateLoadFromExecutionCache(_hash: Fr): Promise<Fr[]> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'privateLoadFromExecutionCache'));
  }

  utilityGetBlockNumber(): Promise<number> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetBlockNumber'));
  }

  utilityGetTimestamp(): Promise<UInt64> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetTimestamp'));
  }

  utilityGetContractAddress(): Promise<AztecAddress> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetContractAddress'));
  }

  utilityGetChainId(): Promise<Fr> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetChainId'));
  }

  utilityGetVersion(): Promise<Fr> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetVersion'));
  }

  utilityGetUtilityContext(): Promise<UtilityContext> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetUtilityContext'));
  }

  utilityGetKeyValidationRequest(_pkMHash: Fr): Promise<KeyValidationRequest> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetKeyValidationRequest'));
  }

  utilityGetContractInstance(_address: AztecAddress): Promise<ContractInstance> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetContractInstance'));
  }

  utilityGetMembershipWitness(_blockNumber: number, _treeId: MerkleTreeId, _leafValue: Fr): Promise<Fr[] | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetMembershipWitness'));
  }

  utilityGetNullifierMembershipWitness(
    _blockNumber: number,
    _nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetNullifierMembershipWitness'));
  }

  utilityGetPublicDataWitness(_blockNumber: number, _leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetPublicDataWitness'));
  }

  utilityGetLowNullifierMembershipWitness(
    _blockNumber: number,
    _nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetLowNullifierMembershipWitness'));
  }

  utilityGetBlockHeader(_blockNumber: number): Promise<BlockHeader | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetBlockHeader'));
  }

  utilityGetPublicKeysAndPartialAddress(_account: AztecAddress): Promise<CompleteAddress> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetCompleteAddress'));
  }

  utilityGetAuthWitness(_messageHash: Fr): Promise<Fr[] | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetAuthWitness'));
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
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetNotes'));
  }

  privateNotifyCreatedNote(
    _storageSlot: Fr,
    _noteTypeId: NoteSelector,
    _note: Fr[],
    _noteHash: Fr,
    _counter: number,
  ): void {
    throw new OracleMethodNotAvailableError(this.className, 'privateNotifyCreatedNote');
  }

  privateNotifyNullifiedNote(_innerNullifier: Fr, _noteHash: Fr, _counter: number): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'privateNotifyNullifiedNote'));
  }

  privateNotifyCreatedNullifier(_innerNullifier: Fr): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'privateNotifyCreatedNullifier'));
  }

  utilityCheckNullifierExists(_innerNullifier: Fr): Promise<boolean> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityCheckNullifierExists'));
  }

  utilityGetL1ToL2MembershipWitness(
    _contractAddress: AztecAddress,
    _messageHash: Fr,
    _secret: Fr,
  ): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetL1ToL2MembershipWitness'));
  }

  utilityStorageRead(
    _contractAddress: AztecAddress,
    _startStorageSlot: Fr,
    _blockNumber: number,
    _numberOfElements: number,
  ): Promise<Fr[]> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityStorageRead'));
  }

  privateNotifyCreatedContractClassLog(_log: ContractClassLog, _counter: number): void {
    throw new OracleMethodNotAvailableError(this.className, 'privateNotifyCreatedContractClassLog');
  }

  privateCallPrivateFunction(
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _argsHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<{ endSideEffectCounter: Fr; returnsHash: Fr }> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'privateCallPrivateFunction'));
  }

  privateNotifyEnqueuedPublicFunctionCall(
    _targetContractAddress: AztecAddress,
    _calldataHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'privateNotifyEnqueuedPublicFunctionCall'));
  }

  privateNotifySetPublicTeardownFunctionCall(
    _targetContractAddress: AztecAddress,
    _calldataHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<void> {
    return Promise.reject(
      new OracleMethodNotAvailableError(this.className, 'privateNotifySetPublicTeardownFunctionCall'),
    );
  }

  privateNotifySetMinRevertibleSideEffectCounter(_minRevertibleSideEffectCounter: number): Promise<void> {
    throw new OracleMethodNotAvailableError(this.className, 'privateNotifySetMinRevertibleSideEffectCounter');
  }

  utilityDebugLog(_message: string, _fields: Fr[]): void {
    throw new OracleMethodNotAvailableError(this.className, 'utilityDebugLog');
  }

  utilityGetIndexedTaggingSecretAsSender(
    _sender: AztecAddress,
    _recipient: AztecAddress,
  ): Promise<IndexedTaggingSecret> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetIndexedTaggingSecretAsSender'));
  }

  privateIncrementAppTaggingSecretIndexAsSender(_sender: AztecAddress, _recipient: AztecAddress): Promise<void> {
    return Promise.reject(
      new OracleMethodNotAvailableError(this.className, 'privateIncrementAppTaggingSecretIndexAsSender'),
    );
  }

  utilityFetchTaggedLogs(_pendingTaggedLogArrayBaseSlot: Fr): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityFetchTaggedLogs'));
  }

  utilityValidateEnqueuedNotesAndEvents(
    _contractAddress: AztecAddress,
    _noteValidationRequestsArrayBaseSlot: Fr,
    _eventValidationRequestsArrayBaseSlot: Fr,
  ): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityValidateEnqueuedNotesAndEvents'));
  }

  utilityBulkRetrieveLogs(
    _contractAddress: AztecAddress,
    _logRetrievalRequestsArrayBaseSlot: Fr,
    _logRetrievalResponsesArrayBaseSlot: Fr,
  ): Promise<void> {
    throw new OracleMethodNotAvailableError(this.className, 'utilityBulkRetrieveLogs');
  }

  utilityStoreCapsule(_contractAddress: AztecAddress, _key: Fr, _capsule: Fr[]): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityStoreCapsule'));
  }

  utilityLoadCapsule(_contractAddress: AztecAddress, _key: Fr): Promise<Fr[] | null> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityLoadCapsule'));
  }

  utilityDeleteCapsule(_contractAddress: AztecAddress, _key: Fr): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityDeleteCapsule'));
  }

  utilityCopyCapsule(_contractAddress: AztecAddress, _srcKey: Fr, _dstKey: Fr, _numEntries: number): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityCopyCapsule'));
  }

  utilityAes128Decrypt(_ciphertext: Buffer, _iv: Buffer, _symKey: Buffer): Promise<Buffer> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityAes128Decrypt'));
  }

  utilityGetSharedSecret(_address: AztecAddress, _ephPk: Point): Promise<Point> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityGetSharedSecret'));
  }

  utilityEmitOffchainEffect(_data: Fr[]): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'utilityEmitOffchainEffect'));
  }

  privateGetSenderForTags(): Promise<AztecAddress | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'privateGetSenderForTags'));
  }

  privateSetSenderForTags(_senderForTags: AztecAddress): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError(this.className, 'privateSetSenderForTags'));
  }
}
