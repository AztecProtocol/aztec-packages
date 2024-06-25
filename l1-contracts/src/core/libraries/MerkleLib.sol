// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

import {Errors} from "../libraries/Errors.sol";
import {Hash} from "../libraries/Hash.sol";

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

    if (subtreeRoot != _expectedRoot) {
      revert Errors.MerkleLib__InvalidRoot(_expectedRoot, subtreeRoot, _leaf, _index);
    }
  }

  /**
   * @notice Decomposes a max 2 byte number into powers of 2 to create subtrees for an unbalanced tree.
   * @dev Follows structure of rollup circuits - useful for txsEffectHash and outHash tree.
   * @param _numTxs - The number of txs to form into subtrees.
   * @return res - The subtree sizes in a byte array.
   */
  function computeSubtreeSizes(uint256 _numTxs) internal pure returns (bytes memory) {
    // TODO: maximum number of subtrees?
    // Using 1 byte per subtree means each can only hold 255 leaves => cannot decompose a total num > 256
    // => Currently using 2 bytes per subtree up to 16 subtrees => can store 2**16 - 1 = 65,535
    // We could reduce the max num bytes from 32 to 30 => could store 15 trees holding max 65,534 leaves
    // However the gas cost is the same as 32 bytes for this fn
    if (_numTxs > 65535) {
      revert Errors.TxsDecoder__TxsTooLarge(65535, _numTxs);
    }

    bytes memory res = new bytes(32);
    uint256 x = _numTxs;
    uint32 i = 0;
    // We have already padded _numTxs to at least 2, so no need for 0/1 cases
    while (x > 1) {
      uint256 v = x;
      // the following rounds v up to the next power of 2 (works only for 4 bytes value!)
      v |= v >> 1;
      v |= v >> 2;
      v |= v >> 4;
      v |= v >> 8;
      v |= v >> 16;
      v++;
      // We find the prev power
      uint256 prevPower = v == 2 ? 2 : v - (v >> 1);
      bytes2 prevPowerBytes = bytes2(uint16(prevPower));
      res[i++] = prevPowerBytes[0];
      res[i++] = prevPowerBytes[1];
      x -= prevPower;
    }
    // If _numTxs is an odd number, we are left with x = 1 and need to append a single base rollup leaf
    if (x == 1) {
      res[i++] = hex"00";
      res[i++] = hex"01";
    }
    // Trim to length required so we can loop on the subtrees
    bytes memory trimmed = new bytes(i);
    for (uint256 j = 0; j < i; j++) {
      trimmed[j] = res[j];
    }

    return trimmed;
  }

  /**
   * @notice Computes the minimum and maximum path size of an unbalanced tree.
   * @dev Follows structure of rollup circuits - calls above fn to find subtree sizes
   * @param _numTxs - The number of txs to form into subtrees.
   * @return (min, max) - The min and max path sizes.
   */
  function computeMinMaxPathLength(uint256 _numTxs) internal pure returns (uint256, uint256) {
    uint256 numTxs = _numTxs < 2 ? 2 : _numTxs;
    bytes memory subtreeSizes = computeSubtreeSizes(numTxs);
    // Each subtree is encoded into 2 bytes
    uint256 numSubtrees = subtreeSizes.length / 2;
    uint256 firstSubtreeSize = uint16(bytes2(bytes.concat(subtreeSizes[0], subtreeSizes[1])));
    uint256 firstSubtreeHeight = calculateTreeHeightFromSize(firstSubtreeSize);
    if (numSubtrees == 1) {
      // We have a balanced tree
      return (firstSubtreeHeight, firstSubtreeHeight);
    }
    uint256 finalSubtreeSize = uint16(
      bytes2(
        bytes.concat(subtreeSizes[subtreeSizes.length - 2], subtreeSizes[subtreeSizes.length - 1])
      )
    );
    uint256 min = calculateTreeHeightFromSize(finalSubtreeSize) + numSubtrees - 1;
    uint256 max = firstSubtreeHeight + 1;

    return (min, max);
  }

  /**
   * @notice Calculates a tree height from the amount of elements in the tree
   * @dev - This mirrors the function in TestUtil, but assumes _size is an exact power of 2 or = 1
   * @param _size - The number of elements in the tree
   */
  function calculateTreeHeightFromSize(uint256 _size) internal pure returns (uint256) {
    /// We need the height of the tree that will contain all of our leaves,
    /// hence the next highest power of two from the amount of leaves - Math.ceil(Math.log2(x))
    uint256 height = 0;

    if (_size == 1) {
      return 0;
    }

    /// While size > 1, we divide by two, and count how many times we do this; producing a rudimentary way of calculating Math.Floor(Math.log2(x))
    while (_size > 1) {
      _size >>= 1;
      height++;
    }
    return height;
  }
}
