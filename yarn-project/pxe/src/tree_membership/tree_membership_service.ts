import type { L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { SiblingPath } from '@aztec/foundation/trees';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { getNonNullifiedL1ToL2MessageWitness } from '@aztec/stdlib/messaging';
import { MerkleTreeId, NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';

// TODO: REmove this class as it no longer seems valuable. The only somewhat real functionality in this class is in
// the `getMembershipWitness` method that is used by `utilityGetMembershipWitness` oracle by then in Aztec.nr we
// have helper functions around that oracle for archive and note hash tree and the generic method itself is not used
// anywhere else - make sense to just have simple specific handlers for the archive and note hash trees and drop this.
export class TreeMembershipService {
  constructor(private readonly aztecNode: AztecNode) {}

  /**
   * Gets the index of a nullifier in the nullifier tree.
   * @returns - The index of the nullifier. Undefined if it does not exist in the tree.
   */
  public async getNullifierIndex(nullifier: Fr): Promise<bigint | undefined> {
    const [leafIndex] = await this.aztecNode.findLeavesIndexes('latest', MerkleTreeId.NULLIFIER_TREE, [nullifier]);
    return leafIndex?.data;
  }

  /**
   * Fetches the index and sibling path of a leaf at a given block from a given tree.
   * @param blockHash - The block hash at which to get the membership witness.
   * @param treeId - Id of the tree to get the sibling path from.
   * @param leafValue - The leaf value
   * @returns The index and sibling path concatenated [index, sibling_path]
   */
  public async getMembershipWitness(blockHash: L2BlockHash, treeId: MerkleTreeId, leafValue: Fr): Promise<Fr[]> {
    const witness = await this.#tryGetMembershipWitness(blockHash, treeId, leafValue);
    if (!witness) {
      throw new Error(
        `Leaf value ${leafValue} not found in tree ${MerkleTreeId[treeId]} at block hash ${blockHash.toString()}`,
      );
    }
    return witness;
  }

  /**
   * Returns a low nullifier membership witness for a given nullifier at a given block.
   * @param blockHash - The block hash at which to get the index.
   * @param nullifier - Nullifier we try to find the low nullifier witness for.
   * @returns The low nullifier membership witness (if found).
   * @remarks Low nullifier witness can be used to perform a nullifier non-inclusion proof by leveraging the "linked
   * list structure" of leaves and proving that a lower nullifier is pointing to a bigger next value than the nullifier
   * we are trying to prove non-inclusion for.
   */
  public getLowNullifierMembershipWitness(
    blockHash: L2BlockHash,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return this.aztecNode.getLowNullifierMembershipWitness(blockHash, nullifier);
  }

  /**
   * Returns a witness for a given slot of the public data tree at a given block.
   * @param blockHash - The block hash at which to get the witness.
   * @param leafSlot - The slot of the public data in the public data tree.
   */
  public getPublicDataWitness(blockHash: L2BlockHash, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    return this.aztecNode.getPublicDataWitness(blockHash, leafSlot);
  }

  /**
   * Looks for the L1 to L2 membership witness of a message at the Aztec node, given its hash.
   * @param contractAddress - Address of a contract by which the message was emitted.
   * @dev Contract address and secret are only used to compute the nullifier to get non-nullified messages.
   * The message nullifier is computed locally, so the secret is not sent to the node.
   * @returns The l1 to l2 membership witness (index of message in the tree and sibling path).
   */
  public getL1ToL2MembershipWitness(
    contractAddress: AztecAddress,
    messageHash: Fr,
    secret: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>]> {
    return getNonNullifiedL1ToL2MessageWitness(this.aztecNode, contractAddress, messageHash, secret);
  }

  async #tryGetMembershipWitness(blockHash: L2BlockHash, treeId: MerkleTreeId, value: Fr): Promise<Fr[] | undefined> {
    switch (treeId) {
      case MerkleTreeId.NULLIFIER_TREE:
        return (await this.aztecNode.getNullifierMembershipWitness(blockHash, value))?.withoutPreimage().toFields();
      case MerkleTreeId.NOTE_HASH_TREE:
        return (await this.aztecNode.getNoteHashMembershipWitness(blockHash, value))?.toFields();
      case MerkleTreeId.PUBLIC_DATA_TREE:
        return (await this.aztecNode.getPublicDataWitness(blockHash, value))?.withoutPreimage().toFields();
      case MerkleTreeId.ARCHIVE:
        return (await this.aztecNode.getArchiveMembershipWitness(blockHash, value))?.toFields();
      default:
        throw new Error('Not implemented');
    }
  }
}
