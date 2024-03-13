// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

import {Errors} from "../libraries/Errors.sol";

/**
 * @title Merkle Library
 * @author Aztec Labs
 * @notice
 */
library Merkle {
  /**
   * @notice Verifies the membership of a leaf and path against an expected root.
   * @dev In the case of a mismatched root, and subsequent inability to verify membership, this function throws.
   * @param _path - The sibling path of the message as a leaf, used to prove message inclusion
   * @param _leaf - The hash of the message we are trying to prove inclusion for
   * @param _index - The index of the message inside the L2 to L1 message tree
   * @param _expectedRoot - The expected root to check the validity of the message and sibling path with.
   * @notice -
   * E.g. A sibling path for a leaf at index 3 in a tree of depth 3 (between 5 and 8 leafs) consists of the 3 elements denoted as *'s
   * d0:                                            [ root ]
   * d1:                      [ ]                                               [*]
   * d2:         [*]                      [ ]                       [ ]                     [ ]
   * d3:   [ ]         [ ]          [*]         [ ]           [ ]         [ ]          [ ]        [ ].
   * And the elements would be ordered as: [ d3_index_2, d2_index_0, d1_index_1 ].
   */
  function verifyMembership(
    bytes32[] memory _path,
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
        ? sha256(bytes.concat(_path[height], subtreeRoot))
        : sha256(bytes.concat(subtreeRoot, _path[height]));
      /// @notice - We divide by two here to get the index of the parent of the current subtreeRoot in its own layer
      indexAtHeight >>= 1;
    }

    if (subtreeRoot != _expectedRoot) {
      revert Errors.MerkleLib__InvalidRoot(_expectedRoot, subtreeRoot);
    }
  }

  /*
  * @notice Calculates a tree height from the amount of elements in the tree
  * @param _size - The amount of elements in the tree
  */
  function calculateTreeHeightFromSize(uint256 _size) internal pure returns (uint256) {
    /// The code / formula that works below has one edge case at _size = 1, which we handle here
    if (_size == 1) {
      return 1;
    }

    /// We need to store the original numer to check at the end if we are a power of two
    uint256 originalNumber = _size;

    /// We need the height of the tree that will contain all of our leaves,
    /// hence the next highest power of two from the amount of leaves - Math.ceil(Math.log2(x))
    uint256 height = 0;

    /// While size > 1, we divide by two, and count how many times we do this; producing a rudimentary way of calculating Math.Floor(Math.log2(x))
    while (_size > 1) {
      _size >>= 1;
      height++;
    }

    /// @notice - We check if 2 ** height does not equal our original number. If so, this means that our size is not a power of two,
    /// and hence we've rounded down (Math.floor) and have obtained the next lowest power of two instead of rounding up (Math.ceil) to obtain the next highest power of two and therefore we need to increment height before returning it.
    /// If 2 ** height equals our original number, it means that we have a perfect power of two and Math.floor(Math.log2(x)) = Math.ceil(Math.log2(x)) and we can return height as-is
    return (2 ** height) != originalNumber ? ++height : height;
  }
}
