import {
  type CompleteAddress,
  type MerkleTreeId,
  type Note,
  type NoteStatus,
  type NullifierMembershipWitness,
  type PublicDataWitness,
  type UnencryptedL2Log,
} from '@aztec/circuit-types';
import {
  type BlockHeader,
  type ContractInstance,
  type IndexedTaggingSecret,
  type KeyValidationRequest,
  type L1_TO_L2_MSG_TREE_HEIGHT,
} from '@aztec/circuits.js';
import { type FunctionSelector, type NoteSelector } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';

import { type MessageLoadOracleInputs } from '../../common/message_load_oracle_inputs.js';

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

  storeArrayInExecutionCache(_args: Fr[]): Promise<Fr> {
    throw new OracleMethodNotAvailableError('storeArrayInExecutionCache');
  }

  storeInExecutionCache(_values: Fr[]): Promise<Fr> {
    throw new OracleMethodNotAvailableError('storeInExecutionCache');
  }

  loadFromExecutionCache(_hash: Fr): Promise<Fr[]> {
    throw new OracleMethodNotAvailableError('loadFromExecutionCache');
  }

  getBlockNumber(): Promise<number> {
    throw new OracleMethodNotAvailableError('getBlockNumber');
  }

  getContractAddress(): Promise<AztecAddress> {
    throw new OracleMethodNotAvailableError('getContractAddress');
  }

  getChainId(): Promise<Fr> {
    throw new OracleMethodNotAvailableError('getChainId');
  }

  getVersion(): Promise<Fr> {
    throw new OracleMethodNotAvailableError('getVersion');
  }

  getKeyValidationRequest(_pkMHash: Fr): Promise<KeyValidationRequest> {
    throw new OracleMethodNotAvailableError('getKeyValidationRequest');
  }

  getContractInstance(_address: AztecAddress): Promise<ContractInstance> {
    throw new OracleMethodNotAvailableError('getContractInstance');
  }

  getMembershipWitness(_blockNumber: number, _treeId: MerkleTreeId, _leafValue: Fr): Promise<Fr[] | undefined> {
    throw new OracleMethodNotAvailableError('getMembershipWitness');
  }

  getNullifierMembershipWitness(_blockNumber: number, _nullifier: Fr): Promise<NullifierMembershipWitness | undefined> {
    throw new OracleMethodNotAvailableError('getNullifierMembershipWitness');
  }

  getPublicDataTreeWitness(_blockNumber: number, _leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    throw new OracleMethodNotAvailableError('getPublicDataTreeWitness');
  }

  getLowNullifierMembershipWitness(
    _blockNumber: number,
    _nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    throw new OracleMethodNotAvailableError('getLowNullifierMembershipWitness');
  }

  getBlockHeader(_blockNumber: number): Promise<BlockHeader | undefined> {
    throw new OracleMethodNotAvailableError('getBlockHeader');
  }

  getCompleteAddress(_account: AztecAddress): Promise<CompleteAddress> {
    throw new OracleMethodNotAvailableError('getCompleteAddress');
  }

  getAuthWitness(_messageHash: Fr): Promise<Fr[] | undefined> {
    throw new OracleMethodNotAvailableError('getAuthWitness');
  }

  popCapsule(): Promise<Fr[]> {
    throw new OracleMethodNotAvailableError('popCapsule');
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
    throw new OracleMethodNotAvailableError('getNotes');
  }

  notifyCreatedNote(_storageSlot: Fr, _noteTypeId: NoteSelector, _note: Fr[], _noteHash: Fr, _counter: number): void {
    throw new OracleMethodNotAvailableError('notifyCreatedNote');
  }

  notifyNullifiedNote(_innerNullifier: Fr, _noteHash: Fr, _counter: number): Promise<void> {
    throw new OracleMethodNotAvailableError('notifyNullifiedNote');
  }

  notifyCreatedNullifier(_innerNullifier: Fr): Promise<void> {
    throw new OracleMethodNotAvailableError('notifyCreatedNullifier');
  }

  checkNullifierExists(_innerNullifier: Fr): Promise<boolean> {
    throw new OracleMethodNotAvailableError('checkNullifierExists');
  }

  getL1ToL2MembershipWitness(
    _contractAddress: AztecAddress,
    _messageHash: Fr,
    _secret: Fr,
  ): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
    throw new OracleMethodNotAvailableError('getL1ToL2MembershipWitness');
  }

  storageRead(
    _contractAddress: AztecAddress,
    _startStorageSlot: Fr,
    _blockNumber: number,
    _numberOfElements: number,
  ): Promise<Fr[]> {
    throw new OracleMethodNotAvailableError('storageRead');
  }

  storageWrite(_startStorageSlot: Fr, _values: Fr[]): Promise<Fr[]> {
    throw new OracleMethodNotAvailableError('storageWrite');
  }

  emitContractClassLog(_log: UnencryptedL2Log, _counter: number): Fr {
    throw new OracleMethodNotAvailableError('emitContractClassUnencryptedLog');
  }

  callPrivateFunction(
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _argsHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<{ endSideEffectCounter: Fr; returnsHash: Fr }> {
    throw new OracleMethodNotAvailableError('callPrivateFunction');
  }

  enqueuePublicFunctionCall(
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _argsHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<Fr> {
    throw new OracleMethodNotAvailableError('enqueuePublicFunctionCall');
  }

  setPublicTeardownFunctionCall(
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _argsHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<Fr> {
    throw new OracleMethodNotAvailableError('setPublicTeardownFunctionCall');
  }

  notifySetMinRevertibleSideEffectCounter(_minRevertibleSideEffectCounter: number): void {
    throw new OracleMethodNotAvailableError('notifySetMinRevertibleSideEffectCounter');
  }

  debugLog(_message: string, _fields: Fr[]): void {
    throw new OracleMethodNotAvailableError('debugLog');
  }

  getIndexedTaggingSecretAsSender(_sender: AztecAddress, _recipient: AztecAddress): Promise<IndexedTaggingSecret> {
    throw new OracleMethodNotAvailableError('getIndexedTaggingSecretAsSender');
  }

  incrementAppTaggingSecretIndexAsSender(_sender: AztecAddress, _recipient: AztecAddress): Promise<void> {
    throw new OracleMethodNotAvailableError('incrementAppTaggingSecretIndexAsSender');
  }

  syncNotes(): Promise<void> {
    throw new OracleMethodNotAvailableError('syncNotes');
  }

  store(_contract: AztecAddress, _key: Fr, _values: Fr[]): Promise<void> {
    throw new OracleMethodNotAvailableError('store');
  }

  load(_contract: AztecAddress, _key: Fr): Promise<Fr[] | null> {
    throw new OracleMethodNotAvailableError('load');
  }
}
