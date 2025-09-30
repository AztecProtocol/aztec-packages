// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {NaiveMerkle} from "./merkle/Naive.sol";
import {MerkleTestUtil} from "./merkle/TestUtil.sol";

contract FakeRollup {
  uint256 public getProvenBlockNumber = 0;

  function setProvenBlockNum(uint256 _provenBlockNum) public {
    getProvenBlockNumber = _provenBlockNum;
  }
}

contract OutboxTest is Test {
  using Hash for DataStructures.L2ToL1Msg;

  address internal constant NOT_RECIPIENT = address(0x420);
  uint256 internal constant DEFAULT_TREE_HEIGHT = 2;
  uint256 internal constant AZTEC_VERSION = 1;

  address internal ROLLUP_CONTRACT;
  Outbox internal outbox;
  NaiveMerkle internal zeroedTree;
  MerkleTestUtil internal merkleTestUtil;

  function setUp() public {
    ROLLUP_CONTRACT = address(new FakeRollup());

    outbox = new Outbox(ROLLUP_CONTRACT, AZTEC_VERSION);
    zeroedTree = new NaiveMerkle(DEFAULT_TREE_HEIGHT);
    merkleTestUtil = new MerkleTestUtil();
  }

  function _fakeMessage(address _recipient, uint256 _content) internal view returns (DataStructures.L2ToL1Msg memory) {
    return DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor({
        actor: 0x2000000000000000000000000000000000000000000000000000000000000000,
        version: AZTEC_VERSION
      }),
      recipient: DataStructures.L1Actor({actor: _recipient, chainId: block.chainid}),
      content: bytes32(_content)
    });
  }

  function testRevertIfInsertingFromNonRollup(address _caller) public {
    vm.assume(ROLLUP_CONTRACT != _caller);
    bytes32 root = zeroedTree.computeRoot();

    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__Unauthorized.selector));
    outbox.insert(1, root);
  }

  function testRevertIfInsertingBlockAlreadyProven() public {
    bytes32 root = zeroedTree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__BlockAlreadyProven.selector, 0));
    outbox.insert(0, root);
  }

  function testRevertIfPathTooLong() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32[] memory path = new bytes32[](256);
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__PathTooLong.selector));
    outbox.consume(fakeMessage, 1, 0, path);
  }

  function testRevertIfLeafIndexOutOfBounds(uint256 _leafIndex) public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32[] memory path = new bytes32[](4);
    uint256 leafIndex = bound(_leafIndex, 1 << path.length, type(uint256).max);
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__LeafIndexOutOfBounds.selector, leafIndex, path.length));
    outbox.consume(fakeMessage, 1, leafIndex, path);
  }

  // This function tests the insertion of random arrays of L2 to L1 messages
  // We make a naive tree with a computed height, insert the leafs into it, and compute a root. We then add the root as
  // the root of the
  // L2 to L1 message tree, expect for the correct event to be emitted, and then query for the root in the
  // contract—making sure the roots, as well as the
  // the tree height (which is also the length of the sibling path) match
  function testInsertVariedLeafs(bytes32[] calldata _messageLeafs) public {
    uint256 treeHeight = merkleTestUtil.calculateTreeHeightFromSize(_messageLeafs.length);
    NaiveMerkle tree = new NaiveMerkle(treeHeight);

    for (uint256 i = 0; i < _messageLeafs.length; i++) {
      vm.assume(_messageLeafs[i] != bytes32(0));
      tree.insertLeaf(_messageLeafs[i]);
    }

    bytes32 root = tree.computeRoot();

    vm.expectEmit(true, true, true, true, address(outbox));
    emit IOutbox.RootAdded(1, root);
    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(1, root);

    FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(1);

    bytes32 actualRoot = outbox.getRootData(1);
    assertEq(root, actualRoot);
  }

  function testRevertIfConsumingMessageBelongingToOther() public {
    FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(1);
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);

    (bytes32[] memory path,) = zeroedTree.computeSiblingPath(0);

    vm.prank(NOT_RECIPIENT);
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__InvalidRecipient.selector, address(this), NOT_RECIPIENT));
    outbox.consume(fakeMessage, 1, 1, path);
  }

  function testRevertIfConsumingMessageWithInvalidChainId() public {
    FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(1);
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);

    (bytes32[] memory path,) = zeroedTree.computeSiblingPath(0);

    fakeMessage.recipient.chainId = block.chainid + 1;

    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__InvalidChainId.selector));
    outbox.consume(fakeMessage, 1, 1, path);
  }

  function testRevertIfVersionMismatch() public {
    FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(1);

    DataStructures.L2ToL1Msg memory message = _fakeMessage(address(this), 123);
    (bytes32[] memory path,) = zeroedTree.computeSiblingPath(0);

    message.sender.version = AZTEC_VERSION + 1;
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__VersionMismatch.selector, message.sender.version, AZTEC_VERSION)
    );
    outbox.consume(message, 1, 1, path);
  }

  function testRevertIfNothingInsertedAtBlockNumber() public {
    FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(1);
    uint256 blockNumber = 1;
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);

    (bytes32[] memory path,) = zeroedTree.computeSiblingPath(0);

    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__NothingToConsumeAtBlock.selector, blockNumber));
    outbox.consume(fakeMessage, blockNumber, 1, path);
  }

  function testRevertIfTryingToConsumeSameMessage() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();

    NaiveMerkle tree = new NaiveMerkle(DEFAULT_TREE_HEIGHT);
    tree.insertLeaf(leaf);
    bytes32 root = tree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(1, root);

    FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(1);

    uint256 leafIndex = 0;
    uint256 leafId = 2 ** DEFAULT_TREE_HEIGHT + leafIndex;
    (bytes32[] memory path,) = tree.computeSiblingPath(leafIndex);
    outbox.consume(fakeMessage, 1, leafIndex, path);

    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, 1, leafId));
    outbox.consume(fakeMessage, 1, leafIndex, path);
  }

  function testRevertIfPathHeightMismatch() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();

    NaiveMerkle tree = new NaiveMerkle(DEFAULT_TREE_HEIGHT);
    tree.insertLeaf(leaf);
    bytes32 root = tree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(1, root);

    FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(1);

    NaiveMerkle smallerTree = new NaiveMerkle(DEFAULT_TREE_HEIGHT - 1);
    smallerTree.insertLeaf(leaf);
    bytes32 smallerTreeRoot = smallerTree.computeRoot();

    (bytes32[] memory path,) = smallerTree.computeSiblingPath(0);
    vm.expectRevert(abi.encodeWithSelector(Errors.MerkleLib__InvalidRoot.selector, root, smallerTreeRoot, leaf, 0));
    outbox.consume(fakeMessage, 1, 0, path);
  }

  function testRevertIfTryingToConsumeMessageNotInTree() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();
    fakeMessage.content = bytes32(uint256(42_069));
    bytes32 modifiedLeaf = fakeMessage.sha256ToField();

    NaiveMerkle tree = new NaiveMerkle(DEFAULT_TREE_HEIGHT);
    tree.insertLeaf(leaf);
    bytes32 root = tree.computeRoot();

    NaiveMerkle modifiedTree = new NaiveMerkle(DEFAULT_TREE_HEIGHT);
    modifiedTree.insertLeaf(modifiedLeaf);
    bytes32 modifiedRoot = modifiedTree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(1, root);

    FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(1);

    (bytes32[] memory path,) = modifiedTree.computeSiblingPath(0);

    vm.expectRevert(abi.encodeWithSelector(Errors.MerkleLib__InvalidRoot.selector, root, modifiedRoot, modifiedLeaf, 0));
    outbox.consume(fakeMessage, 1, 0, path);
  }

  function testRevertIfConsumingFromTreeNotProven() public {
    FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(0);

    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();

    NaiveMerkle tree = new NaiveMerkle(DEFAULT_TREE_HEIGHT);
    tree.insertLeaf(leaf);
    bytes32 root = tree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(1, root);

    (bytes32[] memory path,) = tree.computeSiblingPath(0);

    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__BlockNotProven.selector, 1));
    outbox.consume(fakeMessage, 1, 0, path);
  }

  function testValidInsertAndConsume() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();

    NaiveMerkle tree = new NaiveMerkle(DEFAULT_TREE_HEIGHT);
    tree.insertLeaf(leaf);
    bytes32 root = tree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(1, root);

    FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(1);

    uint256 leafIndex = 0;
    uint256 leafId = 2 ** DEFAULT_TREE_HEIGHT + leafIndex;
    (bytes32[] memory path,) = tree.computeSiblingPath(leafIndex);

    bool statusBeforeConsumption = outbox.hasMessageBeenConsumedAtBlock(1, leafId);
    assertEq(abi.encode(0), abi.encode(statusBeforeConsumption));

    vm.expectEmit(true, true, true, true, address(outbox));
    emit IOutbox.MessageConsumed(1, root, leaf, leafId);
    outbox.consume(fakeMessage, 1, leafIndex, path);

    bool statusAfterConsumption = outbox.hasMessageBeenConsumedAtBlock(1, leafId);
    assertEq(abi.encode(1), abi.encode(statusAfterConsumption));
  }

  // This test takes awhile so to keep it somewhat reasonable we've set a limit on the amount of fuzz runs
  /// forge-config: default.fuzz.runs = 64
  function testInsertAndConsumeWithVariedRecipients(
    address[256] calldata _recipients,
    uint256 _blockNumber,
    uint8 _size
  ) public {
    uint256 blockNumber = bound(_blockNumber, 1, 256);
    uint256 numberOfMessages = bound(_size, 1, _recipients.length);
    DataStructures.L2ToL1Msg[] memory messages = new DataStructures.L2ToL1Msg[](numberOfMessages);

    uint256 treeHeight = merkleTestUtil.calculateTreeHeightFromSize(numberOfMessages);
    NaiveMerkle tree = new NaiveMerkle(treeHeight);

    for (uint256 i = 0; i < numberOfMessages; i++) {
      DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(_recipients[i], 123);
      messages[i] = fakeMessage;
      bytes32 modifiedLeaf = fakeMessage.sha256ToField();

      tree.insertLeaf(modifiedLeaf);
    }

    bytes32 root = tree.computeRoot();

    vm.expectEmit(true, true, true, true, address(outbox));
    emit IOutbox.RootAdded(blockNumber, root);
    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(blockNumber, root);

    FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(blockNumber);

    for (uint256 i = 0; i < numberOfMessages; i++) {
      (bytes32[] memory path, bytes32 leaf) = tree.computeSiblingPath(i);
      uint256 leafId = 2 ** treeHeight + i;

      vm.expectEmit(true, true, true, true, address(outbox));
      emit IOutbox.MessageConsumed(blockNumber, root, leaf, leafId);
      vm.prank(_recipients[i]);
      outbox.consume(messages[i], blockNumber, i, path);
    }
  }

  function testCheckOutOfBoundsStatus(uint256 _blockNumber, uint256 _leafId) public view {
    bool outOfBounds = outbox.hasMessageBeenConsumedAtBlock(_blockNumber, _leafId);
    assertFalse(outOfBounds);
  }

  function testGetRootData() public {
    bytes32 root = zeroedTree.computeRoot();

    vm.startPrank(ROLLUP_CONTRACT);
    outbox.insert(1, root);
    outbox.insert(2, root);
    vm.stopPrank();

    FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(1);

    {
      bytes32 actualRoot = outbox.getRootData(1);
      assertEq(root, actualRoot);
    }

    {
      bytes32 actualRoot = outbox.getRootData(2);
      assertEq(bytes32(0), actualRoot);
    }
  }

  function testConsumeOneOutHashAsRoot() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();

    // There's only 1 message in the entire block, so the root is the leaf.
    bytes32 root = leaf;

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(1, leaf);

    FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(1);

    uint256 leafIndex = 0;
    uint256 leafId = 1;

    bool statusBeforeConsumption = outbox.hasMessageBeenConsumedAtBlock(1, leafId);
    assertEq(abi.encode(0), abi.encode(statusBeforeConsumption));

    vm.expectEmit(true, true, true, true, address(outbox));
    emit IOutbox.MessageConsumed(1, root, leaf, leafId);
    bytes32[] memory path = new bytes32[](0);
    outbox.consume(fakeMessage, 1, leafIndex, path);

    bool statusAfterConsumption = outbox.hasMessageBeenConsumedAtBlock(1, leafId);
    assertEq(abi.encode(1), abi.encode(statusAfterConsumption));
  }

  function testConsumeMessagesInWonkyTree() public {
    DataStructures.L2ToL1Msg[] memory fakeMessages = new DataStructures.L2ToL1Msg[](3);
    bytes32[] memory leaves = new bytes32[](3);
    for (uint256 i = 0; i < 3; i++) {
      fakeMessages[i] = _fakeMessage(address(this), i);
      leaves[i] = fakeMessages[i].sha256ToField();
    }
    uint256 blockNumber = 1;

    // Build a wonky tree of 3 txs. Each tx has 1 message, so the txOutHash equals the only leaf.
    //    outHash
    //     /   \
    //    .   tx2
    //  /   \
    // tx0 tx1

    // First, build the left subtree with 2 leaves.
    // subtreeRoot
    //  /  \
    // tx0 tx1
    NaiveMerkle subtree = new NaiveMerkle(1);
    subtree.insertLeaf(leaves[0]);
    subtree.insertLeaf(leaves[1]);
    bytes32 subtreeRoot = subtree.computeRoot();

    // Then, build the top tree with the subtree root and the last leaf.
    //      outHash
    //   /          \
    // subtreeRoot tx2
    NaiveMerkle topTree = new NaiveMerkle(1);
    topTree.insertLeaf(subtreeRoot);
    topTree.insertLeaf(leaves[2]);
    bytes32 root = topTree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(blockNumber, root);

    FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(blockNumber);

    // Consume the message of tx0.
    {
      uint256 msgIndex = 0;
      uint256 leafIndex = 0;
      uint256 leafId = 2 ** 2;
      bytes32[] memory path = new bytes32[](2);
      {
        (bytes32[] memory subtreePath,) = subtree.computeSiblingPath(0);
        (bytes32[] memory topTreePath,) = topTree.computeSiblingPath(0);
        path[0] = subtreePath[0];
        path[1] = topTreePath[0];
      }
      outbox.consume(fakeMessages[msgIndex], blockNumber, leafIndex, path);

      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, blockNumber, leafId));
      outbox.consume(fakeMessages[msgIndex], blockNumber, leafIndex, path);
    }

    // Consume the message of tx1.
    {
      uint256 msgIndex = 1;
      uint256 leafIndex = 1;
      uint256 leafId = 2 ** 2 + 1;
      bytes32[] memory path = new bytes32[](2);
      {
        (bytes32[] memory subtreePath,) = subtree.computeSiblingPath(1);
        (bytes32[] memory topTreePath,) = topTree.computeSiblingPath(0);
        path[0] = subtreePath[0];
        path[1] = topTreePath[0];
      }
      outbox.consume(fakeMessages[msgIndex], blockNumber, leafIndex, path);

      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, blockNumber, leafId));
      outbox.consume(fakeMessages[msgIndex], blockNumber, leafIndex, path);
    }

    // Consume the message of tx2.
    {
      uint256 msgIndex = 2;
      uint256 leafIndex = 1;
      uint256 leafId = 2 ** 1 + 1;
      (bytes32[] memory path,) = topTree.computeSiblingPath(1);
      outbox.consume(fakeMessages[msgIndex], blockNumber, leafIndex, path);

      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, blockNumber, leafId));
      outbox.consume(fakeMessages[msgIndex], blockNumber, leafIndex, path);
    }
  }

  function testConsumeMessagesInWonkyWonkyTree() public {
    // Test with a wonky tree of 3 txs:
    // - tx0 has 1 message.
    // - tx1 has 3 messages.
    // - tx2 has 3 messages.

    DataStructures.L2ToL1Msg[] memory fakeMessages = new DataStructures.L2ToL1Msg[](7);
    bytes32[] memory leaves = new bytes32[](7);
    for (uint256 i = 0; i < 7; i++) {
      fakeMessages[i] = _fakeMessage(address(this), i);
      leaves[i] = fakeMessages[i].sha256ToField();
    }
    uint256 blockNumber = 1;

    bytes32[] memory txOutHashes = new bytes32[](3);

    // tx0 has 1 message, the message leaf is the root.
    txOutHashes[0] = leaves[0];

    // Build the subtree of tx1 with 3 message.
    bytes32 tx1SubtreeRoot;
    {
      NaiveMerkle subtree = new NaiveMerkle(1);
      subtree.insertLeaf(leaves[1]);
      subtree.insertLeaf(leaves[2]);
      tx1SubtreeRoot = subtree.computeRoot();
      NaiveMerkle topTree = new NaiveMerkle(1);
      topTree.insertLeaf(tx1SubtreeRoot);
      topTree.insertLeaf(leaves[3]);
      txOutHashes[1] = topTree.computeRoot();
    }

    // Build the subtree of tx2 with 3 messages.
    bytes32 tx2SubtreeRoot;
    {
      NaiveMerkle tx2Subtree = new NaiveMerkle(1);
      NaiveMerkle tx2TopTree = new NaiveMerkle(1);
      tx2Subtree.insertLeaf(leaves[4]);
      tx2Subtree.insertLeaf(leaves[5]);
      tx2SubtreeRoot = tx2Subtree.computeRoot();
      tx2TopTree.insertLeaf(tx2SubtreeRoot);
      tx2TopTree.insertLeaf(leaves[6]);
      txOutHashes[2] = tx2TopTree.computeRoot();
    }

    // Build a wonky tree of 3 txs.
    //    outHash
    //     /  \
    //    .   tx2
    //  /  \
    // tx0 tx1

    // First, build the left subtree with 2 txOutHashes.
    // subtreeRoot
    //  /  \
    // tx0 tx1
    bytes32 subtreeRoot;
    {
      NaiveMerkle subtree = new NaiveMerkle(1);
      subtree.insertLeaf(txOutHashes[0]);
      subtree.insertLeaf(txOutHashes[1]);
      subtreeRoot = subtree.computeRoot();
    }

    // Then, build the top tree with the subtree root and the last txOutHash.
    //      outHash
    //    /        \
    // subtreeRoot tx2
    {
      NaiveMerkle topTree = new NaiveMerkle(1);
      topTree.insertLeaf(subtreeRoot);
      topTree.insertLeaf(txOutHashes[2]);
      bytes32 root = topTree.computeRoot();

      vm.prank(ROLLUP_CONTRACT);
      outbox.insert(blockNumber, root);

      FakeRollup(ROLLUP_CONTRACT).setProvenBlockNum(blockNumber);
    }

    // Consume messages[0] in tx0.
    {
      //    outHash
      //     /  \
      //    .   tx2
      //   /  \
      //  m0  tx1
      uint256 msgIndex = 0;
      uint256 leafIndex = 0;
      uint256 leafId = 2 ** 2;
      bytes32[] memory path = new bytes32[](2);
      path[0] = txOutHashes[1];
      path[1] = txOutHashes[2];
      outbox.consume(fakeMessages[msgIndex], blockNumber, leafIndex, path);

      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, blockNumber, leafId));
      outbox.consume(fakeMessages[msgIndex], blockNumber, leafIndex, path);
    }

    // Consume messages[2] in tx1.
    {
      //    outHash
      //     /  \
      //    .   tx2
      //   /  \
      // tx0  tx1
      //      / \
      //    .   m3
      //   / \
      //  m1 m2
      uint256 msgIndex = 2;
      uint256 leafIndex = 5; // Leaf at index 5 in a balanced tree of height 4.
      uint256 leafId = 2 ** 4 + leafIndex;
      bytes32[] memory path = new bytes32[](4);
      path[0] = leaves[1];
      path[1] = leaves[3];
      path[2] = txOutHashes[0];
      path[3] = txOutHashes[2];
      outbox.consume(fakeMessages[msgIndex], blockNumber, leafIndex, path);

      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, blockNumber, leafId));
      outbox.consume(fakeMessages[msgIndex], blockNumber, leafIndex, path);
    }

    // Consume messages[4] in tx2.
    {
      //    outHash
      //     /  \
      //    .   tx2
      //        /  \
      //       .   m6
      //     /  \
      //    m4 m5
      uint256 msgIndex = 4;
      uint256 leafIndex = 4; // Leaf at index 4 in a balanced tree of height 3.
      uint256 leafId = 2 ** 3 + leafIndex;
      bytes32[] memory path = new bytes32[](3);
      path[0] = leaves[5];
      path[1] = leaves[6];
      path[2] = subtreeRoot;
      outbox.consume(fakeMessages[msgIndex], blockNumber, leafIndex, path);

      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, blockNumber, leafId));
      outbox.consume(fakeMessages[msgIndex], blockNumber, leafIndex, path);
    }

    // Consume messages[6] in tx2.
    {
      //    outHash
      //     /  \
      //    .   tx2
      //        /  \
      //       .   m6
      uint256 msgIndex = 6;
      uint256 leafIndex = 3; // Leaf at index 3 in a balanced tree of height 2.
      uint256 leafId = 2 ** 2 + leafIndex;
      bytes32[] memory path = new bytes32[](2);
      path[0] = tx2SubtreeRoot;
      path[1] = subtreeRoot;
      outbox.consume(fakeMessages[msgIndex], blockNumber, leafIndex, path);

      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, blockNumber, leafId));
      outbox.consume(fakeMessages[msgIndex], blockNumber, leafIndex, path);
    }
  }
}
