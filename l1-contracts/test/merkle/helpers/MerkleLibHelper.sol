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

  function computeMinMaxPathLength(uint256 _numTxs) external pure returns (uint256, uint256) {
    return MerkleLib.computeMinMaxPathLength(_numTxs);
  }

  function computeUnbalancedRoot(bytes32[] memory _leaves) external pure returns (bytes32) {
    return MerkleLib.computeUnbalancedRoot(_leaves);
  }
}
