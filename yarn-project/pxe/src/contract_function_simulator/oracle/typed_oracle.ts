import type { L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import { Fr, Point } from '@aztec/foundation/fields';
import type { EventSelector, FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress, ContractInstance } from '@aztec/stdlib/contract';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import type { ContractClassLog, IndexedTaggingSecret } from '@aztec/stdlib/logs';
import type { Note, NoteStatus } from '@aztec/stdlib/note';
import { type MerkleTreeId, type NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import type { BlockHeader, TxHash } from '@aztec/stdlib/tx';

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
  nonce: Fr;
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
 */
export abstract class TypedOracle {
  getRandomField(): Fr {
    return Fr.random();
  }

  storeInExecutionCache(_values: Fr[], _hash: Fr): void {
    throw new OracleMethodNotAvailableError('storeInExecutionCache');
  }

  loadFromExecutionCache(_hash: Fr): Promise<Fr[]> {
    return Promise.reject(new OracleMethodNotAvailableError('loadFromExecutionCache'));
  }

  getBlockNumber(): Promise<number> {
    return Promise.reject(new OracleMethodNotAvailableError('getBlockNumber'));
  }

  getContractAddress(): Promise<AztecAddress> {
    return Promise.reject(new OracleMethodNotAvailableError('getContractAddress'));
  }

  getChainId(): Promise<Fr> {
    return Promise.reject(new OracleMethodNotAvailableError('getChainId'));
  }

  getVersion(): Promise<Fr> {
    return Promise.reject(new OracleMethodNotAvailableError('getVersion'));
  }

  getKeyValidationRequest(_pkMHash: Fr): Promise<KeyValidationRequest> {
    return Promise.reject(new OracleMethodNotAvailableError('getKeyValidationRequest'));
  }

  getContractInstance(_address: AztecAddress): Promise<ContractInstance> {
    return Promise.reject(new OracleMethodNotAvailableError('getContractInstance'));
  }

  getMembershipWitness(_blockNumber: number, _treeId: MerkleTreeId, _leafValue: Fr): Promise<Fr[] | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError('getMembershipWitness'));
  }

  getNullifierMembershipWitness(_blockNumber: number, _nullifier: Fr): Promise<NullifierMembershipWitness | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError('getNullifierMembershipWitness'));
  }

  getPublicDataWitness(_blockNumber: number, _leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError('getPublicDataWitness'));
  }

  getLowNullifierMembershipWitness(
    _blockNumber: number,
    _nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError('getLowNullifierMembershipWitness'));
  }

  getBlockHeader(_blockNumber: number): Promise<BlockHeader | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError('getBlockHeader'));
  }

  getCompleteAddress(_account: AztecAddress): Promise<CompleteAddress> {
    return Promise.reject(new OracleMethodNotAvailableError('getCompleteAddress'));
  }

  getAuthWitness(_messageHash: Fr): Promise<Fr[] | undefined> {
    return Promise.reject(new OracleMethodNotAvailableError('getAuthWitness'));
  }

  getNotes(
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
    return Promise.reject(new OracleMethodNotAvailableError('getNotes'));
  }

  notifyCreatedNote(_storageSlot: Fr, _noteTypeId: NoteSelector, _note: Fr[], _noteHash: Fr, _counter: number): void {
    throw new OracleMethodNotAvailableError('notifyCreatedNote');
  }

  notifyNullifiedNote(_innerNullifier: Fr, _noteHash: Fr, _counter: number): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('notifyNullifiedNote'));
  }

  notifyCreatedNullifier(_innerNullifier: Fr): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('notifyCreatedNullifier'));
  }

  checkNullifierExists(_innerNullifier: Fr): Promise<boolean> {
    return Promise.reject(new OracleMethodNotAvailableError('checkNullifierExists'));
  }

  getL1ToL2MembershipWitness(
    _contractAddress: AztecAddress,
    _messageHash: Fr,
    _secret: Fr,
  ): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
    return Promise.reject(new OracleMethodNotAvailableError('getL1ToL2MembershipWitness'));
  }

  storageRead(
    _contractAddress: AztecAddress,
    _startStorageSlot: Fr,
    _blockNumber: number,
    _numberOfElements: number,
  ): Promise<Fr[]> {
    return Promise.reject(new OracleMethodNotAvailableError('storageRead'));
  }

  storageWrite(_startStorageSlot: Fr, _values: Fr[]): Promise<Fr[]> {
    return Promise.reject(new OracleMethodNotAvailableError('storageWrite'));
  }

  notifyCreatedContractClassLog(_log: ContractClassLog, _counter: number): void {
    throw new OracleMethodNotAvailableError('notifyCreatedContractClassLog');
  }

  callPrivateFunction(
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _argsHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<{ endSideEffectCounter: Fr; returnsHash: Fr }> {
    return Promise.reject(new OracleMethodNotAvailableError('callPrivateFunction'));
  }

  notifyEnqueuedPublicFunctionCall(
    _targetContractAddress: AztecAddress,
    _calldataHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('notifyEnqueuedPublicFunctionCall'));
  }

  notifySetPublicTeardownFunctionCall(
    _targetContractAddress: AztecAddress,
    _calldataHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('notifySetPublicTeardownFunctionCall'));
  }

  notifySetMinRevertibleSideEffectCounter(_minRevertibleSideEffectCounter: number): Promise<void> {
    throw new OracleMethodNotAvailableError('notifySetMinRevertibleSideEffectCounter');
  }

  debugLog(_message: string, _fields: Fr[]): void {
    throw new OracleMethodNotAvailableError('debugLog');
  }

  getIndexedTaggingSecretAsSender(_sender: AztecAddress, _recipient: AztecAddress): Promise<IndexedTaggingSecret> {
    return Promise.reject(new OracleMethodNotAvailableError('getIndexedTaggingSecretAsSender'));
  }

  incrementAppTaggingSecretIndexAsSender(_sender: AztecAddress, _recipient: AztecAddress): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('incrementAppTaggingSecretIndexAsSender'));
  }

  fetchTaggedLogs(_pendingTaggedLogArrayBaseSlot: Fr): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('fetchTaggedLogs'));
  }

  validateEnqueuedNotes(_contractAddress: AztecAddress, _noteValidationRequestsArrayBaseSlot: Fr): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('validateEnqueuedNotes'));
  }

  bulkRetrieveLogs(
    _contractAddress: AztecAddress,
    _logRetrievalRequestsArrayBaseSlot: Fr,
    _logRetrievalResponsesArrayBaseSlot: Fr,
  ): Promise<void> {
    throw new OracleMethodNotAvailableError('bulkRetrieveLogs');
  }

  storeCapsule(_contractAddress: AztecAddress, _key: Fr, _capsule: Fr[]): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('storeCapsule'));
  }

  loadCapsule(_contractAddress: AztecAddress, _key: Fr): Promise<Fr[] | null> {
    return Promise.reject(new OracleMethodNotAvailableError('loadCapsule'));
  }

  deleteCapsule(_contractAddress: AztecAddress, _key: Fr): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('deleteCapsule'));
  }

  copyCapsule(_contractAddress: AztecAddress, _srcKey: Fr, _dstKey: Fr, _numEntries: number): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('copyCapsule'));
  }

  aes128Decrypt(_ciphertext: Buffer, _iv: Buffer, _symKey: Buffer): Promise<Buffer> {
    return Promise.reject(new OracleMethodNotAvailableError('aes128Decrypt'));
  }

  getSharedSecret(_address: AztecAddress, _ephPk: Point): Promise<Point> {
    return Promise.reject(new OracleMethodNotAvailableError('getSharedSecret'));
  }

  storePrivateEventLog(
    _contractAddress: AztecAddress,
    _recipient: AztecAddress,
    _eventSelector: EventSelector,
    _logContent: Fr[],
    _txHash: TxHash,
    _logIndexInTx: number,
    _txIndexInBlock: number,
  ): Promise<void> {
    return Promise.reject(new OracleMethodNotAvailableError('storePrivateEventLog'));
  }
}
