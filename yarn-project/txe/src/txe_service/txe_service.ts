import { ContractInstanceStore } from '@aztec/archiver';
import { L2Block, MerkleTreeId, PublicDataWrite } from '@aztec/circuit-types';
import {
  Fr,
  Header,
  KeyValidationRequest,
  PUBLIC_DATA_SUBTREE_HEIGHT,
  Point,
  PrivateContextInputs,
  PublicDataTreeLeaf,
  getContractInstanceFromDeployParams,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { type Logger } from '@aztec/foundation/log';
import { KeyStore } from '@aztec/key-store';
import { type AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/utils';
import { ExecutionNoteCache, PackedValuesCache, type TypedOracle } from '@aztec/simulator';
import { MerkleTrees } from '@aztec/world-state';

import { TXE } from '../oracle/txe_oracle.js';
import {
  type ForeignCallArray,
  type ForeignCallSingle,
  fromArray,
  fromSingle,
  toArray,
  toForeignCallResult,
  toSingle,
} from '../util/encoding.js';

export class TXEService {
  private blockNumber = 0;

  constructor(
    private logger: Logger,
    private typedOracle: TypedOracle,
    private store: AztecKVStore,
    private trees: MerkleTrees,
    private contractInstanceStore: ContractInstanceStore,
    private keyStore: KeyStore,
    private contractAddress: AztecAddress,
  ) {}

  static async init(logger: Logger, contractAddress = AztecAddress.random()) {
    const store = openTmpStore(true);
    const trees = await MerkleTrees.new(store, logger);
    const packedValuesCache = new PackedValuesCache();
    const noteCache = new ExecutionNoteCache();
    const contractInstanceStore = new ContractInstanceStore(store);
    const keyStore = new KeyStore(store);
    logger.info(`TXE service initialized`);
    const txe = new TXE(logger, trees, packedValuesCache, noteCache, contractInstanceStore, keyStore, contractAddress);
    const service = new TXEService(logger, txe, store, trees, contractInstanceStore, keyStore, contractAddress);
    await service.timeTravel(toSingle(new Fr(1n)));
    return service;
  }

  // Cheatcodes

  async getPrivateContextInputs(blockNumber: ForeignCallSingle) {
    const inputs = PrivateContextInputs.empty();
    const stateReference = await this.trees.getStateReference(true);
    inputs.historicalHeader.globalVariables.blockNumber = fromSingle(blockNumber);
    inputs.historicalHeader.state = stateReference;
    inputs.callContext.msgSender = AztecAddress.random();
    inputs.callContext.storageContractAddress = this.contractAddress;
    return toForeignCallResult(inputs.toFields().map(toSingle));
  }

  async timeTravel(blocks: ForeignCallSingle) {
    const nBlocks = fromSingle(blocks).toNumber();
    this.logger.info(`time traveling ${nBlocks} blocks`);
    for (let i = 0; i < nBlocks; i++) {
      const header = Header.empty();
      const l2Block = L2Block.empty();
      header.state = await this.trees.getStateReference(true);
      header.globalVariables.blockNumber = new Fr(this.blockNumber);
      header.state.partial.nullifierTree.root = Fr.fromBuffer(
        (await this.trees.getTreeInfo(MerkleTreeId.NULLIFIER_TREE, true)).root,
      );
      header.state.partial.noteHashTree.root = Fr.fromBuffer(
        (await this.trees.getTreeInfo(MerkleTreeId.NOTE_HASH_TREE, true)).root,
      );
      header.state.partial.publicDataTree.root = Fr.fromBuffer(
        (await this.trees.getTreeInfo(MerkleTreeId.PUBLIC_DATA_TREE, true)).root,
      );
      header.state.l1ToL2MessageTree.root = Fr.fromBuffer(
        (await this.trees.getTreeInfo(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, true)).root,
      );
      l2Block.archive.root = Fr.fromBuffer((await this.trees.getTreeInfo(MerkleTreeId.ARCHIVE, true)).root);
      l2Block.header = header;
      await this.trees.handleL2BlockAndMessages(l2Block, []);
      this.blockNumber++;
    }
    return toForeignCallResult([]);
  }

  async reset() {
    this.blockNumber = 0;
    this.store = openTmpStore(true);
    this.trees = await MerkleTrees.new(this.store, this.logger);
    this.contractInstanceStore = new ContractInstanceStore(this.store);
    this.keyStore = new KeyStore(this.store);
    this.typedOracle = new TXE(
      this.logger,
      this.trees,
      new PackedValuesCache(),
      new ExecutionNoteCache(),
      this.contractInstanceStore,
      this.keyStore,
      this.contractAddress,
    );
    await this.timeTravel(toSingle(new Fr(1)));
    return toForeignCallResult([]);
  }

  setContractAddress(address: ForeignCallSingle) {
    const typedAddress = AztecAddress.fromField(fromSingle(address));
    this.contractAddress = typedAddress;
    (this.typedOracle as TXE).setContractAddress(typedAddress);
    return toForeignCallResult([]);
  }

  async deploy(
    path: ForeignCallArray,
    initializer: ForeignCallArray,
    _length: ForeignCallSingle,
    args: ForeignCallArray,
  ) {
    const pathStr = fromArray(path)
      .map(char => String.fromCharCode(char.toNumber()))
      .join('');
    const initializerStr = fromArray(initializer)
      .map(char => String.fromCharCode(char.toNumber()))
      .join('');
    const decodedArgs = fromArray(args);
    this.logger.debug(`Deploy ${pathStr} with ${initializerStr} and ${decodedArgs}`);
    const contractModule = await import(pathStr);
    // Hacky way of getting the class, the name of the Artifact is always longer
    const contractClass = contractModule[Object.keys(contractModule).sort((a, b) => a.length - b.length)[0]];
    const instance = getContractInstanceFromDeployParams(contractClass.artifact, {
      constructorArgs: decodedArgs,
      salt: Fr.ONE,
      publicKeysHash: Fr.ZERO,
      constructorArtifact: initializerStr,
      deployer: AztecAddress.ZERO,
    });
    this.logger.debug(`Deployed ${contractClass.artifact.name} at ${instance.address}`);
    await this.contractInstanceStore.addContractInstance(instance);
    return toForeignCallResult([toSingle(instance.address)]);
  }

  async directStorageWrite(
    contractAddress: ForeignCallSingle,
    startStorageSlot: ForeignCallSingle,
    values: ForeignCallArray,
  ) {
    const startStorageSlotFr = fromSingle(startStorageSlot);
    const valuesFr = fromArray(values);
    const contractAddressFr = fromSingle(contractAddress);
    const db = this.trees.asLatest();

    const publicDataWrites = valuesFr.map((value, i) => {
      const storageSlot = startStorageSlotFr.add(new Fr(i));
      this.logger.debug(`Oracle storage write: slot=${storageSlot.toString()} value=${value}`);
      return new PublicDataWrite(computePublicDataTreeLeafSlot(contractAddressFr, storageSlot), value);
    });
    await db.batchInsert(
      MerkleTreeId.PUBLIC_DATA_TREE,
      publicDataWrites.map(write => new PublicDataTreeLeaf(write.leafIndex, write.newValue).toBuffer()),
      PUBLIC_DATA_SUBTREE_HEIGHT,
    );
    return toForeignCallResult([toArray(publicDataWrites.map(write => write.newValue))]);
  }

  // PXE oracles

  getRandomField() {
    return toForeignCallResult([toSingle(this.typedOracle.getRandomField())]);
  }

  getContractAddress() {
    return toForeignCallResult([toSingle(this.contractAddress.toField())]);
  }

  getBlockNumber() {
    return toForeignCallResult([toSingle(new Fr(this.blockNumber))]);
  }

  avmOpcodeAddress() {
    return toForeignCallResult([toSingle(this.contractAddress.toField())]);
  }

  avmOpcodeBlockNumber() {
    return toForeignCallResult([toSingle(new Fr(this.blockNumber))]);
  }

  async packArgumentsArray(args: ForeignCallArray) {
    const packed = await this.typedOracle.packArgumentsArray(fromArray(args));
    return toForeignCallResult([toSingle(packed)]);
  }

  async packArguments(_length: ForeignCallSingle, values: ForeignCallArray) {
    const packed = await this.typedOracle.packArgumentsArray(fromArray(values));
    return toForeignCallResult([toSingle(packed)]);
  }

  // Since the argument is a slice, noir automatically adds a length field to oracle call.
  async packReturns(_length: ForeignCallSingle, values: ForeignCallArray) {
    const packed = await this.typedOracle.packReturns(fromArray(values));
    return toForeignCallResult([toSingle(packed)]);
  }

  async unpackReturns(returnsHash: ForeignCallSingle) {
    const unpacked = await this.typedOracle.unpackReturns(fromSingle(returnsHash));
    return toForeignCallResult([toArray(unpacked)]);
  }

  // Since the argument is a slice, noir automatically adds a length field to oracle call.
  debugLog(message: ForeignCallArray, _length: ForeignCallSingle, fields: ForeignCallArray) {
    const messageStr = fromArray(message)
      .map(field => String.fromCharCode(field.toNumber()))
      .join('');
    const fieldsFr = fromArray(fields);
    this.typedOracle.debugLog(messageStr, fieldsFr);
    return toForeignCallResult([]);
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

  async getPublicDataTreeWitness(blockNumber: ForeignCallSingle, leafSlot: ForeignCallSingle) {
    const parsedBlockNumber = fromSingle(blockNumber).toNumber();
    const parsedLeafSlot = fromSingle(leafSlot);

    const witness = await this.typedOracle.getPublicDataTreeWitness(parsedBlockNumber, parsedLeafSlot);
    if (!witness) {
      throw new Error(`Public data witness not found for slot ${parsedLeafSlot} at block ${parsedBlockNumber}.`);
    }
    return toForeignCallResult([toArray(witness.toFields())]);
  }

  async getSiblingPath(blockNumber: ForeignCallSingle, treeId: ForeignCallSingle, leafIndex: ForeignCallSingle) {
    const result = await this.typedOracle.getSiblingPath(
      fromSingle(blockNumber).toNumber(),
      fromSingle(treeId).toNumber(),
      fromSingle(leafIndex),
    );
    return toForeignCallResult([toArray(result)]);
  }

  async getNotes(
    storageSlot: ForeignCallSingle,
    numSelects: ForeignCallSingle,
    selectByIndexes: ForeignCallArray,
    selectByOffsets: ForeignCallArray,
    selectByLengths: ForeignCallArray,
    selectValues: ForeignCallArray,
    selectComparators: ForeignCallArray,
    sortByIndexes: ForeignCallArray,
    sortByOffsets: ForeignCallArray,
    sortByLengths: ForeignCallArray,
    sortOrder: ForeignCallArray,
    limit: ForeignCallSingle,
    offset: ForeignCallSingle,
    status: ForeignCallSingle,
    returnSize: ForeignCallSingle,
  ) {
    const noteDatas = await this.typedOracle.getNotes(
      fromSingle(storageSlot),
      fromSingle(numSelects).toNumber(),
      fromArray(selectByIndexes).map(fr => fr.toNumber()),
      fromArray(selectByOffsets).map(fr => fr.toNumber()),
      fromArray(selectByLengths).map(fr => fr.toNumber()),
      fromArray(selectValues),
      fromArray(selectComparators).map(fr => fr.toNumber()),
      fromArray(sortByIndexes).map(fr => fr.toNumber()),
      fromArray(sortByOffsets).map(fr => fr.toNumber()),
      fromArray(sortByLengths).map(fr => fr.toNumber()),
      fromArray(sortOrder).map(fr => fr.toNumber()),
      fromSingle(limit).toNumber(),
      fromSingle(offset).toNumber(),
      fromSingle(status).toNumber(),
    );
    const noteLength = noteDatas?.[0]?.note.items.length ?? 0;
    if (!noteDatas.every(({ note }) => noteLength === note.items.length)) {
      throw new Error('Notes should all be the same length.');
    }

    const contractAddress = noteDatas[0]?.contractAddress ?? Fr.ZERO;

    // Values indicates whether the note is settled or transient.
    const noteTypes = {
      isSettled: new Fr(0),
      isTransient: new Fr(1),
    };
    const flattenData = noteDatas.flatMap(({ nonce, note, index }) => [
      nonce,
      index === undefined ? noteTypes.isTransient : noteTypes.isSettled,
      ...note.items,
    ]);

    const returnFieldSize = fromSingle(returnSize).toNumber();
    const returnData = [noteDatas.length, contractAddress, ...flattenData].map(v => new Fr(v));
    if (returnData.length > returnFieldSize) {
      throw new Error(`Return data size too big. Maximum ${returnFieldSize} fields. Got ${flattenData.length}.`);
    }

    const paddedZeros = Array(returnFieldSize - returnData.length).fill(new Fr(0));
    return toForeignCallResult([toArray([...returnData, ...paddedZeros])]);
  }

  notifyCreatedNote(
    storageSlot: ForeignCallSingle,
    noteTypeId: ForeignCallSingle,
    note: ForeignCallArray,
    innerNoteHash: ForeignCallSingle,
    counter: ForeignCallSingle,
  ) {
    this.typedOracle.notifyCreatedNote(
      fromSingle(storageSlot),
      fromSingle(noteTypeId),
      fromArray(note),
      fromSingle(innerNoteHash),
      fromSingle(counter).toNumber(),
    );
    return toForeignCallResult([toSingle(new Fr(0))]);
  }

  async notifyNullifiedNote(
    innerNullifier: ForeignCallSingle,
    innerNoteHash: ForeignCallSingle,
    counter: ForeignCallSingle,
  ) {
    await this.typedOracle.notifyNullifiedNote(
      fromSingle(innerNullifier),
      fromSingle(innerNoteHash),
      fromSingle(counter).toNumber(),
    );
    return toForeignCallResult([toSingle(new Fr(0))]);
  }

  async checkNullifierExists(innerNullifier: ForeignCallSingle) {
    const exists = await this.typedOracle.checkNullifierExists(fromSingle(innerNullifier));
    return toForeignCallResult([toSingle(new Fr(exists))]);
  }

  async getContractInstance(address: ForeignCallSingle) {
    const instance = await this.typedOracle.getContractInstance(fromSingle(address));
    return toForeignCallResult([
      toArray([
        instance.salt,
        instance.deployer,
        instance.contractClassId,
        instance.initializationHash,
        instance.publicKeysHash,
      ]),
    ]);
  }

  async getPublicKeysAndPartialAddress(address: ForeignCallSingle) {
    const parsedAddress = AztecAddress.fromField(fromSingle(address));
    const { publicKeys, partialAddress } = await this.typedOracle.getCompleteAddress(parsedAddress);

    return toForeignCallResult([toArray([...publicKeys.toFields(), partialAddress])]);
  }

  async getKeyValidationRequest(pkMHash: ForeignCallSingle) {
    const keyValidationRequest = await this.typedOracle.getKeyValidationRequest(fromSingle(pkMHash));
    return toForeignCallResult([toArray(keyValidationRequest.toFields())]);
  }

  computeEncryptedLog(
    contractAddress: ForeignCallSingle,
    storageSlot: ForeignCallSingle,
    noteTypeId: ForeignCallSingle,
    ovskApp: ForeignCallSingle,
    ovpkMX: ForeignCallSingle,
    ovpkMY: ForeignCallSingle,
    ivpkMX: ForeignCallSingle,
    ivpkMY: ForeignCallSingle,
    preimage: ForeignCallArray,
  ) {
    const ovpkM = new Point(fromSingle(ovpkMX), fromSingle(ovpkMY));
    const ovKeys = new KeyValidationRequest(ovpkM, Fr.fromString(fromSingle(ovskApp).toString()));
    const ivpkM = new Point(fromSingle(ivpkMX), fromSingle(ivpkMY));
    const encLog = this.typedOracle.computeEncryptedLog(
      AztecAddress.fromString(fromSingle(contractAddress).toString()),
      Fr.fromString(fromSingle(storageSlot).toString()),
      Fr.fromString(fromSingle(noteTypeId).toString()),
      ovKeys,
      ivpkM,
      fromArray(preimage),
    );
    const bytes: Fr[] = [];

    encLog.forEach(v => {
      bytes.push(new Fr(v));
    });
    return toForeignCallResult([toArray(bytes)]);
  }

  emitEncryptedLog(
    _contractAddress: ForeignCallSingle,
    _randomandomness: ForeignCallSingle,
    _encryptedLog: ForeignCallSingle,
    _counter: ForeignCallSingle,
  ) {
    return toForeignCallResult([]);
  }

  emitEncryptedNoteLog(
    _noteHashCounter: ForeignCallSingle,
    _encryptedNote: ForeignCallArray,
    _counter: ForeignCallSingle,
  ) {
    return toForeignCallResult([]);
  }
}
