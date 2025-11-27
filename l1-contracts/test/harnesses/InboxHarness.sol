// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {FrontierLib} from "@aztec/core/libraries/crypto/FrontierLib.sol";

contract InboxHarness is Inbox {
  using FrontierLib for FrontierLib.Tree;

  constructor(address _rollup, IERC20 _feeAsset, uint256 _version, uint256 _height)
    Inbox(_rollup, _feeAsset, _version, _height)
  {}

  function getSize() external view returns (uint256) {
    return SIZE;
  }

  function getEmptyRoot() external view returns (bytes32) {
    return EMPTY_ROOT;
  }

  function treeInProgressFull() external view returns (bool) {
    return trees[state.inProgress].isFull(SIZE);
  }

  function getToConsumeRoot(uint256 _toConsume) external view returns (bytes32) {
    bytes32 root = EMPTY_ROOT;
    if (_toConsume > Constants.INITIAL_CHECKPOINT_NUMBER) {
      root = trees[_toConsume].root(forest, HEIGHT, SIZE);
    }
    return root;
  }

  function getNumTrees() external view returns (uint256) {
    // -INITIAL_CHECKPOINT_NUMBER because tree number INITIAL_CHECKPOINT_NUMBER is not real
    return state.inProgress - Constants.INITIAL_CHECKPOINT_NUMBER;
  }

  function getNextMessageIndex() external view returns (uint256) {
    FrontierLib.Tree storage currentTree = trees[state.inProgress];
    uint256 index = (state.inProgress - Constants.INITIAL_CHECKPOINT_NUMBER) * SIZE + currentTree.nextIndex;
    return index;
  }
}
