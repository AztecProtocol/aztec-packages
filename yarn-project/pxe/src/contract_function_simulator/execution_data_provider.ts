import type { L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import type { Fr, Point } from '@aztec/foundation/fields';
import type { FunctionArtifact, FunctionArtifactWithContractName, FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2Block } from '@aztec/stdlib/block';
import type { CompleteAddress, ContractInstance } from '@aztec/stdlib/contract';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import { IndexedTaggingSecret, PrivateLogWithTxData, PublicLogWithTxData } from '@aztec/stdlib/logs';
import type { NoteStatus } from '@aztec/stdlib/note';
import { type MerkleTreeId, type NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import type { BlockHeader, NodeStats } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import type { MessageLoadOracleInputs } from './oracle/message_load_oracle_inputs.js';
import type { NoteData } from './oracle/typed_oracle.js';

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
   * Returns a contract instance associated with an address, if available.
   * @param address - Address.
   * @returns A contract instance.
   */
  getContractInstance(address: AztecAddress): Promise<ContractInstance>;

  /**
   * Retrieve the complete address associated to a given address.
   * @param account - The account address.
   * @returns A complete address associated with the input address.
   * @throws An error if the account is not registered in the database.
   */
  getCompleteAddress(account: AztecAddress): Promise<CompleteAddress>;

  /**
   * Retrieve keys associated with a specific master public key and app address.
   * @param pkMHash - The master public key hash.
   * @returns A Promise that resolves to nullifier keys.
   * @throws If the keys are not registered in the key store.
   */
  getKeyValidationRequest(pkMHash: Fr, contractAddress: AztecAddress): Promise<KeyValidationRequest>;

  /**
   * Retrieves a set of notes stored in the database for a given contract address and storage slot.
   * The query result is paginated using 'limit' and 'offset' values.
   * Returns an object containing an array of note data.
   *
   * @param contractAddress - The contract address of the notes.
   * @param storageSlot - The storage slot of the notes.
   * @param status - The status of notes to fetch.
   * @param scopes - The accounts whose notes we can access in this call. Currently optional and will default to all.
   * @returns A Promise that resolves to an array of note data.
   */
  getNotes(
    contractAddress: AztecAddress,
    storageSlot: Fr,
    status: NoteStatus,
    scopes?: AztecAddress[],
  ): Promise<NoteData[]>;

  /**
   * Retrieve the artifact information of a specific function within a contract.
   * The function is identified by its selector, which is a unique identifier generated from the function signature.
   *
   * @param contractAddress - The contract address.
   * @param selector - The corresponding function selector.
   * @returns A Promise that resolves to a FunctionArtifact object.
   */
  getFunctionArtifact(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<FunctionArtifactWithContractName>;

  /**
   * Generates a stable function name for debug purposes.
   * @param contractAddress - The contract address.
   * @param selector - The corresponding function selector.
   */
  getDebugFunctionName(contractAddress: AztecAddress, selector: FunctionSelector): Promise<string>;

  /**
   * Retrieves the artifact of a specified function within a given contract.
   * The function is identified by its name, which is unique within a contract.
   *
   * @param contractAddress - The AztecAddress representing the contract containing the function.
   * @param functionName - The name of the function.
   * @returns The corresponding function's artifact as an object.
   */
  getFunctionArtifactByName(contractAddress: AztecAddress, functionName: string): Promise<FunctionArtifact | undefined>;

  /**
   * Gets the index of a nullifier in the nullifier tree.
   * @param nullifier - The nullifier.
   * @returns - The index of the nullifier. Undefined if it does not exist in the tree.
   */
  getNullifierIndex(nullifier: Fr): Promise<bigint | undefined>;

  /**
   * Returns a nullifier membership witness for the given nullifier or undefined if not found.
   * REFACTOR: Same as getL1ToL2MembershipWitness, can be combined with aztec-node method that does almost the same thing.
   * @param nullifier - Nullifier we're looking for.
   */
  getNullifierMembershipWitnessAtLatestBlock(nullifier: Fr): Promise<NullifierMembershipWitness | undefined>;

  /**
   * Fetches a message from the db, given its key.
   * @param contractAddress - Address of a contract by which the message was emitted.
   * @param messageHash - Hash of the message.
   * @param secret - Secret used to compute a nullifier.
   * @dev Contract address and secret are only used to compute the nullifier to get non-nullified messages
   * @returns The l1 to l2 membership witness (index of message in the tree and sibling path).
   */
  getL1ToL2MembershipWitness(
    contractAddress: AztecAddress,
    messageHash: Fr,
    secret: Fr,
  ): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>>;

  /**
   * Retrieve the latest block header synchronized by the PXE.
   * @dev This structure is fed into the circuits simulator and is used to prove against certain historical roots.
   * @returns The BlockHeader object.
   */
  getBlockHeader(): Promise<BlockHeader>;

  /**
   * Fetches the index and sibling path of a leaf at a given block from a given tree.
   * @param blockNumber - The block number at which to get the membership witness.
   * @param treeId - Id of the tree to get the sibling path from.
   * @param leafValue - The leaf value
   * @returns The index and sibling path concatenated [index, sibling_path]
   */
  getMembershipWitness(blockNumber: number, treeId: MerkleTreeId, leafValue: Fr): Promise<Fr[]>;

  /**
   * Returns a nullifier membership witness for a given nullifier at a given block.
   * @param blockNumber - The block number at which to get the index.
   * @param nullifier - Nullifier we try to find witness for.
   * @returns The nullifier membership witness (if found).
   */
  getNullifierMembershipWitness(blockNumber: number, nullifier: Fr): Promise<NullifierMembershipWitness | undefined>;

  /**
   * Returns a low nullifier membership witness for a given nullifier at a given block.
   * @param blockNumber - The block number at which to get the index.
   * @param nullifier - Nullifier we try to find the low nullifier witness for.
   * @returns The low nullifier membership witness (if found).
   * @remarks Low nullifier witness can be used to perform a nullifier non-inclusion proof by leveraging the "linked
   * list structure" of leaves and proving that a lower nullifier is pointing to a bigger next value than the nullifier
   * we are trying to prove non-inclusion for.
   */
  getLowNullifierMembershipWitness(blockNumber: number, nullifier: Fr): Promise<NullifierMembershipWitness | undefined>;

  /**
   * Returns a witness for a given slot of the public data tree at a given block.
   * @param blockNumber - The block number at which to get the witness.
   * @param leafSlot - The slot of the public data in the public data tree.
   */
  getPublicDataWitness(blockNumber: number, leafSlot: Fr): Promise<PublicDataWitness | undefined>;

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
  getPublicStorageAt(blockNumber: number, contract: AztecAddress, slot: Fr): Promise<Fr>;

  /**
   * Fetch a block corresponding to the given block number.
   * @param blockNumber - The block number of a block to fetch.
   * @returns - The block corresponding to the given block number. Undefined if it does not exist.
   */
  getBlock(blockNumber: number): Promise<L2Block | undefined>;

  /**
   * Fetches the latest block number synchronized by the node.
   * @returns The block number.
   */
  getBlockNumber(): Promise<number>;

  /**
   * Fetches the timestamp of the latest block synchronized by the node.
   * @returns The timestamp.
   */
  getTimestamp(): Promise<UInt64>;

  /**
   * Fetches the current chain id.
   * @returns The chain id.
   */
  getChainId(): Promise<number>;

  /**
   * Fetches the current chain id.
   * @returns The chain id.
   */
  getVersion(): Promise<number>;

  /**
   * Returns the tagging secret for a given sender and recipient pair. For this to work, the ivsk_m of the sender must be known.
   * Includes the next index to be used used for tagging with this secret.
   * @param contractAddress - The contract address to silo the secret for
   * @param sender - The address sending the note
   * @param recipient - The address receiving the note
   * @returns A tagging secret that can be used to tag notes.
   */
  getIndexedTaggingSecretAsSender(
    contractAddress: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
  ): Promise<IndexedTaggingSecret>;

  /**
   * Increments the tagging secret for a given sender and recipient pair. For this to work, the ivsk_m of the sender must be known.
   * @param contractAddress - The contract address to silo the secret for
   * @param sender - The address sending the note
   * @param recipient - The address receiving the note
   */
  incrementAppTaggingSecretIndexAsSender(
    contractAddress: AztecAddress,
    sender: AztecAddress,
    recipient: AztecAddress,
  ): Promise<void>;

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

  /**
   * Searches for a log with the corresponding `tag` and returns it along with contextual transaction information.
   * Returns null if no such log exists, and throws if more than one exists.
   *
   * @param tag - The log tag to search for.
   * @param contractAddress - The contract address to search for the log in.
   * @returns The public log with transaction data if found, null otherwise.
   * @throws If more than one log with that tag exists.
   */
  getPublicLogByTag(tag: Fr, contractAddress: AztecAddress): Promise<PublicLogWithTxData | null>;

  /**
   * Searches for a private log with the corresponding `siloedTag` and returns it along with contextual transaction
   * information.
   *
   * @param siloedTag - The siloed log tag to search for.
   * @returns The private log with transaction data if found, null otherwise.
   */
  getPrivateLogByTag(siloedTag: Fr): Promise<PrivateLogWithTxData | null>;

  /**
   * Removes all of a contract's notes that have been nullified from the note database.
   */
  removeNullifiedNotes(contractAddress: AztecAddress): Promise<void>;

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
   * Retrieves the shared secret for a given address and ephemeral public key.
   * @param address - The address to get the secret for.
   * @param ephPk - The ephemeral public key to get the secret for.
   * @returns The secret for the given address.
   */
  getSharedSecret(address: AztecAddress, ephPk: Point): Promise<Point>;

  /**
   * Returns the execution statistics collected during the simulator run.
   * @returns The execution statistics.
   */
  getStats(): ExecutionStats;
}
