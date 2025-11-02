import type { Fr } from '@aztec/foundation/fields';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassPublic, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { UInt64 } from '@aztec/stdlib/types';

/**
 * Database interface for providing access to public state.
 */
export interface PublicStateDBInterface {
  /**
   * Reads a value from public storage, returning zero if none.
   * @param contract - Owner of the storage.
   * @param slot - Slot to read in the contract storage.
   * @returns The current value in the storage slot.
   */
  storageRead(contract: AztecAddress, slot: Fr): Promise<Fr>;

  /**
   * Records a write to public storage.
   * @param contract - Owner of the storage.
   * @param slot - Slot to read in the contract storage.
   * @param newValue - The new value to store.
   */
  storageWrite(contract: AztecAddress, slot: Fr, newValue: Fr): Promise<void>;
}

/**
 * Database interface for providing access to public contract data.
 */
export interface PublicContractsDBInterface {
  /**
   * Returns a contract instance given its address and the given timestamp, or undefined if not exists.
   * @param address - Address of the contract.
   * @param timestamp - Timestamp to get the contract instance at. Contract updates might change the instance.
   * @returns The contract instance or undefined if not found.
   */
  getContractInstance(address: AztecAddress, timestamp: UInt64): Promise<ContractInstanceWithAddress | undefined>;

  /**
   * Returns a publicly deployed contract class.
   * @param contractClassId - ID of the contract class.
   * @returns The contract class or undefined if not found
   */
  getContractClass(contractClassId: Fr): Promise<ContractClassPublic | undefined>;

  /**
   * Returns the commitment to the bytecode of a contract class.
   * @param contractClassId - ID of the contract class.
   * @returns The commitment to the bytecode or undefined if not found.
   */
  getBytecodeCommitment(contractClassId: Fr): Promise<Fr | undefined>;

  /**
   * Returns the function name of a contract's function given its selector.
   * @param contractAddress - Address of the contract.
   * @param selector - Selector of the function.
   * @returns The name of the function or undefined if not found.
   */
  getDebugFunctionName(contractAddress: AztecAddress, selector: FunctionSelector): Promise<string | undefined>;

  /**
   * Adds contracts (classes and instances) to the database.
   * Contracts are added to the current checkpoint level (top of the stack).
   * @param contractClasses - Array of contract classes to add.
   * @param contractInstances - Array of contract instances to add.
   */
  addContracts(contractClasses: ContractClassPublic[], contractInstances: ContractInstanceWithAddress[]): Promise<void>;

  /**
   * Creates a checkpoint for speculative contract additions.
   * Follows copy-on-create semantics: copies the current top of the stack.
   * Maximum of 3 total levels (base + 2 checkpoints).
   */
  createCheckpoint(): void;

  /**
   * Commits the current checkpoint, merging it into its parent.
   * Throws if no active checkpoint exists.
   */
  commitCheckpoint(): void;

  /**
   * Reverts the current checkpoint, discarding all changes made since creation.
   * Throws if no active checkpoint exists.
   */
  revertCheckpoint(): void;
}
