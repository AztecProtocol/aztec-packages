import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassIdPreimage, ContractClassWithId, ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { ProtocolContractAddress } from './protocol_contract_data.js';

/**
 * Represents a canonical protocol contract deployed at a well-known address in the Aztec network.
 *
 * Protocol contracts are system-level contracts that are fundamental to the operation of the Aztec network.
 * They are deployed at deterministic addresses and provide core functionality such as contract registration,
 * instance management, fee handling, and transaction routing.
 *
 * These contracts are part of the protocol itself and are treated specially by the network nodes.
 * Their addresses are known in advance and hardcoded in the protocol constants.
 *
 * @remarks
 * Protocol contracts differ from regular user contracts in that:
 * - They are deployed at predetermined addresses during network genesis
 * - Their bytecode and behavior are part of the protocol specification
 * - They provide essential infrastructure for the network operation
 * - They are automatically trusted by all network participants
 *
 * @example
 * ```typescript
 * import { getCanonicalFeeJuice } from '@aztec/protocol-contracts';
 *
 * // Get the canonical FeeJuice protocol contract
 * const feeJuice = await getCanonicalFeeJuice();
 * console.log('FeeJuice address:', feeJuice.address.toString());
 * ```
 */
export interface ProtocolContract {
  /**
   * The canonical deployed contract instance with its full configuration.
   * Contains the address, salt, class ID, initialization hash, and public keys.
   */
  instance: ContractInstanceWithAddress;

  /**
   * The contract class definition including its ID and preimage.
   * The class defines the code and structure of the contract without specifying
   * the deployment parameters.
   */
  contractClass: ContractClassWithId & ContractClassIdPreimage;

  /**
   * The complete contract artifact containing all metadata.
   * Includes the ABI, function signatures, events, storage layout, and bytecode
   * needed to interact with the contract.
   */
  artifact: ContractArtifact;

  /**
   * The deterministic deployment address for this canonical protocol contract.
   * This address is derived from the protocol constants and is the same across all Aztec networks.
   */
  address: AztecAddress;
}

/**
 * Checks whether the given address corresponds to a known protocol contract.
 *
 * This function verifies if an address belongs to one of the canonical protocol contracts
 * such as ContractClassRegistry, ContractInstanceRegistry, FeeJuice, Router, etc.
 *
 * @param address - The address to check
 * @returns True if the address matches any protocol contract address, false otherwise
 *
 * @example
 * ```typescript
 * import { isProtocolContract, ProtocolContractAddress } from '@aztec/protocol-contracts';
 *
 * // Check if an address is a protocol contract
 * const isFeeJuice = isProtocolContract(ProtocolContractAddress.FeeJuice);
 * console.log('Is FeeJuice a protocol contract?', isFeeJuice); // true
 *
 * // Check a random user contract address
 * const isUserContract = isProtocolContract(someUserAddress);
 * console.log('Is user contract a protocol contract?', isUserContract); // false
 * ```
 */
export function isProtocolContract(address: AztecAddress) {
  return Object.values(ProtocolContractAddress).some(a => a.equals(address));
}

export { type ProtocolContractsProvider } from './provider/protocol_contracts_provider.js';
