import {
  type AuthWitness,
  type AztecNode,
  CountedContractClassLog,
  CountedPublicExecutionRequest,
  Note,
  NoteAndSlot,
  type NoteStatus,
  type PrivateExecutionResult,
  PublicExecutionRequest,
  type UnencryptedL2Log,
} from '@aztec/circuit-types';
import {
  type BlockHeader,
  CallContext,
  FunctionSelector,
  PRIVATE_CONTEXT_INPUTS_LENGTH,
  PUBLIC_DISPATCH_SELECTOR,
  PrivateContextInputs,
  type TxContext,
} from '@aztec/circuits.js';
import { computeUniqueNoteHash, siloNoteHash } from '@aztec/circuits.js/hash';
import { type FunctionAbi, type FunctionArtifact, type NoteSelector, countArgumentsSize } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';

import { type NoteData, toACVMWitness } from '../acvm/index.js';
import { type HashedValuesCache } from '../common/hashed_values_cache.js';
import { type SimulationProvider } from '../server.js';
import { type DBOracle } from './db_oracle.js';
import { type ExecutionNoteCache } from './execution_note_cache.js';
import { pickNotes } from './pick_notes.js';
import { executePrivateFunction } from './private_execution.js';
import { ViewDataOracle } from './view_data_oracle.js';

/**
 * The execution context for a client tx simulation.
 */
export class ClientExecutionContext extends ViewDataOracle {
  /**
   * New notes created during this execution.
   * It's possible that a note in this list has been nullified (in the same or other executions) and doesn't exist in the ExecutionNoteCache and the final proof data.
   * But we still include those notes in the execution result because their commitments are still in the public inputs of this execution.
   * This information is only for references (currently used for tests), and is not used for any sort of constrains.
   * Users can also use this to get a clearer idea of what's happened during a simulation.
   */
  private newNotes: NoteAndSlot[] = [];
  /**
   * Notes from previous transactions that are returned to the oracle call `getNotes` during this execution.
   * The mapping maps from the unique siloed note hash to the index for notes created in private executions.
   * It maps from siloed note hash to the index for notes created by public functions.
   *
   * They are not part of the ExecutionNoteCache and being forwarded to nested contexts via `extend()`
   * because these notes are meant to be maintained on a per-call basis
   * They should act as references for the read requests output by an app circuit via public inputs.
   */
  private noteHashLeafIndexMap: Map<bigint, bigint> = new Map();
  private noteHashNullifierCounterMap: Map<number, number> = new Map();
  private contractClassLogs: CountedContractClassLog[] = [];
  private nestedExecutions: PrivateExecutionResult[] = [];
  private enqueuedPublicFunctionCalls: CountedPublicExecutionRequest[] = [];
  private publicTeardownFunctionCall: PublicExecutionRequest = PublicExecutionRequest.empty();

  constructor(
    private readonly argsHash: Fr,
    private readonly txContext: TxContext,
    private readonly callContext: CallContext,
    /** Header of a block whose state is used during private execution (not the block the transaction is included in). */
    protected readonly historicalHeader: BlockHeader,
    /** List of transient auth witnesses to be used during this simulation */
    authWitnesses: AuthWitness[],
    private readonly executionCache: HashedValuesCache,
    private readonly noteCache: ExecutionNoteCache,
    db: DBOracle,
    private node: AztecNode,
    private provider: SimulationProvider,
    protected sideEffectCounter: number = 0,
    log = createLogger('simulator:client_execution_context'),
    scopes?: AztecAddress[],
  ) {
    super(callContext.contractAddress, authWitnesses, db, node, log, scopes);
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

    if (args.length !== argumentsSize) {
      throw new Error('Invalid arguments size');
    }

    const privateContextInputs = new PrivateContextInputs(
      this.callContext,
      this.historicalHeader,
      this.txContext,
      this.sideEffectCounter,
    );
    const privateContextInputsAsFields = privateContextInputs.toFields();
    if (privateContextInputsAsFields.length !== PRIVATE_CONTEXT_INPUTS_LENGTH) {
      throw new Error('Invalid private context inputs size');
    }

    const fields = [...privateContextInputsAsFields, ...args];
    return toACVMWitness(0, fields);
  }

