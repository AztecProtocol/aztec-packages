import {
  CONTRACT_TREE_HEIGHT,
  Fr,
  HISTORIC_BLOCKS_TREE_HEIGHT,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
} from '@aztec/circuits.js';

import { L1ToL2MessageAndIndex } from '../l1_to_l2_message.js';
import { MerkleTreeId } from '../merkle_tree_id.js';
import { SiblingPath } from '../sibling_path.js';

/**
 * Interface providing methods for retrieving information about content of the state trees.
 */
export interface StateInfoProvider {
  /**
   * Find the index of the given leaf in the given tree.
   * @param treeId - The tree to search in.
   * @param leafValue - The value to search for
   * @returns The index of the given leaf in the given tree or undefined if not found.
   */
  findLeafIndex(treeId: MerkleTreeId, leafValue: Fr): Promise<bigint | undefined>;

  /**
   * Returns the sibling path for the given index in the contract tree.
   * @param leafIndex - The index of the leaf for which the sibling path is required.
   * @returns The sibling path for the leaf index.
   * TODO: https://github.com/AztecProtocol/aztec-packages/issues/3414
   */
  getContractSiblingPath(leafIndex: bigint): Promise<SiblingPath<typeof CONTRACT_TREE_HEIGHT>>;

  /**
   * Returns the sibling path for the given index in the note hash tree.
   * @param leafIndex - The index of the leaf for which the sibling path is required.
   * @returns The sibling path for the leaf index.
   * TODO: https://github.com/AztecProtocol/aztec-packages/issues/3414
   */
  getNoteHashSiblingPath(leafIndex: bigint): Promise<SiblingPath<typeof NOTE_HASH_TREE_HEIGHT>>;

  /**
   * Gets a confirmed/consumed L1 to L2 message for the given message key (throws if not found).
   * and its index in the merkle tree
   * @param messageKey - The message key.
   * @returns The map containing the message and index.
   */
  getL1ToL2MessageAndIndex(messageKey: Fr): Promise<L1ToL2MessageAndIndex>;

  /**
   * Returns the sibling path for a leaf in the committed l1 to l2 data tree.
   * @param leafIndex - Index of the leaf in the tree.
   * @returns The sibling path.
   * TODO: https://github.com/AztecProtocol/aztec-packages/issues/3414
   */
  getL1ToL2MessageSiblingPath(leafIndex: bigint): Promise<SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>>;

  /**
   * Returns the sibling path for a leaf in the committed historic blocks tree.
   * @param leafIndex - Index of the leaf in the tree.
   * @returns The sibling path.
   * TODO: https://github.com/AztecProtocol/aztec-packages/issues/3414
   */
  getHistoricBlocksTreeSiblingPath(leafIndex: bigint): Promise<SiblingPath<typeof HISTORIC_BLOCKS_TREE_HEIGHT>>;
}
