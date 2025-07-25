// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {
  InboxAnchorHash,
  InboxAnchor,
  InboxAnchorChainLib,
  InboxAnchorLib
} from "@aztec/core/libraries/crypto/InboxAnchorChain.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {InboxHarness} from "./InboxHarness.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";

contract LowerAnchorForcefullyTest is Test {
  using InboxAnchorLib for InboxAnchor;

  InboxHarness public inbox;
  uint256 public pendingBlockNumber = 0;

  function setUp() public {
    inbox =
      new InboxHarness(address(this), IERC20(address(0)), 0, Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT);
  }

  function getPendingBlockNumber() public view returns (uint256) {
    return pendingBlockNumber;
  }

  modifier _insertion(uint256 _pendingBlockNumber) {
    pendingBlockNumber = bound(_pendingBlockNumber, 100, 1000);
    uint256 toInsert = pendingBlockNumber + 1;

    assertEq(inbox.getInProgress(), pendingBlockNumber + 2);
    assertEq(inbox.getLastAnchorBlockNumber(), 0);
    assertEq(inbox.hasAnchor(0), true); // genesis
    assertEq(inbox.hasAnchor(toInsert), false);

    // Forcefully lowers an anchor
    // Will emit an {{InboxAnchor}} event, and perform 3 writes:
    // - `state.inProgress`
    // - `lastAnchorBlockNumber`
    // - `links[toInsert]`

    vm.expectEmit(true, true, true, true, address(inbox));
    emit InboxAnchorChainLib.AnchorLowered(
      InboxAnchor({
        root: inbox.getRoot(toInsert),
        blockNumber: toInsert,
        parent: inbox.getAnchorHash(0)
      })
    );
    vm.record();
    inbox.lowerAnchorForcefully();
    (, bytes32[] memory writes) = vm.accesses(address(inbox));
    assertEq(writes.length, 3);

    _;

    assertEq(inbox.getInProgress(), pendingBlockNumber + 2);

    // The progress should be one beyond the toInsert, e.g., should match pending + 2
    IInbox.InboxState memory state = inbox.getState();
    assertEq(state.inProgress, toInsert + 1);

    assertEq(inbox.getLastAnchorBlockNumber(), toInsert);
    assertEq(inbox.hasAnchor(0), true); // genesis
    assertEq(inbox.hasAnchor(toInsert), true);
    assertEq(
      InboxAnchorHash.unwrap(inbox.getAnchorHash(toInsert)),
      InboxAnchorHash.unwrap(
        InboxAnchor({
          root: inbox.getRoot(toInsert),
          blockNumber: toInsert,
          parent: inbox.getAnchorHash(0)
        }).hash()
      )
    );
  }

  function test_insertion(uint256 _pendingBlockNumber) public _insertion(_pendingBlockNumber) {
    // Abusing the modifier to make test easily reusable.
  }

  function test_lowerWhenExists(uint256 _pendingBlockNumber) public _insertion(_pendingBlockNumber) {
    // Perform a call to `lowerAnchorForcefully` when there is already a an anchor, will perform no-op.
    vm.record();
    inbox.lowerAnchorForcefully();
    (, bytes32[] memory writes) = vm.accesses(address(inbox));
    assertEq(writes.length, 0);
  }

  function test_noOpWhenInPast(uint256 _t1, uint256 _t2) public {
    // If t1 < t2 and there is an anchor for time t2, if blocks are pruned,
    // going back to t1, the anchor should not be updated using this snapshot
    // because there already is an anchor and it will essentially be the same as
    // hitting already existing.

    uint256 t1 = bound(_t1, 100, 1000);
    uint256 t2 = bound(_t2, t1 + 1, 2000);

    pendingBlockNumber = t2;

    // Now jump into the past, to try and alter it!
    uint256 shouldHaveAnchor = pendingBlockNumber + 1;
    assertFalse(inbox.hasAnchor(shouldHaveAnchor));

    inbox.lowerAnchorForcefully();

    assertTrue(inbox.hasAnchor(shouldHaveAnchor));

    pendingBlockNumber = t1;

    vm.record();
    inbox.lowerAnchorForcefully();
    (, bytes32[] memory writes) = vm.accesses(address(inbox));
    assertEq(writes.length, 0);
  }

  function test_allNonEmptyNotInProgressTreesHaveAnchors() public {
    // After a call to forcefully lower an anchor, any tree in the past
    // (not in progress) should have an anchor. If that is not the case
    // it could be possible to "delete" some messages, which could cause
    // a loss of funds.
    // It is not a problem that some zero roots also have anchors, but all
    // non-zero must have.

    DataStructures.L1ToL2Msg memory message = inbox.getFakeMessage();

    pendingBlockNumber = 1;
    inbox.sendL2Message(message.recipient, message.content, message.secretHash);
    pendingBlockNumber = 4;

    inbox.lowerAnchorForcefully();

    // Then we need to check the anchor here for being valid!
    // The block for

    for (uint256 i = 0; i < inbox.getInProgress(); i++) {
      // Any block that have a root that is not the empty root should have an anchor at this point.
      if (inbox.getRoot(i) != inbox.getEmptyRoot()) {
        assertEq(inbox.hasAnchor(i), true, "Missing anchor!");
      }
    }
  }
}
