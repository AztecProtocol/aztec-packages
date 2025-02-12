import { type InBlock, type NotesFilter } from '@aztec/circuit-types';
import {
  type BlockHeader,
  type CompleteAddress,
  type ContractInstanceWithAddress,
  type IndexedTaggingSecret,
  type PublicKey,
} from '@aztec/circuits.js';
import { type ContractArtifact } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { type Fr } from '@aztec/foundation/fields';

import { type ContractArtifactDatabase } from './contracts/contract_artifact_db.js';
import { type ContractInstanceDatabase } from './contracts/contract_instance_db.js';
import { type NoteDao } from './note_dao.js';

/**
 * A database interface that provides methods for retrieving, adding, and removing transactional data related to Aztec
 * addresses, storage slots, and nullifiers.
 */
export interface PxeDatabase extends ContractArtifactDatabase, ContractInstanceDatabase {
  getContract(address: AztecAddress): Promise<(ContractInstanceWithAddress & ContractArtifact) | undefined>;

  /**
   * Add a auth witness to the database.
   * @param messageHash - The message hash.
   * @param witness - An array of field elements representing the auth witness.
   */
  addAuthWitness(messageHash: Fr, witness: Fr[]): Promise<void>;

  /**
   * Fetching the auth witness for a given message hash.
   * @param messageHash - The message hash.
   * @returns A Promise that resolves to an array of field elements representing the auth witness.
   */
  getAuthWitness(messageHash: Fr): Promise<Fr[] | undefined>;

  /**
   * Gets notes based on the provided filter.
   * @param filter - The filter to apply to the notes.
   * @returns The requested notes.
   */
  getNotes(filter: NotesFilter): Promise<NoteDao[]>;

  /**
   * Adds a note to DB.
   * @param note - The note to add.
   * @param scope - The scope to add the note under. Currently optional.
   * @remark - Will create a database for the scope if it does not already exist.
   */
  addNote(note: NoteDao, scope?: AztecAddress): Promise<void>;

  /**
   * Adds a nullified note to DB.
   * @param note - The note to add.
   */
  addNullifiedNote(note: NoteDao): Promise<void>;

  /**
   * Adds an array of notes to DB.
   * This function is used to insert multiple notes to the database at once,
   * which can improve performance when dealing with large numbers of transactions.
   *
   * @param notes - An array of notes.
   * @param scope - The scope to add the notes under. Currently optional.
   * @remark - Will create a database for the scope if it does not already exist.
   */
  addNotes(notes: NoteDao[], scope?: AztecAddress): Promise<void>;

  /**
   * Remove nullified notes associated with the given account and nullifiers.
   *
   * @param nullifiers - An array of Fr instances representing nullifiers to be matched.
   * @param account - A PublicKey instance representing the account for which the records are being removed.
   * @returns Removed notes.
   */
  removeNullifiedNotes(nullifiers: InBlock<Fr>[], account: PublicKey): Promise<NoteDao[]>;

  /**
   * Gets the most recently processed block number.
   * @returns The most recently processed block number or undefined if never synched.
   */
  getBlockNumber(): Promise<number | undefined>;

  /**
   * Retrieve the stored Block Header from the database.
   * The function returns a Promise that resolves to the Block Header.
   * This data is required to reproduce block attestations.
   * Throws an error if the block header is not available within the database.
   *
   * note: this data is a combination of the tree roots and the global variables hash.
   *
   * @returns The Block Header.
   * @throws If no block have been processed yet.
   */
  getBlockHeader(): Promise<BlockHeader>;

  /**
   * Set the latest Block Header.
   * Note that this will overwrite any existing hash or roots in the database.
   *
   * @param header - An object containing the most recent block header.
   * @returns A Promise that resolves when the hash has been successfully updated in the database.
   */
  setHeader(header: BlockHeader): Promise<void>;

  /**
   * Adds sender address to the database.
   * @param address - The address to add to the address book.
   * @returns A promise resolving to true if the address was added, false if it already exists.
   */
  addSenderAddress(address: AztecAddress): Promise<boolean>;

  /**
   * Retrieves the list of sender addresses in the address book.
   * @returns An array of Aztec addresses.
   */
  getSenderAddresses(): Promise<AztecAddress[]>;

  /**
   * Removes a sender address from the database.
   * @param address - The address to remove from the address book.
   * @returns A promise resolving to true if the address was removed, false if it does not exist.
   */
  removeSenderAddress(address: AztecAddress): Promise<boolean>;

  /**
   * Adds complete address to the database.
   * @param address - The complete address to add.
   * @returns A promise resolving to true if the address was added, false if it already exists.
   * @throws If we try to add a CompleteAddress with the same AztecAddress but different public key or partial
   * address.
   */
  addCompleteAddress(address: CompleteAddress): Promise<boolean>;

