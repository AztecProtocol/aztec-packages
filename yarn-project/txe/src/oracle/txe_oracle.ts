import {
  AuthWitness,
  MerkleTreeId,
  Note,
  type NoteStatus,
  NullifierMembershipWitness,
  PublicDataWitness,
  PublicDataWrite,
  PublicExecutionRequest,
  SimulationError,
  type UnencryptedL2Log,
} from '@aztec/circuit-types';
import { type CircuitWitnessGenerationStats } from '@aztec/circuit-types/stats';
import {
  CallContext,
  CombinedConstantData,
  type ContractInstance,
  type ContractInstanceWithAddress,
  Gas,
  Header,
  IndexedTaggingSecret,
  type KeyValidationRequest,
  NULLIFIER_SUBTREE_HEIGHT,
  type NULLIFIER_TREE_HEIGHT,
  type NullifierLeafPreimage,
  PUBLIC_DATA_SUBTREE_HEIGHT,
  type PUBLIC_DATA_TREE_HEIGHT,
  PUBLIC_DISPATCH_SELECTOR,
  PrivateContextInputs,
  PublicDataTreeLeaf,
  type PublicDataTreeLeafPreimage,
  TxContext,
  computeContractClassId,
  computeTaggingSecret,
  deriveKeys,
  getContractClassFromArtifact,
} from '@aztec/circuits.js';
import { Schnorr } from '@aztec/circuits.js/barretenberg';
import { computePublicDataTreeLeafSlot, siloNoteHash, siloNullifier } from '@aztec/circuits.js/hash';
import {
  type ContractArtifact,
  type FunctionAbi,
  FunctionSelector,
  type NoteSelector,
  countArgumentsSize,
} from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, applyStringFormatting } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { type KeyStore } from '@aztec/key-store';
import { ContractDataOracle, enrichPublicSimulationError } from '@aztec/pxe';
import {
  ExecutionError,
  type ExecutionNoteCache,
  type MessageLoadOracleInputs,
  type NoteData,
  Oracle,
  type PackedValuesCache,
  PublicExecutor,
  type TypedOracle,
  acvm,
  createSimulationError,
  extractCallStack,
  extractPrivateCircuitPublicInputs,
  pickNotes,
  toACVMWitness,
  witnessMapToFields,
} from '@aztec/simulator';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { MerkleTreeSnapshotOperationsFacade, type MerkleTrees } from '@aztec/world-state';

import { type TXEDatabase } from '../util/txe_database.js';
import { TXEPublicContractDataSource } from '../util/txe_public_contract_data_source.js';
import { TXEWorldStateDB } from '../util/txe_world_state_db.js';

export class TXE implements TypedOracle {
  private blockNumber = 0;
  private sideEffectsCounter = 0;
  private contractAddress: AztecAddress;
  private msgSender: AztecAddress;
  private functionSelector = FunctionSelector.fromField(new Fr(0));
  private isStaticCall = false;
  // Return/revert data of the latest nested call.
  private nestedCallReturndata: Fr[] = [];

  private contractDataOracle: ContractDataOracle;

  private version: Fr = Fr.ONE;
  private chainId: Fr = Fr.ONE;

  constructor(
    private logger: Logger,
    private trees: MerkleTrees,
    private packedValuesCache: PackedValuesCache,
    private noteCache: ExecutionNoteCache,
    private keyStore: KeyStore,
    private txeDatabase: TXEDatabase,
  ) {
    this.contractDataOracle = new ContractDataOracle(txeDatabase);
    this.contractAddress = AztecAddress.random();
    // Default msg_sender (for entrypoints) is now Fr.max_value rather than 0 addr (see #7190 & #7404)
    this.msgSender = AztecAddress.fromField(Fr.MAX_FIELD_VALUE);
  }

  // Utils

