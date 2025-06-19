import type { Fr } from '@aztec/foundation/fields';

import type { FunctionSelector } from '../../abi/index.js';
import type { AztecAddress } from '../../aztec-address/index.js';
import type { UInt64 } from '../../types/shared.js';
import type { ContractClassPublic } from './contract_class.js';
import type { ContractInstanceWithAddress } from './contract_instance.js';

export interface ContractDataSource {
  /**
   * Gets the number of the latest L2 block processed by the implementation.
   * @returns The number of the latest L2 block processed by the implementation.
   */
  getBlockNumber(): Promise<number>;

  /**
   * Returns the contract class for a given contract class id, or undefined if not found.
   * @param id - Contract class id.
   */
  getContractClass(id: Fr): Promise<ContractClassPublic | undefined>;

  getBytecodeCommitment(id: Fr): Promise<Fr | undefined>;

  /**
   * Returns a publicly deployed contract instance given its address.
   * @param address - Address of the deployed contract.
   * @param timestamp - Timestamp at which to retrieve the contract instance. If not provided, the latest block should be used. TODO(benesjan): update this comment.
   */
  getContract(address: AztecAddress, timestamp?: UInt64): Promise<ContractInstanceWithAddress | undefined>;

  /**
   * Returns the list of all class ids known.
   */
  getContractClassIds(): Promise<Fr[]>;

  /** Returns a function's name. It's only available if provided by calling `registerContractFunctionSignatures`. */
  getDebugFunctionName(address: AztecAddress, selector: FunctionSelector): Promise<string | undefined>;

  /** Registers a function names. Useful for debugging. */
  registerContractFunctionSignatures(signatures: string[]): Promise<void>;
}
