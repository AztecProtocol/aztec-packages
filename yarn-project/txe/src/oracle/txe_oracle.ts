import {
  AuthWitness,
  Body,
  L2Block,
  MerkleTreeId,
  type MerkleTreeReadOperations,
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
  AppendOnlyTreeSnapshot,
  BlockHeader,
  CallContext,
  type ContractInstance,
  type ContractInstanceWithAddress,
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
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  type NullifierLeafPreimage,
  PRIVATE_CONTEXT_INPUTS_LENGTH,
  type PUBLIC_DATA_TREE_HEIGHT,
  PUBLIC_DISPATCH_SELECTOR,
  PrivateContextInputs,
  type PrivateLog,
  PublicDataTreeLeaf,
  type PublicDataTreeLeafPreimage,
  PublicDataWrite,
  type PublicLog,
  computeTaggingSecretPoint,
  deriveKeys,
} from '@aztec/circuits.js';
import { Schnorr } from '@aztec/circuits.js/barretenberg';
import {
  computeNoteHashNonce,
  computePublicDataTreeLeafSlot,
  computeUniqueNoteHash,
  siloNoteHash,
  siloNullifier,
} from '@aztec/circuits.js/hash';
import {
  makeAppendOnlyTreeSnapshot,
  makeContentCommitment,
  makeGlobalVariables,
  makeHeader,
} from '@aztec/circuits.js/testing';
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
import { type LogFn, type Logger, applyStringFormatting, createDebugOnlyLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { type KeyStore } from '@aztec/key-store';
import { ContractDataOracle, SimulatorOracle, enrichPublicSimulationError } from '@aztec/pxe';
import {
  ExecutionNoteCache,
  type MessageLoadOracleInputs,
  type NoteData,
  Oracle,
  type TypedOracle,
  ViewDataOracle,
  WASMSimulator,
  extractCallStack,
  extractPrivateCircuitPublicInputs,
  pickNotes,
  toACVMWitness,
  witnessMapToFields,
} from '@aztec/simulator/client';
import { createTxForPublicCalls } from '@aztec/simulator/public/fixtures';
import {
  ExecutionError,
  type HashedValuesCache,
  type PublicTxResult,
  PublicTxSimulator,
  WorldStateDB,
  createSimulationError,
  resolveAssertionMessageFromError,
} from '@aztec/simulator/server';
import { type NativeWorldStateService } from '@aztec/world-state';

import { TXENode } from '../node/txe_node.js';
import { type TXEDatabase } from '../util/txe_database.js';
import { TXEPublicContractDataSource } from '../util/txe_public_contract_data_source.js';

export class TXE implements TypedOracle {
  private blockNumber = 1;
  private sideEffectCounter = 0;
  private msgSender: AztecAddress;
  private functionSelector = FunctionSelector.fromField(new Fr(0));
  private isStaticCall = false;
  // Return/revert data of the latest nested call.
  private nestedCallReturndata: Fr[] = [];

  private contractDataOracle: ContractDataOracle;
  private simulatorOracle: SimulatorOracle;
  private viewDataOracle: ViewDataOracle;

  private publicDataWrites: PublicDataWrite[] = [];
  private uniqueNoteHashesFromPublic: Fr[] = [];
  private siloedNullifiersFromPublic: Fr[] = [];
  private privateLogs: PrivateLog[] = [];
  private publicLogs: PublicLog[] = [];

  private committedBlocks = new Set<number>();

  private VERSION = 1;
  private CHAIN_ID = 1;

  private node: TXENode;

  private simulationProvider = new WASMSimulator();

  private noteCache: ExecutionNoteCache;

  debug: LogFn;

  private constructor(
    private logger: Logger,
    private executionCache: HashedValuesCache,
    private keyStore: KeyStore,
    private txeDatabase: TXEDatabase,
    private contractAddress: AztecAddress,
    private nativeWorldStateService: NativeWorldStateService,
    private baseFork: MerkleTreeWriteOperations,
  ) {
    this.noteCache = new ExecutionNoteCache(this.getTxRequestHash());
    this.contractDataOracle = new ContractDataOracle(txeDatabase);

    this.node = new TXENode(this.blockNumber, this.VERSION, this.CHAIN_ID, nativeWorldStateService, baseFork);

    // Default msg_sender (for entrypoints) is now Fr.max_value rather than 0 addr (see #7190 & #7404)
    this.msgSender = AztecAddress.fromField(Fr.MAX_FIELD_VALUE);
    this.simulatorOracle = new SimulatorOracle(
      this.contractDataOracle,
      txeDatabase,
      keyStore,
      this.node,
      this.simulationProvider,
    );

    this.viewDataOracle = new ViewDataOracle(
      this.contractAddress,
      [] /* authWitnesses */,
      this.simulatorOracle, // note: SimulatorOracle implements DBOracle
      this.node,
      /* log, */
      /* scopes, */
    );

    this.debug = createDebugOnlyLogger('aztec:kv-pxe-database');
  }

  static async create(
    logger: Logger,
    executionCache: HashedValuesCache,
    keyStore: KeyStore,
    txeDatabase: TXEDatabase,
    nativeWorldStateService: NativeWorldStateService,
    baseFork: MerkleTreeWriteOperations,
  ) {
    return new TXE(
      logger,
      executionCache,
      keyStore,
      txeDatabase,
      await AztecAddress.random(),
      nativeWorldStateService,
      baseFork,
    );
  }

  // Utils

  getNativeWorldStateService() {
    return this.nativeWorldStateService;
  }

  getBaseFork() {
    return this.baseFork;
  }

  getChainId(): Promise<Fr> {
    return Promise.resolve(this.node.getChainId().then(id => new Fr(id)));
  }

  getVersion(): Promise<Fr> {
    return Promise.resolve(this.node.getVersion().then(v => new Fr(v)));
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

  async addContractArtifact(contractClassId: Fr, artifact: ContractArtifact) {
    await this.txeDatabase.addContractArtifact(contractClassId, artifact);
  }

  async getPrivateContextInputs(
    blockNumber: number,
    sideEffectsCounter = this.sideEffectCounter,
    isStaticCall = false,
  ) {
    if (blockNumber > this.blockNumber) {
      throw new Error(
        `Tried to request private context inputs for ${blockNumber}, which is greater than our current block number of ${this.blockNumber}`,
      );
    } else if (blockNumber === this.blockNumber) {
      this.logger.debug(
        `Tried to request private context inputs for ${blockNumber}, equal to current block of ${this.blockNumber}. Clamping to current block - 1.`,
      );
      blockNumber = this.blockNumber - 1;
    }

    const snap = this.nativeWorldStateService.getSnapshot(blockNumber);
    const previousBlockState = this.nativeWorldStateService.getSnapshot(blockNumber - 1);

    const stateReference = await snap.getStateReference();
    const inputs = PrivateContextInputs.empty();
    inputs.txContext.chainId = new Fr(await this.node.getChainId());
    inputs.txContext.version = new Fr(await this.node.getVersion());
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
    const signature = await schnorr.constructSignature(messageHash.toBuffer(), privateKey);
    const authWitness = new AuthWitness(messageHash, [...signature.toBuffer()]);
    return this.txeDatabase.addAuthWitness(authWitness.requestHash, authWitness.witness);
  }

  async addPublicDataWrites(writes: PublicDataWrite[]) {
    this.publicDataWrites.push(...writes);

    await this.baseFork.sequentialInsert(
      MerkleTreeId.PUBLIC_DATA_TREE,
      writes.map(w => new PublicDataTreeLeaf(w.leafSlot, w.value).toBuffer()),
    );
  }

  async checkNullifiersNotInTree(contractAddress: AztecAddress, nullifiers: Fr[]) {
    const siloedNullifiers = await Promise.all(nullifiers.map(nullifier => siloNullifier(contractAddress, nullifier)));
    const db = this.baseFork;
    const nullifierIndexesInTree = await db.findLeafIndices(
      MerkleTreeId.NULLIFIER_TREE,
      siloedNullifiers.map(n => n.toBuffer()),
    );
    if (nullifierIndexesInTree.some(index => index !== undefined)) {
      throw new Error(`Rejecting tx for emitting duplicate nullifiers`);
    }
  }

  addSiloedNullifiersFromPublic(siloedNullifiers: Fr[]) {
    this.siloedNullifiersFromPublic.push(...siloedNullifiers);
  }

  addUniqueNoteHashesFromPublic(siloedNoteHashes: Fr[]) {
    this.uniqueNoteHashesFromPublic.push(...siloedNoteHashes);
  }

  async addPrivateLogs(contractAddress: AztecAddress, privateLogs: PrivateLog[]) {
    for (const privateLog of privateLogs) {
      privateLog.fields[0] = await poseidon2Hash([contractAddress, privateLog.fields[0]]);
    }

    this.privateLogs.push(...privateLogs);
  }

  addPublicLogs(logs: PublicLog[]) {
    logs.forEach(log => {
      try {
        // The first elt stores lengths => tag is in fields[1]
        const tag = log.log[1];

        this.logger.verbose(`Found tagged public log with tag ${tag.toString()} in block ${this.blockNumber}`);
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

  storeInExecutionCache(values: Fr[]) {
    return this.executionCache.store(values);
  }

  loadFromExecutionCache(returnsHash: Fr) {
    return Promise.resolve(this.executionCache.getPreimage(returnsHash));
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
    const index = (await snap.findLeafIndices(treeId, [leafValue.toBuffer()]))[0];
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

    const [index] = await snap.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]);
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
    if (blockNumber === 1) {
      // TODO: Figure out why native merkle trees cannot get snapshot of 0, as it defaults to latest
      throw new Error('Cannot get the block header of block number 1');
    }

    const snap = this.nativeWorldStateService.getSnapshot(blockNumber);
    const stateReference = await snap.getStateReference();

    const previousState = this.nativeWorldStateService.getSnapshot(blockNumber - 1);
    const archiveInfo = await previousState.getTreeInfo(MerkleTreeId.ARCHIVE);

    const header = new BlockHeader(
      new AppendOnlyTreeSnapshot(new Fr(archiveInfo.root), Number(archiveInfo.size)),
      makeContentCommitment(),
      stateReference,
      makeGlobalVariables(),
      Fr.ZERO,
      Fr.ZERO,
    );

    header.globalVariables.blockNumber = new Fr(blockNumber);

    return header;
  }

  getCompleteAddress(account: AztecAddress) {
    return Promise.resolve(this.txeDatabase.getAccount(account));
  }

  getAuthWitness(messageHash: Fr) {
    return this.txeDatabase.getAuthWitness(messageHash);
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
    status: NoteStatus,
  ) {
    // Nullified pending notes are already removed from the list.
    const pendingNotes = this.noteCache.getNotes(this.contractAddress, storageSlot);

    const pendingNullifiers = this.noteCache.getNullifiers(this.contractAddress);
    const dbNotes = await this.simulatorOracle.getNotes(this.contractAddress, storageSlot, status);
    const dbNotesFiltered = dbNotes.filter(n => !pendingNullifiers.has((n.siloedNullifier as Fr).value));

    const notes = pickNotes<NoteData>([...dbNotesFiltered, ...pendingNotes], {
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

  async notifyNullifiedNote(innerNullifier: Fr, noteHash: Fr, counter: number) {
    await this.checkNullifiersNotInTree(this.contractAddress, [innerNullifier]);
    await this.noteCache.nullifyNote(this.contractAddress, innerNullifier, noteHash);
    this.sideEffectCounter = counter + 1;
  }

  async notifyCreatedNullifier(innerNullifier: Fr): Promise<void> {
    await this.checkNullifiersNotInTree(this.contractAddress, [innerNullifier]);
    await this.noteCache.nullifierCreated(this.contractAddress, innerNullifier);
  }

  async checkNullifierExists(innerNullifier: Fr): Promise<boolean> {
    const snap = this.nativeWorldStateService.getSnapshot(this.blockNumber - 1);

    const nullifier = await siloNullifier(this.contractAddress, innerNullifier!);
    const [index] = await snap.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]);
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
      const leafSlot = (await computePublicDataTreeLeafSlot(contractAddress, storageSlot)).toBigInt();

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
    const publicDataWrites = await Promise.all(
      values.map(async (value, i) => {
        const storageSlot = startStorageSlot.add(new Fr(i));
        this.logger.debug(`Oracle storage write: slot=${storageSlot.toString()} value=${value}`);
        return new PublicDataWrite(await computePublicDataTreeLeafSlot(this.contractAddress, storageSlot), value);
      }),
    );

    await this.addPublicDataWrites(publicDataWrites);
    return publicDataWrites.map(write => write.value);
  }

  async commitState() {
    const blockNumber = await this.getBlockNumber();
    const { usedTxRequestHashForNonces } = this.noteCache.finish();
    if (this.committedBlocks.has(blockNumber)) {
      throw new Error('Already committed state');
    } else {
      this.committedBlocks.add(blockNumber);
    }

    const fork = this.baseFork;

    const txEffect = TxEffect.empty();

    const nonceGenerator = usedTxRequestHashForNonces ? this.getTxRequestHash() : this.noteCache.getAllNullifiers()[0];

    let i = 0;
    const uniqueNoteHashesFromPrivate = await Promise.all(
      this.noteCache
        .getAllNotes()
        .map(async pendingNote =>
          computeUniqueNoteHash(
            await computeNoteHashNonce(nonceGenerator, i++),
            await siloNoteHash(pendingNote.note.contractAddress, pendingNote.noteHashForConsumption),
          ),
        ),
    );
    txEffect.noteHashes = [...uniqueNoteHashesFromPrivate, ...this.uniqueNoteHashesFromPublic];

    txEffect.nullifiers = [...this.siloedNullifiersFromPublic, ...this.noteCache.getAllNullifiers()];
    if (usedTxRequestHashForNonces) {
      txEffect.nullifiers.unshift(this.getTxRequestHash());
    }

    txEffect.publicDataWrites = this.publicDataWrites;

    const body = new Body([txEffect]);

    const l2Block = new L2Block(
      makeAppendOnlyTreeSnapshot(blockNumber + 1),
      makeHeader(0, blockNumber, blockNumber),
      body,
    );

    const paddedTxEffects = l2Block.body.txEffects;

    const l1ToL2Messages = Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(0).map(Fr.zero);

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

    await this.node.setTxEffect(blockNumber, new TxHash(new Fr(blockNumber)), txEffect);
    this.node.setNullifiersIndexesWithBlock(blockNumber, txEffect.nullifiers);
    this.node.addNoteLogsByTags(this.blockNumber, this.privateLogs);
    this.node.addPublicLogsByTags(this.blockNumber, this.publicLogs);

    const stateReference = await fork.getStateReference();
    const archiveInfo = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);
    const header = new BlockHeader(
      new AppendOnlyTreeSnapshot(new Fr(archiveInfo.root), Number(archiveInfo.size)),
      makeContentCommitment(),
      stateReference,
      makeGlobalVariables(),
      Fr.ZERO,
      Fr.ZERO,
    );

    header.globalVariables.blockNumber = new Fr(blockNumber);

    l2Block.header = header;

    await fork.updateArchive(l2Block.header);

    await this.nativeWorldStateService.handleL2BlockAndMessages(l2Block, l1ToL2Messages);

    this.publicDataWrites = [];
    this.privateLogs = [];
    this.publicLogs = [];
    this.uniqueNoteHashesFromPublic = [];
    this.siloedNullifiersFromPublic = [];
    this.noteCache = new ExecutionNoteCache(this.getTxRequestHash());
  }

  getTxRequestHash() {
    // Using block number itself is invalid since indexed trees come prefilled with the first slots.
    return new Fr(this.blockNumber + 6969);
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
    const acirExecutionResult = await this.simulationProvider
      .executeUserCircuit(acir, initialWitness, acvmCallback)
      .catch((err: Error) => {
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

    await this.addPrivateLogs(
      targetContractAddress,
      publicInputs.privateLogs.filter(privateLog => !privateLog.isEmpty()).map(privateLog => privateLog.log),
    );

    this.setContractAddress(currentContractAddress);
    this.setMsgSender(currentMessageSender);
    this.setFunctionSelector(currentFunctionSelector);

    return { endSideEffectCounter, returnsHash: publicInputs.returnsHash };
  }

  async getInitialWitness(abi: FunctionAbi, argsHash: Fr, sideEffectCounter: number, isStaticCall: boolean) {
    const argumentsSize = countArgumentsSize(abi);

    const args = this.executionCache.getPreimage(argsHash);

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
    const functionSelectorsAndNames = await Promise.all(
      artifact.functions.map(async f => ({
        name: f.name,
        selector: await FunctionSelector.fromNameAndParameters(f.name, f.parameters),
      })),
    );
    const functionSelectorAndName = functionSelectorsAndNames.find(f => f.selector.equals(selector));
    if (!functionSelectorAndName) {
      return undefined;
    }

    return `${artifact.name}:${functionSelectorAndName.name}`;
  }

  private async executePublicFunction(args: Fr[], callContext: CallContext, isTeardown: boolean = false) {
    const executionRequest = new PublicExecutionRequest(callContext, args);

    const db = this.baseFork;

    const globalVariables = GlobalVariables.empty();
    globalVariables.chainId = new Fr(await this.node.getChainId());
    globalVariables.version = new Fr(await this.node.getVersion());
    globalVariables.blockNumber = new Fr(this.blockNumber);
    globalVariables.gasFees = new GasFees(1, 1);

    const simulator = new PublicTxSimulator(
      db,
      new WorldStateDB(db, new TXEPublicContractDataSource(this)),
      globalVariables,
    );

    const { usedTxRequestHashForNonces } = this.noteCache.finish();
    const firstNullifier = usedTxRequestHashForNonces ? this.getTxRequestHash() : this.noteCache.getAllNullifiers()[0];

    // When setting up a teardown call, we tell it that
    // private execution used Gas(1, 1) so it can compute a tx fee.
    const gasUsedByPrivate = isTeardown ? new Gas(1, 1) : Gas.empty();
    const tx = await createTxForPublicCalls(
      firstNullifier,
      /*setupExecutionRequests=*/ [],
      /*appExecutionRequests=*/ isTeardown ? [] : [executionRequest],
      /*teardownExecutionRequests=*/ isTeardown ? executionRequest : undefined,
      /*feePayer=*/ AztecAddress.zero(),
      gasUsedByPrivate,
    );

    const result = await simulator.simulate(tx);
    const noteHashes = result.avmProvingRequest.inputs.publicInputs.accumulatedData.noteHashes.filter(
      s => !s.isEmpty(),
    );

    const publicDataWrites = result.avmProvingRequest.inputs.publicInputs.accumulatedData.publicDataWrites.filter(
      s => !s.isEmpty(),
    );
    await this.addPublicDataWrites(publicDataWrites);

    this.addUniqueNoteHashesFromPublic(noteHashes);

    this.addPublicLogs(
      result.avmProvingRequest.inputs.publicInputs.accumulatedData.publicLogs.filter(
        log => !log.contractAddress.equals(AztecAddress.ZERO),
      ),
    );

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

    const args = [this.functionSelector.toField(), ...this.executionCache.getPreimage(argsHash)];
    const newArgsHash = await this.executionCache.store(args);

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
    const sideEffects = executionResult.avmProvingRequest.inputs.publicInputs.accumulatedData;

    const { usedTxRequestHashForNonces } = this.noteCache.finish();
    const firstNullifier = usedTxRequestHashForNonces ? this.getTxRequestHash() : this.noteCache.getAllNullifiers()[0];
    const nullifiers = sideEffects.nullifiers.filter(s => !s.isEmpty()).filter(s => !s.equals(firstNullifier));

    // For some reason we cannot move this up to 'executePublicFunction'. It gives us an error of trying to modify the same nullifier twice.
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

  async notifySetMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter: number) {
    await this.noteCache.setMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter);
  }

  debugLog(message: string, fields: Fr[]): void {
    this.logger.verbose(`${applyStringFormatting(message, fields)}`, { module: `${this.logger.module}:debug_log` });
  }

  async incrementAppTaggingSecretIndexAsSender(sender: AztecAddress, recipient: AztecAddress): Promise<void> {
    const appSecret = await this.#calculateAppTaggingSecret(this.contractAddress, sender, recipient);
    const [index] = await this.txeDatabase.getTaggingSecretsIndexesAsSender([appSecret]);
    await this.txeDatabase.setTaggingSecretsIndexesAsSender([new IndexedTaggingSecret(appSecret, index + 1)]);
  }

  async getIndexedTaggingSecretAsSender(sender: AztecAddress, recipient: AztecAddress): Promise<IndexedTaggingSecret> {
    const secret = await this.#calculateAppTaggingSecret(this.contractAddress, sender, recipient);
    const [index] = await this.txeDatabase.getTaggingSecretsIndexesAsSender([secret]);
    return new IndexedTaggingSecret(secret, index);
  }

  async #calculateAppTaggingSecret(contractAddress: AztecAddress, sender: AztecAddress, recipient: AztecAddress) {
    const senderCompleteAddress = await this.getCompleteAddress(sender);
    const senderIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(sender);
    const secretPoint = await computeTaggingSecretPoint(senderCompleteAddress, senderIvsk, recipient);
    // Silo the secret to the app so it can't be used to track other app's notes
    const appSecret = poseidon2Hash([secretPoint.x, secretPoint.y, contractAddress]);
    return appSecret;
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

    await this.simulatorOracle.removeNullifiedNotes(this.contractAddress);

    return Promise.resolve();
  }

  deliverNote(
    _contractAddress: AztecAddress,
    _storageSlot: Fr,
    _nonce: Fr,
    _content: Fr[],
    _noteHash: Fr,
    _nullifier: Fr,
    _txHash: Fr,
    _recipient: AztecAddress,
  ): Promise<void> {
    throw new Error('deliverNote');
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
      const sideEffects = executionResult.avmProvingRequest.inputs.publicInputs.accumulatedData;
      const publicDataWrites = sideEffects.publicDataWrites.filter(s => !s.isEmpty());
      const noteHashes = sideEffects.noteHashes.filter(s => !s.isEmpty());
      const { usedTxRequestHashForNonces } = this.noteCache.finish();
      const firstNullifier = usedTxRequestHashForNonces
        ? this.getTxRequestHash()
        : this.noteCache.getAllNullifiers()[0];
      const nullifiers = sideEffects.nullifiers.filter(s => !s.isEmpty()).filter(s => !s.equals(firstNullifier));
      await this.addPublicDataWrites(publicDataWrites);
      this.addUniqueNoteHashesFromPublic(noteHashes);
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

  async avmOpcodeNullifierExists(innerNullifier: Fr, targetAddress: AztecAddress): Promise<boolean> {
    const nullifier = await siloNullifier(targetAddress, innerNullifier!);
    const db = this.baseFork;
    const index = (await db.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]))[0];
    return index !== undefined;
  }

  async avmOpcodeEmitNullifier(nullifier: Fr) {
    const siloedNullifier = await siloNullifier(this.contractAddress, nullifier);
    this.addSiloedNullifiersFromPublic([siloedNullifier]);

    return Promise.resolve();
  }

  // Doesn't this need to get hashed w/ the nonce ?
  async avmOpcodeEmitNoteHash(noteHash: Fr) {
    const siloedNoteHash = await siloNoteHash(this.contractAddress, noteHash);
    this.addUniqueNoteHashesFromPublic([siloedNoteHash]);
    return Promise.resolve();
  }

  async avmOpcodeStorageRead(slot: Fr) {
    const leafSlot = await computePublicDataTreeLeafSlot(this.contractAddress, slot);

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

  storeCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.txeDatabase.storeCapsule(this.contractAddress, slot, capsule);
  }

  loadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.txeDatabase.loadCapsule(this.contractAddress, slot);
  }

  deleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.txeDatabase.deleteCapsule(this.contractAddress, slot);
  }

  copyCapsule(contractAddress: AztecAddress, srcSlot: Fr, dstSlot: Fr, numEntries: number): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.txeDatabase.copyCapsule(this.contractAddress, srcSlot, dstSlot, numEntries);
  }

  aes128Decrypt(ciphertext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer> {
    return this.viewDataOracle.aes128Decrypt(ciphertext, iv, symKey);
  }
}
