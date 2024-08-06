import {
  EncryptedFunctionL2Logs,
  type EncryptedL2Log,
  type EncryptedL2NoteLog,
  EncryptedNoteFunctionL2Logs,
  type Note,
  PublicExecutionRequest,
  UnencryptedFunctionL2Logs,
  type UnencryptedL2Log,
} from '@aztec/circuit-types';
import { type IsEmpty, type PrivateCallStackItem, sortByCounter } from '@aztec/circuits.js';
import { type NoteSelector } from '@aztec/foundation/abi';
import { type Fr } from '@aztec/foundation/fields';

import { type ACVMField } from '../acvm/index.js';

/**
 * The contents of a new note.
 */
export interface NoteAndSlot {
  /** The note. */
  note: Note;
  /** The storage slot of the note. */
  storageSlot: Fr;
  /** The note type identifier. */
  noteTypeId: NoteSelector;
}

export class CountedLog<TLog extends UnencryptedL2Log | EncryptedL2NoteLog | EncryptedL2Log> implements IsEmpty {
  constructor(public log: TLog, public counter: number) {}

  isEmpty(): boolean {
    return !this.log.data.length && !this.counter;
  }
}

export class CountedNoteLog extends CountedLog<EncryptedL2NoteLog> {
  constructor(log: EncryptedL2NoteLog, counter: number, public noteHashCounter: number) {
    super(log, counter);
  }
}

export class CountedPublicExecutionRequest {
  constructor(public request: PublicExecutionRequest, public counter: number) {}

  isEmpty(): boolean {
    return this.request.isEmpty() && !this.counter;
  }
}

/**
 * The result of executing a private function.
 */
export interface ExecutionResult {
  // Needed for prover
  /** The ACIR bytecode. */
  acir: Buffer;
  /** The verification key. */
  vk: Buffer;
  /** The partial witness. */
  partialWitness: Map<number, ACVMField>;
  // Needed for the verifier (kernel)
  /** The call stack item. */
  callStackItem: PrivateCallStackItem;
  /** Mapping of note hash to its index in the note hash tree. Used for building hints for note hash read requests. */
  noteHashLeafIndexMap: Map<bigint, bigint>;
  /** The notes created in the executed function. */
  newNotes: NoteAndSlot[];
  /** Mapping of note hash counter to the counter of its nullifier. */
  noteHashNullifierCounterMap: Map<number, number>;
  /** The raw return values of the executed function. */
  returnValues: Fr[];
  /** The nested executions. */
  nestedExecutions: this[];
  /** Enqueued public function execution requests to be picked up by the sequencer. */
  enqueuedPublicFunctionCalls: CountedPublicExecutionRequest[];
  /** Public function execution requested for teardown */
  publicTeardownFunctionCall: PublicExecutionRequest;
  /**
   * Encrypted note logs emitted during execution of this function call.
   * Note: These are preimages to `noteEncryptedLogsHashes`.
   */
  noteEncryptedLogs: CountedNoteLog[];
  /**
   * Encrypted logs emitted during execution of this function call.
   * Note: These are preimages to `encryptedLogsHashes`.
   */
  encryptedLogs: CountedLog<EncryptedL2Log>[];
  /**
   * Unencrypted logs emitted during execution of this function call.
   * Note: These are preimages to `unencryptedLogsHashes`.
   */
  unencryptedLogs: CountedLog<UnencryptedL2Log>[];
}

export function collectNoteHashLeafIndexMap(execResult: ExecutionResult, accum: Map<bigint, bigint> = new Map()) {
  execResult.noteHashLeafIndexMap.forEach((value, key) => accum.set(key, value));
  execResult.nestedExecutions.forEach(nested => collectNoteHashLeafIndexMap(nested, accum));
  return accum;
}

export function collectNoteHashNullifierCounterMap(
  execResult: ExecutionResult,
  accum: Map<number, number> = new Map(),
) {
  execResult.noteHashNullifierCounterMap.forEach((value, key) => accum.set(key, value));
  execResult.nestedExecutions.forEach(nested => collectNoteHashNullifierCounterMap(nested, accum));
  return accum;
}

/**
 * Collect all encrypted logs across all nested executions.
 * @param execResult - The topmost execution result.
 * @returns All encrypted logs.
 */
function collectNoteEncryptedLogs(
  execResult: ExecutionResult,
  noteHashNullifierCounterMap: Map<number, number>,
  minRevertibleSideEffectCounter: number,
): CountedLog<EncryptedL2NoteLog>[] {
  return [
    execResult.noteEncryptedLogs.filter(noteLog => {
      const nullifierCounter = noteHashNullifierCounterMap.get(noteLog.noteHashCounter);
      return (
        nullifierCounter === undefined ||
        (noteLog.noteHashCounter < minRevertibleSideEffectCounter && nullifierCounter >= minRevertibleSideEffectCounter)
      );
    }),
    ...execResult.nestedExecutions.flatMap(res =>
      collectNoteEncryptedLogs(res, noteHashNullifierCounterMap, minRevertibleSideEffectCounter),
    ),
  ].flat();
}

