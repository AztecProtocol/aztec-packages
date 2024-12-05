import {
  AuthWitness,
  Body,
  L2Block,
  MerkleTreeId,
  MerkleTreeReadOperations,
  type MerkleTreeWriteOperations,
  Note,
  type NoteStatus,
  NullifierMembershipWitness,
  PublicDataWitness,
  PublicExecutionRequest,
  SimulationError,
  TxEffect,
  TxHash,
  type UnencryptedL2Log,
} from '@aztec/circuit-types';
import { type CircuitWitnessGenerationStats } from '@aztec/circuit-types/stats';
import {
  BlockHeader,
  AppendOnlyTreeSnapshot,
  CallContext,
  type ContractInstance,
  type ContractInstanceWithAddress,
  DEPLOYER_CONTRACT_ADDRESS,
  Gas,
  GasFees,
  GlobalVariables,
  IndexedTaggingSecret,
  type KeyValidationRequest,
  type L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NULLIFIER_SUBTREE_HEIGHT,
  type NULLIFIER_TREE_HEIGHT,
  type NullifierLeafPreimage,
  PRIVATE_CONTEXT_INPUTS_LENGTH,
  type PUBLIC_DATA_TREE_HEIGHT,
  PUBLIC_DISPATCH_SELECTOR,
  PrivateContextInputs,
  type PrivateLog,
  PublicDataTreeLeaf,
  type PublicDataTreeLeafPreimage,
  PublicDataWrite,
  computeContractClassId,
  computeTaggingSecret,
  deriveKeys,
  getContractClassFromArtifact,
} from '@aztec/circuits.js';
import { Schnorr } from '@aztec/circuits.js/barretenberg';
import {
  computeNoteHashNonce,
  computePublicDataTreeLeafSlot,
  computeUniqueNoteHash,
  siloNoteHash,
  siloNullifier,
} from '@aztec/circuits.js/hash';
import { makeAppendOnlyTreeSnapshot, makeHeader } from '@aztec/circuits.js/testing';
import {
  type ContractArtifact,
  type FunctionAbi,
  FunctionSelector,
  type NoteSelector,
  countArgumentsSize,
} from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { padArrayEnd } from '@aztec/foundation/collection';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, applyStringFormatting } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { type KeyStore } from '@aztec/key-store';
import { ContractDataOracle, SimulatorOracle, enrichPublicSimulationError } from '@aztec/pxe';
import {
  ExecutionError,
  ExecutionNoteCache,
  type MessageLoadOracleInputs,
  type NoteData,
  Oracle,
  type PackedValuesCache,
  type PublicTxResult,
  PublicTxSimulator,
  type TypedOracle,
  acvm,
  createSimulationError,
  extractCallStack,
  extractPrivateCircuitPublicInputs,
  pickNotes,
  resolveAssertionMessageFromError,
  toACVMWitness,
  witnessMapToFields,
} from '@aztec/simulator';
import { createTxForPublicCall } from '@aztec/simulator/public/fixtures';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { type MerkleTrees, type NativeWorldStateService } from '@aztec/world-state';

import { TXENode } from '../node/txe_node.js';
import { type TXEDatabase } from '../util/txe_database.js';
import { TXEPublicContractDataSource } from '../util/txe_public_contract_data_source.js';
import { TXEWorldStateDB } from '../util/txe_world_state_db.js';

export class TXE implements TypedOracle {
  private blockNumber = 1;
  private sideEffectCounter = 0;
  private contractAddress: AztecAddress;
  private msgSender: AztecAddress;
  private functionSelector = FunctionSelector.fromField(new Fr(0));
  private isStaticCall = false;
  // Return/revert data of the latest nested call.
  private nestedCallReturndata: Fr[] = [];

  private contractDataOracle: ContractDataOracle;
  private simulatorOracle: SimulatorOracle;

  private version: Fr = Fr.ONE;
  private chainId: Fr = Fr.ONE;

  private siloedNoteHashesFromPublic: Fr[] = [];
  private siloedNullifiersFromPublic: Fr[] = [];

  private manuallyCreatedNoteHashes: Fr[] = [];
  private manuallyCreatedNullifiers: Fr[] = [];

  private publicDataWrites: PublicDataWrite[] = [];
  private privateLogs: PrivateLog[] = [];
  private publicLogs: UnencryptedL2Log[] = [];

