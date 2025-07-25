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
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {InboxHarness} from "./InboxHarness.sol";
import {TestERC20} from "src/mock/TestERC20.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

contract SendL2MessageTest is Test {
  using InboxAnchorLib for InboxAnchor;

  uint256 internal pendingBlockNumber = 0;
  InboxHarness internal inbox;

  modifier assertAnchors() {
    _;

    // After the test, ensure that any block prior to the current in progress that have a non-zero
    // root also has an ancor.
    for (uint256 i = 0; i < inbox.getInProgress(); i++) {
      // Any block that have a root that is not the empty root should have an anchor at this point.
      if (inbox.getRoot(i) != inbox.getEmptyRoot()) {
        assertEq(inbox.hasAnchor(i), true, "Missing anchor!");
      }
    }
  }

  function setUp() public {
    uint256 version = 1;

    IERC20 feeAsset = new TestERC20("Fee Asset", "FA", address(this));
    inbox =
      new InboxHarness(address(this), feeAsset, version, Constants.L1_TO_L2_MSG_SUBTREE_HEIGHT);
  }

  function getPendingBlockNumber() public view returns (uint256) {
    return pendingBlockNumber;
  }

  function test_RevertIfActorTooLarge() public {
    DataStructures.L1ToL2Msg memory message = inbox.getFakeMessage();
    message.recipient.actor = bytes32(Constants.P);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Inbox__ActorTooLarge.selector, message.recipient.actor)
    );
    inbox.sendL2Message(message.recipient, message.content, message.secretHash);
  }

  function testRevertIfVersionMismatch() public {
    DataStructures.L1ToL2Msg memory message = inbox.getFakeMessage();
    message.recipient.version = inbox.VERSION() + 1;
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Inbox__VersionMismatch.selector, message.recipient.version, inbox.VERSION()
      )
    );
    inbox.sendL2Message(message.recipient, message.content, message.secretHash);
  }

  function testRevertIfContentTooLarge() public {
    DataStructures.L1ToL2Msg memory message = inbox.getFakeMessage();
    message.content = bytes32(Constants.P);
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__ContentTooLarge.selector, message.content));
    inbox.sendL2Message(message.recipient, message.content, message.secretHash);
  }

  function testRevertIfSecretHashTooLarge() public {
    DataStructures.L1ToL2Msg memory message = inbox.getFakeMessage();
    message.secretHash = bytes32(Constants.P);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Inbox__SecretHashTooLarge.selector, message.secretHash)
    );
    inbox.sendL2Message(message.recipient, message.content, message.secretHash);
  }

  function test_duplicateMessages() public {
    DataStructures.L1ToL2Msg memory message = inbox.getFakeMessage();
    (bytes32 leaf1, uint256 index1) =
      inbox.sendL2Message(message.recipient, message.content, message.secretHash);
    (bytes32 leaf2, uint256 index2) =
      inbox.sendL2Message(message.recipient, message.content, message.secretHash);
    (bytes32 leaf3, uint256 index3) =
      inbox.sendL2Message(message.recipient, message.content, message.secretHash);

    // Only 1 tree should be non-zero
    assertEq(inbox.getNumTrees(), 1);

    // All the leaves should be different since the index gets mixed into the hash
    assertNotEq(leaf1, leaf2);
    assertNotEq(leaf2, leaf3);

    // Check indices
    assertEq(index1 + 1, index2);
    assertEq(index1 + 2, index3);
  }

  function test_fullCreatesNewTree() public assertAnchors {
    // If the tree that we are inserting into is full, a new tree should be build,
    // increasing the number of trees and the value in progress.
    // This will lower the anchor

    uint256 size = inbox.getSize();
    uint256 inProgress = inbox.getInProgress();

    DataStructures.L1ToL2Msg memory message = inbox.getFakeMessage();
    for (uint256 i = 0; i < size; i++) {
      inbox.sendL2Message(message.recipient, message.content, message.secretHash);
    }

    assertEq(inbox.getNumTrees(), 1);
    assertEq(inbox.getInProgress(), inProgress);
    assertEq(inbox.treeInProgressFull(), true);
    assertEq(inbox.hasAnchor(inProgress), false);
    assertEq(inbox.getState().inProgress, inProgress);

    // Now insert another message and see that it pushes forward the `inProgress`

    InboxAnchor memory anchor = InboxAnchor({
      root: inbox.getRoot(inProgress),
      blockNumber: inProgress,
      parent: inbox.getAnchorHash(0)
    });

    vm.expectEmit(true, true, true, true, address(inbox));
    emit InboxAnchorChainLib.AnchorLowered(anchor);
    inbox.sendL2Message(message.recipient, message.content, message.secretHash);

    assertEq(inbox.getNumTrees(), 2);
    assertEq(inbox.getInProgress(), inProgress + 1);
    assertEq(inbox.getState().inProgress, inProgress + 1);
    assertEq(inbox.treeInProgressFull(), false);
    assertEq(inbox.hasAnchor(inProgress), true);
    assertEq(
      InboxAnchorHash.unwrap(inbox.getAnchorHash(inProgress)), InboxAnchorHash.unwrap(anchor.hash())
    );
  }

  function test_anchorIfNeeded() public assertAnchors {
    // If the block number of the rollup have increased the `inProgress` will have to progress
    // and a checkpoint should be created for the parent.
    // we need to anchor the current tree.

    uint256 inProgress = inbox.getInProgress();

    DataStructures.L1ToL2Msg memory message = inbox.getFakeMessage();

    inbox.sendL2Message(message.recipient, message.content, message.secretHash);
    assertNotEq(inbox.getRoot(inProgress), inbox.getEmptyRoot());

    assertEq(inbox.hasAnchor(inProgress), false);

    pendingBlockNumber += 1;

    inbox.sendL2Message(message.recipient, message.content, message.secretHash);
    assertEq(inbox.hasAnchor(inProgress), true);
    assertEq(inbox.hasAnchor(inProgress + 1), false);
  }
}
