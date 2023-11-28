import { CompleteAddress, GrumpkinPrivateKey, HistoricBlockData, PublicKey } from '@aztec/circuits.js';
import { FunctionArtifact, FunctionDebugMetadata, FunctionSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { MerkleTreeId } from '@aztec/types';

import { NoteData } from '../acvm/index.js';
import { CommitmentsDB } from '../public/index.js';

/**
 * A function artifact with optional debug metadata
 */
export interface FunctionArtifactWithDebugMetadata extends FunctionArtifact {
  /**
   * Debug metadata for the function.
   */
  debug?: FunctionDebugMetadata;
}

/**
 * The database oracle interface.
 */
export interface DBOracle extends CommitmentsDB {
  /**
   * Retrieve the complete address associated to a given address.
   * @param address - Address to fetch the pubkey for.
   * @returns A complete address associated with the input address.
   */
  getCompleteAddress(address: AztecAddress): Promise<CompleteAddress>;

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
   * Retrieve the secret key associated with a specific public key.
   * The function only allows access to the secret keys of the transaction creator,
   * and throws an error if the address does not match the public key address of the key pair.
   *
   * @param contractAddress - The contract address. Ignored here. But we might want to return different keys for different contracts.
   * @param pubKey - The public key of an account.
   * @returns A Promise that resolves to the secret key.
   * @throws An Error if the input address does not match the public key address of the key pair.
   */
  getSecretKey(contractAddress: AztecAddress, pubKey: PublicKey): Promise<GrumpkinPrivateKey>;

  /**
   * Retrieves a set of notes stored in the database for a given contract address and storage slot.
   * The query result is paginated using 'limit' and 'offset' values.
   * Returns an object containing an array of note data.
   *
   * @param contractAddress - The AztecAddress instance representing the contract address.
   * @param storageSlot - The Fr instance representing the storage slot of the notes.
   * @returns A Promise that resolves to an array of note data.
   */
  getNotes(contractAddress: AztecAddress, storageSlot: Fr): Promise<NoteData[]>;

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
  ): Promise<FunctionArtifactWithDebugMetadata>;

  /**
   * Retrieves the artifact of a specified function within a given contract.
   * The function is identified by its name, which is unique within a contract.
   *
   * @param contractAddress - The AztecAddress representing the contract containing the function.
   * @param functionName - The name of the function.
   * @returns The corresponding function's artifact as an object.
   */
  getFunctionArtifactByName(
    contractAddress: AztecAddress,
    functionName: string,
  ): Promise<FunctionArtifactWithDebugMetadata | undefined>;

  /**
   * Retrieves the portal contract address associated with the given contract address.
   * Throws an error if the input contract address is not found or invalid.
   *
   * @param contractAddress - The address of the contract whose portal address is to be fetched.
   * @returns A Promise that resolves to an EthAddress instance, representing the portal contract address.
   */
  getPortalContractAddress(contractAddress: AztecAddress): Promise<EthAddress>;

  /**
   * Gets the index of a nullifier in the nullifier tree.
   * @param nullifier - The nullifier.
   * @returns - The index of the nullifier. Undefined if it does not exist in the tree.
   */
  getNullifierIndex(nullifier: Fr): Promise<bigint | undefined>;

  /**
   * Retrieve the databases view of the Historic Block Data object.
   * This structure is fed into the circuits simulator and is used to prove against certain historic roots.
   *
   * @returns A Promise that resolves to a HistoricBlockData object.
   */
  getHistoricBlockData(): Promise<HistoricBlockData>;

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
   */
  getSiblingPath(blockNumber: number, treeId: MerkleTreeId, leafIndex: bigint): Promise<Fr[]>;
}
