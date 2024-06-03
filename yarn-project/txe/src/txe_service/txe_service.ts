import {
  type MerkleTreeId,
  type NoteStatus,
  type NullifierMembershipWitness,
  type PublicDataWitness,
  type UnencryptedL2Log,
} from '@aztec/circuit-types';
import {
  type CompleteAddress,
  type Header,
  type KeyValidationRequest,
  type PrivateCallStackItem,
  type PublicCallRequest,
} from '@aztec/circuits.js';
import { type FunctionSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr, type Point } from '@aztec/foundation/fields';
import { type Logger } from '@aztec/foundation/log';
import { type AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/utils';
import {
  type MessageLoadOracleInputs,
  type NoteData,
  type TypedOracle,
  WorldStateDB,
  WorldStatePublicDB,
} from '@aztec/simulator';
import { type ContractInstance } from '@aztec/types/contracts';
import { type MerkleTreeOperations, MerkleTrees } from '@aztec/world-state';

import {
  type ForeignCallArray,
  type ForeignCallSingle,
  fromArray,
  fromSingle,
  toArray,
  toForeignCallResult,
} from '../util/encoding.js';

export class TXE implements TypedOracle {
  private worldStatePublicDB: WorldStatePublicDB;
  private worldStateDB: WorldStateDB;

  constructor(private logger: Logger, private trees: MerkleTreeOperations, private contractAddress: AztecAddress) {
    this.worldStatePublicDB = new WorldStatePublicDB(this.trees);
    this.worldStateDB = new WorldStateDB(this.trees);
  }

  getRandomField() {
    return Fr.random();
  }

  packArgumentsArray(_args: Fr[]): Promise<Fr> {
    throw new Error('Method not implemented.');
  }
  packReturns(_returns: Fr[]): Promise<Fr> {
    throw new Error('Method not implemented.');
  }
  unpackReturns(_returnsHash: Fr): Promise<Fr[]> {
    throw new Error('Method not implemented.');
  }
  getKeyValidationRequest(_pkMHash: Fr): Promise<KeyValidationRequest> {
    throw new Error('Method not implemented.');
  }
  getContractInstance(_address: AztecAddress): Promise<ContractInstance> {
    throw new Error('Method not implemented.');
  }
  getMembershipWitness(_blockNumber: number, _treeId: MerkleTreeId, _leafValue: Fr): Promise<Fr[] | undefined> {
    throw new Error('Method not implemented.');
  }
  getSiblingPath(_blockNumber: number, _treeId: MerkleTreeId, _leafIndex: Fr): Promise<Fr[]> {
    throw new Error('Method not implemented.');
  }
  getNullifierMembershipWitness(_blockNumber: number, _nullifier: Fr): Promise<NullifierMembershipWitness | undefined> {
    throw new Error('Method not implemented.');
  }
  getPublicDataTreeWitness(_blockNumber: number, _leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    throw new Error('Method not implemented.');
  }
  getLowNullifierMembershipWitness(
    _blockNumber: number,
    _nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    throw new Error('Method not implemented.');
  }
  getHeader(_blockNumber: number): Promise<Header | undefined> {
    throw new Error('Method not implemented.');
  }
  getCompleteAddress(_account: AztecAddress): Promise<CompleteAddress> {
    throw new Error('Method not implemented.');
  }
  getAuthWitness(_messageHash: Fr): Promise<Fr[] | undefined> {
    throw new Error('Method not implemented.');
  }
  popCapsule(): Promise<Fr[]> {
    throw new Error('Method not implemented.');
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
    throw new Error('Method not implemented.');
  }
  notifyCreatedNote(_storageSlot: Fr, _noteTypeId: Fr, _note: Fr[], _innerNoteHash: Fr, _counter: number): void {
    throw new Error('Method not implemented.');
  }
  notifyNullifiedNote(_innerNullifier: Fr, _innerNoteHash: Fr, _counter: number): Promise<void> {
    throw new Error('Method not implemented.');
  }
  checkNullifierExists(_innerNullifier: Fr): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  getL1ToL2MembershipWitness(
    _contractAddress: AztecAddress,
    _messageHash: Fr,
    _secret: Fr,
  ): Promise<MessageLoadOracleInputs<16>> {
    throw new Error('Method not implemented.');
  }
  async storageRead(startStorageSlot: Fr, numberOfElements: number): Promise<Fr[]> {
    const values = [];
    for (let i = 0n; i < numberOfElements; i++) {
      const storageSlot = startStorageSlot.add(new Fr(i));
      const value = await this.worldStatePublicDB.storageRead(this.contractAddress, storageSlot);
      this.logger.debug(`Oracle storage read: slot=${storageSlot.toString()} value=${value}`);
      values.push(value);
    }
    return values;
  }

  async storageWrite(startStorageSlot: Fr, values: Fr[]): Promise<Fr[]> {
    return await Promise.all(
      values.map(async (value, i) => {
        const storageSlot = startStorageSlot.add(new Fr(i));
        const result = await this.worldStatePublicDB.storageWrite(this.contractAddress, storageSlot, value);
        this.logger.debug(`Oracle storage write: slot=${storageSlot.toString()} value=${value}`);
        return new Fr(result);
      }),
    );
  }
  emitEncryptedLog(_contractAddress: AztecAddress, _randomness: Fr, _encryptedNote: Buffer, _counter: number): void {
    throw new Error('Method not implemented.');
  }
  emitEncryptedNoteLog(_noteHashCounter: number, _encryptedNote: Buffer, _counter: number): void {
    throw new Error('Method not implemented.');
  }
  computeEncryptedLog(
    _contractAddress: AztecAddress,
    _storageSlot: Fr,
    _noteTypeId: Fr,
    _ovKeys: KeyValidationRequest,
    _ivpkM: Point,
    _preimage: Fr[],
  ): Buffer {
    throw new Error('Method not implemented.');
  }
  emitUnencryptedLog(_log: UnencryptedL2Log, _counter: number): void {
    throw new Error('Method not implemented.');
  }
  emitContractClassUnencryptedLog(_log: UnencryptedL2Log, _counter: number): Fr {
    throw new Error('Method not implemented.');
  }
  callPrivateFunction(
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _argsHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
    _isDelegateCall: boolean,
  ): Promise<PrivateCallStackItem> {
    throw new Error('Method not implemented.');
  }
  callPublicFunction(
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _argsHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
    _isDelegateCall: boolean,
  ): Promise<Fr[]> {
    throw new Error('Method not implemented.');
  }
  enqueuePublicFunctionCall(
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _argsHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
    _isDelegateCall: boolean,
  ): Promise<PublicCallRequest> {
    throw new Error('Method not implemented.');
  }
  setPublicTeardownFunctionCall(
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _argsHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
    _isDelegateCall: boolean,
  ): Promise<PublicCallRequest> {
    throw new Error('Method not implemented.');
  }
  aes128Encrypt(_input: Buffer, _initializationVector: Buffer, _key: Buffer): Buffer {
    throw new Error('Method not implemented.');
  }
  debugLog(_message: string, _fields: Fr[]): void {
    throw new Error('Method not implemented.');
  }
}

export class TXEService {
  constructor(private typedOracle: TypedOracle, private store: AztecKVStore, private contractAddress: AztecAddress) {}

  static async init(logger: Logger, contractAddress = AztecAddress.random()) {
    const store = openTmpStore(true);
    const trees = await MerkleTrees.new(store, logger);
    const txe = new TXE(logger, trees.asLatest(), contractAddress);
    return new TXEService(txe, store, contractAddress);
  }

  setContractAddress(address = AztecAddress.random()): AztecAddress {
    this.contractAddress = address;
    return this.contractAddress;
  }

  async reset() {
    await this.store.clear();
  }

  async storageRead(startStorageSlot: ForeignCallSingle, numberOfElements: ForeignCallSingle) {
    const values = await this.typedOracle.storageRead(
      fromSingle(startStorageSlot),
      fromSingle(numberOfElements).toNumber(),
    );
    return toForeignCallResult([toArray(values)]);
  }

  async storageWrite(startStorageSlot: ForeignCallSingle, values: ForeignCallArray) {
    const newValues = await this.typedOracle.storageWrite(fromSingle(startStorageSlot), fromArray(values));
    return toForeignCallResult([toArray(newValues)]);
  }
}