  async #getTreesAt(blockNumber: number) {
    const db =
      blockNumber === (await this.getBlockNumber())
        ? await this.trees.getLatest()
        : new MerkleTreeSnapshotOperationsFacade(this.trees, blockNumber);
    return db;
  }

  getChainId() {
    return Promise.resolve(this.chainId);
  }

  getVersion() {
    return Promise.resolve(this.version);
  }

  getMsgSender() {
    return this.msgSender;
  }

  getFunctionSelector() {
    return this.functionSelector;
  }

  setMsgSender(msgSender: Fr) {
    this.msgSender = msgSender;
  }

  setFunctionSelector(functionSelector: FunctionSelector) {
    this.functionSelector = functionSelector;
  }

  getSideEffectsCounter() {
    return this.sideEffectsCounter;
  }

  setSideEffectsCounter(sideEffectsCounter: number) {
    this.sideEffectsCounter = sideEffectsCounter;
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

  getContractDataOracle() {
    return this.contractDataOracle;
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
    sideEffectsCounter = this.sideEffectsCounter,
    isStaticCall = false,
  ) {
    const db = await this.#getTreesAt(blockNumber);
    const previousBlockState = await this.#getTreesAt(blockNumber - 1);

    const stateReference = await db.getStateReference();
    const inputs = PrivateContextInputs.empty();
    inputs.txContext.chainId = this.chainId;
    inputs.txContext.version = this.version;
    inputs.historicalHeader.globalVariables.blockNumber = new Fr(blockNumber);
    inputs.historicalHeader.state = stateReference;
    inputs.historicalHeader.lastArchive.root = Fr.fromBuffer(
      (await previousBlockState.getTreeInfo(MerkleTreeId.ARCHIVE)).root,
    );
    inputs.callContext = new CallContext(this.msgSender, this.contractAddress, this.functionSelector, isStaticCall);
    inputs.startSideEffectCounter = sideEffectsCounter;
    return inputs;
  }

  deriveKeys(secret: Fr) {
    return deriveKeys(secret);
  }

  async addAuthWitness(address: AztecAddress, messageHash: Fr) {
    const account = this.txeDatabase.getAccount(address);
    const privateKey = await this.keyStore.getMasterSecretKey(account.publicKeys.masterIncomingViewingPublicKey);
    const schnorr = new Schnorr();
    const signature = schnorr.constructSignature(messageHash.toBuffer(), privateKey).toBuffer();
    const authWitness = new AuthWitness(messageHash, [...signature]);
    return this.txeDatabase.addAuthWitness(authWitness.requestHash, authWitness.witness);
  }

  async addNullifiers(contractAddress: AztecAddress, nullifiers: Fr[]) {
    const db = await this.trees.getLatest();
    const siloedNullifiers = nullifiers.map(nullifier => siloNullifier(contractAddress, nullifier).toBuffer());

    await db.batchInsert(MerkleTreeId.NULLIFIER_TREE, siloedNullifiers, NULLIFIER_SUBTREE_HEIGHT);
  }

  async addNoteHashes(contractAddress: AztecAddress, noteHashes: Fr[]) {
    const db = await this.trees.getLatest();
    const siloedNoteHashes = noteHashes.map(noteHash => siloNoteHash(contractAddress, noteHash));
    await db.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, siloedNoteHashes);
  }

  // TypedOracle

  getBlockNumber() {
    return Promise.resolve(this.blockNumber);
  }

  getContractAddress() {
    return Promise.resolve(this.contractAddress);
  }

  setIsStaticCall(isStatic: boolean) {
    this.isStaticCall = isStatic;
  }

  getIsStaticCall() {
    return this.isStaticCall;
  }

  getRandomField() {
    return Fr.random();
  }

  packArgumentsArray(args: Fr[]) {
    return Promise.resolve(this.packedValuesCache.pack(args));
  }

  packReturns(returns: Fr[]) {
    return Promise.resolve(this.packedValuesCache.pack(returns));
  }

  unpackReturns(returnsHash: Fr) {
    return Promise.resolve(this.packedValuesCache.unpack(returnsHash));
  }

  getKeyValidationRequest(pkMHash: Fr): Promise<KeyValidationRequest> {
    return this.keyStore.getKeyValidationRequest(pkMHash, this.contractAddress);
  }

  async getContractInstance(address: AztecAddress): Promise<ContractInstance> {
    const contractInstance = await this.contractDataOracle.getContractInstance(address);
    if (!contractInstance) {
      throw new Error(`Contract instance not found for address ${address}`);
    }
    return contractInstance;
  }

  async getMembershipWitness(blockNumber: number, treeId: MerkleTreeId, leafValue: Fr): Promise<Fr[] | undefined> {
    const db = await this.#getTreesAt(blockNumber);
    const index = await db.findLeafIndex(treeId, leafValue.toBuffer());
    if (!index) {
      throw new Error(`Leaf value: ${leafValue} not found in ${MerkleTreeId[treeId]} at block ${blockNumber}`);
    }
    const siblingPath = await db.getSiblingPath(treeId, index);
    return [new Fr(index), ...siblingPath.toFields()];
  }

  async getSiblingPath(blockNumber: number, treeId: MerkleTreeId, leafIndex: Fr) {
    const committedDb = new MerkleTreeSnapshotOperationsFacade(this.trees, blockNumber);
    const result = await committedDb.getSiblingPath(treeId, leafIndex.toBigInt());
    return result.toFields();
  }

  async getNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const db = await this.#getTreesAt(blockNumber);
    const index = await db.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer());
    if (!index) {
      return undefined;
    }

    const leafPreimagePromise = db.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, index);
    const siblingPathPromise = db.getSiblingPath<typeof NULLIFIER_TREE_HEIGHT>(
      MerkleTreeId.NULLIFIER_TREE,
      BigInt(index),
    );

    const [leafPreimage, siblingPath] = await Promise.all([leafPreimagePromise, siblingPathPromise]);

    if (!leafPreimage) {
      return undefined;
    }

    return new NullifierMembershipWitness(BigInt(index), leafPreimage as NullifierLeafPreimage, siblingPath);
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

  async getHeader(blockNumber: number): Promise<Header | undefined> {
    const header = Header.empty();
    const db = await this.#getTreesAt(blockNumber);
    header.state = await db.getStateReference();
    header.globalVariables.blockNumber = new Fr(blockNumber);
    return header;
  }

  getCompleteAddress(account: AztecAddress) {
    return Promise.resolve(this.txeDatabase.getAccount(account));
  }

  getAuthWitness(messageHash: Fr) {
    return this.txeDatabase.getAuthWitness(messageHash);
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

  notifyCreatedNote(storageSlot: Fr, noteTypeId: NoteSelector, noteItems: Fr[], noteHash: Fr, counter: number) {
    const note = new Note(noteItems);
    this.noteCache.addNewNote(
      {
        contractAddress: this.contractAddress,
        storageSlot,
        nonce: Fr.ZERO, // Nonce cannot be known during private execution.
        note,
        siloedNullifier: undefined, // Siloed nullifier cannot be known for newly created note.
        noteHash,
      },
      counter,
    );
    this.sideEffectsCounter = counter + 1;
    return Promise.resolve();
  }

  notifyNullifiedNote(innerNullifier: Fr, noteHash: Fr, counter: number) {
    this.noteCache.nullifyNote(this.contractAddress, innerNullifier, noteHash);
    this.sideEffectsCounter = counter + 1;
    return Promise.resolve();
  }

  async checkNullifierExists(innerNullifier: Fr): Promise<boolean> {
    const nullifier = siloNullifier(this.contractAddress, innerNullifier!);
    const db = await this.trees.getLatest();
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

  async storageRead(
    contractAddress: Fr,
    startStorageSlot: Fr,
    blockNumber: number,
    numberOfElements: number,
  ): Promise<Fr[]> {
    const db = await this.#getTreesAt(blockNumber);
    const values = [];
    for (let i = 0n; i < numberOfElements; i++) {
      const storageSlot = startStorageSlot.add(new Fr(i));
      const leafSlot = computePublicDataTreeLeafSlot(contractAddress, storageSlot).toBigInt();

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
    const db = await this.trees.getLatest();

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

  emitEncryptedLog(_contractAddress: AztecAddress, _randomness: Fr, _encryptedNote: Buffer, counter: number): void {
    this.sideEffectsCounter = counter + 1;
    return;
  }

  emitEncryptedNoteLog(_noteHashCounter: number, _encryptedNote: Buffer, counter: number): void {
    this.sideEffectsCounter = counter + 1;
    return;
  }

  emitUnencryptedLog(_log: UnencryptedL2Log, counter: number): void {
    this.sideEffectsCounter = counter + 1;
    return;
  }

  emitContractClassUnencryptedLog(_log: UnencryptedL2Log, _counter: number): Fr {
    throw new Error('Method not implemented.');
  }

  async callPrivateFunction(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
  ) {
    this.logger.verbose(
      `Executing external function ${await this.getDebugFunctionName(
        targetContractAddress,
        functionSelector,
      )}@${targetContractAddress} isStaticCall=${isStaticCall}`,
    );

    // Store and modify env
    const currentContractAddress = AztecAddress.fromField(this.contractAddress);
    const currentMessageSender = AztecAddress.fromField(this.msgSender);
    const currentFunctionSelector = FunctionSelector.fromField(this.functionSelector.toField());
    this.setMsgSender(this.contractAddress);
    this.setContractAddress(targetContractAddress);
    this.setFunctionSelector(functionSelector);

    const artifact = await this.contractDataOracle.getFunctionArtifact(targetContractAddress, functionSelector);

    const acir = artifact.bytecode;
    const initialWitness = await this.getInitialWitness(artifact, argsHash, sideEffectCounter, isStaticCall);
    const acvmCallback = new Oracle(this);
    const timer = new Timer();
    try {
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
        this.logger.debug(`Error executing private function ${targetContractAddress}:${functionSelector}`);
        throw createSimulationError(execError);
      });
      const duration = timer.ms();
      const publicInputs = extractPrivateCircuitPublicInputs(artifact, acirExecutionResult.partialWitness);

      const initialWitnessSize = witnessMapToFields(initialWitness).length * Fr.SIZE_IN_BYTES;
      this.logger.debug(`Ran external function ${targetContractAddress.toString()}:${functionSelector}`, {
        circuitName: 'app-circuit',
        duration,
        eventName: 'circuit-witness-generation',
        inputSize: initialWitnessSize,
        outputSize: publicInputs.toBuffer().length,
        appCircuitName: 'noname',
      } satisfies CircuitWitnessGenerationStats);

      // Apply side effects
      const endSideEffectCounter = publicInputs.endSideEffectCounter;
      this.sideEffectsCounter = endSideEffectCounter.toNumber() + 1;

      await this.addNullifiers(
        targetContractAddress,
        publicInputs.nullifiers.filter(nullifier => !nullifier.isEmpty()).map(nullifier => nullifier.value),
      );

      await this.addNoteHashes(
        targetContractAddress,
        publicInputs.noteHashes.filter(noteHash => !noteHash.isEmpty()).map(noteHash => noteHash.value),
      );

      return { endSideEffectCounter, returnsHash: publicInputs.returnsHash };
    } finally {
      this.setContractAddress(currentContractAddress);
      this.setMsgSender(currentMessageSender);
      this.setFunctionSelector(currentFunctionSelector);
    }
  }

  async getInitialWitness(abi: FunctionAbi, argsHash: Fr, sideEffectCounter: number, isStaticCall: boolean) {
    const argumentsSize = countArgumentsSize(abi);

    const args = this.packedValuesCache.unpack(argsHash);

    if (args.length !== argumentsSize) {
      throw new Error('Invalid arguments size');
    }

    const privateContextInputs = await this.getPrivateContextInputs(
      this.blockNumber - 1,
      sideEffectCounter,
      isStaticCall,
    );

    const fields = [...privateContextInputs.toFields(), ...args];

    return toACVMWitness(0, fields);
  }

  public async getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined> {
    const instance = await this.contractDataOracle.getContractInstance(address);
    if (!instance) {
      return undefined;
    }
    const artifact = await this.contractDataOracle.getContractArtifact(instance!.contractClassId);
    if (!artifact) {
      return undefined;
    }

    const f = artifact.functions.find(f =>
      FunctionSelector.fromNameAndParameters(f.name, f.parameters).equals(selector),
    );
    if (!f) {
      return undefined;
    }

    return `${artifact.name}:${f.name}`;
  }

  private async executePublicFunction(args: Fr[], callContext: CallContext, counter: number) {
    const executor = new PublicExecutor(
      new TXEWorldStateDB(await this.trees.getLatest(), new TXEPublicContractDataSource(this)),
      new NoopTelemetryClient(),
    );
    const execution = new PublicExecutionRequest(callContext, args);

    const db = await this.trees.getLatest();
    const previousBlockState = await this.#getTreesAt(this.blockNumber - 1);

    const combinedConstantData = CombinedConstantData.empty();
    combinedConstantData.globalVariables.chainId = this.chainId;
    combinedConstantData.globalVariables.version = this.version;
    combinedConstantData.globalVariables.blockNumber = new Fr(this.blockNumber);
    combinedConstantData.historicalHeader.globalVariables.chainId = this.chainId;
    combinedConstantData.historicalHeader.globalVariables.version = this.version;
    combinedConstantData.historicalHeader.globalVariables.blockNumber = new Fr(this.blockNumber - 1);
    combinedConstantData.historicalHeader.state = await db.getStateReference();
    combinedConstantData.historicalHeader.lastArchive.root = Fr.fromBuffer(
      (await previousBlockState.getTreeInfo(MerkleTreeId.ARCHIVE)).root,
    );

    combinedConstantData.txContext.chainId = this.chainId;
    combinedConstantData.txContext.version = this.version;

    const executionResult = executor.simulate(
      execution,
      combinedConstantData,
      Gas.test(),
      TxContext.empty(),
      /* pendingNullifiers */ [],
      /* transactionFee */ Fr.ONE,
      counter,
    );
    return Promise.resolve(executionResult);
  }

  async enqueuePublicFunctionCall(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
  ): Promise<Fr> {
    // Store and modify env
    const currentContractAddress = AztecAddress.fromField(this.contractAddress);
    const currentMessageSender = AztecAddress.fromField(this.msgSender);
    const currentFunctionSelector = FunctionSelector.fromField(this.functionSelector.toField());
    this.setMsgSender(this.contractAddress);
    this.setContractAddress(targetContractAddress);
    this.setFunctionSelector(functionSelector);

    const callContext = new CallContext(
      /* msgSender */ currentContractAddress,
      targetContractAddress,
      FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR)),
      isStaticCall,
    );

    const args = [this.functionSelector.toField(), ...this.packedValuesCache.unpack(argsHash)];
    const newArgsHash = this.packedValuesCache.pack(args);

    const executionResult = await this.executePublicFunction(args, callContext, sideEffectCounter);

    // Poor man's revert handling
    if (executionResult.reverted) {
      if (executionResult.revertReason && executionResult.revertReason instanceof SimulationError) {
        await enrichPublicSimulationError(
          executionResult.revertReason,
          this.contractDataOracle,
          this.txeDatabase,
          this.logger,
        );
        throw new Error(executionResult.revertReason.message);
      } else {
        throw new Error(`Enqueued public function call reverted: ${executionResult.revertReason}`);
      }
    }

    // Apply side effects
    this.sideEffectsCounter = executionResult.endSideEffectCounter.toNumber() + 1;
    await this.addNoteHashes(
      targetContractAddress,
      executionResult.noteHashes.map(noteHash => noteHash.value),
    );
    await this.addNullifiers(
      targetContractAddress,
      executionResult.nullifiers.map(nullifier => nullifier.value),
    );

    this.setContractAddress(currentContractAddress);
    this.setMsgSender(currentMessageSender);
    this.setFunctionSelector(currentFunctionSelector);

    return newArgsHash;
  }

  async setPublicTeardownFunctionCall(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
  ): Promise<Fr> {
    // Definitely not right, in that the teardown should always be last.
    // But useful for executing flows.
    return await this.enqueuePublicFunctionCall(
      targetContractAddress,
      functionSelector,
      argsHash,
      sideEffectCounter,
      isStaticCall,
    );
  }

  notifySetMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter: number) {
    this.noteCache.setMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter);
  }

  debugLog(message: string, fields: Fr[]): void {
    this.logger.verbose(`debug_log ${applyStringFormatting(message, fields)}`);
  }

  emitEncryptedEventLog(
    _contractAddress: AztecAddress,
    _randomness: Fr,
    _encryptedEvent: Buffer,
    counter: number,
  ): void {
    this.sideEffectsCounter = counter + 1;
    return;
  }

  async getAppTaggingSecret(sender: AztecAddress, recipient: AztecAddress): Promise<IndexedTaggingSecret> {
    const senderCompleteAddress = await this.getCompleteAddress(sender);
    const senderIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(sender);
    const sharedSecret = computeTaggingSecret(senderCompleteAddress, senderIvsk, recipient);
    // Silo the secret to the app so it can't be used to track other app's notes
    const secret = poseidon2Hash([sharedSecret.x, sharedSecret.y, this.contractAddress]);
    const [index] = await this.txeDatabase.getTaggingSecretsIndexes([secret]);
    return new IndexedTaggingSecret(secret, index);
  }

  async getAppTaggingSecretsForSenders(recipient: AztecAddress): Promise<IndexedTaggingSecret[]> {
    const recipientCompleteAddress = await this.getCompleteAddress(recipient);
    const completeAddresses = await this.txeDatabase.getCompleteAddresses();
    // Filter out the addresses corresponding to accounts
    const accounts = await this.keyStore.getAccounts();
    const senders = completeAddresses.filter(
      completeAddress => !accounts.find(account => account.equals(completeAddress.address)),
    );
    const recipientIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(recipient);
    const secrets = senders.map(({ address: sender }) => {
      const sharedSecret = computeTaggingSecret(recipientCompleteAddress, recipientIvsk, sender);
      return poseidon2Hash([sharedSecret.x, sharedSecret.y, this.contractAddress]);
    });
    const indexes = await this.txeDatabase.getTaggingSecretsIndexes(secrets);
    return secrets.map((secret, i) => new IndexedTaggingSecret(secret, indexes[i]));
  }

  // AVM oracles

  async avmOpcodeCall(targetContractAddress: AztecAddress, args: Fr[], isStaticCall: boolean) {
    // Store and modify env
    const currentContractAddress = AztecAddress.fromField(this.contractAddress);
    const currentMessageSender = AztecAddress.fromField(this.msgSender);
    this.setMsgSender(this.contractAddress);
    this.setContractAddress(targetContractAddress);

    const callContext = new CallContext(
      /* msgSender */ currentContractAddress,
      targetContractAddress,
      FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR)),
      isStaticCall,
    );

    const executionResult = await this.executePublicFunction(args, callContext, this.sideEffectsCounter);
    // Save return/revert data for later.
    this.nestedCallReturndata = executionResult.returnValues;

    // Apply side effects
    if (!executionResult.reverted) {
      this.sideEffectsCounter = executionResult.endSideEffectCounter.toNumber() + 1;
      await this.addNoteHashes(
        targetContractAddress,
        executionResult.noteHashes.map(noteHash => noteHash.value),
      );
      await this.addNullifiers(
        targetContractAddress,
        executionResult.nullifiers.map(nullifier => nullifier.value),
      );
    }

    this.setContractAddress(currentContractAddress);
    this.setMsgSender(currentMessageSender);

    return executionResult;
  }

  avmOpcodeReturndataSize(): number {
    return this.nestedCallReturndata.length;
  }

  avmOpcodeReturndataCopy(rdOffset: number, copySize: number): Fr[] {
    return this.nestedCallReturndata.slice(rdOffset, rdOffset + copySize);
  }

  async avmOpcodeNullifierExists(innerNullifier: Fr, targetAddress: AztecAddress): Promise<boolean> {
    const nullifier = siloNullifier(targetAddress, innerNullifier!);
    const db = await this.trees.getLatest();
    const index = await db.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer());
    return index !== undefined;
  }

  async avmOpcodeEmitNullifier(nullifier: Fr) {
    const db = await this.trees.getLatest();
    const siloedNullifier = siloNullifier(this.contractAddress, nullifier);
    await db.batchInsert(MerkleTreeId.NULLIFIER_TREE, [siloedNullifier.toBuffer()], NULLIFIER_SUBTREE_HEIGHT);
    return Promise.resolve();
  }

  async avmOpcodeEmitNoteHash(noteHash: Fr) {
    const db = await this.trees.getLatest();
    const siloedNoteHash = siloNoteHash(this.contractAddress, noteHash);
    await db.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, [siloedNoteHash]);
    return Promise.resolve();
  }

  async avmOpcodeStorageRead(slot: Fr) {
    const db = await this.trees.getLatest();

    const leafSlot = computePublicDataTreeLeafSlot(this.contractAddress, slot);

    const lowLeafResult = await db.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot.toBigInt());
    if (!lowLeafResult || !lowLeafResult.alreadyPresent) {
      return Fr.ZERO;
    }

    const preimage = (await db.getLeafPreimage(
      MerkleTreeId.PUBLIC_DATA_TREE,
      lowLeafResult.index,
    )) as PublicDataTreeLeafPreimage;

    return preimage.value;
  }
}