  /**
   * Retrieve the complete address associated to a given address.
   * @param account - The account address.
   * @returns A promise that resolves to a CompleteAddress instance if found, or undefined if not found.
   */
  getCompleteAddress(account: AztecAddress): Promise<CompleteAddress | undefined>;

  /**
   * Retrieves the list of complete addresses added to this database
   * @returns A promise that resolves to an array of AztecAddress instances.
   */
  getCompleteAddresses(): Promise<CompleteAddress[]>;

  /**
   * Returns the estimated size in bytes of this db.
   * @returns The estimated size in bytes of this db.
   */
  estimateSize(): Promise<number>;

  /**
   * Returns the last seen indexes for the provided app siloed tagging secrets or 0 if they've never been seen.
   * @param appTaggingSecrets - The app siloed tagging secrets.
   * @returns The indexes for the provided secrets, 0 if they've never been seen.
   */
  getTaggingSecretsIndexesAsRecipient(appTaggingSecrets: Fr[]): Promise<number[]>;

  /**
   * Returns the last seen indexes for the provided app siloed tagging secrets or 0 if they've never been used
   * @param appTaggingSecrets - The app siloed tagging secrets.
   * @returns The indexes for the provided secrets, 0 if they've never been seen.
   */
  getTaggingSecretsIndexesAsSender(appTaggingSecrets: Fr[]): Promise<number[]>;

  /**
   * Sets the index for the provided app siloed tagging secrets
   * To be used when the generated tags have been "seen" as a sender
   * @param appTaggingSecrets - The app siloed tagging secrets.
   */
  setTaggingSecretsIndexesAsSender(indexedTaggingSecrets: IndexedTaggingSecret[]): Promise<void>;

  /**
   * Sets the index for the provided app siloed tagging secrets
   * To be used when the generated tags have been "seen" as a recipient
   * @param appTaggingSecrets - The app siloed tagging secrets.
   */
  setTaggingSecretsIndexesAsRecipient(indexedTaggingSecrets: IndexedTaggingSecret[]): Promise<void>;

  /**
   * Deletes all notes synched after this block number.
   * @param blockNumber - All notes strictly after this block number are removed.
   */
  removeNotesAfter(blockNumber: number): Promise<void>;

  /**
   * Restores notes nullified after the given block.
   * @param blockNumber - All nullifiers strictly after this block are removed.
   */
  unnullifyNotesAfter(blockNumber: number): Promise<void>;

  /**
   * Resets the indexes used to sync notes to 0 for every sender and recipient, causing the next sync process to
   * start from scratch, taking longer than usual.
   * This can help fix desynchronization issues, including finding logs that had previously been overlooked, and
   * is also required to deal with chain reorgs.
   */
  resetNoteSyncData(): Promise<void>;

  /**
   * Stores arbitrary information in a per-contract non-volatile database (called capsules), which can later
   * be retrieved with `loadCapsule`. If data was already stored at this slot, it is overwritten.
   * @param contractAddress - The contract address to scope the data under.
   * @param slot - The slot in the database in which to store the value. Slots need not be contiguous.
   * @param capsule - An array of field elements representing the capsule.
   * @remarks A capsule is a "blob" of data that is passed to the contract through an oracle. It works similarly
   * to public contract storage in that it's indexed by the contract address and storage slot but instead of the global
   * network state it's backed by local PXE db.
   */
  storeCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void>;

  /**
   * Returns data previously stored via `storeCapsule` in the per-contract non-volatile database (called capsules).
   * @param contractAddress - The contract address under which the data is scoped.
   * @param slot - The slot in the database to read.
   * @returns The stored data or `null` if no data is stored under the slot.
   */
  loadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null>;

  /**
   * Deletes data in the per-contract non-volatile database (called capsules). Does nothing if no data was present.
   * @param contractAddress - The contract address under which the data is scoped.
   * @param slot - The slot in the database to delete.
   */
  deleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void>;

  /**
   * Copies a number of contiguous entries in the per-contract non-volatile database (called capsules). This allows for
   * efficient data structures by avoiding repeated calls to `loadCapsule` and `storeCapsule`.
   * Supports overlapping source and destination regions (which will result in the overlapped source values being
   * overwritten). All copied slots must exist in the database (i.e. have been stored and not deleted)
   *
   * @param contractAddress - The contract address under which the data is scoped.
   * @param srcSlot - The first slot to copy from.
   * @param dstSlot - The first slot to copy to.
   * @param numEntries - The number of entries to copy.
   */
  copyCapsule(contractAddress: AztecAddress, srcSlot: Fr, dstSlot: Fr, numEntries: number): Promise<void>;
}