  private committedBlocks = new Set<number>();

  private node = new TXENode(this.blockNumber);

  constructor(
    private logger: Logger,
    private trees: MerkleTrees,
    private packedValuesCache: PackedValuesCache,
    private noteCache: ExecutionNoteCache,
    private keyStore: KeyStore,
    private txeDatabase: TXEDatabase,
    private nativeWorldStateService: NativeWorldStateService,
    private baseFork: MerkleTreeWriteOperations,
  ) {
    this.contractDataOracle = new ContractDataOracle(txeDatabase);
    this.contractAddress = AztecAddress.random();
    // Default msg_sender (for entrypoints) is now Fr.max_value rather than 0 addr (see #7190 & #7404)
    this.msgSender = AztecAddress.fromField(Fr.MAX_FIELD_VALUE);
    this.simulatorOracle = new SimulatorOracle(this.contractDataOracle, txeDatabase, keyStore, this.node);
  }

  // Utils

  getNativeWorldStateService() {
    return this.nativeWorldStateService;
  }

  getBaseFork() {
    return this.baseFork;
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

  setMsgSender(msgSender: AztecAddress) {
    this.msgSender = msgSender;
  }

  setFunctionSelector(functionSelector: FunctionSelector) {
    this.functionSelector = functionSelector;
  }

  getSideEffectsCounter() {
    return this.sideEffectCounter;
  }

  setSideEffectsCounter(sideEffectsCounter: number) {
    this.sideEffectCounter = sideEffectsCounter;
  }

  setContractAddress(contractAddress: AztecAddress) {
    this.contractAddress = contractAddress;
  }

  setBlockNumber(blockNumber: number) {
    this.blockNumber = blockNumber;
    this.node.setBlockNumber(blockNumber);
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
    sideEffectsCounter = this.sideEffectCounter,
    isStaticCall = false,
  ) {
    const snap = this.nativeWorldStateService.getSnapshot(blockNumber);
    const previousBlockState = this.nativeWorldStateService.getSnapshot(blockNumber - 1);

    const stateReference = await snap.getStateReference();
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
    const account = await this.txeDatabase.getAccount(address);
    const privateKey = await this.keyStore.getMasterSecretKey(account.publicKeys.masterIncomingViewingPublicKey);
    const schnorr = new Schnorr();
    const signature = schnorr.constructSignature(messageHash.toBuffer(), privateKey).toBuffer();
    const authWitness = new AuthWitness(messageHash, [...signature]);
    return this.txeDatabase.addAuthWitness(authWitness.requestHash, authWitness.witness);
  }

  async addPublicDataWrites(writes: PublicDataWrite[]) {
    this.publicDataWrites.push(...writes);

    await this.baseFork.sequentialInsert(
      MerkleTreeId.PUBLIC_DATA_TREE,
      writes.map(w => new PublicDataTreeLeaf(w.leafSlot, w.value).toBuffer()),
    );
  }

  addManuallyCreatedNoteHashes(contractAddress: AztecAddress, noteHashes: Fr[]) {
    const siloedNoteHashes = noteHashes.map(noteHash => siloNoteHash(contractAddress, noteHash));
    this.manuallyCreatedNoteHashes.push(...siloedNoteHashes);
  }

  addManuallyCreatedNullifiers(contractAddress: AztecAddress, nullifiers: Fr[]) {
    const siloedNullifiers = nullifiers.map(nullifier => siloNullifier(contractAddress, nullifier));
    this.manuallyCreatedNullifiers.push(...siloedNullifiers);
  }

  addSiloedNullifiersFromPublic(siloedNullifiers: Fr[]) {
    this.siloedNullifiersFromPublic.push(...siloedNullifiers);
  }

  addSiloedNoteHashesFromPublic(siloedNoteHashes: Fr[]) {
    this.siloedNoteHashesFromPublic.push(...siloedNoteHashes);
  }

  addPrivateLogs(contractAddress: AztecAddress, privateLogs: PrivateLog[]) {
    privateLogs.forEach(privateLog => {
      privateLog.fields[0] = poseidon2Hash([contractAddress, privateLog.fields[0]]);
    });

    this.privateLogs.push(...privateLogs);
  }

  addPublicLogs(logs: UnencryptedL2Log[]) {
    logs.forEach(log => {
      if (log.data.length < 32 * 33) {
        // TODO remove when #9835 and #9836 are fixed
        this.logger.warn(`Skipping unencrypted log with insufficient data length: ${log.data.length}`);
        return;
      }
      try {
        // TODO remove when #9835 and #9836 are fixed. The partial note logs are emitted as bytes, but encoded as Fields.
        // This means that for every 32 bytes of payload, we only have 1 byte of data.
        // Also, the tag is not stored in the first 32 bytes of the log, (that's the length of public fields now) but in the next 32.
        const correctedBuffer = Buffer.alloc(32);
        const initialOffset = 32;
        for (let i = 0; i < 32; i++) {
          const byte = Fr.fromBuffer(log.data.subarray(i * 32 + initialOffset, i * 32 + 32 + initialOffset)).toNumber();
          correctedBuffer.writeUInt8(byte, i);
        }
        const tag = new Fr(correctedBuffer);

        this.logger.verbose(`Found tagged unencrypted log with tag ${tag.toString()} in block ${this.blockNumber}`);
        this.publicLogs.push(log);
      } catch (err) {
        this.logger.warn(`Failed to add tagged log to store: ${err}`);
      }
    });
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
    const snap = this.nativeWorldStateService.getSnapshot(blockNumber);

    const index = await snap.findLeafIndex(treeId, leafValue.toBuffer());
    if (index === undefined) {
      throw new Error(`Leaf value: ${leafValue} not found in ${MerkleTreeId[treeId]} at block ${blockNumber}`);
    }
    const siblingPath = await snap.getSiblingPath(treeId, index);

    return [new Fr(index), ...siblingPath.toFields()];
  }

  async getSiblingPath(blockNumber: number, treeId: MerkleTreeId, leafIndex: Fr) {
    const snap = this.nativeWorldStateService.getSnapshot(blockNumber);

    const result = await snap.getSiblingPath(treeId, leafIndex.toBigInt());
    return result.toFields();
  }

  async getNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const snap = this.nativeWorldStateService.getSnapshot(blockNumber);

    const index = await snap.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer());
    if (!index) {
      return undefined;
    }

