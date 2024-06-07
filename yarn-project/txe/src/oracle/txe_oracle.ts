import {
  MerkleTreeId,
  Note,
  type NoteStatus,
  type NullifierMembershipWitness,
  PublicDataWitness,
  PublicDataWrite,
  type UnencryptedL2Log,
} from '@aztec/circuit-types';
import {
  type CompleteAddress,
  type Header,
  type KeyValidationRequest,
  NULLIFIER_SUBTREE_HEIGHT,
  PUBLIC_DATA_SUBTREE_HEIGHT,
  type PUBLIC_DATA_TREE_HEIGHT,
  type PrivateCallStackItem,
  type PublicCallRequest,
  PublicDataTreeLeaf,
  type PublicDataTreeLeafPreimage,
} from '@aztec/circuits.js';
import { Aes128 } from '@aztec/circuits.js/barretenberg';
import { computePublicDataTreeLeafSlot, siloNoteHash, siloNullifier } from '@aztec/circuits.js/hash';
import { type FunctionSelector } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr, type Point } from '@aztec/foundation/fields';
import { type Logger, applyStringFormatting } from '@aztec/foundation/log';
import {
  type ExecutionNoteCache,
  type MessageLoadOracleInputs,
  type NoteData,
  type PackedValuesCache,
  type TypedOracle,
  pickNotes,
} from '@aztec/simulator';
import { type ContractInstance } from '@aztec/types/contracts';
import { MerkleTreeSnapshotOperationsFacade, type MerkleTrees } from '@aztec/world-state';

export class TXE implements TypedOracle {
  constructor(
    private logger: Logger,
    private trees: MerkleTrees,
    private packedValuesCache: PackedValuesCache,
    private noteCache: ExecutionNoteCache,
    private contractAddress: AztecAddress,
  ) {
    this.packedValuesCache = packedValuesCache;
    this.noteCache = noteCache;
  }

  setContractAddress(contractAddress: AztecAddress) {
    this.contractAddress = contractAddress;
  }

  getRandomField() {
    return Fr.random();
  }

  packArgumentsArray(args: Fr[]): Promise<Fr> {
    return Promise.resolve(this.packedValuesCache.pack(args));
  }

  packReturns(returns: Fr[]): Promise<Fr> {
    return Promise.resolve(this.packedValuesCache.pack(returns));
  }

  unpackReturns(returnsHash: Fr): Promise<Fr[]> {
    return Promise.resolve(this.packedValuesCache.unpack(returnsHash));
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

  async getSiblingPath(blockNumber: number, treeId: MerkleTreeId, leafIndex: Fr) {
    const committedDb = new MerkleTreeSnapshotOperationsFacade(this.trees, blockNumber);
    const result = await committedDb.getSiblingPath(treeId, leafIndex.toBigInt());
    return result.toFields();
  }

  getNullifierMembershipWitness(_blockNumber: number, _nullifier: Fr): Promise<NullifierMembershipWitness | undefined> {
    throw new Error('Method not implemented.');
  }

  async getPublicDataTreeWitness(blockNumber: number, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    const committedDb = new MerkleTreeSnapshotOperationsFacade(this.trees, blockNumber);
    const lowLeafResult = await committedDb.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot.toBigInt());
    if (!lowLeafResult) {
      return undefined;
    } else {
      const preimage = (await committedDb.getLeafPreimage(
        MerkleTreeId.PUBLIC_DATA_TREE,
        lowLeafResult.index,
      )) as PublicDataTreeLeafPreimage;
      const path = await committedDb.getSiblingPath<typeof PUBLIC_DATA_TREE_HEIGHT>(
        MerkleTreeId.PUBLIC_DATA_TREE,
        lowLeafResult.index,
      );
      return new PublicDataWitness(lowLeafResult.index, preimage, path);
    }
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
    storageSlot: Fr,
    numSelects: number,
    selectByIndexes: number[],
    selectByOffsets: number[],
    selectByLengths: number[],
    selectValues: Fr[],
    selectComparators: number[],
    sortByIndexes: number[],
    sortByOffsets: number[],
    sortByLengths: number[],
    sortOrder: number[],
    limit: number,
    offset: number,
    _status: NoteStatus,
  ) {
    // Nullified pending notes are already removed from the list.
    console.log(`fecthing notes for ${this.contractAddress}`);
    const pendingNotes = this.noteCache.getNotes(this.contractAddress, storageSlot);

    // const pendingNullifiers = this.noteCache.getNullifiers(this.contractAddress);
    // const dbNotes = await this.db.getNotes(this.contractAddress, storageSlot, status);
    // const dbNotesFiltered = dbNotes.filter(n => !pendingNullifiers.has((n.siloedNullifier as Fr).value));

    const notes = pickNotes<NoteData>(pendingNotes, {
      selects: selectByIndexes.slice(0, numSelects).map((index, i) => ({
        selector: { index, offset: selectByOffsets[i], length: selectByLengths[i] },
        value: selectValues[i],
        comparator: selectComparators[i],
      })),
      sorts: sortByIndexes.map((index, i) => ({
        selector: { index, offset: sortByOffsets[i], length: sortByLengths[i] },
        order: sortOrder[i],
      })),
      limit,
      offset,
    });

    this.logger.debug(
      `Returning ${notes.length} notes for ${this.contractAddress} at ${storageSlot}: ${notes
        .map(n => `${n.nonce.toString()}:[${n.note.items.map(i => i.toString()).join(',')}]`)
        .join(', ')}`,
    );

    return Promise.resolve(notes);
  }

