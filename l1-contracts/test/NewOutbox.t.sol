// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";
import {NewOutbox} from "../src/core/messagebridge/NewOutbox.sol";
import {Errors} from "../src/core/libraries/Errors.sol";
import {DataStructures} from "../src/core/libraries/DataStructures.sol";
import {Hash} from "../src/core/libraries/Hash.sol";
import {NaiveMerkle} from "./merkle/Naive.sol";


contract NewOutboxTest is Test {
  using Hash for DataStructures.L2ToL1Msg;

  address internal constant STATE_TRANSITIONER = address(0x42069123);
  uint256 internal constant TREE_HEIGHT = 2;
  uint256 internal constant version = 0;

  NewOutbox internal outbox;
  NaiveMerkle internal zeroedTree;

  event RootAdded(uint256 indexed l2BlockNumber, bytes32 indexed root, uint256 height);
  event MessageConsumed(
    uint256 indexed l2BlockNumber, bytes32 indexed root, bytes32 indexed messageHash
  );

  function setUp() public {
    outbox = new NewOutbox(STATE_TRANSITIONER);
    zeroedTree = new NaiveMerkle(TREE_HEIGHT);
  }

  function _fakeMessage() internal view returns (DataStructures.L2ToL1Msg memory) {
    return DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor({
        actor: 0x2000000000000000000000000000000000000000000000000000000000000000,
        version: version
      }),
      recipient: DataStructures.L1Actor({actor: address(this), chainId: block.chainid}),
      content: 0x3000000000000000000000000000000000000000000000000000000000000000
    });
  }

  function testRevertIfInsertingFromNonRollup() public {
    bytes32 root = zeroedTree.computeRoot();

    vm.prank(address(0x69));
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__Unauthorized.selector)
    );
    outbox.insert(1, root, TREE_HEIGHT);
  }

  function testRevertIfInsertingDuplicate() public {
    bytes32 root = zeroedTree.computeRoot();

    vm.prank(STATE_TRANSITIONER);
    outbox.insert(1, root, TREE_HEIGHT);

    vm.prank(STATE_TRANSITIONER);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__RootAlreadySet.selector, 1)
    );
    outbox.insert(1, root, TREE_HEIGHT);
  }

  function testRevertIfConsumingMessageBelongingToOther() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage();

    (bytes32[] memory path,) = zeroedTree.computeSiblingPath(0);

    vm.prank(address(0x69));
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__InvalidRecipient.selector, address(this), address(0x69))
    );
    outbox.consume(1, 1, fakeMessage, path);
  }

  function testRevertIfNothingInsertedAtBlockNumber() public {
    uint256 blockNumber = 1;
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage();

    (bytes32[] memory path,) = zeroedTree.computeSiblingPath(0);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__NothingToConsumeAtBlock.selector, blockNumber)
    );
    outbox.consume(blockNumber, 1, fakeMessage, path);
  }

  function testRevertIfConsumingMessageWithInvalidChainId() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage();

    (bytes32[] memory path,) = zeroedTree.computeSiblingPath(0);

    fakeMessage.recipient.chainId = block.chainid + 1;

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__InvalidChainId.selector)
    );
    outbox.consume(1, 1, fakeMessage, path);
  }

  function testRevertIfTryingToConsumeSameMessage() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage();
    bytes32 leaf = fakeMessage.sha256ToField();

    NaiveMerkle tree = new NaiveMerkle(TREE_HEIGHT);    
    tree.insertLeaf(leaf);
    bytes32 root = tree.computeRoot();

    vm.prank(STATE_TRANSITIONER);
    outbox.insert(1, root, TREE_HEIGHT);

    (bytes32[] memory path,) = tree.computeSiblingPath(0);
    outbox.consume(1, 0, fakeMessage, path);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, 1, 0)
    );
    outbox.consume(1, 0, fakeMessage, path);
  }

  function testRevertIfPathHeightMismatch() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage();
    bytes32 leaf = fakeMessage.sha256ToField();

    NaiveMerkle tree = new NaiveMerkle(TREE_HEIGHT);    
    tree.insertLeaf(leaf);
    bytes32 root = tree.computeRoot();

    vm.prank(STATE_TRANSITIONER);
    outbox.insert(1, root, TREE_HEIGHT);

    NaiveMerkle biggerTree = new NaiveMerkle(TREE_HEIGHT + 1);    
    tree.insertLeaf(leaf);

    (bytes32[] memory path,) = biggerTree.computeSiblingPath(0);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__InvalidPathLength.selector, TREE_HEIGHT, TREE_HEIGHT + 1)
    );
    outbox.consume(1, 0, fakeMessage, path);
  }

  function testRevertIfTryingToConsumeMessageNotInTree() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage();
    bytes32 leaf = fakeMessage.sha256ToField();
    fakeMessage.content = bytes32 (uint256(42069));
    bytes32 modifiedLeaf = fakeMessage.sha256ToField();

    NaiveMerkle tree = new NaiveMerkle(TREE_HEIGHT);    
    tree.insertLeaf(leaf);
    bytes32 root = tree.computeRoot();

    NaiveMerkle modifiedTree = new NaiveMerkle(TREE_HEIGHT);    
    modifiedTree.insertLeaf(modifiedLeaf);
    bytes32 modifiedRoot = modifiedTree.computeRoot();

    vm.prank(STATE_TRANSITIONER);
    outbox.insert(1, root, TREE_HEIGHT);

    (bytes32[] memory path,) = modifiedTree.computeSiblingPath(0);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__InvalidRoot.selector, root, modifiedRoot)
    );
    outbox.consume(1, 0, fakeMessage, path);
  }

