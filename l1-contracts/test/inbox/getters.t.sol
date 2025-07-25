// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {
  InboxAnchorHash,
  InboxAnchor,
  InboxAnchorLib
} from "@aztec/core/libraries/crypto/InboxAnchorChain.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {InboxHarness} from "./InboxHarness.sol";
import {TestERC20} from "src/mock/TestERC20.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";

contract GettersTest is Test {
  using InboxAnchorLib for InboxAnchor;

  uint256 internal pendingBlockNumber = 0;
  IERC20 internal feeAsset;
  InboxHarness internal inbox;

  function setUp() public {
    uint256 version = 1;

    feeAsset = new TestERC20("Fee Asset", "FA", address(this));
    inbox =
      new InboxHarness(address(this), feeAsset, version, Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT);
  }

  function getPendingBlockNumber() public view returns (uint256) {
    return pendingBlockNumber;
  }

  function test_getHeight() public view {
    assertEq(inbox.getHeight(), Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT);
  }

  function test_getSize() public view {
    assertEq(inbox.getSize(), 2 ** Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT);
  }

  function test_getTotalMessagesInserted() public view {
    assertEq(inbox.getTotalMessagesInserted(), 0);
  }

  function test_getFeeAssetPortal() public view {
    assertEq(address(feeAsset), address(FeeJuicePortal(inbox.getFeeAssetPortal()).UNDERLYING()));
  }

  function test_isAnchor() public {
    InboxAnchor memory anchor =
      InboxAnchor({root: inbox.getEmptyRoot(), blockNumber: 1, parent: inbox.getAnchorHash(0)});

    assertEq(inbox.isAnchor(0, inbox.getAnchorHash(0)), true);
    assertEq(inbox.isAnchor(1, anchor.hash()), false);
    assertEq(inbox.isAnchor(anchor), false);

    inbox.lowerAnchorForcefully();

    assertEq(inbox.isAnchor(0, inbox.getAnchorHash(0)), true);
    assertEq(inbox.isAnchor(1, anchor.hash()), true);
    assertEq(inbox.isAnchor(anchor), true);
  }

  function test_buildAnchorChain() public {
    vm.expectRevert(Errors.Inbox__StartBlockGreaterThanEndBlock.selector);
    inbox.getAnchorChain(3, 1);

    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__EndBlockNotAnchored.selector, 1000));
    inbox.getAnchorChain(1, 1000);
  }
}