  /**
   * The KernelProver will use this to fully populate witnesses and provide hints to the kernel circuit
   * regarding which note hash each settled read request corresponds to.
   */
  public getNoteHashLeafIndexMap() {
    return this.noteHashLeafIndexMap;
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
   * Return the nested execution results during this execution.
   */
  public getNestedExecutions() {
    return this.nestedExecutions;
  }

  /**
   * Return the enqueued public function calls during this execution.
   */
  public getEnqueuedPublicFunctionCalls() {
    return this.enqueuedPublicFunctionCalls;
  }

  /**
   * Return the public teardown function call set during this execution.
   */
  public getPublicTeardownFunctionCall() {
    return this.publicTeardownFunctionCall;
  }

  /**
   * Pack the given array of arguments.
   * @param args - Arguments to pack
   */
  public override packArgumentsArray(args: Fr[]): Promise<Fr> {
    return Promise.resolve(this.executionCache.store(args));
  }

  /**
   * Store values in the execution cache.
   * @param values - Returns to store.
   * @returns The hash of the values.
   */
  public override storeInExecutionCache(values: Fr[]): Promise<Fr> {
    return Promise.resolve(this.executionCache.store(values));
  }

  /**
   * Gets values from the execution cache.
   * @param hash - Hash of the values.
   * @returns The values.
   */
  public override loadFromExecutionCache(hash: Fr): Promise<Fr[]> {
    return Promise.resolve(this.executionCache.getPreimage(hash));
  }

  /**
   * Gets some notes for a storage slot.
   *
   * @remarks
   * Check for pending notes with matching slot.
   * Real notes coming from DB will have a leafIndex which
   * represents their index in the note hash tree.
   *
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
  public override async getNotes(
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
    const pendingNotes = this.noteCache.getNotes(this.callContext.contractAddress, storageSlot);

    const pendingNullifiers = this.noteCache.getNullifiers(this.callContext.contractAddress);
    const dbNotes = await this.db.getNotes(this.callContext.contractAddress, storageSlot, status, this.scopes);
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
        .map(n => `${n.nonce.toString()}:[${n.note.items.map(i => i.toString()).join(',')}]`)
        .join(', ')}`,
    );

    notes.forEach(n => {
      if (n.index !== undefined) {
        const siloedNoteHash = siloNoteHash(n.contractAddress, n.noteHash);
        const uniqueNoteHash = computeUniqueNoteHash(n.nonce, siloedNoteHash);

        this.noteHashLeafIndexMap.set(uniqueNoteHash.toBigInt(), n.index);
      }
    });

    return notes;
  }

  /**
   * Keep track of the new note created during execution.
   * It can be used in subsequent calls (or transactions when chaining txs is possible).
   * @param contractAddress - The contract address.
   * @param storageSlot - The storage slot.
   * @param noteTypeId - The type ID of the note.
   * @param noteItems - The items to be included in a Note.
   * @param noteHash - A hash of the new note.
   * @returns
   */
  public override notifyCreatedNote(
    storageSlot: Fr,
    noteTypeId: NoteSelector,
    noteItems: Fr[],
    noteHash: Fr,
    counter: number,
  ) {
    const note = new Note(noteItems);
    this.noteCache.addNewNote(
      {
        contractAddress: this.callContext.contractAddress,
        storageSlot,
        nonce: Fr.ZERO, // Nonce cannot be known during private execution.
        note,
        siloedNullifier: undefined, // Siloed nullifier cannot be known for newly created note.
        noteHash,
      },
      counter,
    );
    this.newNotes.push(new NoteAndSlot(note, storageSlot, noteTypeId));
  }

  /**
   * Adding a siloed nullifier into the current set of all pending nullifiers created
   * within the current transaction/execution.
   * @param innerNullifier - The pending nullifier to add in the list (not yet siloed by contract address).
   * @param noteHash - A hash of the new note.
   */
  public override notifyNullifiedNote(innerNullifier: Fr, noteHash: Fr, counter: number) {
    const nullifiedNoteHashCounter = this.noteCache.nullifyNote(
      this.callContext.contractAddress,
      innerNullifier,
      noteHash,
    );
    if (nullifiedNoteHashCounter !== undefined) {
      this.noteHashNullifierCounterMap.set(nullifiedNoteHashCounter, counter);
    }
    return Promise.resolve();
  }

  /**
   * Emit a contract class unencrypted log.
   * This fn exists because sha hashing the preimage
   * is too large to compile (16,200 fields, 518,400 bytes) => the oracle hashes it.
   * See private_context.nr
   * @param log - The unencrypted log to be emitted.
   */
  public override emitContractClassLog(log: UnencryptedL2Log, counter: number) {
    this.contractClassLogs.push(new CountedContractClassLog(log, counter));
    const text = log.toHumanReadable();
    this.log.verbose(
      `Emitted log from ContractClassRegisterer: "${text.length > 100 ? text.slice(0, 100) + '...' : text}"`,
    );
    return Fr.fromBuffer(log.hash());
  }

  #checkValidStaticCall(childExecutionResult: PrivateExecutionResult) {
    if (
      childExecutionResult.publicInputs.noteHashes.some(item => !item.isEmpty()) ||
      childExecutionResult.publicInputs.nullifiers.some(item => !item.isEmpty()) ||
      childExecutionResult.publicInputs.l2ToL1Msgs.some(item => !item.isEmpty()) ||
      childExecutionResult.publicInputs.privateLogs.some(item => !item.isEmpty()) ||
      childExecutionResult.publicInputs.contractClassLogsHashes.some(item => !item.isEmpty())
    ) {
      throw new Error(`Static call cannot update the state, emit L2->L1 messages or generate logs`);
    }
  }