    const leafPreimagePromise = snap.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, index);
    const siblingPathPromise = snap.getSiblingPath<typeof NULLIFIER_TREE_HEIGHT>(
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
    const snap = this.nativeWorldStateService.getSnapshot(blockNumber);

    const lowLeafResult = await snap.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot.toBigInt());
    if (!lowLeafResult) {
      return undefined;
    } else {
      const preimage = (await snap.getLeafPreimage(
        MerkleTreeId.PUBLIC_DATA_TREE,
        lowLeafResult.index,
      )) as PublicDataTreeLeafPreimage;
      const path = await snap.getSiblingPath<typeof PUBLIC_DATA_TREE_HEIGHT>(
        MerkleTreeId.PUBLIC_DATA_TREE,
        lowLeafResult.index,
      );
      return new PublicDataWitness(lowLeafResult.index, preimage, path);
    }
  }

  async getLowNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const snap = this.nativeWorldStateService.getSnapshot(blockNumber);

    const findResult = await snap.getPreviousValueIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBigInt());
    if (!findResult) {
      return undefined;
    }
    const { index, alreadyPresent } = findResult;
    if (alreadyPresent) {
      this.logger.warn(`Nullifier ${nullifier.toBigInt()} already exists in the tree`);
    }
    const preimageData = (await snap.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, index))!;

    const siblingPath = await snap.getSiblingPath<typeof NULLIFIER_TREE_HEIGHT>(
      MerkleTreeId.NULLIFIER_TREE,
      BigInt(index),
    );
    return new NullifierMembershipWitness(BigInt(index), preimageData as NullifierLeafPreimage, siblingPath);
  }

  async getBlockHeader(blockNumber: number): Promise<BlockHeader | undefined> {
    const snap = this.nativeWorldStateService.getSnapshot(blockNumber);

    const previousBlockState = this.nativeWorldStateService.getSnapshot(blockNumber - 1);

    const header = BlockHeader.empty();
    header.globalVariables.blockNumber = new Fr(blockNumber);
    header.state = await snap.getStateReference();
    header.lastArchive.root = Fr.fromBuffer((await previousBlockState.getTreeInfo(MerkleTreeId.ARCHIVE)).root);

    return Promise.resolve(header);
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

  async getNotes(
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
    const syncedNotes = await this.simulatorOracle.getNotes(this.contractAddress, storageSlot, _status);
    const pendingNotes = this.noteCache.getNotes(this.contractAddress, storageSlot);

    const notesToFilter = [...pendingNotes, ...syncedNotes];

    const notes = pickNotes<NoteData>(notesToFilter, {
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

    return notes;
  }

  notifyCreatedNote(storageSlot: Fr, _noteTypeId: NoteSelector, noteItems: Fr[], noteHash: Fr, counter: number) {
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
    this.sideEffectCounter = counter + 1;
    return Promise.resolve();
  }

  notifyNullifiedNote(innerNullifier: Fr, noteHash: Fr, counter: number) {
    this.noteCache.nullifyNote(this.contractAddress, innerNullifier, noteHash);
    this.sideEffectCounter = counter + 1;
    return Promise.resolve();
  }

  async checkNullifierExists(innerNullifier: Fr): Promise<boolean> {
    const snap = this.nativeWorldStateService.getSnapshot(this.blockNumber - 1);

    const nullifier = siloNullifier(this.contractAddress, innerNullifier!);
    const index = await snap.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer());
    return index !== undefined;
  }

  getL1ToL2MembershipWitness(
    _contractAddress: AztecAddress,
    _messageHash: Fr,
    _secret: Fr,
  ): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
    throw new Error('Method not implemented.');
  }

  async storageRead(
    contractAddress: AztecAddress,
    startStorageSlot: Fr,
    blockNumber: number,
    numberOfElements: number,
  ): Promise<Fr[]> {
    let db: MerkleTreeReadOperations;
    if (blockNumber === this.blockNumber) {
      db = this.baseFork;
    } else {
      db = this.nativeWorldStateService.getSnapshot(blockNumber);
    }

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
    const publicDataWrites = values.map((value, i) => {
      const storageSlot = startStorageSlot.add(new Fr(i));
      this.logger.debug(`Oracle storage write: slot=${storageSlot.toString()} value=${value}`);
      return new PublicDataWrite(computePublicDataTreeLeafSlot(this.contractAddress, storageSlot), value);
    });

    await this.addPublicDataWrites(publicDataWrites);
    return publicDataWrites.map(write => write.value);
  }

  async commitState() {
    const blockNumber = await this.getBlockNumber();
    if (this.committedBlocks.has(blockNumber)) {
      throw new Error('Already committed state');
    } else {
      this.committedBlocks.add(blockNumber);
    }

    const fork = this.baseFork;

    const txEffect = TxEffect.empty();

    let i = 0;
    txEffect.noteHashes = [
      ...this.noteCache
        .getAllNotes()
        .map(pendingNote =>
          siloNoteHash(
            pendingNote.note.contractAddress,
            computeUniqueNoteHash(
              computeNoteHashNonce(new Fr(this.blockNumber + 6969), i++),
              pendingNote.noteHashForConsumption,
            ),
          ),
        ),
      ...this.manuallyCreatedNoteHashes,
      ...this.siloedNoteHashesFromPublic,
    ];
    txEffect.nullifiers = [
      new Fr(blockNumber + 6969),
      ...this.noteCache.getAllNullifiers(),
      ...this.manuallyCreatedNullifiers,
      ...this.siloedNullifiersFromPublic,
    ];
    txEffect.publicDataWrites = this.publicDataWrites;

    txEffect.noteHashes = txEffect.noteHashes.filter((noteHash, i) => {
      const foundNoteHashIndex = txEffect.noteHashes.findIndex(otherNoteHash => otherNoteHash.equals(noteHash));
      return i === foundNoteHashIndex;
    });

    txEffect.nullifiers = txEffect.nullifiers.filter((nullifier, i) => {
      const foundNullifierIndex = txEffect.nullifiers.findIndex(otherNullifier => otherNullifier.equals(nullifier));
      return i === foundNullifierIndex;
    });

    // Using block number itself, (without adding 6969) gets killed at 1 as it says the slot is already used,
    // it seems like we commit a 1 there to the trees before ? To see what I mean, uncomment these lines below
    // let index = await (await this.trees.getLatest()).findLeafIndex(MerkleTreeId.NULLIFIER_TREE, Fr.ONE.toBuffer());
    // console.log('INDEX OF ONE', index);
    // index = await (await this.trees.getLatest()).findLeafIndex(MerkleTreeId.NULLIFIER_TREE, Fr.random().toBuffer());
    // console.log('INDEX OF RANDOM', index);

    const body = new Body([txEffect]);

    const txsEffectsHash = body.getTxsEffectsHash();

    const l2Block = new L2Block(
      makeAppendOnlyTreeSnapshot(blockNumber + 1),
      makeHeader(0, blockNumber, blockNumber, txsEffectsHash),
      body,
    );

    const paddedTxEffects = padArrayEnd(
      l2Block.body.txEffects,
      TxEffect.empty(),
      l2Block.body.numberOfTxsIncludingPadded,
    );

    const l1ToL2Messages = Array(16).fill(0).map(Fr.zero);

    {
      const noteHashesPadded = paddedTxEffects.flatMap(txEffect =>
        padArrayEnd(txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
      );
      await fork.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, noteHashesPadded);

      await fork.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2Messages);
    }

    {
      for (const txEffect of paddedTxEffects) {
        // We do not need to add public data writes because we apply them as we go. We use the sequentialInsert because
        // the batchInsert was not working when updating a previously updated slot.

        const nullifiersPadded = padArrayEnd(txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX);

        await fork.batchInsert(
          MerkleTreeId.NULLIFIER_TREE,
          nullifiersPadded.map(nullifier => nullifier.toBuffer()),
          NULLIFIER_SUBTREE_HEIGHT,
        );
      }
    }

    this.node.setTxEffect(blockNumber, new TxHash(new Fr(blockNumber).toBuffer()), txEffect);
    this.node.setNullifiersIndexesWithBlock(blockNumber, txEffect.nullifiers);
    this.node.addNoteLogsByTags(this.blockNumber, this.privateLogs);
    this.node.addPublicLogsByTags(this.blockNumber, this.publicLogs);

    const state = await fork.getStateReference();
    l2Block.header.state = state;
    await fork.updateArchive(l2Block.header);

    const archiveState = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);

    l2Block.archive = new AppendOnlyTreeSnapshot(Fr.fromBuffer(archiveState.root), Number(archiveState.size));

    await this.nativeWorldStateService.handleL2BlockAndMessages(l2Block, l1ToL2Messages);

    this.privateLogs = [];
    this.publicLogs = [];
    this.manuallyCreatedNoteHashes = [];
    this.manuallyCreatedNullifiers = [];
    this.siloedNoteHashesFromPublic = [];
    this.siloedNullifiersFromPublic = [];
    this.publicDataWrites = [];
    this.noteCache = new ExecutionNoteCache(new Fr(1));
  }

  emitContractClassLog(_log: UnencryptedL2Log, _counter: number): Fr {
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
    const currentContractAddress = this.contractAddress;
    const currentMessageSender = this.msgSender;
    const currentFunctionSelector = FunctionSelector.fromField(this.functionSelector.toField());
    this.setMsgSender(this.contractAddress);
    this.setContractAddress(targetContractAddress);
    this.setFunctionSelector(functionSelector);

    const artifact = await this.contractDataOracle.getFunctionArtifact(targetContractAddress, functionSelector);

    const acir = artifact.bytecode;
    const initialWitness = await this.getInitialWitness(artifact, argsHash, sideEffectCounter, isStaticCall);
    const acvmCallback = new Oracle(this);
    const timer = new Timer();
    const acirExecutionResult = await acvm(acir, initialWitness, acvmCallback).catch((err: Error) => {
      err.message = resolveAssertionMessageFromError(err, artifact);

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
    this.sideEffectCounter = endSideEffectCounter.toNumber() + 1;

    this.addPrivateLogs(
      targetContractAddress,
      publicInputs.privateLogs.filter(privateLog => !privateLog.isEmpty()).map(privateLog => privateLog.log),
    );

    this.addManuallyCreatedNoteHashes(
      targetContractAddress,
      publicInputs.noteHashes.filter(noteHash => !noteHash.isEmpty()).map(noteHash => noteHash.value),
    );

    this.addManuallyCreatedNullifiers(
      targetContractAddress,
      publicInputs.nullifiers.filter(nullifier => !nullifier.isEmpty()).map(nullifier => nullifier.value),
    );

    this.setContractAddress(currentContractAddress);
    this.setMsgSender(currentMessageSender);
    this.setFunctionSelector(currentFunctionSelector);

    return { endSideEffectCounter, returnsHash: publicInputs.returnsHash };
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
    const privateContextInputsAsFields = privateContextInputs.toFields();
    if (privateContextInputsAsFields.length !== PRIVATE_CONTEXT_INPUTS_LENGTH) {
      throw new Error('Invalid private context inputs size');
    }

    const fields = [...privateContextInputsAsFields, ...args];
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

  private async executePublicFunction(args: Fr[], callContext: CallContext, isTeardown: boolean = false) {
    const executionRequest = new PublicExecutionRequest(callContext, args);

    const db = this.baseFork;
    const worldStateDb = new TXEWorldStateDB(db, new TXEPublicContractDataSource(this), this);

    const globalVariables = GlobalVariables.empty();
    globalVariables.chainId = this.chainId;
    globalVariables.version = this.version;
    globalVariables.blockNumber = new Fr(this.blockNumber);
    globalVariables.gasFees = new GasFees(1, 1);

    // If the contract instance exists in the TXE's world state, make sure its nullifier is present in the tree
    // so its nullifier check passes.
    if ((await worldStateDb.getContractInstance(callContext.contractAddress)) !== undefined) {
      const contractAddressNullifier = siloNullifier(
        AztecAddress.fromNumber(DEPLOYER_CONTRACT_ADDRESS),
        callContext.contractAddress.toField(),
      );
      if ((await worldStateDb.getNullifierIndex(contractAddressNullifier)) === undefined) {
        await db.batchInsert(MerkleTreeId.NULLIFIER_TREE, [contractAddressNullifier.toBuffer()], 0);
      }
    }

    const simulator = new PublicTxSimulator(
      db,
      new TXEWorldStateDB(db, new TXEPublicContractDataSource(this), this),
      new NoopTelemetryClient(),
      globalVariables,
    );

    // When setting up a teardown call, we tell it that
    // private execution used Gas(1, 1) so it can compute a tx fee.
    const gasUsedByPrivate = isTeardown ? new Gas(1, 1) : Gas.empty();
    const tx = createTxForPublicCall(executionRequest, gasUsedByPrivate, isTeardown);

    const result = await simulator.simulate(tx);

    this.addPublicLogs(tx.unencryptedLogs.unrollLogs());

    return Promise.resolve(result);
  }

  async enqueuePublicFunctionCall(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
    _sideEffectCounter: number,
    isStaticCall: boolean,
    isTeardown = false,
  ): Promise<Fr> {
    // Store and modify env
    const currentContractAddress = this.contractAddress;
    const currentMessageSender = this.msgSender;
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

    const executionResult = await this.executePublicFunction(args, callContext, isTeardown);

    // Poor man's revert handling
    if (!executionResult.revertCode.isOK()) {
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
    const sideEffects = executionResult.avmProvingRequest.inputs.output.accumulatedData;
    const publicDataWrites = sideEffects.publicDataWrites.filter(s => !s.isEmpty());
    const noteHashes = sideEffects.noteHashes.filter(s => !s.isEmpty());
    const nullifiers = sideEffects.nullifiers.filter(s => !s.isEmpty());
    await this.addPublicDataWrites(publicDataWrites);
    this.addSiloedNoteHashesFromPublic(noteHashes);
    this.addSiloedNullifiersFromPublic(nullifiers);

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
      /*isTeardown=*/ true,
    );
  }

  notifySetMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter: number) {
    this.noteCache.setMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter);
  }

  debugLog(message: string, fields: Fr[]): void {
    this.logger.verbose(`${applyStringFormatting(message, fields)}`, { module: `${this.logger.module}:debug_log` });
  }

  async incrementAppTaggingSecretIndexAsSender(sender: AztecAddress, recipient: AztecAddress): Promise<void> {
    const appSecret = await this.#calculateTaggingSecret(this.contractAddress, sender, recipient);
    const [index] = await this.txeDatabase.getTaggingSecretsIndexesAsSender([appSecret]);
    await this.txeDatabase.setTaggingSecretsIndexesAsSender([new IndexedTaggingSecret(appSecret, index + 1)]);
  }

  async getAppTaggingSecretAsSender(sender: AztecAddress, recipient: AztecAddress): Promise<IndexedTaggingSecret> {
    const secret = await this.#calculateTaggingSecret(this.contractAddress, sender, recipient);
    const [index] = await this.txeDatabase.getTaggingSecretsIndexesAsSender([secret]);
    return new IndexedTaggingSecret(secret, index);
  }

  async #calculateTaggingSecret(contractAddress: AztecAddress, sender: AztecAddress, recipient: AztecAddress) {
    const senderCompleteAddress = await this.getCompleteAddress(sender);
    const senderIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(sender);
    const sharedSecret = computeTaggingSecret(senderCompleteAddress, senderIvsk, recipient);
    // Silo the secret to the app so it can't be used to track other app's notes
    const siloedSecret = poseidon2Hash([sharedSecret.x, sharedSecret.y, contractAddress]);
    return siloedSecret;
  }

  async syncNotes() {
    const taggedLogsByRecipient = await this.simulatorOracle.syncTaggedLogs(
      this.contractAddress,
      await this.getBlockNumber(),
      undefined,
    );

    for (const [recipient, taggedLogs] of taggedLogsByRecipient.entries()) {
      await this.simulatorOracle.processTaggedLogs(taggedLogs, AztecAddress.fromString(recipient));
    }

    return Promise.resolve();
  }

  // AVM oracles

  async avmOpcodeCall(targetContractAddress: AztecAddress, args: Fr[], isStaticCall: boolean): Promise<PublicTxResult> {
    // Store and modify env
    const currentContractAddress = this.contractAddress;
    const currentMessageSender = this.msgSender;
    this.setMsgSender(this.contractAddress);
    this.setContractAddress(targetContractAddress);

    const callContext = new CallContext(
      /* msgSender */ currentContractAddress,
      targetContractAddress,
      FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR)),
      isStaticCall,
    );

    const executionResult = await this.executePublicFunction(args, callContext);
    // Save return/revert data for later.
    this.nestedCallReturndata = executionResult.processedPhases[0]!.returnValues[0].values!;

    // Apply side effects
    if (executionResult.revertCode.isOK()) {
      const sideEffects = executionResult.avmProvingRequest.inputs.output.accumulatedData;
      const publicDataWrites = sideEffects.publicDataWrites.filter(s => !s.isEmpty());
      const noteHashes = sideEffects.noteHashes.filter(s => !s.isEmpty());
      const nullifiers = sideEffects.nullifiers.filter(s => !s.isEmpty());
      await this.addPublicDataWrites(publicDataWrites);
      this.addSiloedNoteHashesFromPublic(noteHashes);
      this.addSiloedNullifiersFromPublic(nullifiers);
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

  // Does this also get nullifiers created by a previous enqueued call ?
  async avmOpcodeNullifierExists(innerNullifier: Fr, targetAddress: AztecAddress): Promise<boolean> {
    const snap = this.nativeWorldStateService.getSnapshot(this.blockNumber - 1);

    const nullifier = siloNullifier(targetAddress, innerNullifier!);
    const index = await snap.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer());
    return index !== undefined;
  }

  avmOpcodeEmitNullifier(nullifier: Fr) {
    const siloedNullifier = siloNullifier(this.contractAddress, nullifier);
    this.addSiloedNullifiersFromPublic([siloedNullifier]);
    return Promise.resolve();
  }

  avmOpcodeEmitNoteHash(noteHash: Fr) {
    const siloedNoteHash = siloNoteHash(this.contractAddress, noteHash);
    this.addSiloedNoteHashesFromPublic([siloedNoteHash]);
    return Promise.resolve();
  }

  async avmOpcodeStorageRead(slot: Fr) {
    const leafSlot = computePublicDataTreeLeafSlot(this.contractAddress, slot);

    const lowLeafResult = await this.baseFork.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot.toBigInt());
    if (!lowLeafResult || !lowLeafResult.alreadyPresent) {
      return Fr.ZERO;
    }

    const preimage = (await this.baseFork.getLeafPreimage(
      MerkleTreeId.PUBLIC_DATA_TREE,
      lowLeafResult.index,
    )) as PublicDataTreeLeafPreimage;

    return preimage.value;
  }
}
