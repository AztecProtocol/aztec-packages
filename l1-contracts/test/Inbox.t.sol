// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {TestERC20} from "src/mock/TestERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {InboxHarness} from "./harnesses/InboxHarness.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";

contract InboxTest is Test {
  using Hash for DataStructures.L1ToL2Msg;

  InboxHarness internal inbox;
  uint256 internal version = 0;

  function setUp() public {
    address rollup = address(this);
    IERC20 feeAsset = new TestERC20("Fee Asset", "FA", address(this));
    inbox = new InboxHarness(rollup, feeAsset, version, TestConstants.AZTEC_INBOX_BUCKET_RING_SIZE);
  }

  function _fakeMessage() internal view returns (DataStructures.L1ToL2Msg memory) {
    return DataStructures.L1ToL2Msg({
      sender: DataStructures.L1Actor({actor: address(this), chainId: block.chainid}),
      recipient: DataStructures.L2Actor({
        actor: 0x1000000000000000000000000000000000000000000000000000000000000000, version: version
      }),
      publicContentHash: 0x2000000000000000000000000000000000000000000000000000000000000000,
      privateContentHash: 0x3000000000000000000000000000000000000000000000000000000000000000,
      index: 0x01
    });
  }

  function _boundMessage(DataStructures.L1ToL2Msg memory _message, uint256 _globalLeafIndex)
    internal
    view
    returns (DataStructures.L1ToL2Msg memory)
  {
    // fix message.sender
    _message.sender = DataStructures.L1Actor({actor: address(this), chainId: block.chainid});
    // ensure actor fits in a field
    _message.recipient.actor = bytes32(uint256(_message.recipient.actor) % Constants.P);
    // ensure public content hash fits in a field
    _message.publicContentHash = bytes32(uint256(_message.publicContentHash) % Constants.P);
    // ensure private content hash fits in a field
    _message.privateContentHash = bytes32(uint256(_message.privateContentHash) % Constants.P);
    // update version
    _message.recipient.version = version;
    // set leaf index
    _message.index = _globalLeafIndex;

    return _message;
  }

  function testFuzzInsert(DataStructures.L1ToL2Msg memory _message) public {
    Inbox.InboxState memory stateBefore = inbox.getState();
    // Compact cumulative index: the message's index is the count inserted before it.
    uint256 globalLeafIndex = stateBefore.totalMessagesInserted;
    DataStructures.L1ToL2Msg memory message = _boundMessage(_message, globalLeafIndex);

    bytes32 leaf = message.sha256ToField();
    bytes32 expectedInboxRollingHash = Hash.accumulateInboxRollingHash(bytes32(0), leaf);
    vm.expectEmit(true, true, true, true);
    // event we expect
    emit IInbox.MessageSent(leaf, expectedInboxRollingHash, 1, message);
    // event we will get
    (bytes32 insertedLeaf, uint256 insertedIndex) =
      inbox.sendL2Message(message.recipient, message.publicContentHash, message.privateContentHash);

    assertEq(insertedLeaf, leaf);
    assertEq(insertedIndex, globalLeafIndex);

    Inbox.InboxState memory stateAfter = inbox.getState();
    assertEq(stateBefore.totalMessagesInserted + 1, stateAfter.totalMessagesInserted);
  }

  function testSendDuplicateL2Messages() public {
    DataStructures.L1ToL2Msg memory message = _fakeMessage();
    (bytes32 leaf1, uint256 index1) =
      inbox.sendL2Message(message.recipient, message.publicContentHash, message.privateContentHash);
    (bytes32 leaf2, uint256 index2) =
      inbox.sendL2Message(message.recipient, message.publicContentHash, message.privateContentHash);
    (bytes32 leaf3, uint256 index3) =
      inbox.sendL2Message(message.recipient, message.publicContentHash, message.privateContentHash);

    // All the leaves should be different since the index gets mixed in
    assertNotEq(leaf1, leaf2);
    assertNotEq(leaf2, leaf3);

    // Check indices
    assertEq(index1 + 1, index2);
    assertEq(index1 + 2, index3);
  }

  function testRevertIfActorTooLarge() public {
    DataStructures.L1ToL2Msg memory message = _fakeMessage();
    message.recipient.actor = bytes32(Constants.P);
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__ActorTooLarge.selector, message.recipient.actor));
    inbox.sendL2Message(message.recipient, message.publicContentHash, message.privateContentHash);
  }

  function testRevertIfVersionMismatch() public {
    DataStructures.L1ToL2Msg memory message = _fakeMessage();
    message.recipient.version = version + 1;
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__VersionMismatch.selector, message.recipient.version, version));
    inbox.sendL2Message(message.recipient, message.publicContentHash, message.privateContentHash);
  }

  function testRevertIfPublicContentHashTooLarge() public {
    DataStructures.L1ToL2Msg memory message = _fakeMessage();
    message.publicContentHash = bytes32(Constants.P);
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__PublicContentHashTooLarge.selector, message.publicContentHash));
    inbox.sendL2Message(message.recipient, message.publicContentHash, message.privateContentHash);
  }

  function testRevertIfPrivateContentHashTooLarge() public {
    DataStructures.L1ToL2Msg memory message = _fakeMessage();
    message.privateContentHash = bytes32(Constants.P);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Inbox__PrivateContentHashTooLarge.selector, message.privateContentHash)
    );
    inbox.sendL2Message(message.recipient, message.publicContentHash, message.privateContentHash);
  }
}
