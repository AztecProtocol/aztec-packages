// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";
import {NewOutbox} from "../src/core/messagebridge/NewOutbox.sol";
import {INewOutbox} from "../src/core/interfaces/messagebridge/INewOutbox.sol";
import {Errors} from "../src/core/libraries/Errors.sol";
import {DataStructures} from "../src/core/libraries/DataStructures.sol";
import {Merkle} from "../src/core/libraries/Merkle.sol";
import {Hash} from "../src/core/libraries/Hash.sol";
import {NaiveMerkle} from "./merkle/Naive.sol";

contract NewOutboxTest is Test {
  using Hash for DataStructures.L2ToL1Msg;

  address internal constant _STATE_TRANSITIONER = address(0x42069123);
  address internal constant _NOT_STATE_TRANSITIONER = address(0x69);
  address internal constant _NOT_RECIPIENT = address(0x420);
  uint256 internal constant _DEFAULT_TREE_HEIGHT = 2;
  uint256 internal constant _VERSION = 0;

  NewOutbox internal outbox;
  NaiveMerkle internal zeroedTree;

  function setUp() public {
    outbox = new NewOutbox(_STATE_TRANSITIONER);
    zeroedTree = new NaiveMerkle(_DEFAULT_TREE_HEIGHT);
  }

  function _fakeMessage(address _recipient) internal view returns (DataStructures.L2ToL1Msg memory) {
    return DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor({
        actor: 0x2000000000000000000000000000000000000000000000000000000000000000,
        version: _VERSION
      }),
      recipient: DataStructures.L1Actor({actor: _recipient, chainId: block.chainid}),
      content: 0x3000000000000000000000000000000000000000000000000000000000000000
    });
  }

  function testRevertIfInsertingFromNonRollup() public {
    bytes32 root = zeroedTree.computeRoot();

    vm.prank(_NOT_STATE_TRANSITIONER);
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__Unauthorized.selector));
    outbox.insert(1, root, _DEFAULT_TREE_HEIGHT);
  }

  function testRevertIfInsertingDuplicate() public {
    bytes32 root = zeroedTree.computeRoot();

    vm.prank(_STATE_TRANSITIONER);
    outbox.insert(1, root, _DEFAULT_TREE_HEIGHT);

    vm.prank(_STATE_TRANSITIONER);
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__RootAlreadySetAtBlock.selector, 1));
    outbox.insert(1, root, _DEFAULT_TREE_HEIGHT);
  }

  function testInsertVariedLeafs(bytes32[] calldata _messageLeafs) public {
    uint256 bigTreeHeight = Merkle.calculateTreeHeightFromSize(_messageLeafs.length);
    NaiveMerkle tree = new NaiveMerkle(bigTreeHeight);

    for (uint256 i = 0; i < _messageLeafs.length; i++) {
      vm.assume(_messageLeafs[i] != bytes32(0));
      tree.insertLeaf(_messageLeafs[i]);
    }

    bytes32 root = tree.computeRoot();

    vm.expectEmit(true, true, true, true, address(outbox));
    emit INewOutbox.RootAdded(1, root, bigTreeHeight);
    vm.prank(_STATE_TRANSITIONER);
    outbox.insert(1, root, bigTreeHeight);

    (bytes32 actualRoot, uint256 actualHeight) = outbox.roots(1);
    assertEq(root, actualRoot);
    assertEq(bigTreeHeight, actualHeight);
  }

  function testRevertIfConsumingMessageBelongingToOther() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this));

    (bytes32[] memory path,) = zeroedTree.computeSiblingPath(0);

    vm.prank(_NOT_RECIPIENT);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Outbox__InvalidRecipient.selector, address(this), _NOT_RECIPIENT
      )
    );
    outbox.consume(1, 1, fakeMessage, path);
  }

  function testRevertIfConsumingMessageWithInvalidChainId() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this));

    (bytes32[] memory path,) = zeroedTree.computeSiblingPath(0);

    fakeMessage.recipient.chainId = block.chainid + 1;

    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__InvalidChainId.selector));
    outbox.consume(1, 1, fakeMessage, path);
  }

  function testRevertIfNothingInsertedAtBlockNumber() public {
    uint256 blockNumber = 1;
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this));

    (bytes32[] memory path,) = zeroedTree.computeSiblingPath(0);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__NothingToConsumeAtBlock.selector, blockNumber)
    );
    outbox.consume(blockNumber, 1, fakeMessage, path);
  }

  function testRevertIfTryingToConsumeSameMessage() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this));
    bytes32 leaf = fakeMessage.sha256ToField();

    NaiveMerkle tree = new NaiveMerkle(_DEFAULT_TREE_HEIGHT);
    tree.insertLeaf(leaf);
    bytes32 root = tree.computeRoot();

    vm.prank(_STATE_TRANSITIONER);
    outbox.insert(1, root, _DEFAULT_TREE_HEIGHT);

    (bytes32[] memory path,) = tree.computeSiblingPath(0);
    outbox.consume(1, 0, fakeMessage, path);
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, 1, 0));
    outbox.consume(1, 0, fakeMessage, path);
  }

  function testRevertIfPathHeightMismatch() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this));
    bytes32 leaf = fakeMessage.sha256ToField();

    NaiveMerkle tree = new NaiveMerkle(_DEFAULT_TREE_HEIGHT);
    tree.insertLeaf(leaf);
    bytes32 root = tree.computeRoot();

    vm.prank(_STATE_TRANSITIONER);
    outbox.insert(1, root, _DEFAULT_TREE_HEIGHT);

    NaiveMerkle biggerTree = new NaiveMerkle(_DEFAULT_TREE_HEIGHT + 1);
    tree.insertLeaf(leaf);

    (bytes32[] memory path,) = biggerTree.computeSiblingPath(0);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Outbox__InvalidPathLength.selector, _DEFAULT_TREE_HEIGHT, _DEFAULT_TREE_HEIGHT + 1
      )
    );
    outbox.consume(1, 0, fakeMessage, path);
  }

  function testRevertIfTryingToConsumeMessageNotInTree() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this));
    bytes32 leaf = fakeMessage.sha256ToField();
    fakeMessage.content = bytes32(uint256(42069));
    bytes32 modifiedLeaf = fakeMessage.sha256ToField();

    NaiveMerkle tree = new NaiveMerkle(_DEFAULT_TREE_HEIGHT);
    tree.insertLeaf(leaf);
    bytes32 root = tree.computeRoot();

    NaiveMerkle modifiedTree = new NaiveMerkle(_DEFAULT_TREE_HEIGHT);
    modifiedTree.insertLeaf(modifiedLeaf);
    bytes32 modifiedRoot = modifiedTree.computeRoot();

    vm.prank(_STATE_TRANSITIONER);
    outbox.insert(1, root, _DEFAULT_TREE_HEIGHT);

    (bytes32[] memory path,) = modifiedTree.computeSiblingPath(0);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.MerkleLib__InvalidRoot.selector, root, modifiedRoot)
    );
    outbox.consume(1, 0, fakeMessage, path);
  }

  function testValidInsertAndConsume() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this));
    bytes32 leaf = fakeMessage.sha256ToField();

    NaiveMerkle tree = new NaiveMerkle(_DEFAULT_TREE_HEIGHT);
    tree.insertLeaf(leaf);
    bytes32 root = tree.computeRoot();

    vm.prank(_STATE_TRANSITIONER);
    outbox.insert(1, root, _DEFAULT_TREE_HEIGHT);

    (bytes32[] memory path,) = tree.computeSiblingPath(0);

    bool statusBeforeConsumption = outbox.hasMessageBeenConsumedAtBlockAndIndex(1, 0);
    assertEq(abi.encode(0), abi.encode(statusBeforeConsumption));

    vm.expectEmit(true, true, true, true, address(outbox));
    emit INewOutbox.MessageConsumed(1, root, leaf, 0);
    outbox.consume(1, 0, fakeMessage, path);

    bool statusAfterConsumption = outbox.hasMessageBeenConsumedAtBlockAndIndex(1, 0);
    assertEq(abi.encode(1), abi.encode(statusAfterConsumption));
  }

  // This test takes awhile so to keep it somewhat reasonable we've set a limit on the amount of fuzz runs
  /// forge-config: default.fuzz.runs = 64
  function testInsertAndConsumeWithVariedRecipients(
    address[] calldata _recipients,
    uint256 _blockNumber
  ) public {
    DataStructures.L2ToL1Msg[] memory messages = new DataStructures.L2ToL1Msg[](_recipients.length);

    uint256 bigTreeHeight = Merkle.calculateTreeHeightFromSize(_recipients.length);
    NaiveMerkle tree = new NaiveMerkle(bigTreeHeight);

    for (uint256 i = 0; i < _recipients.length; i++) {
      DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(_recipients[i]);
      messages[i] = fakeMessage;
      bytes32 modifiedLeaf = fakeMessage.sha256ToField();

      tree.insertLeaf(modifiedLeaf);
    }

    bytes32 root = tree.computeRoot();

    vm.expectEmit(true, true, true, true, address(outbox));
    emit INewOutbox.RootAdded(_blockNumber, root, bigTreeHeight);
    vm.prank(_STATE_TRANSITIONER);
    outbox.insert(_blockNumber, root, bigTreeHeight);

    for (uint256 i = 0; i < _recipients.length; i++) {
      (bytes32[] memory path, bytes32 leaf) = tree.computeSiblingPath(i);

      vm.expectEmit(true, true, true, true, address(outbox));
      emit INewOutbox.MessageConsumed(_blockNumber, root, leaf, i);
      vm.prank(_recipients[i]);
      outbox.consume(_blockNumber, i, messages[i], path);
    }
  }

  function testCheckOutOfBoundsStatus(uint256 _blockNumber, uint256 _leafIndex) external {
    bool outOfBounds = outbox.hasMessageBeenConsumedAtBlockAndIndex(_blockNumber, _leafIndex);
    assertEq(abi.encode(0), abi.encode(outOfBounds));
  }
}
