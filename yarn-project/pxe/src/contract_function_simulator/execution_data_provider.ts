import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { NodeStats } from '@aztec/stdlib/tx';

import type { SenderTaggingDataProvider } from '../storage/tagging_data_provider/sender_tagging_data_provider.js';

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
   * Gets the storage value at the given contract storage slot.
   *
   * @remarks The storage slot here refers to the slot as it is defined in Noir not the index in the merkle tree.
   * Aztec's version of `eth_getStorageAt`.
   *
   * @param blockNumber - The block number at which to get the data.
   * @param contract - Address of the contract to query.
   * @param slot - Slot to query.
   * @returns Storage value at the given contract slot.
   * @throws If the contract is not deployed.
   */
  getPublicStorageAt(blockNumber: BlockNumber, contract: AztecAddress, slot: Fr): Promise<Fr>;

  /**
   * Assert that the oracle version is compatible with the expected version.
   * @param version - The expected version.
   */
  assertCompatibleOracleVersion(version: number): void;

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
   * Stores arbitrary information in a per-contract non-volatile database, which can later be retrieved with `loadCapsule`.
   * * If data was already stored at this slot, it is overwritten.
   * @param contractAddress - The contract address to scope the data under.
   * @param slot - The slot in the database in which to store the value. Slots need not be contiguous.
   * @param capsule - An array of field elements representing the capsule.
   * @remarks A capsule is a "blob" of data that is passed to the contract through an oracle. It works similarly
   * to public contract storage in that it's indexed by the contract address and storage slot but instead of the global
   * network state it's backed by local PXE db.
   */
  storeCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void>;

  /**
   * Returns data previously stored via `storeCapsule` in the per-contract non-volatile database.
   * @param contractAddress - The contract address under which the data is scoped.
   * @param slot - The slot in the database to read.
   * @returns The stored data or `null` if no data is stored under the slot.
   */
  loadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null>;

  /**
   * Deletes data in the per-contract non-volatile database. Does nothing if no data was present.
   * @param contractAddress - The contract address under which the data is scoped.
   * @param slot - The slot in the database to delete.
   */
  deleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void>;

  /**
   * Copies a number of contiguous entries in the per-contract non-volatile database. This allows for efficient data
   * structures by avoiding repeated calls to `loadCapsule` and `storeCapsule`.
   * Supports overlapping source and destination regions (which will result in the overlapped source values being
   * overwritten). All copied slots must exist in the database (i.e. have been stored and not deleted)
   *
   * @param contractAddress - The contract address under which the data is scoped.
   * @param srcSlot - The first slot to copy from.
   * @param dstSlot - The first slot to copy to.
   * @param numEntries - The number of entries to copy.
   */
  copyCapsule(contractAddress: AztecAddress, srcSlot: Fr, dstSlot: Fr, numEntries: number): Promise<void>;

  /**
   * Returns the execution statistics collected during the simulator run.
   * @returns The execution statistics.
   */
  getStats(): ExecutionStats;

  // Exposed when moving in the direction of #17776
  get aztecNode(): AztecNode;
  get senderTaggingDataProvider(): SenderTaggingDataProvider;
}
