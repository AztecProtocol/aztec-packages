import type { L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import type { Fr } from '@aztec/foundation/fields';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassPublic, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { NullifierMembershipWitness } from '@aztec/stdlib/trees';

import type { MessageLoadOracleInputs } from './message_load_oracle_inputs.js';

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
   * @param blockNumber - The block number at which to retrieve the contract instance.
   * @returns The contract instance or undefined if not found.
   */
  getContractInstance(address: AztecAddress, blockNumber: number): Promise<ContractInstanceWithAddress | undefined>;

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

/** Database interface for providing access to note hash tree, l1 to l2 message tree, and nullifier tree. */
export interface CommitmentsDBInterface {
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
   * @param leafIndex the leaf to look up
   * @returns The l1 to l2 leaf message hash or undefined if not found.
   */
  getL1ToL2MessageHash(leafIndex: bigint): Promise<Fr | undefined>;

  /**
   * Gets note hash in the note hash tree at the given leaf index.
   * @param leafIndex - the leaf to look up.
   * @returns - The note hash at that index. Undefined if leaf index is not found.
   */
  getNoteHash(leafIndex: bigint): Promise<Fr | undefined>;

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
}
