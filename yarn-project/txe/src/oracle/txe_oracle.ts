import { type AztecNode, Body, L2Block, Note } from '@aztec/aztec.js';
import {
  DEFAULT_GAS_LIMIT,
  DEFAULT_TEARDOWN_GAS_LIMIT,
  type L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_L2_GAS_PER_TX_PUBLIC_PORTION,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  NULLIFIER_SUBTREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  PRIVATE_CONTEXT_INPUTS_LENGTH,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Aes128, Schnorr, poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr, Point } from '@aztec/foundation/fields';
import { type Logger, applyStringFormatting } from '@aztec/foundation/log';
import { TestDateProvider, Timer } from '@aztec/foundation/timer';
import { KeyStore } from '@aztec/key-store';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import type { ProtocolContract } from '@aztec/protocol-contracts';
import {
  AddressDataProvider,
  CapsuleDataProvider,
  NoteDataProvider,
  PXEOracleInterface,
  PrivateEventDataProvider,
  SyncDataProvider,
  TaggingDataProvider,
  enrichPublicSimulationError,
} from '@aztec/pxe/server';
import {
  ExecutionNoteCache,
  HashedValuesCache,
  MessageLoadOracleInputs,
  type NoteData,
  Oracle,
  PrivateExecutionOracle,
  type TypedOracle,
  UtilityExecutionOracle,
  executePrivateFunction,
  extractPrivateCircuitPublicInputs,
  generateSimulatedProvingResult,
  pickNotes,
} from '@aztec/pxe/simulator';
import { WASMSimulator, extractCallStack, toACVMWitness, witnessMapToFields } from '@aztec/simulator/client';
import { createTxForPublicCalls } from '@aztec/simulator/public/fixtures';
import {
  ExecutionError,
  GuardedMerkleTreeOperations,
  PublicContractsDB,
  PublicProcessor,
  type PublicTxResult,
  PublicTxSimulator,
  createSimulationError,
  resolveAssertionMessageFromError,
} from '@aztec/simulator/server';
import {
  type ContractArtifact,
  type FunctionAbi,
  FunctionSelector,
  FunctionType,
  type NoteSelector,
  countArgumentsSize,
} from '@aztec/stdlib/abi';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstance, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { SimulationError } from '@aztec/stdlib/errors';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import {
  computeCalldataHash,
  computeNoteHashNonce,
  computePublicDataTreeLeafSlot,
  computeUniqueNoteHash,
  computeVarArgsHash,
  siloNoteHash,
  siloNullifier,
} from '@aztec/stdlib/hash';
import type { MerkleTreeReadOperations, MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import {
  type KeyValidationRequest,
  PartialPrivateTailPublicInputsForPublic,
  PrivateContextInputs,
  PrivateKernelTailCircuitPublicInputs,
  PrivateToPublicAccumulatedData,
  PublicCallRequest,
  ScopedLogHash,
} from '@aztec/stdlib/kernel';
import { deriveKeys } from '@aztec/stdlib/keys';
import { ContractClassLog, IndexedTaggingSecret, PrivateLog, type PublicLog } from '@aztec/stdlib/logs';
import { ScopedL2ToL1Message } from '@aztec/stdlib/messaging';
import type { NoteStatus } from '@aztec/stdlib/note';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import type { CircuitWitnessGenerationStats } from '@aztec/stdlib/stats';
import {
  makeAppendOnlyTreeSnapshot,
  makeContentCommitment,
  makeGlobalVariables,
  makeHeader,
} from '@aztec/stdlib/testing';
import {
  AppendOnlyTreeSnapshot,
  MerkleTreeId,
  type NullifierLeafPreimage,
  NullifierMembershipWitness,
  PublicDataTreeLeaf,
  type PublicDataTreeLeafPreimage,
  PublicDataWitness,
} from '@aztec/stdlib/trees';
import {
  BlockHeader,
  CallContext,
  GlobalVariables,
  HashedValues,
  PrivateCallExecutionResult,
  PrivateExecutionResult,
  PublicCallRequestWithCalldata,
  Tx,
  TxConstantData,
  TxContext,
  TxEffect,
  TxHash,
  collectNested,
} from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';
import { ForkCheckpoint, NativeWorldStateService } from '@aztec/world-state/native';

import { TXEStateMachine } from '../state_machine/index.js';
import { AZTEC_SLOT_DURATION, GENESIS_TIMESTAMP } from '../txe_constants.js';
import { TXEAccountDataProvider } from '../util/txe_account_data_provider.js';
import { TXEContractDataProvider } from '../util/txe_contract_data_provider.js';
import { TXEPublicContractDataSource } from '../util/txe_public_contract_data_source.js';

export class TXE implements TypedOracle {
  private blockNumber = 1;
  private timestamp = GENESIS_TIMESTAMP;

  private sideEffectCounter = 0;
  private msgSender: AztecAddress;
  private functionSelector = FunctionSelector.fromField(new Fr(0));
  private isStaticCall = false;
  // Return/revert data of the latest nested call.
  private nestedCallReturndata: Fr[] = [];
  private nestedCallSuccess: boolean = false;

  private pxeOracleInterface: PXEOracleInterface;

  private publicDataWrites: PublicDataWrite[] = [];
  private uniqueNoteHashesFromPublic: Fr[] = [];
  private siloedNullifiersFromPublic: Fr[] = [];
  private privateLogs: PrivateLog[] = [];
  private publicLogs: PublicLog[] = [];

  private committedBlocks = new Set<number>();

  private ROLLUP_VERSION = 1;
  private CHAIN_ID = 1;

  private node: AztecNode;

  private simulator = new WASMSimulator();

  public noteCache: ExecutionNoteCache;

  private authwits: Map<string, AuthWitness> = new Map();

  private constructor(
    private logger: Logger,
    private keyStore: KeyStore,
    private contractDataProvider: TXEContractDataProvider,
    private noteDataProvider: NoteDataProvider,
    private capsuleDataProvider: CapsuleDataProvider,
    private syncDataProvider: SyncDataProvider,
    private taggingDataProvider: TaggingDataProvider,
    private addressDataProvider: AddressDataProvider,
    private privateEventDataProvider: PrivateEventDataProvider,
    private accountDataProvider: TXEAccountDataProvider,
    private executionCache: HashedValuesCache,
    private contractAddress: AztecAddress,
    private nativeWorldStateService: NativeWorldStateService,
    private baseFork: MerkleTreeWriteOperations,
    private stateMachine: TXEStateMachine,
  ) {
    this.noteCache = new ExecutionNoteCache(this.getTxRequestHash());

    this.node = stateMachine.node;

    // Default msg_sender (for entrypoints) is now Fr.max_value rather than 0 addr (see #7190 & #7404)
    this.msgSender = AztecAddress.fromField(Fr.MAX_FIELD_VALUE);

    this.pxeOracleInterface = new PXEOracleInterface(
      this.node,
      this.keyStore,
      this.contractDataProvider,
      this.noteDataProvider,
      this.capsuleDataProvider,
      this.syncDataProvider,
      this.taggingDataProvider,
      this.addressDataProvider,
      this.privateEventDataProvider,
      this.logger,
    );
  }

  static async create(logger: Logger, store: AztecAsyncKVStore, protocolContracts: ProtocolContract[]) {
    const executionCache = new HashedValuesCache();

    const stateMachine = await TXEStateMachine.create(store);
    const syncDataProvider = stateMachine.syncDataProvider;
    const nativeWorldStateService = stateMachine.synchronizer.nativeWorldStateService;
    const baseFork = await nativeWorldStateService.fork();

    const addressDataProvider = new AddressDataProvider(store);
    const privateEventDataProvider = new PrivateEventDataProvider(store);
    const contractDataProvider = new TXEContractDataProvider(store);
    const noteDataProvider = await NoteDataProvider.create(store);
    const taggingDataProvider = new TaggingDataProvider(store);
    const capsuleDataProvider = new CapsuleDataProvider(store);
    const keyStore = new KeyStore(store);

    const accountDataProvider = new TXEAccountDataProvider(store);

    // Register protocol contracts.
    for (const { contractClass, instance, artifact } of protocolContracts) {
      await contractDataProvider.addContractArtifact(contractClass.id, artifact);
      await contractDataProvider.addContractInstance(instance);
    }

    return new TXE(
      logger,
      keyStore,
      contractDataProvider,
      noteDataProvider,
      capsuleDataProvider,
      syncDataProvider,
      taggingDataProvider,
      addressDataProvider,
      privateEventDataProvider,
      accountDataProvider,
      executionCache,
      await AztecAddress.random(),
      nativeWorldStateService,
      baseFork,
      stateMachine,
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
    return Promise.resolve(new Fr(this.CHAIN_ID));
  }

  getVersion(): Promise<Fr> {
    return Promise.resolve(new Fr(this.ROLLUP_VERSION));
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

  // TODO: Currently this is only ever used to increment this.blockNumber by 1. Refactor this as `advanceBlock()`.
  setBlockNumber(blockNumber: number) {
    this.blockNumber = blockNumber;
  }

  advanceTimestampBy(duration: UInt64) {
    this.timestamp = this.timestamp + duration;
  }

  getContractDataProvider() {
    return this.contractDataProvider;
  }

  getKeyStore() {
    return this.keyStore;
  }

  getAccountDataProvider() {
    return this.accountDataProvider;
  }

  getAddressDataProvider() {
    return this.addressDataProvider;
  }

  async addContractInstance(contractInstance: ContractInstanceWithAddress) {
    await this.contractDataProvider.addContractInstance(contractInstance);
  }

  async addContractArtifact(contractClassId: Fr, artifact: ContractArtifact) {
    await this.contractDataProvider.addContractArtifact(contractClassId, artifact);
  }

  async getPrivateContextInputs(
    blockNumber: number | null,
    timestamp: UInt64 | null,
    sideEffectsCounter = this.sideEffectCounter,
    isStaticCall = false,
  ) {
    // If blockNumber or timestamp is null, use the values corresponding to the latest historical block (number of
    // the block being built - 1)
    blockNumber = blockNumber ?? this.blockNumber - 1;

    // TODO: we can't just request a timestamp! we always build contexts off of blocks. if anything we'd need to ensure
    // a block at a given timestamp exists
    timestamp = timestamp ?? this.timestamp;

    const snap = this.nativeWorldStateService.getSnapshot(blockNumber);
    const previousBlockState = this.nativeWorldStateService.getSnapshot(blockNumber - 1);

    const stateReference = await snap.getStateReference();
    const inputs = PrivateContextInputs.empty();
    inputs.txContext.chainId = new Fr(this.CHAIN_ID);
    inputs.txContext.version = new Fr(this.ROLLUP_VERSION);
    inputs.historicalHeader.globalVariables.blockNumber = blockNumber;
    inputs.historicalHeader.globalVariables.timestamp = timestamp;
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
    const account = await this.accountDataProvider.getAccount(address);
    const privateKey = await this.keyStore.getMasterSecretKey(account.publicKeys.masterIncomingViewingPublicKey);
    const schnorr = new Schnorr();
    const signature = await schnorr.constructSignature(messageHash.toBuffer(), privateKey);
    const authWitness = new AuthWitness(messageHash, [...signature.toBuffer()]);
    return this.authwits.set(authWitness.requestHash.toString(), authWitness);
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
        const tag = log.fields[0];
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

  getTimestamp() {
    return Promise.resolve(this.timestamp);
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

  storeInExecutionCache(values: Fr[], hash: Fr) {
    return this.executionCache.store(values, hash);
  }

  loadFromExecutionCache(hash: Fr) {
    const preimage = this.executionCache.getPreimage(hash);
    if (!preimage) {
      throw new Error(`Preimage for hash ${hash.toString()} not found in cache`);
    }
    return Promise.resolve(preimage);
  }

  getKeyValidationRequest(pkMHash: Fr): Promise<KeyValidationRequest> {
    return this.keyStore.getKeyValidationRequest(pkMHash, this.contractAddress);
  }

  async getContractInstance(address: AztecAddress): Promise<ContractInstance> {
    const contractInstance = await this.contractDataProvider.getContractInstance(address);
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
    const siblingPathPromise = snap.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, BigInt(index));

    const [leafPreimage, siblingPath] = await Promise.all([leafPreimagePromise, siblingPathPromise]);

    if (!leafPreimage) {
      return undefined;
    }

    return new NullifierMembershipWitness(BigInt(index), leafPreimage as NullifierLeafPreimage, siblingPath);
  }

  async getPublicDataWitness(blockNumber: number, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    const snap = this.nativeWorldStateService.getSnapshot(blockNumber);

    const lowLeafResult = await snap.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot.toBigInt());
    if (!lowLeafResult) {
      return undefined;
    } else {
      const preimage = (await snap.getLeafPreimage(
        MerkleTreeId.PUBLIC_DATA_TREE,
        lowLeafResult.index,
      )) as PublicDataTreeLeafPreimage;
      const path = await snap.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, lowLeafResult.index);
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

    const siblingPath = await snap.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, BigInt(index));
    return new NullifierMembershipWitness(BigInt(index), preimageData as NullifierLeafPreimage, siblingPath);
  }

  getBlockHeader(blockNumber: number): Promise<BlockHeader | undefined> {
    return this.stateMachine.archiver.getBlockHeader(blockNumber);
  }

  getCompleteAddress(account: AztecAddress) {
    return Promise.resolve(this.accountDataProvider.getAccount(account));
  }

  getAuthWitness(messageHash: Fr) {
    const authwit = this.authwits.get(messageHash.toString());
    return Promise.resolve(authwit?.witness);
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
    const dbNotes = await this.pxeOracleInterface.getNotes(this.contractAddress, storageSlot, status);
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
        .map(n => `${n.noteNonce.toString()}:[${n.note.items.map(i => i.toString()).join(',')}]`)
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
        noteNonce: Fr.ZERO, // Nonce cannot be known during private execution.
        note,
        siloedNullifier: undefined, // Siloed nullifier cannot be known for newly created note.
        noteHash,
      },
      counter,
    );
    this.sideEffectCounter = counter + 1;
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
        value = preimage.leaf.value;
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
    txEffect.privateLogs = this.privateLogs;
    txEffect.publicLogs = this.publicLogs;
    txEffect.txHash = new TxHash(new Fr(blockNumber));

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
        // FIXME: public data writes, note hashes, nullifiers, messages should all be handled in the same way.
        // They are all relevant to subsequent enqueued calls and txs.

        const nullifiersPadded = padArrayEnd(txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX);

        await fork.batchInsert(
          MerkleTreeId.NULLIFIER_TREE,
          nullifiersPadded.map(nullifier => nullifier.toBuffer()),
          NULLIFIER_SUBTREE_HEIGHT,
        );
      }
    }

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

    header.globalVariables.blockNumber = blockNumber;
    header.globalVariables.timestamp = await this.getTimestamp();

    this.logger.info(`Created block ${blockNumber} with timestamp ${header.globalVariables.timestamp}`);

    l2Block.header = header;

    await fork.updateArchive(l2Block.header);

    await this.stateMachine.handleL2Block(l2Block);

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

  notifyCreatedContractClassLog(_log: ContractClassLog, _counter: number): Fr {
    throw new Error('Method not implemented.');
  }

  async simulateUtilityFunction(targetContractAddress: AztecAddress, functionSelector: FunctionSelector, argsHash: Fr) {
    const artifact = await this.contractDataProvider.getFunctionArtifact(targetContractAddress, functionSelector);
    if (!artifact) {
      throw new Error(`Cannot call ${functionSelector} as there is artifact found at ${targetContractAddress}.`);
    }

    const call = {
      name: artifact.name,
      selector: functionSelector,
      to: targetContractAddress,
    };

    const entryPointArtifact = await this.pxeOracleInterface.getFunctionArtifact(call.to, call.selector);

    if (entryPointArtifact.functionType !== FunctionType.UTILITY) {
      throw new Error(`Cannot run ${entryPointArtifact.functionType} function as utility`);
    }

    const oracle = new UtilityExecutionOracle(call.to, [], [], this.pxeOracleInterface, undefined, undefined);

    try {
      this.logger.verbose(`Executing utility function ${entryPointArtifact.name}`, {
        contract: call.to,
        selector: call.selector,
      });

      const args = await this.loadFromExecutionCache(argsHash);
      const initialWitness = toACVMWitness(0, args);
      const acirExecutionResult = await this.simulator
        .executeUserCircuit(initialWitness, entryPointArtifact, new Oracle(oracle).toACIRCallback())
        .catch((err: Error) => {
          err.message = resolveAssertionMessageFromError(err, entryPointArtifact);
          throw new ExecutionError(
            err.message,
            {
              contractAddress: call.to,
              functionSelector: call.selector,
            },
            extractCallStack(err, entryPointArtifact.debug),
            { cause: err },
          );
        });

      const returnWitness = witnessMapToFields(acirExecutionResult.returnWitness);
      this.logger.verbose(`Utility simulation for ${call.to}.${call.selector} completed`);

      const returnHash = await computeVarArgsHash(returnWitness);

      this.storeInExecutionCache(returnWitness, returnHash);
      return returnHash;
    } catch (err) {
      throw createSimulationError(err instanceof Error ? err : new Error('Unknown error during private execution'));
    }
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

    const artifact = await this.contractDataProvider.getFunctionArtifact(targetContractAddress, functionSelector);
    if (!artifact) {
      throw new Error(`Artifact not found when calling private function. Contract address: ${targetContractAddress}.`);
    }

    const initialWitness = await this.getInitialWitness(artifact, argsHash, sideEffectCounter, isStaticCall);
    const acvmCallback = new Oracle(this);
    const timer = new Timer();
    const acirExecutionResult = await this.simulator
      .executeUserCircuit(initialWitness, artifact, acvmCallback.toACIRCallback())
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
      publicInputs.privateLogs.getActiveItems().map(privateLog => privateLog.log),
    );

    this.setContractAddress(currentContractAddress);
    this.setMsgSender(currentMessageSender);
    this.setFunctionSelector(currentFunctionSelector);

    return { endSideEffectCounter, returnsHash: publicInputs.returnsHash };
  }

  async getInitialWitness(abi: FunctionAbi, argsHash: Fr, sideEffectCounter: number, isStaticCall: boolean) {
    const argumentsSize = countArgumentsSize(abi);

    const args = this.executionCache.getPreimage(argsHash);

    if (args?.length !== argumentsSize) {
      throw new Error('Invalid arguments size');
    }

    const privateContextInputs = await this.getPrivateContextInputs(
      this.blockNumber - 1,
      this.timestamp - AZTEC_SLOT_DURATION,
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
    return await this.contractDataProvider.getDebugFunctionName(address, selector);
  }

  private async executePublicFunction(
    calldata: Fr[],
    msgSender: AztecAddress,
    contractAddress: AztecAddress,
    isStaticCall: boolean,
    isTeardown: boolean = false,
  ) {
    const callRequest = await PublicCallRequest.fromCalldata(msgSender, contractAddress, isStaticCall, calldata);
    const executionRequest = new PublicCallRequestWithCalldata(callRequest, calldata);

    const db = this.baseFork;

    const globalVariables = GlobalVariables.empty();
    globalVariables.chainId = new Fr(this.CHAIN_ID);
    globalVariables.version = new Fr(this.ROLLUP_VERSION);
    globalVariables.blockNumber = this.blockNumber;
    globalVariables.timestamp = this.timestamp;
    globalVariables.gasFees = new GasFees(1, 1);

    let result: PublicTxResult;
    // Checkpoint here so that we can revert merkle ops after simulation.
    // See note at revert below.
    const checkpoint = await ForkCheckpoint.new(db);
    try {
      const contractsDB = new PublicContractsDB(new TXEPublicContractDataSource(this));
      const simulator = new PublicTxSimulator(
        this.baseFork,
        contractsDB,
        globalVariables,
        /*doMerkleOperations=*/ false,
        /*skipFeeEnforcement=*/ false,
        /*clientInitiatedSimulation=*/ true,
      );

      const { usedTxRequestHashForNonces } = this.noteCache.finish();
      const firstNullifier = usedTxRequestHashForNonces
        ? this.getTxRequestHash()
        : this.noteCache.getAllNullifiers()[0];

      // When setting up a teardown call, we tell it that
      // private execution used Gas(1, 1) so it can compute a tx fee.
      const gasUsedByPrivate = isTeardown ? new Gas(1, 1) : Gas.empty();
      const tx = createTxForPublicCalls(
        {
          nonRevertible: {
            nullifiers: [firstNullifier],
          },
        },
        /*setupExecutionRequests=*/ [],
        /*appExecutionRequests=*/ isTeardown ? [] : [executionRequest],
        /*teardownExecutionRequests=*/ isTeardown ? executionRequest : undefined,
        /*feePayer=*/ AztecAddress.zero(),
        gasUsedByPrivate,
      );

      result = await simulator.simulate(tx);
    } finally {
      // NOTE: Don't accept any merkle updates from the AVM since this was just 1 enqueued call
      // and the TXE will re-apply all txEffects after entire execution (all enqueued calls)
      // complete.
      await checkpoint.revert();
      // If an error is thrown during the above simulation, this revert is the last
      // thing executed and we skip the postprocessing below.
    }

    const noteHashes = result.avmProvingRequest.inputs.publicInputs.accumulatedData.noteHashes.filter(
      s => !s.isEmpty(),
    );

    const publicDataWrites = result.avmProvingRequest.inputs.publicInputs.accumulatedData.publicDataWrites.filter(
      s => !s.isEmpty(),
    );
    // For now, public data writes are the only merkle operations that are readable by later enqueued calls in the TXE.
    await this.addPublicDataWrites(publicDataWrites);

    this.addUniqueNoteHashesFromPublic(noteHashes);

    this.addPublicLogs(
      result.avmProvingRequest.inputs.publicInputs.accumulatedData.publicLogs.filter(
        log => !log.contractAddress.equals(AztecAddress.ZERO),
      ),
    );

    return Promise.resolve(result);
  }

  async notifyEnqueuedPublicFunctionCall(
    targetContractAddress: AztecAddress,
    calldataHash: Fr,
    _sideEffectCounter: number,
    isStaticCall: boolean,
    isTeardown = false,
  ): Promise<void> {
    // Store and modify env
    const currentContractAddress = this.contractAddress;
    const currentMessageSender = this.msgSender;
    const currentFunctionSelector = FunctionSelector.fromField(this.functionSelector.toField());
    const calldata = this.executionCache.getPreimage(calldataHash);
    if (!calldata) {
      throw new Error('Calldata for enqueued call not found in cache');
    }
    const functionSelector = FunctionSelector.fromField(calldata[0]);
    this.setMsgSender(this.contractAddress);
    this.setContractAddress(targetContractAddress);
    this.setFunctionSelector(functionSelector);

    const executionResult = await this.executePublicFunction(
      calldata,
      /* msgSender */ currentContractAddress,
      targetContractAddress,
      isStaticCall,
      isTeardown,
    );

    // Poor man's revert handling
    if (!executionResult.revertCode.isOK()) {
      if (executionResult.revertReason && executionResult.revertReason instanceof SimulationError) {
        await enrichPublicSimulationError(executionResult.revertReason, this.contractDataProvider, this.logger);
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
  }

  async notifySetPublicTeardownFunctionCall(
    targetContractAddress: AztecAddress,
    calldataHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
  ): Promise<void> {
    // Definitely not right, in that the teardown should always be last.
    // But useful for executing flows.
    await this.notifyEnqueuedPublicFunctionCall(
      targetContractAddress,
      calldataHash,
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
    await this.pxeOracleInterface.incrementAppTaggingSecretIndexAsSender(this.contractAddress, sender, recipient);
  }

  async getIndexedTaggingSecretAsSender(sender: AztecAddress, recipient: AztecAddress): Promise<IndexedTaggingSecret> {
    return await this.pxeOracleInterface.getIndexedTaggingSecretAsSender(this.contractAddress, sender, recipient);
  }

  async fetchTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr) {
    await this.pxeOracleInterface.syncTaggedLogs(this.contractAddress, pendingTaggedLogArrayBaseSlot);

    await this.pxeOracleInterface.removeNullifiedNotes(this.contractAddress);

    return Promise.resolve();
  }

  public async validateEnqueuedNotesAndEvents(
    contractAddress: AztecAddress,
    noteValidationRequestsArrayBaseSlot: Fr,
    eventValidationRequestsArrayBaseSlot: Fr,
  ): Promise<void> {
    await this.pxeOracleInterface.validateEnqueuedNotesAndEvents(
      contractAddress,
      noteValidationRequestsArrayBaseSlot,
      eventValidationRequestsArrayBaseSlot,
    );
  }

  async bulkRetrieveLogs(
    contractAddress: AztecAddress,
    logRetrievalRequestsArrayBaseSlot: Fr,
    logRetrievalResponsesArrayBaseSlot: Fr,
  ): Promise<void> {
    return await this.pxeOracleInterface.bulkRetrieveLogs(
      contractAddress,
      logRetrievalRequestsArrayBaseSlot,
      logRetrievalResponsesArrayBaseSlot,
    );
  }

  // AVM oracles

  async avmOpcodeCall(
    targetContractAddress: AztecAddress,
    calldata: Fr[],
    isStaticCall: boolean,
  ): Promise<PublicTxResult> {
    // Store and modify env
    const currentContractAddress = this.contractAddress;
    const currentMessageSender = this.msgSender;
    this.setMsgSender(this.contractAddress);
    this.setContractAddress(targetContractAddress);

    const executionResult = await this.executePublicFunction(
      calldata,
      /* msgSender */ currentContractAddress,
      targetContractAddress,
      isStaticCall,
    );
    // Save return/revert data for later.
    this.nestedCallReturndata = executionResult.processedPhases[0]!.returnValues[0].values!;
    this.nestedCallSuccess = executionResult.revertCode.isOK();

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

  avmOpcodeSuccessCopy(): boolean {
    return this.nestedCallSuccess;
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

    return preimage.leaf.value;
  }

  storeCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.storeCapsule(this.contractAddress, slot, capsule);
  }

  loadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.loadCapsule(this.contractAddress, slot);
  }

  deleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.deleteCapsule(this.contractAddress, slot);
  }

  copyCapsule(contractAddress: AztecAddress, srcSlot: Fr, dstSlot: Fr, numEntries: number): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.copyCapsule(this.contractAddress, srcSlot, dstSlot, numEntries);
  }

  aes128Decrypt(ciphertext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer> {
    const aes128 = new Aes128();
    return aes128.decryptBufferCBC(ciphertext, iv, symKey);
  }

  getSharedSecret(address: AztecAddress, ephPk: Point): Promise<Point> {
    return this.pxeOracleInterface.getSharedSecret(address, ephPk);
  }

  emitOffchainEffect(_data: Fr[]) {
    // Offchain effects are discarded in TXE tests.
    return Promise.resolve();
  }

  async privateCallNewFlow(
    from: AztecAddress,
    targetContractAddress: AztecAddress = AztecAddress.zero(),
    functionSelector: FunctionSelector = FunctionSelector.empty(),
    args: Fr[],
    argsHash: Fr = Fr.zero(),
    isStaticCall: boolean = false,
  ) {
    this.logger.verbose(
      `Executing external function ${await this.getDebugFunctionName(
        targetContractAddress,
        functionSelector,
      )}@${targetContractAddress} isStaticCall=${isStaticCall}`,
    );

    const artifact = await this.contractDataProvider.getFunctionArtifact(targetContractAddress, functionSelector);

    if (artifact === undefined) {
      throw new Error('Function Artifact does not exist');
    }

    const callContext = new CallContext(from, targetContractAddress, functionSelector, isStaticCall);

    const gasLimits = new Gas(DEFAULT_GAS_LIMIT, MAX_L2_GAS_PER_TX_PUBLIC_PORTION);

    const teardownGasLimits = new Gas(DEFAULT_TEARDOWN_GAS_LIMIT, MAX_L2_GAS_PER_TX_PUBLIC_PORTION);

    const gasSettings = new GasSettings(gasLimits, teardownGasLimits, GasFees.empty(), GasFees.empty());

    const txContext = new TxContext(this.CHAIN_ID, this.ROLLUP_VERSION, gasSettings);

    const blockHeader = await this.pxeOracleInterface.getBlockHeader();

    const noteCache = new ExecutionNoteCache(this.getTxRequestHash());

    const context = new PrivateExecutionOracle(
      argsHash,
      txContext,
      callContext,
      /** Header of a block whose state is used during private execution (not the block the transaction is included in). */
      blockHeader,
      /** List of transient auth witnesses to be used during this simulation */
      [],
      /** List of transient auth witnesses to be used during this simulation */
      [],
      HashedValuesCache.create(),
      noteCache,
      this.pxeOracleInterface,
      this.simulator,
      0,
      1,
    );

    context.storeInExecutionCache(args, argsHash);

    // Note: This is a slight modification of simulator.run without any of the checks. Maybe we should modify simulator.run with a boolean value to skip checks.
    let result: PrivateExecutionResult;
    let executionResult: PrivateCallExecutionResult;
    try {
      executionResult = await executePrivateFunction(
        this.simulator,
        context,
        artifact,
        targetContractAddress,
        functionSelector,
      );
      const { usedTxRequestHashForNonces } = noteCache.finish();
      const firstNullifierHint = usedTxRequestHashForNonces ? Fr.ZERO : noteCache.getAllNullifiers()[0];

      const publicCallRequests = collectNested([executionResult], r =>
        r.publicInputs.publicCallRequests
          .getActiveItems()
          .map(r => r.inner)
          .concat(r.publicInputs.publicTeardownCallRequest.isEmpty() ? [] : [r.publicInputs.publicTeardownCallRequest]),
      );
      const publicFunctionsCalldata = await Promise.all(
        publicCallRequests.map(async r => {
          const calldata = await context.loadFromExecutionCache(r.calldataHash);
          return new HashedValues(calldata, r.calldataHash);
        }),
      );

      result = new PrivateExecutionResult(executionResult, firstNullifierHint, publicFunctionsCalldata);
    } catch (err) {
      throw createSimulationError(err instanceof Error ? err : new Error('Unknown error during private execution'));
    }

    if (executionResult.returnValues !== undefined) {
      const { returnValues } = executionResult;
      // This is a bit of a hack to not deal with returning a slice in nr which is what normally happens.
      // Investigate whether it is faster to do this or return from the oracle directly.
      const returnValuesHash = await computeVarArgsHash(returnValues);
      this.storeInExecutionCache(returnValues, returnValuesHash);
    }

    // According to the protocol rules, the nonce generator for the note hashes
    // can either be the first nullifier in the tx or the hash of the initial tx request
    // if there are none.
    const nonceGenerator = result.firstNullifier.equals(Fr.ZERO) ? this.getTxRequestHash() : result.firstNullifier;
    const { publicInputs } = await generateSimulatedProvingResult(result, nonceGenerator, this.contractDataProvider);

    const globals = makeGlobalVariables();
    globals.blockNumber = this.blockNumber;
    globals.timestamp = this.timestamp;
    globals.gasFees = GasFees.empty();

    const contractsDB = new PublicContractsDB(new TXEPublicContractDataSource(this));
    const guardedMerkleTrees = new GuardedMerkleTreeOperations(this.baseFork);
    const simulator = new PublicTxSimulator(guardedMerkleTrees, contractsDB, globals, true, true);
    const processor = new PublicProcessor(globals, guardedMerkleTrees, contractsDB, simulator, new TestDateProvider());

    const tx = new Tx(publicInputs, ClientIvcProof.empty(), [], result.publicFunctionCalldata);

    let checkpoint;
    if (isStaticCall) {
      checkpoint = await ForkCheckpoint.new(this.baseFork);
    }

    const results = await processor.process([tx]);

    const [processedTx] = results[0];
    const failedTxs = results[1];

    if (failedTxs.length !== 0 || !processedTx.revertCode.isOK()) {
      throw new Error('Public execution has failed', processedTx.revertReason);
    }

    if (isStaticCall) {
      await checkpoint!.revert();
      const txRequestHash = this.getTxRequestHash();

      return {
        endSideEffectCounter: result.entrypoint.publicInputs.endSideEffectCounter,
        returnsHash: result.entrypoint.publicInputs.returnsHash,
        txHash: txRequestHash,
      };
    }

    const fork = this.baseFork;

    const txEffect = TxEffect.empty();

    txEffect.noteHashes = processedTx!.txEffect.noteHashes;
    txEffect.nullifiers = processedTx!.txEffect.nullifiers;
    txEffect.privateLogs = processedTx!.txEffect.privateLogs;
    txEffect.publicLogs = processedTx!.txEffect.publicLogs;
    txEffect.publicDataWrites = processedTx!.txEffect.publicDataWrites;

    txEffect.txHash = new TxHash(new Fr(this.blockNumber));

    const body = new Body([txEffect]);

    const l2Block = new L2Block(
      makeAppendOnlyTreeSnapshot(this.blockNumber + 1),
      makeHeader(0, this.blockNumber, this.blockNumber),
      body,
    );

    const l1ToL2Messages = Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(0).map(Fr.zero);
    await fork.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2Messages);

    const stateReference = await fork.getStateReference();
    const archiveInfo = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);

    const header = new BlockHeader(
      new AppendOnlyTreeSnapshot(new Fr(archiveInfo.root), Number(archiveInfo.size)),
      makeContentCommitment(),
      stateReference,
      globals,
      Fr.ZERO,
      Fr.ZERO,
    );

    header.globalVariables.blockNumber = this.blockNumber;

    l2Block.header = header;

    await fork.updateArchive(l2Block.header);

    await this.stateMachine.handleL2Block(l2Block);

    const txRequestHash = this.getTxRequestHash();

    this.setBlockNumber(this.blockNumber + 1);
    this.advanceTimestampBy(AZTEC_SLOT_DURATION);
    return {
      endSideEffectCounter: result.entrypoint.publicInputs.endSideEffectCounter,
      returnsHash: result.entrypoint.publicInputs.returnsHash,
      txHash: txRequestHash,
    };
  }

  async publicCallNewFlow(
    from: AztecAddress,
    targetContractAddress: AztecAddress,
    calldata: Fr[],
    isStaticCall: boolean,
  ) {
    this.logger.verbose(
      `Executing public function ${await this.getDebugFunctionName(
        targetContractAddress,
        FunctionSelector.fromField(calldata[0]),
      )}@${targetContractAddress} isStaticCall=${isStaticCall}`,
    );

    const gasLimits = new Gas(DEFAULT_GAS_LIMIT, MAX_L2_GAS_PER_TX_PUBLIC_PORTION);

    const teardownGasLimits = new Gas(DEFAULT_TEARDOWN_GAS_LIMIT, MAX_L2_GAS_PER_TX_PUBLIC_PORTION);

    const gasSettings = new GasSettings(gasLimits, teardownGasLimits, GasFees.empty(), GasFees.empty());

    const txContext = new TxContext(this.CHAIN_ID, this.ROLLUP_VERSION, gasSettings);

    const blockHeader = await this.pxeOracleInterface.getBlockHeader();

    const uniqueNoteHashes: Fr[] = [];
    const taggedPrivateLogs: PrivateLog[] = [];
    const nullifiers: Fr[] = !isStaticCall ? [this.getTxRequestHash()] : [];
    const l2ToL1Messages: ScopedL2ToL1Message[] = [];
    const contractClassLogsHashes: ScopedLogHash[] = [];

    const calldataHash = await computeCalldataHash(calldata);

    const calldataHashedValues = new HashedValues(calldata, calldataHash);

    const publicCallRequest = new PublicCallRequest(from, targetContractAddress, isStaticCall, calldataHash);
    const publicCallRequests: PublicCallRequest[] = [publicCallRequest];

    const globals = makeGlobalVariables();
    globals.blockNumber = this.blockNumber;
    globals.timestamp = this.timestamp;
    globals.gasFees = GasFees.empty();

    const contractsDB = new PublicContractsDB(new TXEPublicContractDataSource(this));
    const guardedMerkleTrees = new GuardedMerkleTreeOperations(this.baseFork);
    const simulator = new PublicTxSimulator(guardedMerkleTrees, contractsDB, globals, true, true);
    const processor = new PublicProcessor(globals, guardedMerkleTrees, contractsDB, simulator, new TestDateProvider());

    const constantData = new TxConstantData(blockHeader, txContext, Fr.zero(), Fr.zero());

    const accumulatedDataForPublic = new PrivateToPublicAccumulatedData(
      padArrayEnd(uniqueNoteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
      padArrayEnd(nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX),
      padArrayEnd(l2ToL1Messages, ScopedL2ToL1Message.empty(), MAX_L2_TO_L1_MSGS_PER_TX),
      padArrayEnd(taggedPrivateLogs, PrivateLog.empty(), MAX_PRIVATE_LOGS_PER_TX),
      padArrayEnd(contractClassLogsHashes, ScopedLogHash.empty(), MAX_CONTRACT_CLASS_LOGS_PER_TX),
      padArrayEnd(publicCallRequests, PublicCallRequest.empty(), MAX_ENQUEUED_CALLS_PER_TX),
    );

    const inputsForPublic = new PartialPrivateTailPublicInputsForPublic(
      // nonrevertible
      PrivateToPublicAccumulatedData.empty(),
      // revertible
      // We are using revertible (app phase) because only the app-phase returns are exposed.
      accumulatedDataForPublic,
      PublicCallRequest.empty(),
    );

    const txData = new PrivateKernelTailCircuitPublicInputs(
      constantData,
      /*gasUsed=*/ new Gas(0, 0),
      /*feePayer=*/ AztecAddress.zero(),
      /*includeByTimestamp=*/ 0n,
      inputsForPublic,
      undefined,
    );

    const tx = new Tx(txData, ClientIvcProof.empty(), [], [calldataHashedValues]);

    let checkpoint;
    if (isStaticCall) {
      checkpoint = await ForkCheckpoint.new(this.baseFork);
    }

    const results = await processor.process([tx]);

    const processedTxs = results[0];
    const failedTxs = results[1];

    if (failedTxs.length !== 0 || !processedTxs[0].revertCode.isOK()) {
      throw new Error('Public execution has failed');
    }

    const returnValues = results[3][0].values;
    let returnValuesHash;

    if (returnValues !== undefined) {
      // This is a bit of a hack to not deal with returning a slice in nr which is what normally happens.
      // Investigate whether it is faster to do this or return from the oracle directly.
      returnValuesHash = await computeVarArgsHash(returnValues);
      this.storeInExecutionCache(returnValues, returnValuesHash);
    }

    if (isStaticCall) {
      await checkpoint!.revert();
      const txRequestHash = this.getTxRequestHash();

      return {
        returnsHash: returnValuesHash ?? Fr.ZERO,
        txHash: txRequestHash,
      };
    }

    const fork = this.baseFork;

    const txEffect = TxEffect.empty();

    txEffect.noteHashes = processedTxs[0]!.txEffect.noteHashes;
    txEffect.nullifiers = processedTxs[0]!.txEffect.nullifiers;
    txEffect.privateLogs = taggedPrivateLogs;
    txEffect.publicLogs = processedTxs[0]!.txEffect.publicLogs;
    txEffect.publicDataWrites = processedTxs[0]!.txEffect.publicDataWrites;

    txEffect.txHash = new TxHash(new Fr(this.blockNumber));

    const body = new Body([txEffect]);

    const l2Block = new L2Block(
      makeAppendOnlyTreeSnapshot(this.blockNumber + 1),
      makeHeader(0, this.blockNumber, this.blockNumber),
      body,
    );

    const l1ToL2Messages = Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(0).map(Fr.zero);
    await fork.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2Messages);

    const stateReference = await fork.getStateReference();
    const archiveInfo = await fork.getTreeInfo(MerkleTreeId.ARCHIVE);

    const header = new BlockHeader(
      new AppendOnlyTreeSnapshot(new Fr(archiveInfo.root), Number(archiveInfo.size)),
      makeContentCommitment(),
      stateReference,
      globals,
      Fr.ZERO,
      Fr.ZERO,
    );

    header.globalVariables.blockNumber = this.blockNumber;

    l2Block.header = header;

    await fork.updateArchive(l2Block.header);

    await this.stateMachine.handleL2Block(l2Block);

    const txRequestHash = this.getTxRequestHash();

    this.setBlockNumber(this.blockNumber + 1);
    this.advanceTimestampBy(AZTEC_SLOT_DURATION);

    return {
      returnsHash: returnValuesHash ?? Fr.ZERO,
      txHash: txRequestHash,
    };
  }
}
