// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {FrontierLib} from "@aztec/core/libraries/crypto/FrontierLib.sol";

contract InboxHarness is Inbox {
  using FrontierLib for FrontierLib.Tree;

  constructor(address _rollup, uint256 _height) Inbox(_rollup, _height) {}

  function getSize() external view returns (uint256) {
    return SIZE;
  }

  function getEmptyRoot() external view returns (bytes32) {
    return EMPTY_ROOT;
  }

  function treeInProgressFull() external view returns (bool) {
    return trees[inProgress].isFull(SIZE);
  }

  function getToConsumeRoot(uint256 _toConsume) external view returns (bytes32) {
    bytes32 root = EMPTY_ROOT;
    if (_toConsume > Constants.INITIAL_L2_BLOCK_NUM) {
      root = trees[_toConsume].root(forest, HEIGHT, SIZE);
    }
    return root;
  }

  function getNumTrees() external view returns (uint256) {
    // -INITIAL_L2_BLOCK_NUM because tree number INITIAL_L2_BLOCK_NUM is not real
    return inProgress - Constants.INITIAL_L2_BLOCK_NUM;
  }

  function getNextMessageIndex() external view returns (uint256) {
    FrontierLib.Tree storage currentTree = trees[inProgress];
    uint256 index = (inProgress - Constants.INITIAL_L2_BLOCK_NUM) * SIZE + currentTree.nextIndex;
    return index;
  }
}
