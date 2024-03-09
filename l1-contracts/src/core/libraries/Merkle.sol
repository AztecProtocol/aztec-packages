// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

import {Errors} from "../libraries/Errors.sol";

/**
 * @title
 * @author Aztec Labs
 * @notice
 */
library Merkle {  
  /*
    * @notice Verifies the membership of a leaf and path against an expected root.
    * @dev In the case of a mismatched root, and subsequent inability to verify membership, this function throws.
    * @param _path - The sibling path of the message as a leaf, used to prove message inclusion
    * @param _leaf - The hash of the message we are trying to prove inclusion for
    * @param _index - The index of the message inside the L2 to L1 message tree
    * @param _expectedRoot - The expected root to check the validity of the message and sibling path with.
    * @remark -
    * E.g. A sibling path for a leaf at index 3 in a tree of depth 3 (between 5 and 8 leafs) consists of the 3 elements denoted as *'s
    * d0:                                            [ root ]
    * d1:                      [ ]                                               [*]
    * d2:         [*]                      [ ]                       [ ]                     [ ]
    * d3:   [ ]         [ ]          [*]         [ ]           [ ]         [ ]          [ ]        [ ].
    * And the elements would be ordered as: [ d3_index_2, d2_index_0, d1_index_1 ].
    * @remark - We use the indexAtHeight to see whether our child of the next subtree is at the left or the right side, as any odd indexes are right-sided children.
    * This is important and we have assigned it into its own variable isRight, because this affects the way we concat our two children to then hash and calculate the root.
    */
  function _verifyMembership(
    bytes32[] memory _path,
    bytes32 _leaf,
    uint256 _index,
    bytes32 _expectedRoot
  ) internal pure {
    bytes32 subtreeRoot = _leaf;
    uint256 indexAtHeight = _index;

    for (uint256 height = 0; height < _path.length; height++) {
      bool isRight = (indexAtHeight & 1) == 1;

      subtreeRoot = isRight
        ? sha256(bytes.concat(_path[height], subtreeRoot))
        : sha256(bytes.concat(subtreeRoot, _path[height]));

      indexAtHeight /= 2;
    }

    if (subtreeRoot != _expectedRoot) {
      revert Errors.MerkleLib__InvalidRoot(_expectedRoot, subtreeRoot);
    }
  }
}
