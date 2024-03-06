// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {NewInbox} from "../../src/core/messagebridge/NewInbox.sol";

// Libraries
import {Constants} from "../../src/core/libraries/ConstantsGen.sol";

// TODO: rename to InboxHarness once all the pieces of the new message model are in place.
contract NewInboxHarness is NewInbox {
  uint256 public constant FIRST_REAL_TREE_NUM = Constants.INITIAL_L2_BLOCK_NUM + 1;

  constructor(address _rollup, uint256 _height) NewInbox(_rollup, _height) {}

  function getSize() external view returns (uint256) {
    return SIZE;
  }

  function getEmptyRoot() external view returns (bytes32) {
    return EMPTY_ROOT;
  }

  function getToConsume() external view returns (uint256) {
    return toConsume;
  }

  function getInProgress() external view returns (uint256) {
    return inProgress;
  }

  function treeInProgressFull() external view returns (bool) {
    return trees[inProgress].isFull();
  }

  function getToConsumeRoot() external view returns (bytes32) {
    bytes32 root = EMPTY_ROOT;
    if (toConsume > Constants.INITIAL_L2_BLOCK_NUM) {
      root = trees[toConsume].root();
    }
    return root;
  }

  function getNumTrees() external view returns (uint256) {
    return inProgress - 1; // -1 because tree number 1 is not real
  }
}
