import {
  L1NotePayload,
  MerkleTreeId,
  Note,
  type NoteStatus,
  type NullifierMembershipWitness,
  PublicDataWitness,
  PublicDataWrite,
  TaggedLog,
  type UnencryptedL2Log,
} from '@aztec/circuit-types';
import { type CircuitWitnessGenerationStats } from '@aztec/circuit-types/stats';
import {
  type CompleteAddress,
  FunctionData,
  type Header,
  type KeyValidationRequest,
  NULLIFIER_SUBTREE_HEIGHT,
  PUBLIC_DATA_SUBTREE_HEIGHT,
  type PUBLIC_DATA_TREE_HEIGHT,
  PrivateCallStackItem,
  PrivateCircuitPublicInputs,
  PrivateContextInputs,
  type PublicCallRequest,
  PublicDataTreeLeaf,
  type PublicDataTreeLeafPreimage,
  computeContractClassId,
  getContractClassFromArtifact,
} from '@aztec/circuits.js';
import { Aes128 } from '@aztec/circuits.js/barretenberg';
import { computePublicDataTreeLeafSlot, siloNoteHash, siloNullifier } from '@aztec/circuits.js/hash';
import {
  type ContractArtifact,
  type FunctionAbi,
  type FunctionSelector,
  countArgumentsSize,
} from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr, GrumpkinScalar, type Point } from '@aztec/foundation/fields';
import { type Logger, applyStringFormatting } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { type KeyStore } from '@aztec/key-store';
import { ContractDataOracle } from '@aztec/pxe';
import {
  ExecutionError,
  type ExecutionNoteCache,
  type MessageLoadOracleInputs,
  type NoteData,
  Oracle,
  type PackedValuesCache,
  type TypedOracle,
  acvm,
  extractCallStack,
  pickNotes,
  toACVMWitness,
  witnessMapToFields,
} from '@aztec/simulator';
import { type ContractInstance, type ContractInstanceWithAddress } from '@aztec/types/contracts';
import { MerkleTreeSnapshotOperationsFacade, type MerkleTrees } from '@aztec/world-state';

import { type TXEDatabase } from '../util/txe_database.js';

export class TXE implements TypedOracle {
  private blockNumber = 0;
  private sideEffectCounter = 0;
  private contractDataOracle: ContractDataOracle;

  constructor(
    private logger: Logger,
    private trees: MerkleTrees,
    private packedValuesCache: PackedValuesCache,
    private noteCache: ExecutionNoteCache,
    private keyStore: KeyStore,
    private txeDatabase: TXEDatabase,
    private contractAddress: AztecAddress,
  ) {
    this.contractDataOracle = new ContractDataOracle(txeDatabase);
  }

  // Utils

  getSideEffectCounter() {
    return this.sideEffectCounter;
  }

  setSideEffectCounter(sideEffectCounter: number) {
    this.sideEffectCounter = sideEffectCounter;
  }

  setContractAddress(contractAddress: AztecAddress) {
    this.contractAddress = contractAddress;
  }

  setBlockNumber(blockNumber: number) {
    this.blockNumber = blockNumber;
  }

  getTrees() {
    return this.trees;
  }

  getTXEDatabase() {
    return this.txeDatabase;
  }

  getKeyStore() {
    return this.keyStore;
  }

  async addContractInstance(contractInstance: ContractInstanceWithAddress) {
    await this.txeDatabase.addContractInstance(contractInstance);
  }

  async addContractArtifact(artifact: ContractArtifact) {
    const contractClass = getContractClassFromArtifact(artifact);
    await this.txeDatabase.addContractArtifact(computeContractClassId(contractClass), artifact);
  }

  async getPrivateContextInputs(
    blockNumber: number,
    msgSender = AztecAddress.random(),
    contractAddress = this.contractAddress,
  ) {
    const trees = this.getTrees();
    const stateReference = await trees.getStateReference(true);
    const inputs = PrivateContextInputs.empty();
    inputs.historicalHeader.globalVariables.blockNumber = new Fr(blockNumber);
    inputs.historicalHeader.state = stateReference;
    inputs.callContext.msgSender = msgSender;
    inputs.callContext.storageContractAddress = contractAddress;
    inputs.callContext.sideEffectCounter = this.getSideEffectCounter();
    return inputs;
  }

  // TypedOracle

  getBlockNumber(): Promise<number> {
    return Promise.resolve(this.blockNumber);
  }

