// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

/**
 * @title Merkle Library
 * @author Aztec Labs
 * @notice Library that contains functions useful when interacting with Merkle Trees
 */
library MerkleLib {
  /**
   * @notice Verifies the membership of a leaf and path against an expected root.
   * @dev In the case of a mismatched root, and subsequent inability to verify membership, this function throws.
   * @param _path - The sibling path of the message as a leaf, used to prove message inclusion
   * @param _leaf - The hash of the message we are trying to prove inclusion for
   * @param _index - The index of the message inside the L2 to L1 message tree
   * @param _expectedRoot - The expected root to check the validity of the message and sibling path with.
   * @notice -
   * E.g. A sibling path for a leaf at index 3 (L) in a tree of depth 3 (between 5 and 8 leafs) consists of the 3 elements denoted as *'s
   * d0:                                            [ root ]
   * d1:                      [ ]                                               [*]
   * d2:         [*]                      [ ]                       [ ]                     [ ]
   * d3:   [ ]         [ ]          [*]         [L]           [ ]         [ ]          [ ]        [ ].
   * And the elements would be ordered as: [ d3_index_2, d2_index_0, d1_index_1 ].
   */
  function verifyMembership(
    bytes32[] calldata _path,
    bytes32 _leaf,
    uint256 _index,
    bytes32 _expectedRoot
  ) internal pure {
    bytes32 subtreeRoot = _leaf;
    /// @notice - We use the indexAtHeight to see whether our child of the next subtree is at the left or the right side
    uint256 indexAtHeight = _index;

    for (uint256 height = 0; height < _path.length; height++) {
      /// @notice - This affects the way we concatenate our two children to then hash and calculate the root, as any odd indexes (index bit-masked with least significant bit) are right-sided children.
      bool isRight = (indexAtHeight & 1) == 1;

      subtreeRoot = isRight
        ? Hash.sha256ToField(bytes.concat(_path[height], subtreeRoot))
        : Hash.sha256ToField(bytes.concat(subtreeRoot, _path[height]));
      /// @notice - We divide by two here to get the index of the parent of the current subtreeRoot in its own layer
      indexAtHeight >>= 1;
    }

    require(
      subtreeRoot == _expectedRoot,
      Errors.MerkleLib__InvalidRoot(_expectedRoot, subtreeRoot, _leaf, _index)
    );
  }

  /**
   * @notice Computes the root for a binary Merkle-tree given the leafs.
   * @dev Uses sha256.
   * @param _leafs - The 32 bytes leafs to build the tree of.
   * @return The root of the Merkle tree.
   */
  function computeRoot(bytes32[] memory _leafs) internal pure returns (bytes32) {
    // @todo Must pad the tree
    uint256 treeDepth = 0;
    while (2 ** treeDepth < _leafs.length) {
      treeDepth++;
    }
    uint256 treeSize = 2 ** treeDepth;
    assembly {
      mstore(_leafs, treeSize)
    }

    for (uint256 i = 0; i < treeDepth; i++) {
      for (uint256 j = 0; j < treeSize; j += 2) {
        _leafs[j / 2] = Hash.sha256ToField(bytes.concat(_leafs[j], _leafs[j + 1]));
      }
      treeSize /= 2;
    }

    return _leafs[0];
  }

  /**
   * @notice Computes the root for a binary unbalanced Merkle-tree given the leaves.
   * @dev Filled in greedily with subtrees. Useful for outHash tree.
   * @param _leaves - The 32 bytes leafs to build the tree of.
   * @return The root of the Merkle tree.
   */
  function computeUnbalancedRoot(bytes32[] memory _leaves) internal pure returns (bytes32) {
    // e.g. an unbalanced tree of 7 txs will contain subtrees of 4, 2, and 1 tx(s) = 111
    // e.g. an unbalanced tree of 9 txs will contain subtrees of 8 and 1 tx(s) = 1001
    // We collect the roots of each subtree
    bytes32 root;
    uint256 currentSubtreeSize = 1;
    uint256 numTxs = _leaves.length;
    // We must calculate the smaller rightmost subtrees first, hence starting at 1
    while (numTxs != 0) {
      // If size & txs == 0, the subtree doesn't exist for this number of txs
      if (currentSubtreeSize & numTxs == 0) {
        currentSubtreeSize <<= 1;
        continue;
      }
      bytes32[] memory leavesInSubtree = new bytes32[](currentSubtreeSize);
      uint256 start = numTxs - currentSubtreeSize;
      for (uint256 i = start; i < numTxs; i++) {
        leavesInSubtree[i - start] = _leaves[i];
      }
      bytes32 subtreeRoot = computeRoot(leavesInSubtree);
      root =
        numTxs == _leaves.length ? subtreeRoot : Hash.sha256ToField(bytes.concat(subtreeRoot, root));
      numTxs -= currentSubtreeSize;
      currentSubtreeSize <<= 1;
    }
    return root;
  }
}
