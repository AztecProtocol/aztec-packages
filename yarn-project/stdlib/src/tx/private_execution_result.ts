import type { BlockNumber } from '@aztec/foundation/branded-types';
import { timesParallel } from '@aztec/foundation/collection';
import { randomBytes, randomInt } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { NoteSelector } from '../abi/note_selector.js';
import { PrivateCircuitPublicInputs } from '../kernel/private_circuit_public_inputs.js';
import type { IsEmpty } from '../kernel/utils/interfaces.js';
import { sortByCounter } from '../kernel/utils/order_and_comparison.js';
import { ContractClassLog, ContractClassLogFields } from '../logs/contract_class_log.js';
import { type PreTag, PreTagSchema } from '../logs/pre_tag.js';
import { Note } from '../note/note.js';
import { type ZodFor, mapSchema, schemas } from '../schemas/index.js';
import { HashedValues } from './hashed_values.js';
import type { OffchainEffect } from './offchain_effect.js';

/**
 * The contents of a new note.
 */
export class NoteAndSlot {
  constructor(
    /** The note. */
    public note: Note,
    /** The storage slot of the note. */
    public storageSlot: Fr,
    /** The randomness injected to the note. */
    public randomness: Fr,
    /** The note type identifier. */
    public noteTypeId: NoteSelector,
  ) {}

  static get schema() {
    return z
      .object({
        note: Note.schema,
        storageSlot: schemas.Fr,
        randomness: schemas.Fr,
        noteTypeId: schemas.NoteSelector,
      })
      .transform(NoteAndSlot.from);
  }

  static from(fields: FieldsOf<NoteAndSlot>) {
    return new NoteAndSlot(fields.note, fields.storageSlot, fields.randomness, fields.noteTypeId);
  }

  static random() {
    return new NoteAndSlot(Note.random(), Fr.random(), Fr.random(), NoteSelector.random());
  }
}

export class CountedContractClassLog implements IsEmpty {
  constructor(
    public log: ContractClassLog,
    public counter: number,
  ) {}

  static get schema(): ZodFor<CountedContractClassLog> {
    return z
      .object({
        log: ContractClassLog.schema,
        counter: schemas.Integer,
      })
      .transform(CountedContractClassLog.from);
  }

  static from(fields: { log: ContractClassLog; counter: number }) {
    return new CountedContractClassLog(fields.log, fields.counter);
  }

  isEmpty(): boolean {
    return this.log.isEmpty() && !this.counter;
  }
}

export class PrivateExecutionResult {
  constructor(
    public entrypoint: PrivateCallExecutionResult,
    /** The first non-revertible nullifier emitted by any private call, or the protocol nullifier if there was none. */
    public firstNullifier: Fr,
    /** An array of calldata for the enqueued public function calls and the teardown function call. */
    public publicFunctionCalldata: HashedValues[],
  ) {}

  static get schema(): ZodFor<PrivateExecutionResult> {
    return z
      .object({
        entrypoint: PrivateCallExecutionResult.schema,
        firstNullifier: schemas.Fr,
        publicFunctionCalldata: z.array(HashedValues.schema),
      })
      .transform(PrivateExecutionResult.from);
  }

  static from(fields: FieldsOf<PrivateExecutionResult>) {
    return new PrivateExecutionResult(fields.entrypoint, fields.firstNullifier, fields.publicFunctionCalldata);
  }

  static async random(nested = 1): Promise<PrivateExecutionResult> {
    return new PrivateExecutionResult(await PrivateCallExecutionResult.random(nested), Fr.random(), [
      HashedValues.random(),
      HashedValues.random(),
    ]);
  }

  /**
   * The anchor block number that this execution was simulated with.
   */
  getSimulationAnchorBlockNumber(): BlockNumber {
    return this.entrypoint.publicInputs.anchorBlockHeader.globalVariables.blockNumber;
  }
}

/**
 * The result of executing a call to a private function.
 */
