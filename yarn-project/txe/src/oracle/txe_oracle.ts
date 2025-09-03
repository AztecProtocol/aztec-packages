import { type AztecNode, Body, L2Block, Note } from '@aztec/aztec.js';
import {
  CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
  DEFAULT_DA_GAS_LIMIT,
  DEFAULT_L2_GAS_LIMIT,
  DEFAULT_TEARDOWN_DA_GAS_LIMIT,
  DEFAULT_TEARDOWN_L2_GAS_LIMIT,
  type L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NULLIFIER_SUBTREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  PRIVATE_CONTEXT_INPUTS_LENGTH,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Aes128, Schnorr } from '@aztec/foundation/crypto';
import { Fr, Point } from '@aztec/foundation/fields';
import { type Logger, applyStringFormatting, createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';
import { KeyStore } from '@aztec/key-store';
import {
  AddressDataProvider,
  CapsuleDataProvider,
  NoteDataProvider,
  ORACLE_VERSION,
  PXEOracleInterface,
  PrivateEventDataProvider,
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
  UtilityExecutionOracle,
  executePrivateFunction,
  generateSimulatedProvingResult,
  pickNotes,
} from '@aztec/pxe/simulator';
import { WASMSimulator, extractCallStack, toACVMWitness, witnessMapToFields } from '@aztec/simulator/client';
import {
  ExecutionError,
  GuardedMerkleTreeOperations,
  PublicContractsDB,
  PublicProcessor,
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
import { type ContractInstance, type ContractInstanceWithAddress, computePartialAddress } from '@aztec/stdlib/contract';
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
} from '@aztec/stdlib/kernel';
import { ContractClassLog, IndexedTaggingSecret, PrivateLog, type PublicLog } from '@aztec/stdlib/logs';
import type { NoteStatus } from '@aztec/stdlib/note';
import { ClientIvcProof } from '@aztec/stdlib/proofs';
import {
  makeAppendOnlyTreeSnapshot,
  makeContentCommitment,
  makeGlobalVariables,
  makeHeader,
} from '@aztec/stdlib/testing';
import {
  AppendOnlyTreeSnapshot,
  MerkleTreeId,
  NullifierMembershipWitness,
  PublicDataTreeLeaf,
  type PublicDataTreeLeafPreimage,
  PublicDataWitness,
} from '@aztec/stdlib/trees';
import {
  BlockHeader,
  CallContext,
  HashedValues,
  PrivateCallExecutionResult,
  PrivateExecutionResult,
  Tx,
  TxConstantData,
  TxContext,
  TxEffect,
  TxHash,
  collectNested,
} from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';
import { ForkCheckpoint } from '@aztec/world-state/native';

import { TXEStateMachine } from '../state_machine/index.js';
import { GENESIS_TIMESTAMP } from '../txe_constants.js';
import { TXEAccountDataProvider } from '../util/txe_account_data_provider.js';
import { TXEContractDataProvider } from '../util/txe_contract_data_provider.js';
import { TXEPublicContractDataSource } from '../util/txe_public_contract_data_source.js';
import { TXETypedOracle } from './txe_typed_oracle.js';

export class TXE extends TXETypedOracle {
  private logger: Logger;

  private blockNumber = 1;
  private timestamp = GENESIS_TIMESTAMP;

  private sideEffectCounter = 0;
  private msgSender: AztecAddress;
  private functionSelector = FunctionSelector.fromField(new Fr(0));

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

  // Used by privateSetSenderForTags and privateGetSenderForTags oracles.
  private senderForTags?: AztecAddress;

  private executionCache: HashedValuesCache;

  constructor(
    private keyStore: KeyStore,
    private contractDataProvider: TXEContractDataProvider,
    private noteDataProvider: NoteDataProvider,
    private capsuleDataProvider: CapsuleDataProvider,
    private taggingDataProvider: TaggingDataProvider,
    private addressDataProvider: AddressDataProvider,
    private privateEventDataProvider: PrivateEventDataProvider,
    private accountDataProvider: TXEAccountDataProvider,
    private contractAddress: AztecAddress,
    private baseFork: MerkleTreeWriteOperations,
    private stateMachine: TXEStateMachine,
  ) {
    super();

    this.logger = createLogger('txe:oracle');

    this.noteCache = new ExecutionNoteCache(this.getTxRequestHash());

    this.node = stateMachine.node;

    // Default msg_sender (for entrypoints) is now Fr.max_value rather than 0 addr (see #7190 & #7404)
    this.msgSender = AztecAddress.fromField(Fr.MAX_FIELD_VALUE);

    this.executionCache = new HashedValuesCache();

    this.pxeOracleInterface = new PXEOracleInterface(
      this.node,
      this.keyStore,
      this.contractDataProvider,
      this.noteDataProvider,
      this.capsuleDataProvider,
      this.stateMachine.syncDataProvider,
      this.taggingDataProvider,
      this.addressDataProvider,
      this.privateEventDataProvider,
      this.logger,
    );
  }

  // Utils

  override utilityGetChainId(): Promise<Fr> {
    return Promise.resolve(new Fr(this.CHAIN_ID));
  }

  override utilityGetVersion(): Promise<Fr> {
    return Promise.resolve(new Fr(this.ROLLUP_VERSION));
  }

  override getMsgSender() {
    return this.msgSender;
  }

  override txeSetContractAddress(contractAddress: AztecAddress) {
    this.contractAddress = contractAddress;
  }

  // TODO: Currently this is only ever used to increment this.blockNumber by 1. Refactor this as `advanceBlock()`.
  setBlockNumber(blockNumber: number) {
    this.blockNumber = blockNumber;
  }

  override async txeAdvanceBlocksBy(blocks: number) {
    this.logger.debug(`time traveling ${blocks} blocks`);

    for (let i = 0; i < blocks; i++) {
      const blockNumber = await this.utilityGetBlockNumber();
      await this.commitState();
      this.setBlockNumber(blockNumber + 1);
    }
  }

  override txeAdvanceTimestampBy(duration: UInt64) {
    this.logger.debug(`time traveling ${duration} seconds`);
    this.timestamp = this.timestamp + duration;
  }

  override async txeDeploy(artifact: ContractArtifact, instance: ContractInstanceWithAddress, secret: Fr) {
    // Emit deployment nullifier
    await this.noteCache.nullifierCreated(
      AztecAddress.fromNumber(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS),
      instance.address.toField(),
    );

    // Make sure the deployment nullifier gets included in a tx in a block
    const blockNumber = await this.utilityGetBlockNumber();
    await this.commitState();
    this.setBlockNumber(blockNumber + 1);

    if (!secret.equals(Fr.ZERO)) {
      await this.txeAddAccount(artifact, instance, secret);
    } else {
      await this.addContractInstance(instance);
      await this.addContractArtifact(instance.currentContractClassId, artifact);
      this.logger.debug(`Deployed ${artifact.name} at ${instance.address}`);
    }
  }

  override async txeAddAccount(artifact: ContractArtifact, instance: ContractInstanceWithAddress, secret: Fr) {
    const partialAddress = await computePartialAddress(instance);

    this.logger.debug(`Deployed ${artifact.name} at ${instance.address}`);
    await this.addContractInstance(instance);
    await this.addContractArtifact(instance.currentContractClassId, artifact);

    const keyStore = this.getKeyStore();
    const completeAddress = await keyStore.addAccount(secret, partialAddress);
    const accountDataProvider = this.getAccountDataProvider();
    await accountDataProvider.setAccount(completeAddress.address, completeAddress);
    const addressDataProvider = this.getAddressDataProvider();
    await addressDataProvider.addCompleteAddress(completeAddress);
    this.logger.debug(`Created account ${completeAddress.address}`);

    return completeAddress;
  }

  override async txeCreateAccount(secret: Fr) {
    const keyStore = this.getKeyStore();
    // This is a footgun !
    const completeAddress = await keyStore.addAccount(secret, secret);
    const accountDataProvider = this.getAccountDataProvider();
    await accountDataProvider.setAccount(completeAddress.address, completeAddress);
    const addressDataProvider = this.getAddressDataProvider();
    await addressDataProvider.addCompleteAddress(completeAddress);
    this.logger.debug(`Created account ${completeAddress.address}`);

    return completeAddress;
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

  override async txeGetPrivateContextInputs(
    blockNumber: number | null,
    sideEffectsCounter = this.sideEffectCounter,
    isStaticCall = false,
  ) {
    // If blockNumber or timestamp is null, use the values corresponding to the latest historical block (number of
    // the block being built - 1)
    blockNumber = blockNumber ?? this.blockNumber - 1;

    const snap = this.stateMachine.synchronizer.nativeWorldStateService.getSnapshot(blockNumber);
    const previousBlockState = this.stateMachine.synchronizer.nativeWorldStateService.getSnapshot(blockNumber - 1);

    const stateReference = await snap.getStateReference();
    const inputs = PrivateContextInputs.empty();
    inputs.txContext.chainId = new Fr(this.CHAIN_ID);
    inputs.txContext.version = new Fr(this.ROLLUP_VERSION);
    inputs.historicalHeader.globalVariables.blockNumber = blockNumber;
    inputs.historicalHeader.globalVariables.timestamp = await this.getBlockTimestamp(blockNumber);
    inputs.historicalHeader.state = stateReference;
    inputs.historicalHeader.lastArchive.root = Fr.fromBuffer(
      (await previousBlockState.getTreeInfo(MerkleTreeId.ARCHIVE)).root,
    );
    inputs.callContext = new CallContext(this.msgSender, this.contractAddress, this.functionSelector, isStaticCall);
    inputs.startSideEffectCounter = sideEffectsCounter;

    this.logger.info(`Created private context for block ${blockNumber}`);

    return inputs;
  }

  override async txeAddAuthWitness(address: AztecAddress, messageHash: Fr) {
    const account = await this.accountDataProvider.getAccount(address);
    const privateKey = await this.keyStore.getMasterSecretKey(account.publicKeys.masterIncomingViewingPublicKey);
    const schnorr = new Schnorr();
    const signature = await schnorr.constructSignature(messageHash.toBuffer(), privateKey);
    const authWitness = new AuthWitness(messageHash, [...signature.toBuffer()]);

    this.authwits.set(authWitness.requestHash.toString(), authWitness);
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

  // TypedOracle

  override utilityAssertCompatibleOracleVersion(version: number): void {
    if (version !== ORACLE_VERSION) {
      throw new Error(
        `Incompatible oracle version. PXE is using version '${ORACLE_VERSION}', but got a request for '${version}'.`,
      );
    }
  }

  override utilityGetBlockNumber() {
    return Promise.resolve(this.blockNumber);
  }

  override utilityGetTimestamp() {
    return Promise.resolve(this.timestamp);
  }

  override txeGetLastBlockTimestamp() {
    return this.getBlockTimestamp(this.blockNumber - 1);
  }

  override utilityGetContractAddress() {
    return Promise.resolve(this.contractAddress);
  }

  override utilityGetRandomField() {
    return Fr.random();
  }

  override privateStoreInExecutionCache(values: Fr[], hash: Fr) {
    return this.executionCache.store(values, hash);
  }

  override privateLoadFromExecutionCache(hash: Fr) {
    const preimage = this.executionCache.getPreimage(hash);
    if (!preimage) {
      throw new Error(`Preimage for hash ${hash.toString()} not found in cache`);
    }
    return Promise.resolve(preimage);
  }

  override utilityGetKeyValidationRequest(pkMHash: Fr): Promise<KeyValidationRequest> {
    return this.keyStore.getKeyValidationRequest(pkMHash, this.contractAddress);
  }

  override utilityGetContractInstance(address: AztecAddress): Promise<ContractInstance> {
    return this.pxeOracleInterface.getContractInstance(address);
  }

  override utilityGetMembershipWitness(
    blockNumber: number,
    treeId: MerkleTreeId,
    leafValue: Fr,
  ): Promise<Fr[] | undefined> {
    return this.pxeOracleInterface.getMembershipWitness(blockNumber, treeId, leafValue);
  }

  override utilityGetNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return this.pxeOracleInterface.getNullifierMembershipWitness(blockNumber, nullifier);
  }

  override utilityGetPublicDataWitness(blockNumber: number, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    return this.pxeOracleInterface.getPublicDataWitness(blockNumber, leafSlot);
  }

  override utilityGetLowNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return this.pxeOracleInterface.getLowNullifierMembershipWitness(blockNumber, nullifier);
  }

  override utilityGetBlockHeader(blockNumber: number): Promise<BlockHeader | undefined> {
    return this.stateMachine.archiver.getBlockHeader(blockNumber);
  }

  override utilityGetCompleteAddress(account: AztecAddress) {
    return Promise.resolve(this.accountDataProvider.getAccount(account));
  }

  override utilityGetAuthWitness(messageHash: Fr) {
    const authwit = this.authwits.get(messageHash.toString());
    return Promise.resolve(authwit?.witness);
  }

  override async utilityGetNotes(
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

    if (notes.length > 0) {
      const noteLength = notes[0].note.items.length;
      if (!notes.every(({ note }) => noteLength === note.items.length)) {
        throw new Error('Notes should all be the same length.');
      }
    }

    return notes;
  }

  override privateNotifyCreatedNote(
    storageSlot: Fr,
    _noteTypeId: NoteSelector,
    noteItems: Fr[],
    noteHash: Fr,
    counter: number,
  ) {
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

  override async privateNotifyNullifiedNote(innerNullifier: Fr, noteHash: Fr, counter: number) {
    await this.checkNullifiersNotInTree(this.contractAddress, [innerNullifier]);
    await this.noteCache.nullifyNote(this.contractAddress, innerNullifier, noteHash);
    this.sideEffectCounter = counter + 1;
  }

  override async privateNotifyCreatedNullifier(innerNullifier: Fr): Promise<void> {
    await this.checkNullifiersNotInTree(this.contractAddress, [innerNullifier]);
    await this.noteCache.nullifierCreated(this.contractAddress, innerNullifier);
  }

  override async utilityCheckNullifierExists(innerNullifier: Fr): Promise<boolean> {
    const snap = this.stateMachine.synchronizer.nativeWorldStateService.getSnapshot(this.blockNumber - 1);

    const nullifier = await siloNullifier(this.contractAddress, innerNullifier!);
    const [index] = await snap.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]);

    const inPendingCache = this.noteCache.getNullifiers(this.contractAddress).has(nullifier.toBigInt());

    return index !== undefined || inPendingCache;
  }

  getL1ToL2MembershipWitness(
    _contractAddress: AztecAddress,
    _messageHash: Fr,
    _secret: Fr,
  ): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
    throw new Error('Method not implemented.');
  }

  override async utilityStorageRead(
    contractAddress: AztecAddress,
    startStorageSlot: Fr,
    blockNumber: number,
    numberOfElements: number,
  ): Promise<Fr[]> {
    let db: MerkleTreeReadOperations;
    if (blockNumber === this.blockNumber) {
      db = this.baseFork;
    } else {
      db = this.stateMachine.synchronizer.nativeWorldStateService.getSnapshot(blockNumber);
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

  override async storageWrite(startStorageSlot: Fr, values: Fr[]): Promise<Fr[]> {
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
    const blockNumber = await this.utilityGetBlockNumber();
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
    header.globalVariables.timestamp = await this.utilityGetTimestamp();
    header.globalVariables.version = new Fr(this.ROLLUP_VERSION);
    header.globalVariables.chainId = new Fr(this.CHAIN_ID);

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

  override async simulateUtilityFunction(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
  ) {
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

      const args = await this.privateLoadFromExecutionCache(argsHash);
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

      this.privateStoreInExecutionCache(returnWitness, returnHash);
      return returnHash;
    } catch (err) {
      throw createSimulationError(err instanceof Error ? err : new Error('Unknown error during private execution'));
    }
  }

  async getInitialWitness(abi: FunctionAbi, argsHash: Fr, sideEffectCounter: number, isStaticCall: boolean) {
    const argumentsSize = countArgumentsSize(abi);

    const args = this.executionCache.getPreimage(argsHash);

    if (args?.length !== argumentsSize) {
      throw new Error('Invalid arguments size');
    }

    const historicalBlockNumber = this.blockNumber - 1; // i.e. last

    const privateContextInputs = await this.txeGetPrivateContextInputs(
      historicalBlockNumber,
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

  override utilityDebugLog(message: string, fields: Fr[]): void {
    this.logger.verbose(`${applyStringFormatting(message, fields)}`, { module: `${this.logger.module}:debug_log` });
  }

  override async privateIncrementAppTaggingSecretIndexAsSender(
    sender: AztecAddress,
    recipient: AztecAddress,
  ): Promise<void> {
    await this.pxeOracleInterface.incrementAppTaggingSecretIndexAsSender(this.contractAddress, sender, recipient);
  }

  override async utilityGetIndexedTaggingSecretAsSender(
    sender: AztecAddress,
    recipient: AztecAddress,
  ): Promise<IndexedTaggingSecret> {
    return await this.pxeOracleInterface.getIndexedTaggingSecretAsSender(this.contractAddress, sender, recipient);
  }

  override async utilityFetchTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr) {
    await this.pxeOracleInterface.syncTaggedLogs(this.contractAddress, pendingTaggedLogArrayBaseSlot);

    await this.pxeOracleInterface.removeNullifiedNotes(this.contractAddress);

    return Promise.resolve();
  }

  public override async utilityValidateEnqueuedNotesAndEvents(
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

  override async utilityBulkRetrieveLogs(
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

  override async avmOpcodeNullifierExists(innerNullifier: Fr, targetAddress: AztecAddress): Promise<boolean> {
    const nullifier = await siloNullifier(targetAddress, innerNullifier!);
    const db = this.baseFork;

    const treeIndex = (await db.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]))[0];
    const transientIndex = this.siloedNullifiersFromPublic.find(n => n.equals(nullifier));

    return treeIndex !== undefined || transientIndex !== undefined;
  }

  override async avmOpcodeEmitNullifier(nullifier: Fr) {
    const siloedNullifier = await siloNullifier(this.contractAddress, nullifier);
    this.addSiloedNullifiersFromPublic([siloedNullifier]);

    return Promise.resolve();
  }

  // Doesn't this need to get hashed w/ the nonce ?
  override async avmOpcodeEmitNoteHash(noteHash: Fr) {
    const siloedNoteHash = await siloNoteHash(this.contractAddress, noteHash);
    this.addUniqueNoteHashesFromPublic([siloedNoteHash]);
    return Promise.resolve();
  }

  override async avmOpcodeStorageRead(slot: Fr) {
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

  override utilityStoreCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.storeCapsule(this.contractAddress, slot, capsule);
  }

  override utilityLoadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.loadCapsule(this.contractAddress, slot);
  }

  override utilityDeleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.deleteCapsule(this.contractAddress, slot);
  }

  override utilityCopyCapsule(
    contractAddress: AztecAddress,
    srcSlot: Fr,
    dstSlot: Fr,
    numEntries: number,
  ): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.copyCapsule(this.contractAddress, srcSlot, dstSlot, numEntries);
  }

  override utilityAes128Decrypt(ciphertext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer> {
    const aes128 = new Aes128();
    return aes128.decryptBufferCBC(ciphertext, iv, symKey);
  }

  override utilityGetSharedSecret(address: AztecAddress, ephPk: Point): Promise<Point> {
    return this.pxeOracleInterface.getSharedSecret(address, ephPk);
  }

  override privateGetSenderForTags(): Promise<AztecAddress | undefined> {
    return Promise.resolve(this.senderForTags);
  }

  override privateSetSenderForTags(senderForTags: AztecAddress): Promise<void> {
    this.senderForTags = senderForTags;
    return Promise.resolve();
  }

  override async txePrivateCallNewFlow(
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
      if (functionSelector.equals(await FunctionSelector.fromSignature('verify_private_authwit(Field)'))) {
        throw new Error(
          'Found no account contract artifact for a private authwit check - use `create_contract_account` instead of `create_light_account` for authwit support.',
        );
      } else {
        throw new Error('Function Artifact does not exist');
      }
    }

    const callContext = new CallContext(from, targetContractAddress, functionSelector, isStaticCall);

    const gasLimits = new Gas(DEFAULT_DA_GAS_LIMIT, DEFAULT_L2_GAS_LIMIT);

    const teardownGasLimits = new Gas(DEFAULT_TEARDOWN_DA_GAS_LIMIT, DEFAULT_TEARDOWN_L2_GAS_LIMIT);

    const gasSettings = new GasSettings(gasLimits, teardownGasLimits, GasFees.empty(), GasFees.empty());

    const txContext = new TxContext(this.CHAIN_ID, this.ROLLUP_VERSION, gasSettings);

    const blockHeader = await this.pxeOracleInterface.getBlockHeader();

    const noteCache = new ExecutionNoteCache(this.getTxRequestHash());

    // TODO(benesjan): Fix stale 'context' name.
    const context = new PrivateExecutionOracle(
      argsHash,
      txContext,
      callContext,
      /** Header of a block whose state is used during private execution (not the block the transaction is included in). */
      blockHeader,
      /** List of transient auth witnesses to be used during this simulation */
      Array.from(this.authwits.values()),
      /** List of transient auth witnesses to be used during this simulation */
      [],
      HashedValuesCache.create(),
      noteCache,
      this.pxeOracleInterface,
      this.simulator,
      0,
      1,
      undefined, // log
      undefined, // scopes
      /**
       * In TXE, the typical transaction entrypoint is skipped, so we need to simulate the actions that such a
       * contract would perform, including setting senderForTags.
       */
      from,
    );

    context.privateStoreInExecutionCache(args, argsHash);

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
          const calldata = await context.privateLoadFromExecutionCache(r.calldataHash);
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
      this.privateStoreInExecutionCache(returnValues, returnValuesHash);
    }

    // According to the protocol rules, the nonce generator for the note hashes
    // can either be the first nullifier in the tx or the hash of the initial tx request
    // if there are none.
    const nonceGenerator = result.firstNullifier.equals(Fr.ZERO) ? this.getTxRequestHash() : result.firstNullifier;
    const { publicInputs } = await generateSimulatedProvingResult(result, nonceGenerator, this.contractDataProvider);

    const globals = makeGlobalVariables();
    globals.blockNumber = this.blockNumber;
    globals.timestamp = this.timestamp;
    globals.chainId = new Fr(this.CHAIN_ID);
    globals.version = new Fr(this.ROLLUP_VERSION);
    globals.gasFees = GasFees.empty();

    const contractsDB = new PublicContractsDB(new TXEPublicContractDataSource(this));
    const guardedMerkleTrees = new GuardedMerkleTreeOperations(this.baseFork);
    const simulator = new PublicTxSimulator(guardedMerkleTrees, contractsDB, globals, true, true);
    const processor = new PublicProcessor(globals, guardedMerkleTrees, contractsDB, simulator, new TestDateProvider());

    const tx = await Tx.create({
      data: publicInputs,
      clientIvcProof: ClientIvcProof.empty(),
      contractClassLogFields: [],
      publicFunctionCalldata: result.publicFunctionCalldata,
    });

    let checkpoint;
    if (isStaticCall) {
      checkpoint = await ForkCheckpoint.new(this.baseFork);
    }

    const results = await processor.process([tx]);

    const [processedTx] = results[0];
    const failedTxs = results[1];

    if (failedTxs.length !== 0) {
      throw new Error(`Public execution has failed: ${failedTxs[0].error}`);
    } else if (!processedTx.revertCode.isOK()) {
      if (processedTx.revertReason) {
        await enrichPublicSimulationError(processedTx.revertReason, this.contractDataProvider, this.logger);
        throw new Error(`Contract execution has reverted: ${processedTx.revertReason.getMessage()}`);
      } else {
        throw new Error('Contract execution has reverted');
      }
    }

    if (isStaticCall) {
      await checkpoint!.revert();

      return {
        endSideEffectCounter: result.entrypoint.publicInputs.endSideEffectCounter,
        returnsHash: result.entrypoint.publicInputs.returnsHash,
        txHash: tx.getTxHash(),
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

    this.setBlockNumber(this.blockNumber + 1);
    return {
      endSideEffectCounter: result.entrypoint.publicInputs.endSideEffectCounter,
      returnsHash: result.entrypoint.publicInputs.returnsHash,
      txHash: tx.getTxHash(),
    };
  }

  override async txePublicCallNewFlow(
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

    const gasLimits = new Gas(DEFAULT_DA_GAS_LIMIT, DEFAULT_L2_GAS_LIMIT);

    const teardownGasLimits = new Gas(DEFAULT_TEARDOWN_DA_GAS_LIMIT, DEFAULT_TEARDOWN_L2_GAS_LIMIT);

    const gasSettings = new GasSettings(gasLimits, teardownGasLimits, GasFees.empty(), GasFees.empty());

    const txContext = new TxContext(this.CHAIN_ID, this.ROLLUP_VERSION, gasSettings);

    const blockHeader = await this.pxeOracleInterface.getBlockHeader();

    const calldataHash = await computeCalldataHash(calldata);
    const calldataHashedValues = new HashedValues(calldata, calldataHash);

    const globals = makeGlobalVariables();
    globals.blockNumber = this.blockNumber;
    globals.timestamp = this.timestamp;
    globals.chainId = new Fr(this.CHAIN_ID);
    globals.version = new Fr(this.ROLLUP_VERSION);
    globals.gasFees = GasFees.empty();

    const contractsDB = new PublicContractsDB(new TXEPublicContractDataSource(this));
    const guardedMerkleTrees = new GuardedMerkleTreeOperations(this.baseFork);
    const simulator = new PublicTxSimulator(guardedMerkleTrees, contractsDB, globals, true, true);
    const processor = new PublicProcessor(globals, guardedMerkleTrees, contractsDB, simulator, new TestDateProvider());

    // We're simulating a scenario in which private execution immediately enqueues a public call and halts. The private
    // kernel init would in this case inject a nullifier with the transaction request hash as a non-revertible
    // side-effect, which the AVM then expects to exist in order to use it as the nonce generator when siloing notes as
    // unique.
    const nonRevertibleAccumulatedData = PrivateToPublicAccumulatedData.empty();
    if (!isStaticCall) {
      nonRevertibleAccumulatedData.nullifiers[0] = this.getTxRequestHash();
    }

    // The enqueued public call itself we make be revertible so that the public execution is itself revertible, as tests
    // may require producing reverts.
    const revertibleAccumulatedData = PrivateToPublicAccumulatedData.empty();
    revertibleAccumulatedData.publicCallRequests[0] = new PublicCallRequest(
      from,
      targetContractAddress,
      isStaticCall,
      calldataHash,
    );

    const inputsForPublic = new PartialPrivateTailPublicInputsForPublic(
      nonRevertibleAccumulatedData,
      revertibleAccumulatedData,
      PublicCallRequest.empty(),
    );

    const constantData = new TxConstantData(blockHeader, txContext, Fr.zero(), Fr.zero());

    const txData = new PrivateKernelTailCircuitPublicInputs(
      constantData,
      /*gasUsed=*/ new Gas(0, 0),
      /*feePayer=*/ AztecAddress.zero(),
      /*includeByTimestamp=*/ 0n,
      inputsForPublic,
      undefined,
    );

    const tx = await Tx.create({
      data: txData,
      clientIvcProof: ClientIvcProof.empty(),
      contractClassLogFields: [],
      publicFunctionCalldata: [calldataHashedValues],
    });

    let checkpoint;
    if (isStaticCall) {
      checkpoint = await ForkCheckpoint.new(this.baseFork);
    }

    const results = await processor.process([tx]);

    const [processedTx] = results[0];
    const failedTxs = results[1];

    if (failedTxs.length !== 0) {
      throw new Error(`Public execution has failed: ${failedTxs[0].error}`);
    } else if (!processedTx.revertCode.isOK()) {
      if (processedTx.revertReason) {
        await enrichPublicSimulationError(processedTx.revertReason, this.contractDataProvider, this.logger);
        throw new Error(`Contract execution has reverted: ${processedTx.revertReason.getMessage()}`);
      } else {
        throw new Error('Contract execution has reverted');
      }
    }

    const returnValues = results[3][0].values;
    let returnValuesHash;

    if (returnValues !== undefined) {
      // This is a bit of a hack to not deal with returning a slice in nr which is what normally happens.
      // Investigate whether it is faster to do this or return from the oracle directly.
      returnValuesHash = await computeVarArgsHash(returnValues);
      this.privateStoreInExecutionCache(returnValues, returnValuesHash);
    }

    if (isStaticCall) {
      await checkpoint!.revert();

      return {
        returnsHash: returnValuesHash ?? Fr.ZERO,
        txHash: tx.getTxHash(),
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

    this.setBlockNumber(this.blockNumber + 1);

    return {
      returnsHash: returnValuesHash ?? Fr.ZERO,
      txHash: tx.getTxHash(),
    };
  }

  private async getBlockTimestamp(blockNumber: number) {
    const blockHeader = await this.stateMachine.archiver.getBlockHeader(blockNumber);
    if (!blockHeader) {
      throw new Error(`Requested timestamp for block ${blockNumber}, which does not exist`);
    }

    return blockHeader.globalVariables.timestamp;
  }
}
