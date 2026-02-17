import { MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS, PRIVATE_CONTEXT_INPUTS_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { type CircuitSimulator, toACVMWitness } from '@aztec/simulator/client';
import {
  type FunctionAbi,
  type FunctionArtifact,
  type FunctionCall,
  FunctionSelector,
  type NoteSelector,
  countArgumentsSize,
} from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { siloNullifier } from '@aztec/stdlib/hash';
import { PrivateContextInputs } from '@aztec/stdlib/kernel';
import { type ContractClassLog, DirectionalAppTaggingSecret, type PreTag } from '@aztec/stdlib/logs';
import { Tag } from '@aztec/stdlib/logs';
import { Note, type NoteStatus } from '@aztec/stdlib/note';
import {
  CallContext,
  CountedContractClassLog,
  NoteAndSlot,
  PrivateCallExecutionResult,
  type TxContext,
} from '@aztec/stdlib/tx';

import type { AccessScopes } from '../../access_scopes.js';
import type { ContractSyncService } from '../../contract_sync/contract_sync_service.js';
import { NoteService } from '../../notes/note_service.js';
import type { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
import { syncSenderTaggingIndexes } from '../../tagging/index.js';
import type { ExecutionNoteCache } from '../execution_note_cache.js';
import { ExecutionTaggingIndexCache } from '../execution_tagging_index_cache.js';
import type { HashedValuesCache } from '../hashed_values_cache.js';
import { pickNotes } from '../pick_notes.js';
import type { IPrivateExecutionOracle, NoteData } from './interfaces.js';
import { executePrivateFunction } from './private_execution.js';
import { UtilityExecutionOracle, type UtilityExecutionOracleArgs } from './utility_execution_oracle.js';

/** Args for PrivateExecutionOracle constructor. */
export type PrivateExecutionOracleArgs = Omit<UtilityExecutionOracleArgs, 'contractAddress'> & {
  argsHash: Fr;
  txContext: TxContext;
  callContext: CallContext;
  /** Needed to trigger contract synchronization before nested calls */
  utilityExecutor: (call: FunctionCall, scopes: AccessScopes) => Promise<void>;
  executionCache: HashedValuesCache;
  noteCache: ExecutionNoteCache;
  taggingIndexCache: ExecutionTaggingIndexCache;
  senderTaggingStore: SenderTaggingStore;
  contractSyncService: ContractSyncService;
  totalPublicCalldataCount?: number;
  sideEffectCounter?: number;
  senderForTags?: AztecAddress;
  simulator?: CircuitSimulator;
};

/**
 * The execution oracle for the private part of a transaction.
 */
export class PrivateExecutionOracle extends UtilityExecutionOracle implements IPrivateExecutionOracle {
  isPrivate = true as const;

  /**
   * New notes created during this execution.
   * It's possible that a note in this list has been nullified (in the same or other executions) and doesn't exist in
   * the ExecutionNoteCache and the final proof data. But we still include those notes in the execution result because
   * their commitments are still in the public inputs of this execution.
   * This information is only for references (currently used for tests), and is not used for any sort of constrains.
   * Users can also use this to get a clearer idea of what's happened during a simulation.
   */
  private newNotes: NoteAndSlot[] = [];
  private noteHashNullifierCounterMap: Map<number, number> = new Map();
  private contractClassLogs: CountedContractClassLog[] = [];
  private offchainEffects: { data: Fr[] }[] = [];
  private nestedExecutionResults: PrivateCallExecutionResult[] = [];

  private readonly argsHash: Fr;
  private readonly txContext: TxContext;
  private readonly callContext: CallContext;
  private readonly utilityExecutor: (call: FunctionCall, scopes: AccessScopes) => Promise<void>;
  private readonly executionCache: HashedValuesCache;
  private readonly noteCache: ExecutionNoteCache;
  private readonly taggingIndexCache: ExecutionTaggingIndexCache;
  private readonly senderTaggingStore: SenderTaggingStore;
  private readonly contractSyncService: ContractSyncService;
  private totalPublicCalldataCount: number;
  protected sideEffectCounter: number;
  private senderForTags?: AztecAddress;
  private readonly simulator?: CircuitSimulator;

  constructor(args: PrivateExecutionOracleArgs) {
    super({
      ...args,
      contractAddress: args.callContext.contractAddress,
      log: args.log ?? createLogger('simulator:client_execution_context'),
    });
    this.argsHash = args.argsHash;
    this.txContext = args.txContext;
    this.callContext = args.callContext;
    this.utilityExecutor = args.utilityExecutor;
    this.executionCache = args.executionCache;
    this.noteCache = args.noteCache;
    this.taggingIndexCache = args.taggingIndexCache;
    this.senderTaggingStore = args.senderTaggingStore;
    this.contractSyncService = args.contractSyncService;
    this.totalPublicCalldataCount = args.totalPublicCalldataCount ?? 0;
    this.sideEffectCounter = args.sideEffectCounter ?? 0;
    this.senderForTags = args.senderForTags;
    this.simulator = args.simulator;
  }

  public getPrivateContextInputs(): PrivateContextInputs {
    return new PrivateContextInputs(this.callContext, this.anchorBlockHeader, this.txContext, this.sideEffectCounter);
  }

  // We still need this function until we can get user-defined ordering of structs for fn arguments
  // TODO When that is sorted out on noir side, we can use instead the utilities in serialize.ts
  /**
   * Writes the function inputs to the initial witness.
   * @param abi - The function ABI.
   * @returns The initial witness.
   */
  public getInitialWitness(abi: FunctionAbi) {
    const argumentsSize = countArgumentsSize(abi);

    const args = this.executionCache.getPreimage(this.argsHash);

    if (args?.length !== argumentsSize) {
      throw new Error(`Invalid arguments size: expected ${argumentsSize}, got ${args?.length}`);
    }

    const privateContextInputsAsFields = this.getPrivateContextInputs().toFields();
    if (privateContextInputsAsFields.length !== PRIVATE_CONTEXT_INPUTS_LENGTH) {
      throw new Error('Invalid private context inputs size');
    }

    const fields = [...privateContextInputsAsFields, ...args];
    return toACVMWitness(0, fields);
  }

  /**
   * Get the data for the newly created notes.
   */
  public getNewNotes(): NoteAndSlot[] {
    return this.newNotes;
  }

  public getNoteHashNullifierCounterMap() {
    return this.noteHashNullifierCounterMap;
  }

  /**
   * Return the contract class logs emitted during this execution.
   */
  public getContractClassLogs() {
    return this.contractClassLogs;
  }

  /**
   * Return the offchain effects emitted during this execution.
   */
  public getOffchainEffects() {
    return this.offchainEffects;
  }

  /**
   * Returns the pre-tags that were used in this execution (and that need to be stored in the db).
   */
  public getUsedPreTags(): PreTag[] {
    return this.taggingIndexCache.getUsedPreTags();
  }

  /**
   * Return the nested execution results during this execution.
   */
  public getNestedExecutionResults() {
    return this.nestedExecutionResults;
  }

  /**
   * Get the sender for tags.
   *
   * This unconstrained value is used as the sender when computing an unconstrained shared secret
   * for a tag in order to emit a log. Constrained tagging should not use this as there is no
   * guarantee that the recipient knows about the sender, and hence about the shared secret.
   *
   * The value persists through nested calls, meaning all calls down the stack will use the same
   * 'senderForTags' value (unless it is replaced).
   */
  public privateGetSenderForTags(): Promise<AztecAddress | undefined> {
    return Promise.resolve(this.senderForTags);
  }

  /**
   * Set the sender for tags.
   *
   * This unconstrained value is used as the sender when computing an unconstrained shared secret
   * for a tag in order to emit a log. Constrained tagging should not use this as there is no
   * guarantee that the recipient knows about the sender, and hence about the shared secret.
   *
   * Account contracts typically set this value before calling other contracts. The value persists
   * through nested calls, meaning all calls down the stack will use the same 'senderForTags'
   * value (unless it is replaced by another call to this setter).
   */
  public privateSetSenderForTags(senderForTags: AztecAddress): Promise<void> {
    this.senderForTags = senderForTags;
    return Promise.resolve();
  }

  /**
   * Returns the next app tag for a given sender and recipient pair.
   * @param sender - The address sending the log
   * @param recipient - The address receiving the log
   * @returns An app tag to be used in a log.
   */
  public async privateGetNextAppTagAsSender(sender: AztecAddress, recipient: AztecAddress): Promise<Tag> {
    const secret = await this.#calculateDirectionalAppTaggingSecret(this.contractAddress, sender, recipient);

    const index = await this.#getIndexToUseForSecret(secret);
    this.log.debug(
      `Incrementing tagging index for sender: ${sender}, recipient: ${recipient}, contract: ${this.contractAddress} to ${index}`,
    );
    this.taggingIndexCache.setLastUsedIndex(secret, index);

    return Tag.compute({ secret, index });
  }

  async #calculateDirectionalAppTaggingSecret(
    contractAddress: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
  ) {
    const senderCompleteAddress = await this.getCompleteAddressOrFail(sender);
    const senderIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(sender);
    return DirectionalAppTaggingSecret.compute(
      senderCompleteAddress,
      senderIvsk,
      recipient,
      contractAddress,
      recipient,
    );
  }

  async #getIndexToUseForSecret(secret: DirectionalAppTaggingSecret): Promise<number> {
    // If we have the tagging index in the cache, we use it. If not we obtain it from the execution data provider.
    const lastUsedIndexInTx = this.taggingIndexCache.getLastUsedIndex(secret);

    if (lastUsedIndexInTx !== undefined) {
      return lastUsedIndexInTx + 1;
    } else {
      // This is a tagging secret we've not yet used in this tx, so first sync our store to make sure its indices
      // are up to date. We do this here because this store is not synced as part of the global sync because
      // that'd be wasteful as most tagging secrets are not used in each tx.
      await syncSenderTaggingIndexes(
        secret,
        this.contractAddress,
        this.aztecNode,
        this.senderTaggingStore,
        await this.anchorBlockHeader.hash(),
        this.jobId,
      );

      const lastUsedIndex = await this.senderTaggingStore.getLastUsedIndex(secret, this.jobId);
      // If lastUsedIndex is undefined, we've never used this secret, so start from 0
      // Otherwise, the next index to use is one past the last used index
      return lastUsedIndex === undefined ? 0 : lastUsedIndex + 1;
    }
  }

  /**
   * Store values in the execution cache.
   * @param values - Values to store.
   * @returns The hash of the values.
   */
  public privateStoreInExecutionCache(values: Fr[], hash: Fr) {
    return this.executionCache.store(values, hash);
  }

  /**
   * Gets values from the execution cache.
   * @param hash - Hash of the values.
   * @returns The values.
   */
  public privateLoadFromExecutionCache(hash: Fr): Promise<Fr[]> {
    const preimage = this.executionCache.getPreimage(hash);
    if (!preimage) {
      throw new Error(`Preimage for hash ${hash.toString()} not found in cache`);
    }
    return Promise.resolve(preimage);
  }

  override async utilityCheckNullifierExists(innerNullifier: Fr): Promise<boolean> {
    // This oracle must be overridden because while utility execution can only meaningfully check if a nullifier exists
    // in the synched block, during private execution there's also the possibility of it being pending, i.e. created
    // in the current transaction.

    this.log.debug(`Checking existence of inner nullifier ${innerNullifier}`, {
      contractAddress: this.contractAddress,
    });

    const nullifier = (await siloNullifier(this.contractAddress, innerNullifier)).toBigInt();

    return (
      this.noteCache.getNullifiers(this.contractAddress).has(nullifier) ||
      (await super.utilityCheckNullifierExists(innerNullifier))
    );
  }

  /**
   * Gets some notes for a storage slot.
   *
   * @remarks
   * Check for pending notes with matching slot.
   * Real notes coming from DB will have a leafIndex which
   * represents their index in the note hash tree.
   *
   * @param owner - The owner of the notes. If undefined, returns notes for all owners.
   * @param storageSlot - The storage slot.
   * @param numSelects - The number of valid selects in selectBy and selectValues.
   * @param selectBy - An array of indices of the fields to selects.
   * @param selectValues - The values to match.
   * @param selectComparators - The comparators to match by.
   * @param sortBy - An array of indices of the fields to sort.
   * @param sortOrder - The order of the corresponding index in sortBy. (1: DESC, 2: ASC, 0: Do nothing)
   * @param limit - The number of notes to retrieve per query.
   * @param offset - The starting index for pagination.
   * @param status - The status of notes to fetch.
   * @returns Array of note data.
   */
  public override async utilityGetNotes(
    owner: AztecAddress | undefined,
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
  ): Promise<NoteData[]> {
    // Nullified pending notes are already removed from the list.
    const pendingNotes = this.noteCache.getNotes(this.callContext.contractAddress, owner, storageSlot);

    const pendingNullifiers = this.noteCache.getNullifiers(this.callContext.contractAddress);

    const noteService = new NoteService(this.noteStore, this.aztecNode, this.anchorBlockHeader, this.jobId);
    const dbNotes = await noteService.getNotes(
      this.callContext.contractAddress,
      owner,
      storageSlot,
      status,
      this.scopes,
    );
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

    this.log.debug(
      `Returning ${notes.length} notes for ${this.callContext.contractAddress} at ${storageSlot}: ${notes
        .map(n => `${n.noteNonce.toString()}:[${n.note.items.map(i => i.toString()).join(',')}]`)
        .join(', ')}`,
    );

    return notes;
  }

  /**
   * Keep track of the new note created during execution.
   * It can be used in subsequent calls (or transactions when chaining txs is possible).
   * @param owner - The owner of the note.
   * @param storageSlot - The storage slot.
   * @param randomness - The randomness injected into the note.
   * @param noteTypeId - The type ID of the note.
   * @param noteItems - The items to be included in a Note.
   * @param noteHash - A hash of the new note.
   * @returns
   */
  public privateNotifyCreatedNote(
    owner: AztecAddress,
    storageSlot: Fr,
    randomness: Fr,
    noteTypeId: NoteSelector,
    noteItems: Fr[],
    noteHash: Fr,
    counter: number,
  ) {
    this.log.debug(`Notified of new note with inner hash ${noteHash}`, {
      contractAddress: this.callContext.contractAddress,
      storageSlot,
      randomness,
      noteTypeId,
      counter,
    });

    const note = new Note(noteItems);
    this.noteCache.addNewNote(
      {
        contractAddress: this.callContext.contractAddress,
        owner,
        storageSlot,
        randomness,
        noteNonce: Fr.ZERO, // Nonce cannot be known during private execution.
        note,
        siloedNullifier: undefined, // Siloed nullifier cannot be known for newly created note.
        noteHash,
        isPending: true, // This note has just been created and hence is not settled yet.
      },
      counter,
    );
    this.newNotes.push(NoteAndSlot.from({ note, storageSlot, randomness, noteTypeId }));
  }

  /**
   * Adding a siloed nullifier into the current set of all pending nullifiers created
   * within the current transaction/execution.
   * @param innerNullifier - The pending nullifier to add in the list (not yet siloed by contract address).
   * @param noteHash - A hash of the new note.
   */
  public async privateNotifyNullifiedNote(innerNullifier: Fr, noteHash: Fr, counter: number) {
    const nullifiedNoteHashCounter = await this.noteCache.nullifyNote(
      this.callContext.contractAddress,
      innerNullifier,
      noteHash,
    );
    if (nullifiedNoteHashCounter !== undefined) {
      this.noteHashNullifierCounterMap.set(nullifiedNoteHashCounter, counter);
    }
  }

  /**
   * Adding a siloed nullifier into the current set of all pending nullifiers created
   * within the current transaction/execution.
   * @param innerNullifier - The pending nullifier to add in the list (not yet siloed by contract address).
   * @param noteHash - A hash of the new note.
   */
  public privateNotifyCreatedNullifier(innerNullifier: Fr) {
    this.log.debug(`Notified of new inner nullifier ${innerNullifier}`, { contractAddress: this.contractAddress });
    return this.noteCache.nullifierCreated(this.callContext.contractAddress, innerNullifier);
  }

  /**
   * Check if a nullifier has been emitted in the same transaction, i.e. if privateNotifyCreatedNullifier has been
   * called for this inner nullifier from the contract with the specified address.
   * @param innerNullifier - The inner nullifier to check.
   * @param contractAddress - Address of the contract that emitted the nullifier.
   * @returns A boolean indicating whether the nullifier is pending or not.
   */
  public async privateIsNullifierPending(innerNullifier: Fr, contractAddress: AztecAddress): Promise<boolean> {
    const siloedNullifier = await siloNullifier(contractAddress, innerNullifier);
    const isNullifierPending = this.noteCache.getNullifiers(contractAddress).has(siloedNullifier.toBigInt());
    return Promise.resolve(isNullifierPending);
  }

  /**
   * Emit a contract class log.
   * This fn exists because we only carry a poseidon hash through the kernels, and need to
   * keep the preimage in ts for later.
   * @param log - The contract class log to be emitted.
   * @param counter - The contract class log's counter.
   */
  public privateNotifyCreatedContractClassLog(log: ContractClassLog, counter: number) {
    this.contractClassLogs.push(new CountedContractClassLog(log, counter));
    const text = log.toBuffer().toString('hex');
    this.log.verbose(
      `Emitted log from ContractClassRegistry: "${text.length > 100 ? text.slice(0, 100) + '...' : text}"`,
    );
  }

  #checkValidStaticCall(childExecutionResult: PrivateCallExecutionResult) {
    if (
      childExecutionResult.publicInputs.noteHashes.claimedLength > 0 ||
      childExecutionResult.publicInputs.nullifiers.claimedLength > 0 ||
      childExecutionResult.publicInputs.l2ToL1Msgs.claimedLength > 0 ||
      childExecutionResult.publicInputs.privateLogs.claimedLength > 0 ||
      childExecutionResult.publicInputs.contractClassLogsHashes.claimedLength > 0
    ) {
      throw new Error(`Static call cannot update the state, emit L2->L1 messages or generate logs`);
    }
  }

  /**
   * Calls a private function as a nested execution.
   * @param targetContractAddress - The address of the contract to call.
   * @param functionSelector - The function selector of the function to call.
   * @param argsHash - The arguments hash to pass to the function.
   * @param sideEffectCounter - The side effect counter at the start of the call.
   * @param isStaticCall - Whether the call is a static call.
   * @returns The execution result.
   */
  async privateCallPrivateFunction(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
  ) {
    if (!this.simulator) {
      // In practice it is only when creating inline private contexts in a Noir test using TXE that we create an
      // instance of this class without a simulator.
      throw new Error('No simulator provided, cannot perform a nested private call');
    }

    const simulatorSetupTimer = new Timer();
    this.log.debug(
      `Calling private function ${targetContractAddress}:${functionSelector} from ${this.callContext.contractAddress}`,
    );

    isStaticCall = isStaticCall || this.callContext.isStaticCall;

    // When scopes are set and the target contract is a registered account (has keys in the keyStore),
    // expand scopes to include it so nested private calls can sync and read the contract's own notes.
    // We only expand for registered accounts because the log service needs the recipient's keys to derive
    // tagging secrets, which are only available for registered accounts.
    const expandedScopes =
      this.scopes !== 'ALL_SCOPES' && (await this.keyStore.hasAccount(targetContractAddress))
        ? [...this.scopes, targetContractAddress]
        : this.scopes;

    await this.contractSyncService.ensureContractSynced(
      targetContractAddress,
      functionSelector,
      this.utilityExecutor,
      this.anchorBlockHeader,
      this.jobId,
      expandedScopes,
    );

    const targetArtifact = await this.contractStore.getFunctionArtifactWithDebugMetadata(
      targetContractAddress,
      functionSelector,
    );

    const derivedTxContext = this.txContext.clone();

    const derivedCallContext = await this.deriveCallContext(targetContractAddress, targetArtifact, isStaticCall);

    const privateExecutionOracle = new PrivateExecutionOracle({
      argsHash,
      txContext: derivedTxContext,
      callContext: derivedCallContext,
      anchorBlockHeader: this.anchorBlockHeader,
      utilityExecutor: this.utilityExecutor,
      authWitnesses: this.authWitnesses,
      capsules: this.capsules,
      executionCache: this.executionCache,
      noteCache: this.noteCache,
      taggingIndexCache: this.taggingIndexCache,
      contractStore: this.contractStore,
      noteStore: this.noteStore,
      keyStore: this.keyStore,
      addressStore: this.addressStore,
      aztecNode: this.aztecNode,
      senderTaggingStore: this.senderTaggingStore,
      recipientTaggingStore: this.recipientTaggingStore,
      senderAddressBookStore: this.senderAddressBookStore,
      capsuleStore: this.capsuleStore,
      privateEventStore: this.privateEventStore,
      contractSyncService: this.contractSyncService,
      jobId: this.jobId,
      totalPublicCalldataCount: this.totalPublicCalldataCount,
      sideEffectCounter,
      log: this.log,
      scopes: expandedScopes,
      senderForTags: this.senderForTags,
      simulator: this.simulator!,
    });

    const setupTime = simulatorSetupTimer.ms();

    const childExecutionResult = await executePrivateFunction(
      this.simulator!,
      privateExecutionOracle,
      targetArtifact,
      targetContractAddress,
      functionSelector,
    );

    if (isStaticCall) {
      this.#checkValidStaticCall(childExecutionResult);
    }

    this.nestedExecutionResults.push(childExecutionResult);

    const publicInputs = childExecutionResult.publicInputs;

    // Add simulator overhead to this call
    if (childExecutionResult.profileResult) {
      childExecutionResult.profileResult.timings.witgen += setupTime;
    }

    return {
      endSideEffectCounter: publicInputs.endSideEffectCounter,
      returnsHash: publicInputs.returnsHash,
    };
  }

  #onNewPublicFunctionCall(calldataHash: Fr) {
    const calldata = this.executionCache.getPreimage(calldataHash);
    if (!calldata) {
      throw new Error('Calldata for public call not found in cache');
    }

    this.totalPublicCalldataCount += calldata.length;
    if (this.totalPublicCalldataCount > MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS) {
      throw new Error(`Too many total args to all enqueued public calls! (> ${MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS})`);
    }
  }

  /**
   * Verify relevant information when a public function is enqueued.
   * @param targetContractAddress - The address of the contract to call.
   * @param calldataHash - The hash of the function selector and arguments.
   * @param sideEffectCounter - The side effect counter at the start of the call.
   * @param isStaticCall - Whether the call is a static call.
   */
  public privateNotifyEnqueuedPublicFunctionCall(
    _targetContractAddress: AztecAddress,
    calldataHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ) {
    this.#onNewPublicFunctionCall(calldataHash);
    return Promise.resolve();
  }

  /**
   * Verify relevant information when a public teardown function is set.
   * @param targetContractAddress - The address of the contract to call.
   * @param argsHash - The arguments hash to pass to the function.
   * @param sideEffectCounter - The side effect counter at the start of the call.
   * @param isStaticCall - Whether the call is a static call.
   */
  public privateNotifySetPublicTeardownFunctionCall(
    _targetContractAddress: AztecAddress,
    calldataHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ) {
    this.#onNewPublicFunctionCall(calldataHash);
    return Promise.resolve();
  }

  public privateNotifySetMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter: number): Promise<void> {
    return this.noteCache.setMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter);
  }

  public privateIsSideEffectCounterRevertible(sideEffectCounter: number): Promise<boolean> {
    return Promise.resolve(this.noteCache.isSideEffectCounterRevertible(sideEffectCounter));
  }

  /**
   * Derives the call context for a nested execution.
   * @param targetContractAddress - The address of the contract being called.
   * @param targetArtifact - The artifact of the function being called.
   * @param isStaticCall - Whether the call is a static call.
   * @returns The derived call context.
   */
  private async deriveCallContext(
    targetContractAddress: AztecAddress,
    targetArtifact: FunctionArtifact,
    isStaticCall = false,
  ) {
    return new CallContext(
      this.contractAddress,
      targetContractAddress,
      await FunctionSelector.fromNameAndParameters(targetArtifact.name, targetArtifact.parameters),
      isStaticCall,
    );
  }

  public getDebugFunctionName() {
    return this.contractStore.getDebugFunctionName(this.contractAddress, this.callContext.functionSelector);
  }

  public utilityEmitOffchainEffect(data: Fr[]): Promise<void> {
    this.offchainEffects.push({ data });
    return Promise.resolve();
  }
}
