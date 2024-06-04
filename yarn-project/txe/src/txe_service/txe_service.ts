import { L2Block, MerkleTreeId } from '@aztec/circuit-types';
import { Fr, Header } from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { type Logger } from '@aztec/foundation/log';
import { type AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/utils';
import { PackedValuesCache, type TypedOracle } from '@aztec/simulator';
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
    private typedOracle: TypedOracle,
    private store: AztecKVStore,
    private trees: MerkleTrees,
    private packedValuesCache: PackedValuesCache,
    private contractAddress: AztecAddress,
  ) {}

  static async init(logger: Logger, contractAddress = AztecAddress.random()) {
    const store = openTmpStore(true);
    const trees = await MerkleTrees.new(store, logger);
    const packedValuesCache = new PackedValuesCache();
    logger.info(`TXE service initialized`);
    const txe = new TXE(logger, trees, packedValuesCache, contractAddress);
    const service = new TXEService(txe, store, trees, packedValuesCache, contractAddress);
    await service.timeTravel(1);
    return service;
  }

  async timeTravel(blocks: number) {
    const header = Header.empty();
    const l2Block = L2Block.empty();

    for (let i = 0; i < blocks; i++) {
      header.state = await this.trees.getStateReference(true);
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

  setContractAddress(address = AztecAddress.random()) {
    this.contractAddress = address;
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
    await this.store.clear();
    this.packedValuesCache = new PackedValuesCache();
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
}