  /**
   * Calls a private function as a nested execution.
   * @param targetContractAddress - The address of the contract to call.
   * @param functionSelector - The function selector of the function to call.
   * @param argsHash - The packed arguments to pass to the function.
   * @param sideEffectCounter - The side effect counter at the start of the call.
   * @param isStaticCall - Whether the call is a static call.
   * @returns The execution result.
   */
  override async callPrivateFunction(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
  ) {
    this.log.debug(
      `Calling private function ${this.contractAddress}:${functionSelector} from ${this.callContext.contractAddress}`,
    );

    isStaticCall = isStaticCall || this.callContext.isStaticCall;

    const targetArtifact = await this.db.getFunctionArtifact(targetContractAddress, functionSelector);

    const derivedTxContext = this.txContext.clone();

    const derivedCallContext = this.deriveCallContext(targetContractAddress, targetArtifact, isStaticCall);

    const context = new ClientExecutionContext(
      argsHash,
      derivedTxContext,
      derivedCallContext,
      this.historicalHeader,
      this.authWitnesses,
      this.executionCache,
      this.noteCache,
      this.db,
      this.node,
      this.provider,
      sideEffectCounter,
      this.log,
      this.scopes,
    );

    const childExecutionResult = await executePrivateFunction(
      this.provider,
      context,
      targetArtifact,
      targetContractAddress,
      functionSelector,
    );

    if (isStaticCall) {
      this.#checkValidStaticCall(childExecutionResult);
    }

    this.nestedExecutions.push(childExecutionResult);

    const publicInputs = childExecutionResult.publicInputs;
    return {
      endSideEffectCounter: publicInputs.endSideEffectCounter,
      returnsHash: publicInputs.returnsHash,
    };
  }

  /**
   * Creates a PublicExecutionRequest object representing the request to call a public function.
   * @param targetContractAddress - The address of the contract to call.
   * @param functionSelector - The function selector of the function to call.
   * @param argsHash - The packed arguments to pass to the function.
   * @param sideEffectCounter - The side effect counter at the start of the call.
   * @param isStaticCall - Whether the call is a static call.
   * @returns The public call stack item with the request information.
   */
  protected async createPublicExecutionRequest(
    callType: 'enqueued' | 'teardown',
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
  ) {
    const targetArtifact = await this.db.getFunctionArtifact(targetContractAddress, functionSelector);
    const derivedCallContext = this.deriveCallContext(targetContractAddress, targetArtifact, isStaticCall);
    const args = this.executionCache.getPreimage(argsHash);

    this.log.verbose(
      `Created ${callType} public execution request to ${targetArtifact.name}@${targetContractAddress}`,
      {
        sideEffectCounter,
        isStaticCall,
        functionSelector,
        targetContractAddress,
        callType,
      },
    );

    const request = PublicExecutionRequest.from({
      args,
      callContext: derivedCallContext,
    });

    if (callType === 'enqueued') {
      this.enqueuedPublicFunctionCalls.push(new CountedPublicExecutionRequest(request, sideEffectCounter));
    } else {
      this.publicTeardownFunctionCall = request;
    }
  }

