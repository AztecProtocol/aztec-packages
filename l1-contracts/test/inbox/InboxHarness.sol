// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {FrontierLib} from "@aztec/core/libraries/crypto/FrontierLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";

contract InboxHarness is Inbox {
  using FrontierLib for FrontierLib.Tree;

  constructor(address _rollup, IERC20 _feeAsset, uint256 _version, uint256 _height)
    Inbox(_rollup, _feeAsset, _version, _height)
  {}

  function getEmptyRoot() external view returns (bytes32) {
    return EMPTY_ROOT;
  }

  function treeInProgressFull() external view returns (bool) {
    return trees[getInProgress()].isFull(SIZE);
  }

  function getNumTrees() external view returns (uint256) {
    // -INITIAL_L2_BLOCK_NUM because tree number INITIAL_L2_BLOCK_NUM is not real
    return getInProgress() - Constants.INITIAL_L2_BLOCK_NUM;
  }

  function getNextMessageIndex() external view returns (uint256) {
    uint64 inProgress = getInProgress();
    FrontierLib.Tree storage currentTree = trees[inProgress];
    uint256 index = (inProgress - Constants.INITIAL_L2_BLOCK_NUM) * SIZE + currentTree.nextIndex;
    return index;
  }

  function getFakeMessage() external view returns (DataStructures.L1ToL2Msg memory) {
    return DataStructures.L1ToL2Msg({
      sender: DataStructures.L1Actor({actor: address(this), chainId: block.chainid}),
      recipient: DataStructures.L2Actor({
        actor: 0x1000000000000000000000000000000000000000000000000000000000000000,
        version: VERSION
      }),
      content: 0x2000000000000000000000000000000000000000000000000000000000000000,
      secretHash: 0x3000000000000000000000000000000000000000000000000000000000000000,
      index: 0x01
    });
  }

  function bound(DataStructures.L1ToL2Msg memory _message, uint256 _globalLeafIndex)
    external
    view
    returns (DataStructures.L1ToL2Msg memory)
  {
    // fix message.sender
    _message.sender = DataStructures.L1Actor({actor: address(this), chainId: block.chainid});
    // ensure actor fits in a field
    _message.recipient.actor = bytes32(uint256(_message.recipient.actor) % Constants.P);
    // ensure content fits in a field
    _message.content = bytes32(uint256(_message.content) % Constants.P);
    // ensure secret hash fits in a field
    _message.secretHash = bytes32(uint256(_message.secretHash) % Constants.P);
    // update version
    _message.recipient.version = VERSION;
    // set leaf index
    _message.index = _globalLeafIndex;

    return _message;
  }
}
