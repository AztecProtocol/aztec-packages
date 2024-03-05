// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";

import {NewInboxHarness} from "./harnesses/NewInboxHarness.sol";
import {Constants} from "../src/core/libraries/ConstantsGen.sol";
import {Errors} from "../src/core/libraries/Errors.sol";
import {Hash} from "../src/core/libraries/Hash.sol";
import {DataStructures} from "../src/core/libraries/DataStructures.sol";

contract NewInboxTest is Test {
  using Hash for DataStructures.L1ToL2Msg;

  uint256 internal constant FIRST_REAL_TREE_NUM = Constants.INITIAL_L2_BLOCK_NUM + 1;

  NewInboxHarness internal inbox;
  uint256 internal version = 0;
  bytes32 internal emptyTreeRoot;

  event LeafInserted(uint256 indexed blockNumber, uint256 index, bytes32 value);

  function setUp() public {
    address rollup = address(this);
    // We set low depth (5) to ensure we sufficiently test the tree transitions
    inbox = new NewInboxHarness(rollup, 5);
    emptyTreeRoot = inbox.getEmptyRoot();
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
      deadline: type(uint32).max
    });
  }

  function _divideAndRoundUp(uint256 a, uint256 b) internal pure returns (uint256) {
    return (a + b - 1) / b;
  }

  function _boundMessage(DataStructures.L1ToL2Msg memory _message)
    internal
    view
    returns (DataStructures.L1ToL2Msg memory)
  {
    // fix message.sender and deadline to be more than current time:
    _message.sender = DataStructures.L1Actor({actor: address(this), chainId: block.chainid});
    // ensure actor fits in a field
    _message.recipient.actor = bytes32(uint256(_message.recipient.actor) % Constants.P);
    // ensure content fits in a field
    _message.content = bytes32(uint256(_message.content) % Constants.P);
    // ensure secret hash fits in a field
    _message.secretHash = bytes32(uint256(_message.secretHash) % Constants.P);
    // update version
    _message.recipient.version = version;

    // TODO(#4833): nuke the following 2 values from the struct once the new message model is in place
    _message.deadline = type(uint32).max;
    _message.fee = 0;

    return _message;
  }

  // Since there is a 1 block lag between tree to be consumed and tree in progress the following invariant should never
  // be violated
  modifier checkInvariant() {
    _;
    assertLt(inbox.getToConsume(), inbox.getInProgress());
  }

  function testRevertIfNotConsumingFromRollup() public {
    vm.prank(address(0x1));
    vm.expectRevert(Errors.Inbox__Unauthorized.selector);
    inbox.consume();
  }

  function testFuzzInsert(DataStructures.L1ToL2Msg memory _message) public checkInvariant {
    DataStructures.L1ToL2Msg memory message = _boundMessage(_message);

    bytes32 leaf = message.sha256ToField();
    vm.expectEmit(true, true, true, true);
    // event we expect
    emit LeafInserted(FIRST_REAL_TREE_NUM, 0, leaf);
    // event we will get
    bytes32 insertedLeaf =
      inbox.sendL2Message(message.recipient, message.content, message.secretHash);

    assertEq(insertedLeaf, leaf);
  }

  function testSendMultipleSameL2Messages() public checkInvariant {
    DataStructures.L1ToL2Msg memory message = _fakeMessage();
    bytes32 leaf1 = inbox.sendL2Message(message.recipient, message.content, message.secretHash);
    bytes32 leaf2 = inbox.sendL2Message(message.recipient, message.content, message.secretHash);
    bytes32 leaf3 = inbox.sendL2Message(message.recipient, message.content, message.secretHash);

    // Only 1 tree should be non-zero
    assertEq(inbox.getNumTrees(), 1);

    // All the leaves should be the same
    assertEq(leaf1, leaf2);
    assertEq(leaf2, leaf3);
  }

  function testRevertIfActorTooLarge() public {
    DataStructures.L1ToL2Msg memory message = _fakeMessage();
    message.recipient.actor = bytes32(Constants.MAX_FIELD_VALUE + 1);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Inbox__ActorTooLarge.selector, message.recipient.actor)
    );
    inbox.sendL2Message(message.recipient, message.content, message.secretHash);
  }

  function testRevertIfContentTooLarge() public {
    DataStructures.L1ToL2Msg memory message = _fakeMessage();
    message.content = bytes32(Constants.MAX_FIELD_VALUE + 1);
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__ContentTooLarge.selector, message.content));
    inbox.sendL2Message(message.recipient, message.content, message.secretHash);
  }

  function testRevertIfSecretHashTooLarge() public {
    DataStructures.L1ToL2Msg memory message = _fakeMessage();
    message.secretHash = bytes32(Constants.MAX_FIELD_VALUE + 1);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Inbox__SecretHashTooLarge.selector, message.secretHash)
    );
    inbox.sendL2Message(message.recipient, message.content, message.secretHash);
  }

  function testFuzzSendAndConsume(
    DataStructures.L1ToL2Msg[] memory _messagesFirstBatch,
    DataStructures.L1ToL2Msg[] memory _messagesSecondBatch,
    uint256 _numTreesToConsumeFirstBatch,
    uint256 _numTreesToConsumeSecondBatch
  ) public {
    // Send first batch of messages
    _send(_messagesFirstBatch);

    // Consume first few trees
    _consume(_numTreesToConsumeFirstBatch, _messagesFirstBatch.length);

    // Send second batch of messages
    _send(_messagesSecondBatch);

    // Consume second batch of trees
    _consume(_numTreesToConsumeSecondBatch, _messagesSecondBatch.length);
  }

  function _send(DataStructures.L1ToL2Msg[] memory _messages) internal checkInvariant {
    bool isFirstRun = inbox.getInProgress() == inbox.FIRST_REAL_TREE_NUM();
    bytes32 toConsumeRoot = inbox.getToConsumeRoot();

    // We send the messages and then check that toConsume root did not change.
    for (uint256 i = 0; i < _messages.length; i++) {
      DataStructures.L1ToL2Msg memory message = _boundMessage(_messages[i]);

      inbox.sendL2Message(message.recipient, message.content, message.secretHash);
    }

    // Root of a tree waiting to be consumed should not change because we introduced a 1 block lag to prevent sequencer
    // DOS attacks
    assertEq(
      inbox.getToConsumeRoot(),
      toConsumeRoot,
      "Root of a tree waiting to be consumed should not change"
    );

    // We perform expected num trees check only after first batch because after second one the following accounting
    // does not work because a tree might have been consumed when not full or we might have consumed an empty tree
    if (isFirstRun) {
      uint256 expectedNumTrees = _divideAndRoundUp(_messages.length, inbox.getSize());
      if (expectedNumTrees == 0) {
        // This occurs when there are no messages but we initialize the first tree in the constructor so there are
        // never zero trees
        expectedNumTrees = 1;
      }
      assertEq(inbox.getNumTrees(), expectedNumTrees);
    }
  }

  function _consume(uint256 _numTreesToConsume, uint256 _numMessages) internal checkInvariant {
    bool isFirstRun = inbox.getToConsume() == Constants.INITIAL_L2_BLOCK_NUM;
    uint256 numTrees = inbox.getNumTrees();

    // We use (numTrees * 2) as upper bound here because we want to test the case where we go beyond the currently
    // initalized number of trees. When consuming the newly initialized trees we should get zero roots.
    uint256 numTreesToConsume = bound(_numTreesToConsume, 1, numTrees * 2);

    // Now we consume the trees
    for (uint256 i = 0; i < numTreesToConsume; i++) {
      bytes32 root = inbox.consume();

      // We perform empty roots check only after first batch because after second one the following simple accounting
      // does not work
      if (isFirstRun) {
        // Notes:
        // 1) For i = 0 we should always get empty tree root because first block's messages tree is always
        // empty because we introduced a 1 block lag to prevent sequencer DOS attacks.
        // 2) For _numMessages = 0 and i = 1 we get empty root as well
        if (i != 0 && i <= numTrees && _numMessages > 0) {
          assertNotEq(root, emptyTreeRoot, "Root should not be zero");
        } else {
          assertEq(root, emptyTreeRoot, "Root should be zero");
        }
      }
    }
  }
}
