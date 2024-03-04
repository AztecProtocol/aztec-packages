// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";
import {NewInbox} from "../src/core/messagebridge/NewInbox.sol";
import {Constants} from "../src/core/libraries/ConstantsGen.sol";
import {Errors} from "../src/core/libraries/Errors.sol";
import {Hash} from "../src/core/libraries/Hash.sol";

import {DataStructures} from "../src/core/libraries/DataStructures.sol";

contract NewInboxTest is Test {
  using Hash for DataStructures.L1ToL2Msg;

  NewInbox internal inbox;
  uint256 internal version = 0;

  event LeafInserted(uint256 treeNumber, uint256 index, bytes32 value);

  function setUp() public {
    address rollup = address(this);
    inbox = new NewInbox(rollup, 10, 0);
  }

  function _fakeMessage() internal view returns (DataStructures.L1ToL2Msg memory) {
    return DataStructures.L1ToL2Msg({
      sender: DataStructures.L1Actor({actor: address(this), chainId: block.chainid}),
      recipient: DataStructures.L2Actor({
        actor: 0x1000000000000000000000000000000000000000000000000000000000000000,
        version: version
      }),
      content: 0x2000000000000000000000000000000000000000000000000000000000000000,
      secretHash: 0x3000000000000000000000000000000000000000000000000000000000000000,
      fee: 0,
      deadline: 0
    });
  }

  function testRevertIfNotConsumingFromRollup() public {
    vm.prank(address(0x1));
    vm.expectRevert(Errors.Inbox__Unauthorized.selector);
    inbox.consume();
  }

  function testFuzzSendL2Msg(DataStructures.L1ToL2Msg memory _message) public {
    // fix message.sender and deadline:
    _message.sender = DataStructures.L1Actor({actor: address(this), chainId: block.chainid});
    // ensure actor fits in a field
    _message.recipient.actor = bytes32(uint256(_message.recipient.actor) % Constants.P);
    // ensure content fits in a field
    _message.content = bytes32(uint256(_message.content) % Constants.P);
    // ensure secret hash fits in a field
    _message.secretHash = bytes32(uint256(_message.secretHash) % Constants.P);

    // TODO: nuke the following 2 values from the struct once the new message model is in place
    _message.deadline = 0;
    _message.fee = 0;

    bytes32 leaf = _message.sha256ToField();
    vm.expectEmit(true, true, true, true);
    // event we expect
    emit LeafInserted(1, 1, leaf);
    // event we will get
    bytes32 insertedLeaf = inbox.insert(_message.recipient, _message.content, _message.secretHash);

    assertEq(insertedLeaf, leaf);
  }

  function testSendMultipleSameL2Messages() public {
    DataStructures.L1ToL2Msg memory message = _fakeMessage();
    bytes32 leaf1 = inbox.insert(message.recipient, message.content, message.secretHash);
    bytes32 leaf2 = inbox.insert(message.recipient, message.content, message.secretHash);
    bytes32 leaf3 = inbox.insert(message.recipient, message.content, message.secretHash);

    assertEq(address(inbox.frontier(0)), address(0));
    assertNotEq(address(inbox.frontier(1)), address(0));
    assertEq(address(inbox.frontier(2)), address(0));

    assertEq(leaf1, leaf2);
    assertEq(leaf2, leaf3);
  }
}