/**
 * Collect all encrypted logs across all nested executions and sorts by counter.
 * @param execResult - The topmost execution result.
 * @returns All encrypted logs.
 */
export function collectSortedNoteEncryptedLogs(execResult: ExecutionResult): EncryptedNoteFunctionL2Logs {
  const noteHashNullifierCounterMap = collectNoteHashNullifierCounterMap(execResult);
  const minRevertibleSideEffectCounter = getFinalMinRevertibleSideEffectCounter(execResult);
  const allLogs = collectNoteEncryptedLogs(execResult, noteHashNullifierCounterMap, minRevertibleSideEffectCounter);
  const sortedLogs = sortByCounter(allLogs);
  return new EncryptedNoteFunctionL2Logs(sortedLogs.map(l => l.log));
}
/**
 * Collect all encrypted logs across all nested executions.
 * @param execResult - The topmost execution result.
 * @returns All encrypted logs.
 */
function collectEncryptedLogs(execResult: ExecutionResult): CountedLog<EncryptedL2Log>[] {
  return [execResult.encryptedLogs, ...execResult.nestedExecutions.flatMap(collectEncryptedLogs)].flat();
}

/**
 * Collect all encrypted logs across all nested executions and sorts by counter.
 * @param execResult - The topmost execution result.
 * @returns All encrypted logs.
 */
export function collectSortedEncryptedLogs(execResult: ExecutionResult): EncryptedFunctionL2Logs {
  const allLogs = collectEncryptedLogs(execResult);
  const sortedLogs = sortByCounter(allLogs);
  return new EncryptedFunctionL2Logs(sortedLogs.map(l => l.log));
}

/**
 * Collect all unencrypted logs across all nested executions.
 * @param execResult - The topmost execution result.
 * @returns All unencrypted logs.
 */
function collectUnencryptedLogs(execResult: ExecutionResult): CountedLog<UnencryptedL2Log>[] {
  return [execResult.unencryptedLogs, ...execResult.nestedExecutions.flatMap(collectUnencryptedLogs)].flat();
}

/**
 * Collect all unencrypted logs across all nested executions and sorts by counter.
 * @param execResult - The topmost execution result.
 * @returns All unencrypted logs.
 */
export function collectSortedUnencryptedLogs(execResult: ExecutionResult): UnencryptedFunctionL2Logs {
  const allLogs = collectUnencryptedLogs(execResult);
  const sortedLogs = sortByCounter(allLogs);
  return new UnencryptedFunctionL2Logs(sortedLogs.map(l => l.log));
}

function collectEnqueuedCountedPublicExecutionRequests(execResult: ExecutionResult): CountedPublicExecutionRequest[] {
  return [
    ...execResult.enqueuedPublicFunctionCalls,
    ...execResult.nestedExecutions.flatMap(collectEnqueuedCountedPublicExecutionRequests),
  ];
}

/**
 * Collect all enqueued public function calls across all nested executions.
 * @param execResult - The topmost execution result.
 * @returns All enqueued public function calls.
 */
export function collectEnqueuedPublicFunctionCalls(execResult: ExecutionResult): PublicExecutionRequest[] {
  const countedRequests = collectEnqueuedCountedPublicExecutionRequests(execResult);
  // without the reverse sort, the logs will be in a queue like fashion which is wrong
  // as the kernel processes it like a stack, popping items off and pushing them to output
  return sortByCounter(countedRequests, false).map(r => r.request);
}

export function collectPublicTeardownFunctionCall(execResult: ExecutionResult): PublicExecutionRequest {
  const teardownCalls = [
    execResult.publicTeardownFunctionCall,
    ...execResult.nestedExecutions.flatMap(collectPublicTeardownFunctionCall),
  ].filter(call => !call.isEmpty());

  if (teardownCalls.length === 1) {
    return teardownCalls[0];
  }

  if (teardownCalls.length > 1) {
    throw new Error('Multiple public teardown calls detected');
  }

  return PublicExecutionRequest.empty();
}

export function getFinalMinRevertibleSideEffectCounter(execResult: ExecutionResult): number {
  return execResult.nestedExecutions.reduce((counter, exec) => {
    const nestedCounter = getFinalMinRevertibleSideEffectCounter(exec);
    return nestedCounter ? nestedCounter : counter;
  }, execResult.callStackItem.publicInputs.minRevertibleSideEffectCounter.toNumber());
}
