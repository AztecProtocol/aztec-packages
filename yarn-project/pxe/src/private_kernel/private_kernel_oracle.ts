import { FUNCTION_TREE_HEIGHT, NOTE_HASH_TREE_HEIGHT, VK_TREE_HEIGHT } from '@aztec/constants';
import type { Fr, GrumpkinScalar, Point } from '@aztec/foundation/fields';
import { MembershipWitness } from '@aztec/foundation/trees';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { UpdatedClassIdHints } from '@aztec/stdlib/kernel';
import type { PublicKeys } from '@aztec/stdlib/keys';
import type { NullifierMembershipWitness } from '@aztec/stdlib/trees';
import type { VerificationKeyAsFields } from '@aztec/stdlib/vks';

/**
 * Provides functionality needed by the private kernel for interacting with our state trees.
 * This is either PrivateKernelOracleImpl, or a mocked test implementation.
 */
export interface PrivateKernelOracle {
  /** Retrieves the preimage of a contract address from the registered contract instances db. */
  getContractAddressPreimage(address: AztecAddress): Promise<{
    saltedInitializationHash: Fr;
    publicKeys: PublicKeys;
    currentContractClassId: Fr;
    originalContractClassId: Fr;
  }>;

  /** Retrieves the preimage of a contract class id from the contract classes db. */
  getContractClassIdPreimage(
    contractClassId: Fr,
  ): Promise<{ artifactHash: Fr; publicBytecodeCommitment: Fr; privateFunctionsRoot: Fr }>;

  /**
   * Returns a membership witness with the sibling path and leaf index in our private functions tree.
   */
  getFunctionMembershipWitness(
    contractClassId: Fr,
    selector: FunctionSelector,
  ): Promise<MembershipWitness<typeof FUNCTION_TREE_HEIGHT>>;

  /**
   * Returns a membership witness with the sibling path and leaf index in our protocol VK indexed merkle tree.
   * Used to validate the previous kernel's verification key.
   */
  getVkMembershipWitness(vk: VerificationKeyAsFields): Promise<MembershipWitness<typeof VK_TREE_HEIGHT>>;

  /**
   * Returns a membership witness with the sibling path and leaf index in our private function indexed merkle tree.
   */ getNoteHashMembershipWitness(leafIndex: bigint): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT>>;

  /**
   * Returns a membership witness with the sibling path and leaf index in our nullifier indexed merkle tree.
   */
  getNullifierMembershipWitness(nullifier: Fr): Promise<NullifierMembershipWitness | undefined>;
  /**
   * Returns the root of our note hash merkle tree.
   */
  getNoteHashTreeRoot(): Promise<Fr>;

  /**
   * Retrieves the sk_m corresponding to the pk_m.
   * @throws If the provided public key is not associated with any of the registered accounts.
   * @param pkM - The master public key to get secret key for.
   * @returns A Promise that resolves to sk_m.
   * @dev Used when feeding the sk_m to the kernel circuit for keys verification.
   */
  getMasterSecretKey(masterPublicKey: Point): Promise<GrumpkinScalar>;

  /** Use debug data to get the function name corresponding to a selector. */
  getDebugFunctionName(contractAddress: AztecAddress, selector: FunctionSelector): Promise<string | undefined>;

  /** Returns a membership witness and leaf index to our public data indexed merkle tree,
   * along with an associated DelayedPublicMutable containing the class ID to update. */
  getUpdatedClassIdHints(contractAddress: AztecAddress): Promise<UpdatedClassIdHints>;
}
