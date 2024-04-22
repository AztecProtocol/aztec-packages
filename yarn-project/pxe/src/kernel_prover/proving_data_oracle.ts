import { type NullifierMembershipWitness } from '@aztec/circuit-types';
import {
  type FUNCTION_TREE_HEIGHT,
  type Fr,
  type FunctionSelector,
  type GrumpkinPrivateKey,
  type MembershipWitness,
  type NOTE_HASH_TREE_HEIGHT,
  type Point,
  type VK_TREE_HEIGHT,
  type VerificationKey,
} from '@aztec/circuits.js';
import { type AztecAddress } from '@aztec/foundation/aztec-address';

/**
 * Provides functionality to fetch membership witnesses for verification keys,
 * contract addresses, and function selectors in their respective merkle trees.
 */
export interface ProvingDataOracle {
  /** Retrieves the preimage of a contract address from the registered contract instances db. */
  getContractAddressPreimage(
    address: AztecAddress,
  ): Promise<{ saltedInitializationHash: Fr; publicKeysHash: Fr; contractClassId: Fr }>;

  /** Retrieves the preimage of a contract class id from the contract classes db. */
  getContractClassIdPreimage(
    contractClassId: Fr,
  ): Promise<{ artifactHash: Fr; publicBytecodeCommitment: Fr; privateFunctionsRoot: Fr }>;

  /**
   * Retrieve the function membership witness for the given contract address and function selector.
   * The function membership witness represents a proof that the function belongs to the specified contract.
   * Throws an error if the contract address or function selector is unknown.
   *
   * @param contractAddress - The contract address.
   * @param selector - The function selector.
   * @returns A promise that resolves with the MembershipWitness instance for the specified contract's function.
   */
  getFunctionMembershipWitness(
    contractAddress: AztecAddress,
    selector: FunctionSelector,
  ): Promise<MembershipWitness<typeof FUNCTION_TREE_HEIGHT>>;

  /**
   * Retrieve the membership witness corresponding to a verification key.
   * This function currently returns a random membership witness of the specified height,
   * which is a placeholder implementation until a concrete membership witness calculation
   * is implemented.
   *
   * @param vk - The VerificationKey for which the membership witness is needed.
   * @returns A Promise that resolves to the MembershipWitness instance.
   */
  getVkMembershipWitness(vk: VerificationKey): Promise<MembershipWitness<typeof VK_TREE_HEIGHT>>;

  /**
   * Get the note membership witness for a note in the note hash tree at the given leaf index.
   *
   * @param leafIndex - The leaf index of the note in the note hash tree.
   * @returns the MembershipWitness for the note.
   */
  getNoteMembershipWitness(leafIndex: bigint): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT>>;

  getNullifierMembershipWitness(nullifier: Fr): Promise<NullifierMembershipWitness | undefined>;

  /**
   * Get the root of the note hash tree.
   *
   * @returns the root of the note hash tree.
   */
  getNoteHashTreeRoot(): Promise<Fr>;

  /**
   * Get the master secret key of the nullifier public key.
   *
   * @param nullifierPublicKey - The nullifier public key.
   * @returns the master nullifier secret key.
   */
  getMasterNullifierSecretKey(nullifierPublicKey: Point): Promise<GrumpkinPrivateKey>;
}
