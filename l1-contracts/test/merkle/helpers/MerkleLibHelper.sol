// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {MerkleLib} from "@aztec/core/libraries/crypto/MerkleLib.sol";

// A wrapper used to be able to "call" library functions, instead of "jumping" to them, allowing forge to catch the
// reverts
contract MerkleLibHelper {
  function verifyMembership(bytes32[] calldata _path, bytes32 _leaf, uint256 _index, bytes32 _expectedRoot)
    external
    pure
  {
    MerkleLib.verifyMembership(_path, _leaf, _index, _expectedRoot);
  }

  /**
   * @notice Computes the minimum and maximum path size of an unbalanced tree.
   * @dev Follows structure of rollup circuits by greedy filling subtrees.
   * @param _numTxs - The number of txs to form into subtrees.
   * @return (min, max) - The min and max path sizes.
   */
  function computeMinMaxPathLength(uint256 _numTxs) external pure returns (uint256, uint256) {
    if (_numTxs < 2) {
      return (0, 0);
    }

    uint256 numSubtrees = 0;
    uint256 currentSubtreeSize = 1;
    uint256 currentSubtreeHeight = 0;
    uint256 firstSubtreeHeight;
    uint256 finalSubtreeHeight;
    while (_numTxs != 0) {
      // If size & txs == 0, the subtree doesn't exist for this number of txs
      if (currentSubtreeSize & _numTxs == 0) {
        currentSubtreeSize <<= 1;
        currentSubtreeHeight++;
        continue;
      }
      // Assign the smallest rightmost subtree height
      if (numSubtrees == 0) finalSubtreeHeight = currentSubtreeHeight;
      // Assign the largest leftmost subtree height
      if (_numTxs - currentSubtreeSize == 0) firstSubtreeHeight = currentSubtreeHeight;
      _numTxs -= currentSubtreeSize;
      currentSubtreeSize <<= 1;
      currentSubtreeHeight++;
      numSubtrees++;
    }
    if (numSubtrees == 1) {
      // We have a balanced tree
      return (firstSubtreeHeight, firstSubtreeHeight);
    }
    uint256 min = finalSubtreeHeight + numSubtrees - 1;
    uint256 max = firstSubtreeHeight + 1;
    return (min, max);
  }

  /**
   * @notice Computes the root for a binary unbalanced Merkle-tree given the leaves.
   * @dev Filled in greedily with subtrees. Useful for outHash tree.
   * @param _leaves - The 32 bytes leafs to build the tree of.
   * @return The root of the Merkle tree.
   */
  function computeUnbalancedRoot(bytes32[] memory _leaves) external pure returns (bytes32) {
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
      root = numTxs == _leaves.length ? subtreeRoot : Hash.sha256ToField(bytes.concat(subtreeRoot, root));
      numTxs -= currentSubtreeSize;
      currentSubtreeSize <<= 1;
    }
    return root;
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
}
