import { PrivateCallStackItem, PublicCallRequest, ReadRequestMembershipWitness } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { FunctionL2Logs } from '@aztec/types';

import { ACVMField } from '../acvm/index.js';

/**
 * The contents of a new note.
 */
export interface NewNoteData {
  /** The preimage of the note. */
  preimage: Fr[];
  /** The storage slot of the note. */
  storageSlot: Fr;
}

/**
 * The contents of a nullified commitment.
 */
export interface NewNullifierData {
  /** The preimage of the nullified commitment. */
  preimage: Fr[];
  /** The storage slot of the nullified commitment. */
  storageSlot: Fr;
  /** The nullifier. */
  nullifier: Fr;
}

/**
 * The preimages of the executed function.
 */
export interface ExecutionPreimages {
  /** The preimages of the new notes. */
  newNotes: NewNoteData[];
  /** The preimages of the nullified commitments. */
  nullifiedNotes: NewNullifierData[];
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
  /** The partially filled-in read request membership witnesses for commitments being read. */
  readRequestPartialWitnesses: ReadRequestMembershipWitness[];
  // Needed for the user
  /** The preimages of the executed function. */
  preimages: ExecutionPreimages;
  /** The decoded return values of the executed function. */
  returnValues: any[];
  /** The nested executions. */
  nestedExecutions: this[];
  /** Enqueued public function execution requests to be picked up by the sequencer. */
  enqueuedPublicFunctionCalls: PublicCallRequest[];
  /**
   * Encrypted logs emitted during execution of this function call.
   * Note: These are preimages to `encryptedLogsHash`.
   */
  encryptedLogs: FunctionL2Logs;
  /**
   * Unencrypted logs emitted during execution of this function call.
   * Note: These are preimages to `unencryptedLogsHash`.
   */
  unencryptedLogs: FunctionL2Logs;
}

/**
 * Collect all encrypted logs across all nested executions.
 * @param execResult - The topmost execution result.
 * @returns All encrypted logs.
 */
export function collectEncryptedLogs(execResult: ExecutionResult): FunctionL2Logs[] {
  const logs: FunctionL2Logs[] = [];
  // traverse through the stack of nested executions
  const executionStack = [execResult];
  while (executionStack.length) {
    const currentExecution = executionStack.pop()!;
    executionStack.push(...currentExecution.nestedExecutions);
    logs.push(currentExecution.encryptedLogs);
  }
  return logs;
}

/**
 * Collect all unencrypted logs across all nested executions.
 * @param execResult - The topmost execution result.
 * @returns All unencrypted logs.
 */
export function collectUnencryptedLogs(execResult: ExecutionResult): FunctionL2Logs[] {
  const logs: FunctionL2Logs[] = [];
  // traverse through the stack of nested executions
  const executionStack = [execResult];
  while (executionStack.length) {
    const currentExecution = executionStack.pop()!;
    executionStack.push(...currentExecution.nestedExecutions);
    logs.push(currentExecution.unencryptedLogs);
  }
  return logs;
}

/**
 * Collect all enqueued public function calls across all nested executions.
 * @param execResult - The topmost execution result.
 * @returns All enqueued public function calls.
 */
export function collectEnqueuedPublicFunctionCalls(execResult: ExecutionResult): PublicCallRequest[] {
  return [
    ...execResult.enqueuedPublicFunctionCalls,
    ...execResult.nestedExecutions.flatMap(collectEnqueuedPublicFunctionCalls),
  ];
}
