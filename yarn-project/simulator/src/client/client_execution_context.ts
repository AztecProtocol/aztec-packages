import {
  type AuthWitness,
  type AztecNode,
  EncryptedL2Log,
  EncryptedL2NoteLog,
  L1NotePayload,
  Note,
  type NoteStatus,
  TaggedNote,
  type UnencryptedL2Log,
} from '@aztec/circuit-types';
import {
  CallContext,
  FunctionSelector,
  type Header,
  PrivateContextInputs,
  PublicCallRequest,
  type TxContext,
} from '@aztec/circuits.js';
import { Aes128 } from '@aztec/circuits.js/barretenberg';
import { computePublicDataTreeLeafSlot, computeUniqueNoteHash, siloNoteHash } from '@aztec/circuits.js/hash';
import { type FunctionAbi, type FunctionArtifact, countArgumentsSize } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { pedersenHash } from '@aztec/foundation/crypto';
import { Fr, GrumpkinScalar, type Point } from '@aztec/foundation/fields';
import { applyStringFormatting, createDebugLogger } from '@aztec/foundation/log';

import { type NoteData, toACVMWitness } from '../acvm/index.js';
import { type PackedValuesCache } from '../common/packed_values_cache.js';
import { type DBOracle } from './db_oracle.js';
import { type ExecutionNoteCache } from './execution_note_cache.js';
import { CountedLog, type ExecutionResult, type NoteAndSlot } from './execution_result.js';
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
  private nullifiedNoteHashCounters: Map<number, number> = new Map();
  private noteEncryptedLogs: CountedLog<EncryptedL2NoteLog>[] = [];
  private encryptedLogs: CountedLog<EncryptedL2Log>[] = [];
  private unencryptedLogs: CountedLog<UnencryptedL2Log>[] = [];
  private nestedExecutions: ExecutionResult[] = [];
  private enqueuedPublicFunctionCalls: PublicCallRequest[] = [];
  private publicTeardownFunctionCall: PublicCallRequest = PublicCallRequest.empty();

  constructor(
    contractAddress: AztecAddress,
    private readonly argsHash: Fr,
    private readonly txContext: TxContext,
    private readonly callContext: CallContext,
    /** Header of a block whose state is used during private execution (not the block the transaction is included in). */
    protected readonly historicalHeader: Header,
    /** List of transient auth witnesses to be used during this simulation */
    authWitnesses: AuthWitness[],
    private readonly packedValuesCache: PackedValuesCache,
    private readonly noteCache: ExecutionNoteCache,
    db: DBOracle,
    private node: AztecNode,
    protected sideEffectCounter: number = 0,
    log = createDebugLogger('aztec:simulator:client_execution_context'),
  ) {
    super(contractAddress, authWitnesses, db, node, log);
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

    const args = this.packedValuesCache.unpack(this.argsHash);

    if (args.length !== argumentsSize) {
      throw new Error('Invalid arguments size');
    }

    const privateContextInputs = new PrivateContextInputs(
      this.callContext,
      this.historicalHeader,
      this.txContext,
      this.sideEffectCounter,
    );

    const fields = [...privateContextInputs.toFields(), ...args];
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
   * @param innerNoteHashes - Inner note hashes for the notes.
   */
  public getNewNotes(): NoteAndSlot[] {
    return this.newNotes;
  }

  public getNullifiedNoteHashCounters() {
    return this.nullifiedNoteHashCounters;
  }

  /**
   * Return the note encrypted logs emitted during this execution.
   */
  public getNoteEncryptedLogs() {
    return this.noteEncryptedLogs;
  }

  /**
   * Sometimes notes can be chopped after a nested execution is complete.
   * This means finished nested executions still hold transient logs. This method removes them.
   * TODO(Miranda): is there a cleaner solution?
   */
  public chopNoteEncryptedLogs() {
    // Do not return logs that have been chopped in the cache
    const allNoteLogs = this.noteCache.getLogs();
    this.noteEncryptedLogs = this.noteEncryptedLogs.filter(l => allNoteLogs.includes(l));
    const chop = (thing: any) =>
      thing.nestedExecutions.forEach((result: ExecutionResult) => {
        if (!result.noteEncryptedLogs[0]?.isEmpty()) {
          // The execution has note logs
          result.noteEncryptedLogs = result.noteEncryptedLogs.filter(l => allNoteLogs.includes(l));
        }
        chop(result);
      });
    chop(this);
  }

  /**
   * Return the note encrypted logs emitted during this execution and nested executions.
   */
  public getAllNoteEncryptedLogs() {
    return this.noteCache.getLogs();
  }

  /**
   * Return the encrypted logs emitted during this execution.
   */
  public getEncryptedLogs() {
    return this.encryptedLogs;
  }

  /**
   * Return the encrypted logs emitted during this execution.
   */
  public getUnencryptedLogs() {
    return this.unencryptedLogs;
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
    return Promise.resolve(this.packedValuesCache.pack(args));
  }

  /**
   * Pack the given returns.
   * @param returns - Returns to pack
   */
  public override packReturns(returns: Fr[]): Promise<Fr> {
    return Promise.resolve(this.packedValuesCache.pack(returns));
  }

  /**
   * Unpack the given returns.
   * @param returnsHash - Returns hash to unpack
   */
  public override unpackReturns(returnsHash: Fr): Promise<Fr[]> {
    return Promise.resolve(this.packedValuesCache.unpack(returnsHash));
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
    const pendingNotes = this.noteCache.getNotes(this.callContext.storageContractAddress, storageSlot);

    const pendingNullifiers = this.noteCache.getNullifiers(this.callContext.storageContractAddress);
    const dbNotes = await this.db.getNotes(this.callContext.storageContractAddress, storageSlot, status);
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
      `Returning ${notes.length} notes for ${this.callContext.storageContractAddress} at ${storageSlot}: ${notes
        .map(n => `${n.nonce.toString()}:[${n.note.items.map(i => i.toString()).join(',')}]`)
        .join(', ')}`,
    );

    notes.forEach(n => {
      if (n.index !== undefined) {
        // TODO(https://github.com/AztecProtocol/aztec-packages/issues/1386)
        // Should always call computeUniqueNoteHash when publicly created notes include nonces.
        const uniqueNoteHash = n.nonce.isZero() ? n.innerNoteHash : computeUniqueNoteHash(n.nonce, n.innerNoteHash);
        const siloedNoteHash = siloNoteHash(n.contractAddress, uniqueNoteHash);
        const noteHashForReadRequest = siloedNoteHash;
        this.noteHashLeafIndexMap.set(noteHashForReadRequest.toBigInt(), n.index);
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
   * @param innerNoteHash - The inner note hash of the new note.
   * @returns
   */
  public override notifyCreatedNote(
    storageSlot: Fr,
    noteTypeId: Fr,
    noteItems: Fr[],
    innerNoteHash: Fr,
    counter: number,
  ) {
    const note = new Note(noteItems);
    this.noteCache.addNewNote(
      {
        contractAddress: this.callContext.storageContractAddress,
        storageSlot,
        nonce: Fr.ZERO, // Nonce cannot be known during private execution.
        note,
        siloedNullifier: undefined, // Siloed nullifier cannot be known for newly created note.
        innerNoteHash,
      },
      counter,
    );
    this.newNotes.push({
      storageSlot,
      noteTypeId,
      note,
    });
  }

  /**
   * Adding a siloed nullifier into the current set of all pending nullifiers created
   * within the current transaction/execution.
   * @param innerNullifier - The pending nullifier to add in the list (not yet siloed by contract address).
   * @param innerNoteHash - The inner note hash of the new note.
   */
  public override notifyNullifiedNote(innerNullifier: Fr, innerNoteHash: Fr, counter: number) {
    const nullifiedNoteHashCounter = this.noteCache.nullifyNote(
      this.callContext.storageContractAddress,
      innerNullifier,
      innerNoteHash,
    );
    if (nullifiedNoteHashCounter !== undefined) {
      this.nullifiedNoteHashCounters.set(nullifiedNoteHashCounter, counter);
    }
    return Promise.resolve();
  }

  /**
   * Emit encrypted data
   * @param encryptedNote - The encrypted data.
   * @param counter - The effects counter.
   */
  public override emitEncryptedLog(
    contractAddress: AztecAddress,
    randomness: Fr,
    encryptedData: Buffer,
    counter: number,
  ) {
    const maskedContractAddress = pedersenHash([contractAddress, randomness], 0);
    const encryptedLog = new CountedLog(new EncryptedL2Log(encryptedData, maskedContractAddress), counter);
    this.encryptedLogs.push(encryptedLog);
  }

  /**
   * Emit encrypted note data
   * @param noteHash - The note hash.
   * @param encryptedNote - The encrypted note data.
   * @param counter - The effects counter.
   */
  public override emitEncryptedNoteLog(noteHash: Fr, encryptedNote: Buffer, counter: number) {
    const encryptedLog = new CountedLog(new EncryptedL2NoteLog(encryptedNote), counter);
    this.noteEncryptedLogs.push(encryptedLog);
    this.noteCache.addNewLog(encryptedLog, noteHash);
  }

  /**
   * Encrypt a note
   * @param contractAddress - The contract address of the note.
   * @param storageSlot - The storage slot the note is at.
   * @param noteTypeId - The type ID of the note.
   * @param ivpk - The master incoming viewing public key.
   * @param preimage - The note preimage.
   */
  public override computeEncryptedLog(
    contractAddress: AztecAddress,
    storageSlot: Fr,
    noteTypeId: Fr,
    ivpk: Point,
    preimage: Fr[],
  ) {
    const note = new Note(preimage);
    const l1NotePayload = new L1NotePayload(note, contractAddress, storageSlot, noteTypeId);
    const taggedNote = new TaggedNote(l1NotePayload);

    const ephSk = GrumpkinScalar.random();

    // @todo Issue(#6410) Right now we are completely ignoring the outgoing log. Just drawing random data.
    const ovsk = GrumpkinScalar.random();
    const recipient = AztecAddress.random();

    return taggedNote.encrypt(ephSk, recipient, ivpk, ovsk);
  }

  /**
   * Emit an unencrypted log.
   * @param log - The unencrypted log to be emitted.
   */
  public override emitUnencryptedLog(log: UnencryptedL2Log, counter: number) {
    this.unencryptedLogs.push(new CountedLog(log, counter));
    const text = log.toHumanReadable();
    this.log.verbose(`Emitted unencrypted log: "${text.length > 100 ? text.slice(0, 100) + '...' : text}"`);
  }

  /**
   * Emit a contract class unencrypted log.
   * This fn exists separately from emitUnencryptedLog because sha hashing the preimage
   * is too large to compile (16,200 fields, 518,400 bytes) => the oracle hashes it.
   * See private_context.nr
   * @param log - The unencrypted log to be emitted.
   */
  public override emitContractClassUnencryptedLog(log: UnencryptedL2Log, counter: number) {
    this.unencryptedLogs.push(new CountedLog(log, counter));
    const text = log.toHumanReadable();
    this.log.verbose(
      `Emitted unencrypted log from ContractClassRegisterer: "${
        text.length > 100 ? text.slice(0, 100) + '...' : text
      }"`,
    );
    return Fr.fromBuffer(log.hash());
  }

  #checkValidStaticCall(childExecutionResult: ExecutionResult) {
    if (
      childExecutionResult.callStackItem.publicInputs.newNoteHashes.some(item => !item.isEmpty()) ||
      childExecutionResult.callStackItem.publicInputs.newNullifiers.some(item => !item.isEmpty()) ||
      childExecutionResult.callStackItem.publicInputs.newL2ToL1Msgs.some(item => !item.isEmpty()) ||
      childExecutionResult.callStackItem.publicInputs.encryptedLogsHashes.some(item => !item.isEmpty()) ||
      childExecutionResult.callStackItem.publicInputs.unencryptedLogsHashes.some(item => !item.isEmpty())
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
   * @param isDelegateCall - Whether the call is a delegate call.
   * @returns The execution result.
   */
  override async callPrivateFunction(
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
    isDelegateCall: boolean,
  ) {
    this.log.debug(
      `Calling private function ${this.contractAddress}:${functionSelector} from ${this.callContext.storageContractAddress}`,
    );

    isStaticCall = isStaticCall || this.callContext.isStaticCall;

    const targetArtifact = await this.db.getFunctionArtifact(targetContractAddress, functionSelector);

    const derivedTxContext = this.txContext.clone();

    const derivedCallContext = this.deriveCallContext(
      targetContractAddress,
      targetArtifact,
      sideEffectCounter,
      isDelegateCall,
      isStaticCall,
    );

    const context = new ClientExecutionContext(
      targetContractAddress,
      argsHash,
      derivedTxContext,
      derivedCallContext,
      this.historicalHeader,
      this.authWitnesses,
      this.packedValuesCache,
      this.noteCache,
      this.db,
      this.node,
      sideEffectCounter,
    );

    const childExecutionResult = await executePrivateFunction(
      context,
      targetArtifact,
      targetContractAddress,
      functionSelector,
    );

    if (isStaticCall) {
      this.#checkValidStaticCall(childExecutionResult);
    }

    this.nestedExecutions.push(childExecutionResult);

    return childExecutionResult.callStackItem;
  }

  /**
   * Creates a PublicCallStackItem object representing the request to call a public function.
   * @param targetContractAddress - The address of the contract to call.
   * @param functionSelector - The function selector of the function to call.
   * @param argsHash - The packed arguments to pass to the function.
   * @param sideEffectCounter - The side effect counter at the start of the call.
   * @param isStaticCall - Whether the call is a static call.
   * @returns The public call stack item with the request information.
   */
  protected async createPublicCallRequest(
    callType: 'enqueued' | 'teardown',
    targetContractAddress: AztecAddress,
    functionSelector: FunctionSelector,
    argsHash: Fr,
    sideEffectCounter: number,
    isStaticCall: boolean,
    isDelegateCall: boolean,
  ): Promise<PublicCallRequest> {
    isStaticCall = isStaticCall || this.callContext.isStaticCall;

    const targetArtifact = await this.db.getFunctionArtifact(targetContractAddress, functionSelector);
    const derivedCallContext = this.deriveCallContext(
      targetContractAddress,
      targetArtifact,
      sideEffectCounter,
      isDelegateCall,
      isStaticCall,
    );
    const args = this.packedValuesCache.unpack(argsHash);

    // TODO($846): if enqueued public calls are associated with global
    // side-effect counter, that will leak info about how many other private
    // side-effects occurred in the TX. Ultimately the private kernel should
    // just output everything in the proper order without any counters.
    this.log.verbose(
      `Created PublicCallRequest of type [${callType}], side-effect counter [${sideEffectCounter}] to ${targetContractAddress}:${functionSelector}(${targetArtifact.name})`,
    );

    return PublicCallRequest.from({
      args,
      callContext: derivedCallContext,
      parentCallContext: this.callContext,
      functionSelector,
      contractAddress: targetContractAddress,
    });
  }

  /**
   * Creates and enqueues a PublicCallStackItem object representing the request to call a public function. No function
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
    isDelegateCall: boolean,
  ): Promise<PublicCallRequest> {
    const enqueuedRequest = await this.createPublicCallRequest(
      'enqueued',
      targetContractAddress,
      functionSelector,
      argsHash,
      sideEffectCounter,
      isStaticCall,
      isDelegateCall,
    );

    this.enqueuedPublicFunctionCalls.push(enqueuedRequest);

    return enqueuedRequest;
  }

  /**
   * Creates a PublicCallStackItem and sets it as the public teardown function. No function
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
    isDelegateCall: boolean,
  ): Promise<PublicCallRequest> {
    const publicTeardownFunctionCall = await this.createPublicCallRequest(
      'teardown',
      targetContractAddress,
      functionSelector,
      argsHash,
      sideEffectCounter,
      isStaticCall,
      isDelegateCall,
    );

    this.publicTeardownFunctionCall = publicTeardownFunctionCall;

    return publicTeardownFunctionCall;
  }

  /**
   * Derives the call context for a nested execution.
   * @param targetContractAddress - The address of the contract being called.
   * @param targetArtifact - The artifact of the function being called.
   * @param startSideEffectCounter - The side effect counter at the start of the call.
   * @param isDelegateCall - Whether the call is a delegate call.
   * @param isStaticCall - Whether the call is a static call.
   * @returns The derived call context.
   */
  private deriveCallContext(
    targetContractAddress: AztecAddress,
    targetArtifact: FunctionArtifact,
    startSideEffectCounter: number,
    isDelegateCall = false,
    isStaticCall = false,
  ) {
    return new CallContext(
      isDelegateCall ? this.callContext.msgSender : this.contractAddress,
      isDelegateCall ? this.contractAddress : targetContractAddress,
      FunctionSelector.fromNameAndParameters(targetArtifact.name, targetArtifact.parameters),
      isDelegateCall,
      isStaticCall,
      startSideEffectCounter,
    );
  }

  /**
   * Read the public storage data.
   * @param startStorageSlot - The starting storage slot.
   * @param numberOfElements - Number of elements to read from the starting storage slot.
   */
  public override async storageRead(startStorageSlot: Fr, numberOfElements: number): Promise<Fr[]> {
    // TODO(#4320): This is a hack to work around not having directly access to the public data tree but
    // still having access to the witnesses
    const bn = await this.db.getBlockNumber();

    const values = [];
    for (let i = 0n; i < numberOfElements; i++) {
      const storageSlot = new Fr(startStorageSlot.value + i);
      const leafSlot = computePublicDataTreeLeafSlot(this.callContext.storageContractAddress, storageSlot);
      const witness = await this.db.getPublicDataTreeWitness(bn, leafSlot);
      if (!witness) {
        throw new Error(`No witness for slot ${storageSlot.toString()}`);
      }
      const value = witness.leafPreimage.value;
      this.log.debug(`Oracle storage read: slot=${storageSlot.toString()} value=${value}`);
      values.push(value);
    }
    return values;
  }

  public override aes128Encrypt(input: Buffer, initializationVector: Buffer, key: Buffer): Buffer {
    const aes128 = new Aes128();
    return aes128.encryptBufferCBC(input, initializationVector, key);
  }

  public override debugLog(message: string, fields: Fr[]) {
    this.log.verbose(`debug_log ${applyStringFormatting(message, fields)}`);
  }

  public getDebugFunctionName() {
    return this.db.getDebugFunctionName(this.contractAddress, this.callContext.functionSelector);
  }
}
