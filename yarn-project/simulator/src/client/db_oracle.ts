import {
  type L2Block,
  type MerkleTreeId,
  type NoteStatus,
  type NullifierMembershipWitness,
  type PublicDataWitness,
} from '@aztec/circuit-types';
import { type CompleteAddress, type Header, type KeyValidationRequest } from '@aztec/circuits.js';
import { type FunctionArtifact, type FunctionSelector } from '@aztec/foundation/abi';
import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { type Fr } from '@aztec/foundation/fields';
import { type ContractInstance } from '@aztec/types/contracts';

import { type NoteData } from '../acvm/index.js';
import { type CommitmentsDB } from '../public/db_interfaces.js';

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

/**
 * The database oracle interface.
 */
export interface DBOracle extends CommitmentsDB {
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
   * Retrieve the auth witness for a given message hash.
   * @param messageHash - The message hash.
   * @returns A Promise that resolves to an array of field elements representing the auth witness.
   */
  getAuthWitness(messageHash: Fr): Promise<Fr[]>;

  /**
   * Retrieve a capsule from the capsule dispenser.
   * @returns A promise that resolves to an array of field elements representing the capsule.
   * @remarks A capsule is a "blob" of data that is passed to the contract through an oracle.
   */
  popCapsule(): Promise<Fr[]>;

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
  getFunctionArtifact(contractAddress: AztecAddress, selector: FunctionSelector): Promise<FunctionArtifact>;

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
   * Retrieve the databases view of the Block Header object.
   * This structure is fed into the circuits simulator and is used to prove against certain historical roots.
   *
   * @returns A Promise that resolves to a Header object.
   */
  getHeader(): Promise<Header>;

  /**
   * Fetch the index of the leaf in the respective tree
   * @param blockNumber - The block number at which to get the leaf index.
   * @param treeId - The id of the tree to search.
   * @param leafValue - The leaf value buffer.
   * @returns - The index of the leaf. Undefined if it does not exist in the tree.
   */
  findLeafIndex(blockNumber: number, treeId: MerkleTreeId, leafValue: Fr): Promise<bigint | undefined>;

  /**
   * Fetch the sibling path of the leaf in the respective tree
   * @param blockNumber - The block number at which to get the sibling path.
   * @param treeId - The id of the tree to search.
   * @param leafIndex - The index of the leaf.
   * @returns - The sibling path of the leaf.
   */
  getSiblingPath(blockNumber: number, treeId: MerkleTreeId, leafIndex: bigint): Promise<Fr[]>;

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
  getPublicDataTreeWitness(blockNumber: number, leafSlot: Fr): Promise<PublicDataWitness | undefined>;

  /**
   * Fetch a block corresponding to the given block number.
   * @param blockNumber - The block number of a block to fetch.
   * @returns - The block corresponding to the given block number. Undefined if it does not exist.
   */
  getBlock(blockNumber: number): Promise<L2Block | undefined>;

  /**
   * Fetches the current block number.
   * @returns The block number.
   */
  getBlockNumber(): Promise<number>;
}