  getContractAddress(): Promise<AztecAddress> {
    return Promise.resolve(this.contractAddress);
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

  getKeyValidationRequest(pkMHash: Fr): Promise<KeyValidationRequest> {
    return this.keyStore.getKeyValidationRequest(pkMHash, this.contractAddress);
  }

  async getContractInstance(address: AztecAddress): Promise<ContractInstance> {
    const contractInstance = await this.txeDatabase.getContractInstance(address);
    if (!contractInstance) {
      throw new Error(`Contract instance not found for address ${address}`);
    }
    return Promise.resolve(contractInstance);
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

  getCompleteAddress(account: AztecAddress): Promise<CompleteAddress> {
    return Promise.resolve(this.txeDatabase.getAccount(account));
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
    return;
  }

  emitEncryptedNoteLog(_noteHashCounter: number, _encryptedNote: Buffer, _counter: number): void {
    return;
  }

  computeEncryptedNoteLog(
    contractAddress: AztecAddress,
    storageSlot: Fr,
    noteTypeId: Fr,
    ovKeys: KeyValidationRequest,
    ivpkM: Point,
    preimage: Fr[],
  ): Buffer {
    const note = new Note(preimage);
    const l1NotePayload = new L1NotePayload(note, contractAddress, storageSlot, noteTypeId);
    const taggedNote = new TaggedLog(l1NotePayload);

    const ephSk = GrumpkinScalar.random();

    const recipient = AztecAddress.random();

    return taggedNote.encrypt(ephSk, recipient, ivpkM, ovKeys);
  }

  emitUnencryptedLog(_log: UnencryptedL2Log, _counter: number): void {
    throw new Error('Method not implemented.');
  }

  emitContractClassUnencryptedLog(_log: UnencryptedL2Log, _counter: number): Fr {
    throw new Error('Method not implemented.');
  }

  async callPrivateFunction(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
    _isDelegateCall: boolean,
  ): Promise<PrivateCallStackItem> {
    this.logger.debug(
      `Calling private function ${targetContractAddress}:${functionSelector} from ${this.contractAddress}`,
    );
    const artifact = await this.contractDataOracle.getFunctionArtifact(targetContractAddress, functionSelector);

    const acir = artifact.bytecode;
    const initialWitness = await this.getInitialWitness(artifact, argsHash, targetContractAddress);
    const acvmCallback = new Oracle(this);
    const timer = new Timer();
    const acirExecutionResult = await acvm(acir, initialWitness, acvmCallback).catch((err: Error) => {
      const execError = new ExecutionError(
        err.message,
        {
          contractAddress: targetContractAddress,
          functionSelector,
        },
        extractCallStack(err, artifact.debug),
        { cause: err },
      );
      this.logger.debug(
        `Error executing private function ${targetContractAddress}:${functionSelector}\n${JSON.stringify(
          execError,
          null,
          4,
        )}`,
      );
      throw execError;
    });
    const duration = timer.ms();
    const returnWitness = witnessMapToFields(acirExecutionResult.returnWitness);
    const publicInputs = PrivateCircuitPublicInputs.fromFields(returnWitness);

    // TODO (alexg) estimate this size
    const initialWitnessSize = witnessMapToFields(initialWitness).length * Fr.SIZE_IN_BYTES;
    this.logger.debug(`Ran external function ${targetContractAddress.toString()}:${functionSelector}`, {
      circuitName: 'app-circuit',
      duration,
      eventName: 'circuit-witness-generation',
      inputSize: initialWitnessSize,
      outputSize: publicInputs.toBuffer().length,
      appCircuitName: 'noname',
    } satisfies CircuitWitnessGenerationStats);

    const callStackItem = new PrivateCallStackItem(
      targetContractAddress,
      new FunctionData(functionSelector, true),
      publicInputs,
    );
    this.sideEffectCounter += publicInputs.callContext.sideEffectCounter;

    return callStackItem;
  }

  async getInitialWitness(abi: FunctionAbi, argsHash: Fr, targetContractAddress: AztecAddress) {
    const argumentsSize = countArgumentsSize(abi);

    const args = this.packedValuesCache.unpack(argsHash);

    if (args.length !== argumentsSize) {
      throw new Error('Invalid arguments size');
    }

    const privateContextInputs = await this.getPrivateContextInputs(
      this.blockNumber - 1,
      this.contractAddress,
      targetContractAddress,
    );

    const fields = [...privateContextInputs.toFields(), ...args];

    return toACVMWitness(0, fields);
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

  emitEncryptedEventLog(
    _contractAddress: AztecAddress,
    _randomness: Fr,
    _encryptedEvent: Buffer,
    _counter: number,
  ): void {
    return;
  }

  computeEncryptedEventLog(
    _contractAddress: AztecAddress,
    _randomness: Fr,
    _eventTypeId: Fr,
    _ovKeys: KeyValidationRequest,
    _ivpkM: Point,
    _preimage: Fr[],
  ): Buffer {
    throw new Error('Method not implemented.');
  }
}