//   // fuzz batch insert -> check inserted. event emitted
//   function testFuzzBatchInsert(bytes32[] memory _entryKeys) public {
//     // expected events
//     for (uint256 i = 0; i < _entryKeys.length; i++) {
//       if (_entryKeys[i] == bytes32(0)) continue;
//       vm.expectEmit(true, false, false, false);
//       emit MessageAdded(_entryKeys[i]);
//     }

//     outbox.sendL1Messages(_entryKeys);
//     for (uint256 i = 0; i < _entryKeys.length; i++) {
//       if (_entryKeys[i] == bytes32(0)) continue;
//       bytes32 key = _entryKeys[i];
//       DataStructures.Entry memory entry = outbox.get(key);
//       assertGt(entry.count, 0);
//       assertEq(entry.fee, 0);
//       assertEq(entry.deadline, 0);
//     }
//   }

//   function testRevertIfConsumingFromWrongRecipient() public {
//     DataStructures.L2ToL1Msg memory message = _fakeMessage();
//     message.recipient.actor = address(0x1);
//     vm.expectRevert(Errors.Outbox__Unauthorized.selector);
//     outbox.consume(message);
//   }

//   function testRevertIfConsumingForWrongChain() public {
//     DataStructures.L2ToL1Msg memory message = _fakeMessage();
//     message.recipient.chainId = 2;
//     vm.expectRevert(Errors.Outbox__InvalidChainId.selector);
//     outbox.consume(message);
//   }

//   function testRevertIfConsumingMessageThatDoesntExist() public {
//     DataStructures.L2ToL1Msg memory message = _fakeMessage();
//     bytes32 entryKey = outbox.computeEntryKey(message);
//     vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__NothingToConsume.selector, entryKey));
//     outbox.consume(message);
//   }

//   function testRevertIfInsertingFromWrongRollup() public {
//     address wrongRollup = address(0xbeeffeed);
//     uint256 wrongVersion = registry.upgrade(wrongRollup, STATE_TRANSITIONER, address(outbox));

//     DataStructures.L2ToL1Msg memory message = _fakeMessage();
//     // correctly set message.recipient to this address
//     message.recipient = DataStructures.L1Actor({actor: address(this), chainId: block.chainid});

//     bytes32 expectedEntryKey = outbox.computeEntryKey(message);
//     bytes32[] memory entryKeys = new bytes32[](1);
//     entryKeys[0] = expectedEntryKey;

//     vm.prank(wrongRollup);
//     outbox.sendL1Messages(entryKeys);

//     vm.prank(message.recipient.actor);
//     vm.expectRevert(
//       abi.encodeWithSelector(Errors.Outbox__InvalidVersion.selector, wrongVersion, version)
//     );
//     outbox.consume(message);
//   }

//   function testFuzzConsume(DataStructures.L2ToL1Msg memory _message) public {
//     // correctly set message.recipient to this address
//     _message.recipient = DataStructures.L1Actor({actor: address(this), chainId: block.chainid});

//     // correctly set the message.sender.version
//     _message.sender.version = version;

//     bytes32 expectedEntryKey = outbox.computeEntryKey(_message);
//     bytes32[] memory entryKeys = new bytes32[](1);
//     entryKeys[0] = expectedEntryKey;
//     outbox.sendL1Messages(entryKeys);

//     vm.prank(_message.recipient.actor);
//     vm.expectEmit(true, true, false, false);
//     emit MessageConsumed(expectedEntryKey, _message.recipient.actor);
//     outbox.consume(_message);

//     // ensure no such message to consume:
//     vm.expectRevert(
//       abi.encodeWithSelector(Errors.Outbox__NothingToConsume.selector, expectedEntryKey)
//     );
//     outbox.consume(_message);
//   }
}