export class PrivateCallExecutionResult {
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
    /** The notes created in the executed function. */
    public newNotes: NoteAndSlot[],
    /** Mapping of note hash counter to the counter of its nullifier. */
    public noteHashNullifierCounterMap: Map<number, number>,
    /** The raw return values of the executed function. */
    public returnValues: Fr[],
    /** The offchain effects emitted during execution of this function call via the `emit_offchain_effect` oracle. */
    public offchainEffects: { data: Fr[] }[],
    /** The pre-tags used in this tx to compute tags for private logs */
    public preTags: PreTag[],
    /** The nested executions. */
    public nestedExecutionResults: PrivateCallExecutionResult[],
    /**
     * Contract class logs emitted during execution of this function call.
     * Note: We only need to collect the ContractClassLogFields as preimages for the tx.
     * But keep them as ContractClassLog so that we can verify the log hashes before submitting the tx (TODO).
     */
    public contractClassLogs: CountedContractClassLog[],
    public profileResult?: PrivateExecutionProfileResult,
  ) {}

  static get schema(): ZodFor<PrivateCallExecutionResult> {
    return z
      .object({
        acir: schemas.Buffer,
        vk: schemas.Buffer,
        partialWitness: mapSchema(z.coerce.number(), z.string()),
        publicInputs: PrivateCircuitPublicInputs.schema,
        newNotes: z.array(NoteAndSlot.schema),
        noteHashNullifierCounterMap: mapSchema(z.coerce.number(), z.number()),
        returnValues: z.array(schemas.Fr),
        offchainEffects: z.array(z.object({ data: z.array(schemas.Fr) })),
        preTags: z.array(PreTagSchema),
        nestedExecutionResults: z.array(z.lazy(() => PrivateCallExecutionResult.schema)),
        contractClassLogs: z.array(CountedContractClassLog.schema),
      })
      .transform(PrivateCallExecutionResult.from);
  }

  static from(fields: FieldsOf<PrivateCallExecutionResult>) {
    return new PrivateCallExecutionResult(
      fields.acir,
      fields.vk,
      fields.partialWitness,
      fields.publicInputs,
      fields.newNotes,
      fields.noteHashNullifierCounterMap,
      fields.returnValues,
      fields.offchainEffects,
      fields.preTags,
      fields.nestedExecutionResults,
      fields.contractClassLogs,
    );
  }

  static async random(nested = 1): Promise<PrivateCallExecutionResult> {
    return new PrivateCallExecutionResult(
      randomBytes(4),
      randomBytes(4),
      new Map([[1, 'one']]),
      PrivateCircuitPublicInputs.empty(),
      [NoteAndSlot.random()],
      new Map([[0, 0]]),
      [Fr.random()],
      [
        {
          data: [Fr.random()],
        },
      ],
      [],
      await timesParallel(nested, () => PrivateCallExecutionResult.random(0)),
      [new CountedContractClassLog(await ContractClassLog.random(), randomInt(10))],
    );
  }
}

export function collectNoteHashNullifierCounterMap(execResult: PrivateExecutionResult) {
  const accum: Map<number, number> = new Map();
  const collectNoteHashNullifierCounterMapRecursive = (
    callResult: PrivateCallExecutionResult,
    accum: Map<number, number>,
  ) => {
    callResult.noteHashNullifierCounterMap.forEach((value, key) => accum.set(key, value));
    callResult.nestedExecutionResults.forEach(nested => collectNoteHashNullifierCounterMapRecursive(nested, accum));
  };
  collectNoteHashNullifierCounterMapRecursive(execResult.entrypoint, accum);
  return accum;
}

/**
 * Collect all contract class logs across all nested executions.
 * @param execResult - The topmost execution result.
 * @returns All contract class logs.
 */
function collectContractClassLogs(execResult: PrivateCallExecutionResult): CountedContractClassLog[] {
  return [execResult.contractClassLogs, ...execResult.nestedExecutionResults.flatMap(collectContractClassLogs)].flat();
}

/**
 * Collect all contract class logs across all nested executions and sorts by counter.
 * @param execResult - The topmost execution result.
 * @returns All contract class logs.
 */
export function collectSortedContractClassLogs(execResult: PrivateExecutionResult): ContractClassLogFields[] {
  const allLogs = collectContractClassLogs(execResult.entrypoint);
  const sortedLogs = sortByCounter(allLogs);
  return sortedLogs.map(l => l.log.fields);
}

/**
 * Collect all offchain effects emitted across all nested executions.
 * @param execResult - The execution result to collect offchain effects from.
 * @returns Array of offchain effects.
 */
export function collectOffchainEffects(execResult: PrivateExecutionResult): OffchainEffect[] {
  const collectEffectsRecursive = (callResult: PrivateCallExecutionResult): OffchainEffect[] => {
    return [
      ...callResult.offchainEffects.map(msg => ({
        ...msg,
        contractAddress: callResult.publicInputs.callContext.contractAddress, // contract that emitted the effect
      })),
      ...callResult.nestedExecutionResults.flatMap(nested => collectEffectsRecursive(nested)),
    ];
  };
  return collectEffectsRecursive(execResult.entrypoint);
}

export function getFinalMinRevertibleSideEffectCounter(execResult: PrivateExecutionResult): number {
  const collectFinalMinRevertibleSideEffectCounterRecursive = (callResult: PrivateCallExecutionResult): number => {
    return callResult.nestedExecutionResults.reduce((counter, exec) => {
      const nestedCounter = collectFinalMinRevertibleSideEffectCounterRecursive(exec);
      return nestedCounter ? nestedCounter : counter;
    }, callResult.publicInputs.minRevertibleSideEffectCounter.toNumber());
  };
  return collectFinalMinRevertibleSideEffectCounterRecursive(execResult.entrypoint);
}

export function collectNested<T>(
  executionStack: PrivateCallExecutionResult[],
  extractExecutionItems: (execution: PrivateCallExecutionResult) => T[],
): T[] {
  const thisExecutionReads = executionStack.flatMap(extractExecutionItems);

  return thisExecutionReads.concat(
    executionStack.flatMap(({ nestedExecutionResults }) =>
      collectNested(nestedExecutionResults, extractExecutionItems),
    ),
  );
}

export class PrivateExecutionProfileResult {
  constructor(public timings: { witgen: number; oracles?: Record<string, { times: number[] }> }) {}
}
