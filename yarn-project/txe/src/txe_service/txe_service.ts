import { L2Block, MerkleTreeId } from '@aztec/circuit-types';
import { Fr, Header, PrivateContextInputs } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { type Logger } from '@aztec/foundation/log';
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
    private contractAddress: AztecAddress,
  ) {}

  static async init(logger: Logger, contractAddress = AztecAddress.random()) {
    const store = openTmpStore(true);
    const trees = await MerkleTrees.new(store, logger);
    const packedValuesCache = new PackedValuesCache();
    const noteCache = new ExecutionNoteCache();
    logger.info(`TXE service initialized`);
    const txe = new TXE(logger, trees, packedValuesCache, noteCache, contractAddress);
    const service = new TXEService(logger, txe, store, trees, contractAddress);
    await service.timeTravel(toSingle(new Fr(1n)));
    return service;
  }

  async getPrivateContextInputs(blockNumber: ForeignCallSingle) {
    const inputs = PrivateContextInputs.empty();
    const stateReference = await this.trees.getStateReference(true);
    inputs.historicalHeader.globalVariables.blockNumber = fromSingle(blockNumber);
    inputs.historicalHeader.state = stateReference;
    inputs.callContext.msgSender = AztecAddress.random();
    inputs.callContext.storageContractAddress = this.contractAddress;
    return toForeignCallResult(inputs.toFields().map(toSingle));
  }

  timeTravel(blocks: ForeignCallSingle) {
    return this.#timeTravelInner(fromSingle(blocks).toNumber());
  }

  async #timeTravelInner(blocks: number) {
    this.logger.info(`time traveling ${blocks} blocks`);
    for (let i = 0; i < blocks; i++) {
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

  setContractAddress(address: ForeignCallSingle) {
    const typedAddress = AztecAddress.fromField(fromSingle(address));
    this.contractAddress = typedAddress;
    (this.typedOracle as TXE).setContractAddress(typedAddress);
    return toForeignCallResult([]);
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

  async reset() {
    this.blockNumber = 0;
    this.contractAddress = AztecAddress.random();
    this.store = openTmpStore(true);
    this.trees = await MerkleTrees.new(this.store, this.logger);

    this.typedOracle = new TXE(
      this.logger,
      this.trees,
      new PackedValuesCache(),
      new ExecutionNoteCache(),
      this.contractAddress,
    );
    await this.#timeTravelInner(1);
    return toForeignCallResult([]);
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
    console.log(`injected header: ${contractAddress}`);

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
}
