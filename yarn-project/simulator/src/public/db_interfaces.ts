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
   * Returns a publicly deployed contract instance.
   * @param address - Address of the contract.
   * @param timestamp - The timestamp at which to retrieve the contract instance.
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
}
