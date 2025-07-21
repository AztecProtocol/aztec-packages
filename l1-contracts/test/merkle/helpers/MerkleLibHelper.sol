// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {MerkleLib} from "@aztec/core/libraries/crypto/MerkleLib.sol";

// A wrapper used to be able to "call" library functions, instead of "jumping" to them, allowing forge to catch the reverts
contract MerkleLibHelper {
  function verifyMembership(
    bytes32[] calldata _path,
    bytes32 _leaf,
    uint256 _index,
    bytes32 _expectedRoot
  ) external pure {
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

  function computeUnbalancedRoot(bytes32[] memory _leaves) external pure returns (bytes32) {
    return MerkleLib.computeUnbalancedRoot(_leaves);
  }
}
