import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { NodeStats } from '@aztec/stdlib/tx';

/**
 * Error thrown when a contract is not found in the database.
 */
export class ContractNotFoundError extends Error {
  constructor(contractAddress: string) {
    super(`DB has no contract with address ${contractAddress}`);
  }
}

/**
 * Error thrown when a contract class is not found in the database.
 */
export class ContractClassNotFoundError extends Error {
  constructor(contractClassId: string) {
    super(`DB has no contract class with id ${contractClassId}`);
  }
}

/*
 * Collected stats during the execution of a transaction.
 */
export type ExecutionStats = {
  /**
   * Contains an entry for each RPC call performed during the execution
   */
  nodeRPCCalls: NodeStats;
};

/**
 * The interface for the data layer required to perform private and utility execution.
 */
export interface ExecutionDataProvider {
  /**
   * Gets the index of a nullifier in the nullifier tree.
   * @param nullifier - The nullifier.
   * @returns - The index of the nullifier. Undefined if it does not exist in the tree.
   */
  getNullifierIndex(nullifier: Fr): Promise<bigint | undefined>;

  /**
   * Synchronizes the private logs tagged with scoped addresses and all the senders in the address book. Stores the found
   * logs in CapsuleArray ready for a later retrieval in Aztec.nr.
   * @param contractAddress - The address of the contract that the logs are tagged for.
   * @param pendingTaggedLogArrayBaseSlot - The base slot of the pending tagged log capsule array in which found logs will be stored.
   * @param scopes - The scoped addresses to sync logs for. If not provided, all accounts in the address book will be
   * synced.
   */
  syncTaggedLogs(
    contractAddress: AztecAddress,
    pendingTaggedLogArrayBaseSlot: Fr,
    scopes?: AztecAddress[],
  ): Promise<void>;

  /**
   * Validates all note and event validation requests enqueued via `enqueue_note_for_validation` and
   * `enqueue_event_for_validation`, inserting them into the note database and event store respectively, making them
   * queryable via `get_notes` and `getPrivateEvents`.
   *
   * This automatically clears both validation request queues, so no further work needs to be done by the caller.
   * @param contractAddress - The address of the contract that the logs are tagged for.
   * @param noteValidationRequestsArrayBaseSlot - The base slot of capsule array containing note validation requests.
   * @param eventValidationRequestsArrayBaseSlot - The base slot of capsule array containing event validation requests.
   */
  validateEnqueuedNotesAndEvents(
    contractAddress: AztecAddress,
    noteValidationRequestsArrayBaseSlot: Fr,
    eventValidationRequestsArrayBaseSlot: Fr,
  ): Promise<void>;

  bulkRetrieveLogs(
    contractAddress: AztecAddress,
    logRetrievalRequestsArrayBaseSlot: Fr,
    logRetrievalResponsesArrayBaseSlot: Fr,
  ): Promise<void>;
  /**
   * Looks for nullifiers of active contract notes and marks them as nullified in the db if a nullifier is found.
   */
  syncNoteNullifiers(contractAddress: AztecAddress): Promise<void>;

  /**
   * Returns the execution statistics collected during the simulator run.
   * @returns The execution statistics.
   */
  getStats(): ExecutionStats;

  // Exposed when moving in the direction of #17776
  get aztecNode(): AztecNode;
}
