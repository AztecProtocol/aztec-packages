import { type IsEmpty, PrivateCircuitPublicInputs, sortByCounter } from '@aztec/circuits.js';
import { NoteSelector } from '@aztec/foundation/abi';
import { times } from '@aztec/foundation/collection';
import { randomBytes, randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type ZodFor, hexSchemaFor, mapSchema, schemas } from '@aztec/foundation/schemas';
import { type FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { Note, UnencryptedFunctionL2Logs, UnencryptedL2Log } from './logs/index.js';
import { PublicExecutionRequest } from './public_execution_request.js';

/**
 * The contents of a new note.
 */
export class NoteAndSlot {
  constructor(
    /** The note. */
    public note: Note,
    /** The storage slot of the note. */
    public storageSlot: Fr,
    /** The note type identifier. */
    public noteTypeId: NoteSelector,
  ) {}

  static get schema() {
    return z
      .object({
        note: Note.schema,
        storageSlot: schemas.Fr,
        noteTypeId: schemas.NoteSelector,
      })
      .transform(NoteAndSlot.from);
  }

  static from(fields: FieldsOf<NoteAndSlot>) {
    return new NoteAndSlot(fields.note, fields.storageSlot, fields.noteTypeId);
  }

  toJSON() {
    return {
      note: this.note.toBuffer().toString('hex'),
      storageSlot: this.storageSlot.toBuffer().toString('hex'),
      noteTypeId: this.noteTypeId.toString(),
    };
  }

  public static fromJSON(json: any): NoteAndSlot {
    return new NoteAndSlot(
      Note.fromBuffer(Buffer.from(json.note, 'hex')),
      Fr.fromString(json.storageSlot),
      NoteSelector.fromString(json.noteTypeId),
    );
  }

  static random() {
    return new NoteAndSlot(Note.random(), Fr.random(), NoteSelector.random());
  }
}

export class CountedContractClassLog implements IsEmpty {
  constructor(public log: UnencryptedL2Log, public counter: number) {}

  static get schema() {
    return z
      .object({
        log: UnencryptedL2Log.schema,
        counter: schemas.Integer,
      })
      .transform(CountedContractClassLog.from);
  }

  static from(fields: { log: UnencryptedL2Log; counter: number }) {
    return new CountedContractClassLog(fields.log, fields.counter);
  }

  isEmpty(): boolean {
    return !this.log.data.length && !this.counter;
  }
}

export class CountedPublicExecutionRequest {
  constructor(public request: PublicExecutionRequest, public counter: number) {}

  static get schema() {
    return z
      .object({
        request: hexSchemaFor(PublicExecutionRequest), // TODO(palla/schema) Use PublicExecutionRequest.schema,
        counter: schemas.Integer,
      })
      .transform(CountedPublicExecutionRequest.from);
  }

  static from(fields: FieldsOf<CountedPublicExecutionRequest>) {
    return new CountedPublicExecutionRequest(fields.request, fields.counter);
  }

  isEmpty(): boolean {
    return this.request.isEmpty() && !this.counter;
  }

  toJSON() {
    return {
      request: this.request.toBuffer().toString('hex'),
      counter: this.counter,
    };
  }

  static fromJSON(json: any) {
    return new CountedPublicExecutionRequest(
      PublicExecutionRequest.fromBuffer(Buffer.from(json.request, 'hex')),
      json.counter,
    );
  }

  static random() {
    return new CountedPublicExecutionRequest(PublicExecutionRequest.random(), 0);
  }
}

/**
 * The result of executing a private function.
 */
export class PrivateExecutionResult {
  constructor(
    // Needed for prover
    /** The ACIR bytecode. */
    public acir: Buffer,
    /** The verification key. */
    public vk: Buffer,
    /** The partial witness. */
    public partialWitness: Map<number, string>,
    // Needed for the verifier (kernel)
    /** The call stack item. */
    public publicInputs: PrivateCircuitPublicInputs,
    /** Mapping of note hash to its index in the note hash tree. Used for building hints for note hash read requests. */
    public noteHashLeafIndexMap: Map<bigint, bigint>,
    /** The notes created in the executed function. */
    public newNotes: NoteAndSlot[],
    /** Mapping of note hash counter to the counter of its nullifier. */
    public noteHashNullifierCounterMap: Map<number, number>,
    /** The raw return values of the executed function. */
    public returnValues: Fr[],
    /** The nested executions. */
    public nestedExecutions: PrivateExecutionResult[],
    /** Enqueued public function execution requests to be picked up by the sequencer. */
    public enqueuedPublicFunctionCalls: CountedPublicExecutionRequest[],
    /** Public function execution requested for teardown */
    public publicTeardownFunctionCall: PublicExecutionRequest,
    /**
     * Contract class logs emitted during execution of this function call.
     * Note: These are preimages to `contractClassLogsHashes`.
     */
    public contractClassLogs: CountedContractClassLog[],
  ) {}

  static get schema(): ZodFor<PrivateExecutionResult> {
    return z
      .object({
        acir: schemas.BufferHex,
        vk: schemas.BufferHex,
        partialWitness: mapSchema(z.coerce.number(), z.string()),
        publicInputs: PrivateCircuitPublicInputs.schema,
        noteHashLeafIndexMap: mapSchema(schemas.BigInt, schemas.BigInt),
        newNotes: z.array(NoteAndSlot.schema),
        noteHashNullifierCounterMap: mapSchema(z.coerce.number(), z.number()),
        returnValues: z.array(schemas.Fr),
        nestedExecutions: z.array(z.lazy(() => PrivateExecutionResult.schema)),
        enqueuedPublicFunctionCalls: z.array(CountedPublicExecutionRequest.schema),
        publicTeardownFunctionCall: hexSchemaFor(PublicExecutionRequest), // TODO(palla/schema) Use PublicExecutionRequest.schema
        contractClassLogs: z.array(CountedContractClassLog.schema),
      })
      .transform(PrivateExecutionResult.from);
  }

  static from(fields: FieldsOf<PrivateExecutionResult>) {
    return new PrivateExecutionResult(
      fields.acir,
      fields.vk,
      fields.partialWitness,
      fields.publicInputs,
      fields.noteHashLeafIndexMap,
      fields.newNotes,
      fields.noteHashNullifierCounterMap,
      fields.returnValues,
      fields.nestedExecutions,
      fields.enqueuedPublicFunctionCalls,
      fields.publicTeardownFunctionCall,
      fields.contractClassLogs,
    );
  }

  toJSON(): any {
    return {
      acir: this.acir.toString('hex'),
      vk: this.vk.toString('hex'),
      partialWitness: Array.from(this.partialWitness.entries()),
      publicInputs: this.publicInputs.toJSON(),
      noteHashLeafIndexMap: Array.from(this.noteHashLeafIndexMap.entries()).map(([key, value]) => [
        key.toString(),
        value.toString(),
      ]),
      newNotes: this.newNotes.map(note => note.toJSON()),
      noteHashNullifierCounterMap: Array.from(this.noteHashNullifierCounterMap.entries()),
      returnValues: this.returnValues.map(fr => fr.toBuffer().toString('hex')),
      nestedExecutions: this.nestedExecutions.map(exec => exec.toJSON()),
      enqueuedPublicFunctionCalls: this.enqueuedPublicFunctionCalls.map(call => call.toJSON()),
      publicTeardownFunctionCall: this.publicTeardownFunctionCall.toBuffer().toString('hex'),
      contractClassLogs: this.contractClassLogs.map(countedLog => ({
        log: countedLog.log.toJSON(),
        counter: countedLog.counter,
      })),
    };
  }

  static random(nested = 1): PrivateExecutionResult {
    return new PrivateExecutionResult(
      randomBytes(4),
      randomBytes(4),
      new Map([[1, 'one']]),
      PrivateCircuitPublicInputs.empty(),
      new Map([[1n, 1n]]),
      [NoteAndSlot.random()],
      new Map([[0, 0]]),
      [Fr.random()],
      times(nested, () => PrivateExecutionResult.random(0)),
      [CountedPublicExecutionRequest.random()],
      PublicExecutionRequest.random(),
      [new CountedContractClassLog(UnencryptedL2Log.random(), randomInt(10))],
    );
  }

  static fromJSON(json: any): PrivateExecutionResult {
    return new PrivateExecutionResult(
      Buffer.from(json.acir, 'hex'),
      Buffer.from(json.vk, 'hex'),
      Array.isArray(json.partialWitness)
        ? new Map(json.partialWitness.map(([key, value]: any[]) => [Number(key), value as string]))
        : new Map(),
      PrivateCircuitPublicInputs.fromJSON(json.publicInputs),
      Array.isArray(json.noteHashLeafIndexMap)
        ? new Map(json.noteHashLeafIndexMap.map(([key, value]: any[]) => [BigInt(key), BigInt(value)]))
        : new Map(),
      Array.isArray(json.newNotes) ? json.newNotes.map((note: any) => NoteAndSlot.fromJSON(note)) : [],
      Array.isArray(json.noteHashNullifierCounterMap)
        ? new Map(json.noteHashNullifierCounterMap.map(([key, value]: any[]) => [Number(key), Number(value)]))
        : new Map(),
      json.returnValues.map((fr: any) => new Fr(Buffer.from(fr, 'hex'))),
      Array.isArray(json.nestedExecutions)
        ? json.nestedExecutions.map((exec: any) => PrivateExecutionResult.fromJSON(exec))
        : [],
      Array.isArray(json.enqueuedPublicFunctionCalls)
        ? json.enqueuedPublicFunctionCalls.map((call: any) => CountedPublicExecutionRequest.fromJSON(call))
        : [],
      PublicExecutionRequest.fromBuffer(Buffer.from(json.publicTeardownFunctionCall, 'hex')),
      Array.isArray(json.contractClassLogs)
        ? json.contractClassLogs.map(
            (json: any) => new CountedContractClassLog(UnencryptedL2Log.fromJSON(json.log), json.counter),
          )
        : [],
    );
  }
}

export function collectNoteHashLeafIndexMap(
  execResult: PrivateExecutionResult,
  accum: Map<bigint, bigint> = new Map(),
) {
  execResult.noteHashLeafIndexMap.forEach((value, key) => accum.set(key, value));
  execResult.nestedExecutions.forEach(nested => collectNoteHashLeafIndexMap(nested, accum));
  return accum;
}

export function collectNoteHashNullifierCounterMap(
  execResult: PrivateExecutionResult,
  accum: Map<number, number> = new Map(),
) {
  execResult.noteHashNullifierCounterMap.forEach((value, key) => accum.set(key, value));
  execResult.nestedExecutions.forEach(nested => collectNoteHashNullifierCounterMap(nested, accum));
  return accum;
}

/**
 * Collect all contract class logs across all nested executions.
 * @param execResult - The topmost execution result.
 * @returns All contract class logs.
 */
function collectContractClassLogs(execResult: PrivateExecutionResult): CountedContractClassLog[] {
  return [execResult.contractClassLogs, ...execResult.nestedExecutions.flatMap(collectContractClassLogs)].flat();
}

/**
 * Collect all contract class logs across all nested executions and sorts by counter.
 * @param execResult - The topmost execution result.
 * @returns All contract class logs.
 */
export function collectSortedContractClassLogs(execResult: PrivateExecutionResult): UnencryptedFunctionL2Logs {
  const allLogs = collectContractClassLogs(execResult);
  const sortedLogs = sortByCounter(allLogs);
  return new UnencryptedFunctionL2Logs(sortedLogs.map(l => l.log));
}

function collectEnqueuedCountedPublicExecutionRequests(
  execResult: PrivateExecutionResult,
): CountedPublicExecutionRequest[] {
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
export function collectEnqueuedPublicFunctionCalls(execResult: PrivateExecutionResult): PublicExecutionRequest[] {
  const countedRequests = collectEnqueuedCountedPublicExecutionRequests(execResult);
  // without the reverse sort, the logs will be in a queue like fashion which is wrong
  // as the kernel processes it like a stack, popping items off and pushing them to output
  return sortByCounter(countedRequests, false).map(r => r.request);
}

export function collectPublicTeardownFunctionCall(execResult: PrivateExecutionResult): PublicExecutionRequest {
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

export function getFinalMinRevertibleSideEffectCounter(execResult: PrivateExecutionResult): number {
  return execResult.nestedExecutions.reduce((counter, exec) => {
    const nestedCounter = getFinalMinRevertibleSideEffectCounter(exec);
    return nestedCounter ? nestedCounter : counter;
  }, execResult.publicInputs.minRevertibleSideEffectCounter.toNumber());
}

export function collectNested<T>(
  executionStack: PrivateExecutionResult[],
  extractExecutionItems: (execution: PrivateExecutionResult) => T[],
): T[] {
  const thisExecutionReads = executionStack.flatMap(extractExecutionItems);

  return thisExecutionReads.concat(
    executionStack.flatMap(({ nestedExecutions }) => collectNested(nestedExecutions, extractExecutionItems)),
  );
}
