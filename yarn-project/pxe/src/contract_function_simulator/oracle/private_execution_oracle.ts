import { MAX_FR_CALLDATA_TO_ALL_ENQUEUED_CALLS, PRIVATE_CONTEXT_INPUTS_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { type CircuitSimulator, toACVMWitness } from '@aztec/simulator/client';
import {
  type FunctionAbi,
  type FunctionArtifact,
  FunctionSelector,
  type NoteSelector,
  countArgumentsSize,
} from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeUniqueNoteHash, siloNoteHash } from '@aztec/stdlib/hash';
import { PrivateContextInputs } from '@aztec/stdlib/kernel';
import type { ContractClassLog } from '@aztec/stdlib/logs';
import { Note, type NoteStatus } from '@aztec/stdlib/note';
import {
  type BlockHeader,
  CallContext,
  Capsule,
  CountedContractClassLog,
  NoteAndSlot,
  PrivateCallExecutionResult,
  type TxContext,
} from '@aztec/stdlib/tx';

import type { ExecutionDataProvider } from '../execution_data_provider.js';
import type { ExecutionNoteCache } from '../execution_note_cache.js';
import type { HashedValuesCache } from '../hashed_values_cache.js';
import { pickNotes } from '../pick_notes.js';
import { executePrivateFunction, verifyCurrentClassId } from './private_execution.js';
import type { NoteData } from './typed_oracle.js';
import { UtilityExecutionOracle } from './utility_execution_oracle.js';

/**
 * The execution oracle for the private part of a transaction.
 */
