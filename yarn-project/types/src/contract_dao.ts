import { ContractAbi, FunctionAbi } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';

/**
 * A contract function Data Access Object (DAO).
 * Extends the FunctionAbi interface, adding a 'selector' property.
 * The 'selector' is a unique identifier for the function within the contract.
 */
export interface ContractFunctionDao extends FunctionAbi {
  /**
   * Unique identifier for a contract function.
   */
  selector: Buffer;
}

/**
 * A contract Data Access Object (DAO).
 * Contains the contract's address, portal contract address, and an array of ContractFunctionDao objects.
 * Each ContractFunctionDao object includes FunctionAbi data and the function selector buffer.
 */
export interface ContractDao extends ContractAbi {
  /**
   * The noir contract address.
   */
  address: AztecAddress;
  /**
   * The Ethereum address of the L1 contract serving as a bridge for cross-layer interactions.
   */
  portalContract: EthAddress;
  /**
   * An array of contract functions with additional selector property.
   */
  functions: ContractFunctionDao[];
}