  async notifyCreatedNote(storageSlot: Fr, noteTypeId: Fr, noteItems: Fr[], innerNoteHash: Fr, counter: number) {
    const note = new Note(noteItems);
    this.noteCache.addNewNote(
      {
        contractAddress: this.contractAddress,
        storageSlot,
        nonce: Fr.ZERO, // Nonce cannot be known during private execution.
        note,
        siloedNullifier: undefined, // Siloed nullifier cannot be known for newly created note.
        innerNoteHash,
      },
      counter,
    );
    const db = this.trees.asLatest();
    const noteHash = siloNoteHash(this.contractAddress, innerNoteHash);
    await db.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, [noteHash]);
  }

  async notifyNullifiedNote(innerNullifier: Fr, innerNoteHash: Fr, _counter: number) {
    this.noteCache.nullifyNote(this.contractAddress, innerNullifier, innerNoteHash);
    const db = this.trees.asLatest();
    const siloedNullifier = siloNullifier(this.contractAddress, innerNullifier);
    await db.batchInsert(MerkleTreeId.NULLIFIER_TREE, [siloedNullifier.toBuffer()], NULLIFIER_SUBTREE_HEIGHT);
    return Promise.resolve();
  }

  async checkNullifierExists(innerNullifier: Fr): Promise<boolean> {
    const nullifier = siloNullifier(this.contractAddress, innerNullifier!);
    const db = this.trees.asLatest();
    const index = await db.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer());
    return index !== undefined;
  }

  getL1ToL2MembershipWitness(
    _contractAddress: AztecAddress,
    _messageHash: Fr,
    _secret: Fr,
  ): Promise<MessageLoadOracleInputs<16>> {
    throw new Error('Method not implemented.');
  }

  async storageRead(startStorageSlot: Fr, numberOfElements: number): Promise<Fr[]> {
    const db = this.trees.asLatest();

    const values = [];
    for (let i = 0n; i < numberOfElements; i++) {
      const storageSlot = startStorageSlot.add(new Fr(i));
      const leafSlot = computePublicDataTreeLeafSlot(this.contractAddress, storageSlot).toBigInt();

      const lowLeafResult = await db.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot);

      let value = Fr.ZERO;
      if (lowLeafResult && lowLeafResult.alreadyPresent) {
        const preimage = (await db.getLeafPreimage(
          MerkleTreeId.PUBLIC_DATA_TREE,
          lowLeafResult.index,
        )) as PublicDataTreeLeafPreimage;
        value = preimage.value;
      }
      this.logger.debug(`Oracle storage read: slot=${storageSlot.toString()} value=${value}`);
      values.push(value);
    }
    return values;
  }

  async storageWrite(startStorageSlot: Fr, values: Fr[]): Promise<Fr[]> {
    const db = this.trees.asLatest();

    const publicDataWrites = values.map((value, i) => {
      const storageSlot = startStorageSlot.add(new Fr(i));
      this.logger.debug(`Oracle storage write: slot=${storageSlot.toString()} value=${value}`);
      return new PublicDataWrite(computePublicDataTreeLeafSlot(this.contractAddress, storageSlot), value);
    });
    await db.batchInsert(
      MerkleTreeId.PUBLIC_DATA_TREE,
      publicDataWrites.map(write => new PublicDataTreeLeaf(write.leafIndex, write.newValue).toBuffer()),
      PUBLIC_DATA_SUBTREE_HEIGHT,
    );
    return publicDataWrites.map(write => write.newValue);
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

  aes128Encrypt(input: Buffer, initializationVector: Buffer, key: Buffer): Buffer {
    const aes128 = new Aes128();
    return aes128.encryptBufferCBC(input, initializationVector, key);
  }

  debugLog(message: string, fields: Fr[]): void {
    this.logger.verbose(`debug_log ${applyStringFormatting(message, fields)}`);
  }
}