export class PrivateExecutionOracle extends UtilityExecutionOracle {
  /**
   * New notes created during this execution.
   * It's possible that a note in this list has been nullified (in the same or other executions) and doesn't exist in
   * the ExecutionNoteCache and the final proof data. But we still include those notes in the execution result because
   * their commitments are still in the public inputs of this execution.
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
  private offchainEffects: { data: Fr[] }[] = [];
  private nestedExecutionResults: PrivateCallExecutionResult[] = [];

  constructor(
    private readonly argsHash: Fr,
    private readonly txContext: TxContext,
    private readonly callContext: CallContext,
    /** Header of a block whose state is used during private execution (not the block the transaction is included in). */
    protected readonly historicalHeader: BlockHeader,
    /** List of transient auth witnesses to be used during this simulation */
    authWitnesses: AuthWitness[],
    capsules: Capsule[],
    private readonly executionCache: HashedValuesCache,
    private readonly noteCache: ExecutionNoteCache,
    executionDataProvider: ExecutionDataProvider,
    private simulator: CircuitSimulator,
    private totalPublicCalldataCount: number,
    protected sideEffectCounter: number = 0,
    log = createLogger('simulator:client_execution_context'),
    scopes?: AztecAddress[],
  ) {
    super(callContext.contractAddress, authWitnesses, capsules, executionDataProvider, log, scopes);
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
   * Return the offchain effects emitted during this execution.
   */
  public getOffchainEffects() {
    return this.offchainEffects;
  }

  /**
   * Return the nested execution results during this execution.
   */
  public getNestedExecutionResults() {
    return this.nestedExecutionResults;
  }

  /**
   * Store values in the execution cache.
   * @param values - Values to store.
   * @returns The hash of the values.
   */
  public override storeInExecutionCache(values: Fr[], hash: Fr) {
    return this.executionCache.store(values, hash);
  }

  /**
   * Gets values from the execution cache.
   * @param hash - Hash of the values.
   * @returns The values.
   */
  public override loadFromExecutionCache(hash: Fr): Promise<Fr[]> {
    const preimage = this.executionCache.getPreimage(hash);
    if (!preimage) {
      throw new Error(`Preimage for hash ${hash.toString()} not found in cache`);
    }
    return Promise.resolve(preimage);
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
    const dbNotes = await this.executionDataProvider.getNotes(
      this.callContext.contractAddress,
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

    const noteHashesAndIndexes = await Promise.all(
      notes.map(async n => {
        if (n.index !== undefined) {
          const siloedNoteHash = await siloNoteHash(n.contractAddress, n.noteHash);
          const uniqueNoteHash = await computeUniqueNoteHash(n.noteNonce, siloedNoteHash);

          return { hash: uniqueNoteHash, index: n.index };
        }
      }),
    );

    noteHashesAndIndexes
      .filter(n => n !== undefined)
      .forEach(n => {
        this.noteHashLeafIndexMap.set(n!.hash.toBigInt(), n!.index);
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
    this.log.debug(`Notified of new note with inner hash ${noteHash}`, {
      contractAddress: this.callContext.contractAddress,
      storageSlot,
      noteTypeId,
      counter,
    });

    const note = new Note(noteItems);
    this.noteCache.addNewNote(
      {
        contractAddress: this.callContext.contractAddress,
        storageSlot,
        noteNonce: Fr.ZERO, // Nonce cannot be known during private execution.
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
  public override async notifyNullifiedNote(innerNullifier: Fr, noteHash: Fr, counter: number) {
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
  public override notifyCreatedNullifier(innerNullifier: Fr) {
    return this.noteCache.nullifierCreated(this.callContext.contractAddress, innerNullifier);
  }

  /**
   * Emit a contract class log.
   * This fn exists because we only carry a poseidon hash through the kernels, and need to
   * keep the preimage in ts for later.
   * @param log - The contract class log to be emitted.
   * @param counter - The contract class log's counter.
   */
  public override notifyCreatedContractClassLog(log: ContractClassLog, counter: number) {
    this.contractClassLogs.push(new CountedContractClassLog(log, counter));
    const text = log.toBuffer().toString('hex');
    this.log.verbose(
      `Emitted log from ContractClassRegisterer: "${text.length > 100 ? text.slice(0, 100) + '...' : text}"`,
    );
  }

  #checkValidStaticCall(childExecutionResult: PrivateCallExecutionResult) {
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
   * @param argsHash - The arguments hash to pass to the function.
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
    const simulatorSetupTimer = new Timer();
    this.log.debug(
      `Calling private function ${targetContractAddress}:${functionSelector} from ${this.callContext.contractAddress}`,
    );

    isStaticCall = isStaticCall || this.callContext.isStaticCall;

    await verifyCurrentClassId(
      targetContractAddress,
      this.executionDataProvider,
      this.historicalHeader.globalVariables.blockNumber,
    );

    const targetArtifact = await this.executionDataProvider.getFunctionArtifact(
      targetContractAddress,
      functionSelector,
    );

    const derivedTxContext = this.txContext.clone();

    const derivedCallContext = await this.deriveCallContext(targetContractAddress, targetArtifact, isStaticCall);

    const context = new PrivateExecutionOracle(
      argsHash,
      derivedTxContext,
      derivedCallContext,
      this.historicalHeader,
      this.authWitnesses,
      this.capsules,
      this.executionCache,
      this.noteCache,
      this.executionDataProvider,
      this.simulator,
      this.totalPublicCalldataCount,
      sideEffectCounter,
      this.log,
      this.scopes,
    );

    const setupTime = simulatorSetupTimer.ms();

    const childExecutionResult = await executePrivateFunction(
      this.simulator,
      context,
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
  public override notifyEnqueuedPublicFunctionCall(
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
  public override notifySetPublicTeardownFunctionCall(
    _targetContractAddress: AztecAddress,
    calldataHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ) {
    this.#onNewPublicFunctionCall(calldataHash);
    return Promise.resolve();
  }

  public override notifySetMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter: number): Promise<void> {
    return this.noteCache.setMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter);
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
    return this.executionDataProvider.getDebugFunctionName(this.contractAddress, this.callContext.functionSelector);
  }

  public override async incrementAppTaggingSecretIndexAsSender(sender: AztecAddress, recipient: AztecAddress) {
    await this.executionDataProvider.incrementAppTaggingSecretIndexAsSender(this.contractAddress, sender, recipient);
  }

  public override async fetchTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr) {
    await this.executionDataProvider.syncTaggedLogs(this.contractAddress, pendingTaggedLogArrayBaseSlot, this.scopes);

    await this.executionDataProvider.removeNullifiedNotes(this.contractAddress);
  }

  public override emitOffchainEffect(data: Fr[]): Promise<void> {
    this.offchainEffects.push({ data });
    return Promise.resolve();
  }
}