  /**
   * Creates and enqueues a PublicExecutionRequest object representing the request to call a public function. No function
   * is actually called, since that must happen on the sequencer side. All the fields related to the result
   * of the execution are empty.
   * @param targetContractAddress - The address of the contract to call.
   * @param functionSelector - The function selector of the function to call.
   * @param argsHash - The packed arguments to pass to the function.
   * @param sideEffectCounter - The side effect counter at the start of the call.
   * @param isStaticCall - Whether the call is a static call.
   * @returns The public call stack item with the request information.
   */
  public override async enqueuePublicFunctionCall(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
  ): Promise<Fr> {
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/8985): Fix this.
    // WARNING: This is insecure and should be temporary!
    // The oracle repacks the arguments and returns a new args_hash.
    // new_args = [selector, ...old_args], so as to make it suitable to call the public dispatch function.
    // We don't validate or compute it in the circuit because a) it's harder to do with slices, and
    // b) this is only temporary.
    const newArgsHash = this.executionCache.store([
      functionSelector.toField(),
      ...this.executionCache.getPreimage(argsHash),
    ]);
    await this.createPublicExecutionRequest(
      'enqueued',
      targetContractAddress,
      FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR)),
      newArgsHash,
      sideEffectCounter,
      isStaticCall,
    );
    return newArgsHash;
  }

  /**
   * Creates a PublicExecutionRequest and sets it as the public teardown function. No function
   * is actually called, since that must happen on the sequencer side. All the fields related to the result
   * of the execution are empty.
   * @param targetContractAddress - The address of the contract to call.
   * @param functionSelector - The function selector of the function to call.
   * @param argsHash - The packed arguments to pass to the function.
   * @param sideEffectCounter - The side effect counter at the start of the call.
   * @param isStaticCall - Whether the call is a static call.
   * @returns The public call stack item with the request information.
   */
  public override async setPublicTeardownFunctionCall(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
  ): Promise<Fr> {
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/8985): Fix this.
    // WARNING: This is insecure and should be temporary!
    // The oracle repacks the arguments and returns a new args_hash.
    // new_args = [selector, ...old_args], so as to make it suitable to call the public dispatch function.
    // We don't validate or compute it in the circuit because a) it's harder to do with slices, and
    // b) this is only temporary.
    const newArgsHash = this.executionCache.store([
      functionSelector.toField(),
      ...this.executionCache.getPreimage(argsHash),
    ]);
    await this.createPublicExecutionRequest(
      'teardown',
      targetContractAddress,
      FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR)),
      newArgsHash,
      sideEffectCounter,
      isStaticCall,
    );
    return newArgsHash;
  }

  public override notifySetMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter: number): void {
    this.noteCache.setMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter);
  }

  /**
   * Derives the call context for a nested execution.
   * @param targetContractAddress - The address of the contract being called.
   * @param targetArtifact - The artifact of the function being called.
   * @param isStaticCall - Whether the call is a static call.
   * @returns The derived call context.
   */
  private deriveCallContext(
    targetContractAddress: AztecAddress,
    targetArtifact: FunctionArtifact,
    isStaticCall = false,
  ) {
    return new CallContext(
      this.contractAddress,
      targetContractAddress,
      FunctionSelector.fromNameAndParameters(targetArtifact.name, targetArtifact.parameters),
      isStaticCall,
    );
  }

  public getDebugFunctionName() {
    return this.db.getDebugFunctionName(this.contractAddress, this.callContext.functionSelector);
  }

  public override async incrementAppTaggingSecretIndexAsSender(sender: AztecAddress, recipient: AztecAddress) {
    await this.db.incrementAppTaggingSecretIndexAsSender(this.contractAddress, sender, recipient);
  }

  public override async syncNotes() {
    const taggedLogsByRecipient = await this.db.syncTaggedLogs(
      this.contractAddress,
      this.historicalHeader.globalVariables.blockNumber.toNumber(),
      this.scopes,
    );
    for (const [recipient, taggedLogs] of taggedLogsByRecipient.entries()) {
      await this.db.processTaggedLogs(taggedLogs, AztecAddress.fromString(recipient));
    }

    await this.db.removeNullifiedNotes(this.contractAddress);
  }
}
