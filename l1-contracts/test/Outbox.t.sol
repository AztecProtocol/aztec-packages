// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Outbox, MAX_CHECKPOINTS_PER_EPOCH} from "@aztec/core/messagebridge/Outbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {NaiveMerkle} from "./merkle/Naive.sol";
import {MerkleTestUtil} from "./merkle/TestUtil.sol";

contract OutboxTest is Test {
  using Hash for DataStructures.L2ToL1Msg;

  address internal constant NOT_RECIPIENT = address(0x420);

  // Note: In reality, the epoch message tree could be way bigger. But the size of the actual tree and how it is
  // constructed is not relevant to the Outbox.
  // More comprehensive tests for the epoch message tree structure and the leaf id uniqueness are in
  // `yarn-project/stdlib/src/messaging/l2_to_l1_membership.test.ts`.
  uint256 internal constant DEFAULT_TREE_HEIGHT = 2;

  uint256 internal constant AZTEC_VERSION = 1;
  Epoch internal constant DEFAULT_EPOCH = Epoch.wrap(1);

  // Most tests insert a single root for an epoch. Use K = 1 to identify it.
  uint256 internal constant K1 = 1;

  address internal ROLLUP_CONTRACT;
  Outbox internal outbox;
  NaiveMerkle internal epochTree;
  MerkleTestUtil internal merkleTestUtil;

  function setUp() public {
    ROLLUP_CONTRACT = address(this);

    outbox = new Outbox(ROLLUP_CONTRACT, AZTEC_VERSION);
    epochTree = new NaiveMerkle(DEFAULT_TREE_HEIGHT);
    merkleTestUtil = new MerkleTestUtil();
  }

  function _fakeMessage(address _recipient, uint256 _content) internal view returns (DataStructures.L2ToL1Msg memory) {
    return DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor({
        actor: 0x2000000000000000000000000000000000000000000000000000000000000000, version: AZTEC_VERSION
      }),
      recipient: DataStructures.L1Actor({actor: _recipient, chainId: block.chainid}),
      content: bytes32(_content)
    });
  }

  function _consumeMessageAtEpoch(
    Epoch epoch,
    uint256 numCheckpointsInEpoch,
    NaiveMerkle tree,
    uint256 leafIndex,
    bytes32 leaf,
    DataStructures.L2ToL1Msg memory message
  ) internal {
    uint256 leafId = 2 ** tree.DEPTH() + leafIndex;
    (bytes32[] memory path,) = tree.computeSiblingPath(leafIndex);

    bytes32 root = tree.computeRoot();

    bool statusBeforeConsumption = outbox.hasMessageBeenConsumedAtEpoch(epoch, leafId);
    assertEq(abi.encode(0), abi.encode(statusBeforeConsumption));

    vm.expectEmit(true, true, true, true, address(outbox));
    emit IOutbox.MessageConsumed(epoch, root, leaf, leafId, numCheckpointsInEpoch);
    outbox.consume(message, epoch, numCheckpointsInEpoch, leafIndex, path);

    bool statusAfterConsumption = outbox.hasMessageBeenConsumedAtEpoch(epoch, leafId);
    assertEq(abi.encode(1), abi.encode(statusAfterConsumption));
  }

  function _consumeMessage(uint256 leafIndex, bytes32 leaf, DataStructures.L2ToL1Msg memory message) internal {
    _consumeMessageAtEpoch(DEFAULT_EPOCH, K1, epochTree, leafIndex, leaf, message);
  }

  function _consumeNullifiedMessageAtEpoch(
    Epoch epoch,
    uint256 numCheckpointsInEpoch,
    NaiveMerkle tree,
    uint256 leafIndex,
    DataStructures.L2ToL1Msg memory message
  ) internal {
    uint256 leafId = 2 ** tree.DEPTH() + leafIndex;
    (bytes32[] memory path,) = tree.computeSiblingPath(leafIndex);

    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, epoch, leafId));
    outbox.consume(message, epoch, numCheckpointsInEpoch, leafIndex, path);
  }

  function _consumeNullifiedMessage(uint256 leafIndex, DataStructures.L2ToL1Msg memory message) internal {
    _consumeNullifiedMessageAtEpoch(DEFAULT_EPOCH, K1, epochTree, leafIndex, message);
  }

  function testRevertIfInsertingFromNonRollup(address _caller) public {
    vm.assume(ROLLUP_CONTRACT != _caller);
    bytes32 root = epochTree.computeRoot();

    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__Unauthorized.selector));
    outbox.insert(DEFAULT_EPOCH, K1, root);
  }

  function testRevertIfInsertingNumCheckpointsZero() public {
    bytes32 root = epochTree.computeRoot();
    vm.prank(ROLLUP_CONTRACT);
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__InvalidNumCheckpointsInEpoch.selector, 0));
    outbox.insert(DEFAULT_EPOCH, 0, root);
  }

  function testRevertIfInsertingNumCheckpointsAboveMax(uint256 _n) public {
    uint256 n = bound(_n, MAX_CHECKPOINTS_PER_EPOCH + 1, type(uint256).max);
    bytes32 root = epochTree.computeRoot();
    vm.prank(ROLLUP_CONTRACT);
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__InvalidNumCheckpointsInEpoch.selector, n));
    outbox.insert(DEFAULT_EPOCH, n, root);
  }

  function testRevertIfPathTooLong() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32[] memory path = new bytes32[](256);
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__PathTooLong.selector));
    outbox.consume(fakeMessage, DEFAULT_EPOCH, K1, 0, path);
  }

  function testRevertIfLeafIndexOutOfBounds(uint256 _leafIndex) public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32[] memory path = new bytes32[](4);
    uint256 leafIndex = bound(_leafIndex, 1 << path.length, type(uint256).max);
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__LeafIndexOutOfBounds.selector, leafIndex, path.length));
    outbox.consume(fakeMessage, DEFAULT_EPOCH, K1, leafIndex, path);
  }

  // We make a naive tree with a computed height, insert the leafs into it, and compute a root. We then add the root as
  // the root of the L2 to L1 message tree, expect for the correct event to be emitted, and then query for the root in
  // the contract, making sure the roots match.
  function testInsertVariedLeafs(bytes32[] calldata _messageLeafs) public {
    uint256 treeHeight = merkleTestUtil.calculateTreeHeightFromSize(_messageLeafs.length);
    NaiveMerkle tree = new NaiveMerkle(treeHeight);

    for (uint256 i = 0; i < _messageLeafs.length; i++) {
      vm.assume(_messageLeafs[i] != bytes32(0));
      tree.insertLeaf(_messageLeafs[i]);
    }

    bytes32 root = tree.computeRoot();

    vm.expectEmit(true, true, true, true, address(outbox));
    emit IOutbox.RootAdded(DEFAULT_EPOCH, K1, root);
    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, K1, root);

    assertEq(root, outbox.getRootData(DEFAULT_EPOCH, K1));
    bytes32[MAX_CHECKPOINTS_PER_EPOCH] memory roots = outbox.getRoots(DEFAULT_EPOCH);
    assertEq(roots[0], root);
    for (uint256 i = 1; i < MAX_CHECKPOINTS_PER_EPOCH; i++) {
      assertEq(roots[i], bytes32(0));
    }
  }

  function testRevertIfConsumingMessageBelongingToOther() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);

    (bytes32[] memory path,) = epochTree.computeSiblingPath(0);

    vm.prank(NOT_RECIPIENT);
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__InvalidRecipient.selector, address(this), NOT_RECIPIENT));
    outbox.consume(fakeMessage, DEFAULT_EPOCH, K1, 1, path);
  }

  function testRevertIfConsumingMessageWithInvalidChainId() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);

    (bytes32[] memory path,) = epochTree.computeSiblingPath(0);

    fakeMessage.recipient.chainId = block.chainid + 1;

    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__InvalidChainId.selector));
    outbox.consume(fakeMessage, DEFAULT_EPOCH, K1, 1, path);
  }

  function testRevertIfVersionMismatch() public {
    DataStructures.L2ToL1Msg memory message = _fakeMessage(address(this), 123);
    (bytes32[] memory path,) = epochTree.computeSiblingPath(0);

    message.sender.version = AZTEC_VERSION + 1;
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Outbox__VersionMismatch.selector, message.sender.version, AZTEC_VERSION)
    );
    outbox.consume(message, DEFAULT_EPOCH, K1, 1, path);
  }

  function testRevertIfNothingInsertedAtEpoch() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);

    (bytes32[] memory path,) = epochTree.computeSiblingPath(0);

    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__NothingToConsumeAtEpoch.selector, DEFAULT_EPOCH));
    outbox.consume(fakeMessage, DEFAULT_EPOCH, K1, 1, path);
  }

  function testRevertIfConsumingAtNumCheckpointsWithoutRoot() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();
    epochTree.insertLeaf(leaf);
    bytes32 root = epochTree.computeRoot();

    // Insert at K=1, but try to consume at K=2 (no root there).
    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, K1, root);

    (bytes32[] memory path,) = epochTree.computeSiblingPath(0);

    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__NothingToConsumeAtEpoch.selector, DEFAULT_EPOCH));
    outbox.consume(fakeMessage, DEFAULT_EPOCH, 2, 0, path);
  }

  function testRevertIfConsumingAtNumCheckpointsZero() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();
    epochTree.insertLeaf(leaf);
    bytes32 root = epochTree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, K1, root);

    (bytes32[] memory path,) = epochTree.computeSiblingPath(0);

    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__NothingToConsumeAtEpoch.selector, DEFAULT_EPOCH));
    outbox.consume(fakeMessage, DEFAULT_EPOCH, 0, 0, path);
  }

  function testRevertIfConsumingAtNumCheckpointsAboveMax(uint256 _n) public {
    uint256 n = bound(_n, MAX_CHECKPOINTS_PER_EPOCH + 1, type(uint256).max);
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();
    epochTree.insertLeaf(leaf);
    bytes32 root = epochTree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, K1, root);

    (bytes32[] memory path,) = epochTree.computeSiblingPath(0);

    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__NothingToConsumeAtEpoch.selector, DEFAULT_EPOCH));
    outbox.consume(fakeMessage, DEFAULT_EPOCH, n, 0, path);
  }

  function testValidInsertAndConsume() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();

    epochTree.insertLeaf(leaf);
    bytes32 root = epochTree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, K1, root);

    uint256 leafIndex = 0;
    _consumeMessage(leafIndex, leaf, fakeMessage);
  }

  function testRevertIfTryingToConsumeSameMessage() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();

    epochTree.insertLeaf(leaf);
    bytes32 root = epochTree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, K1, root);

    uint256 leafIndex = 0;
    _consumeMessage(leafIndex, leaf, fakeMessage);

    _consumeNullifiedMessage(leafIndex, fakeMessage);
  }

  function testRevertIfPathHeightMismatch() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();

    epochTree.insertLeaf(leaf);
    bytes32 root = epochTree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, K1, root);

    NaiveMerkle smallerTree = new NaiveMerkle(DEFAULT_TREE_HEIGHT - 1);
    smallerTree.insertLeaf(leaf);
    bytes32 smallerTreeRoot = smallerTree.computeRoot();

    (bytes32[] memory path,) = smallerTree.computeSiblingPath(0);
    vm.expectRevert(abi.encodeWithSelector(Errors.MerkleLib__InvalidRoot.selector, root, smallerTreeRoot, leaf, 0));
    outbox.consume(fakeMessage, DEFAULT_EPOCH, K1, 0, path);
  }

  function testRevertIfTryingToConsumeMessageNotInTree() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();
    fakeMessage.content = bytes32(uint256(42_069));
    bytes32 modifiedLeaf = fakeMessage.sha256ToField();

    epochTree.insertLeaf(leaf);
    bytes32 root = epochTree.computeRoot();

    NaiveMerkle modifiedTree = new NaiveMerkle(DEFAULT_TREE_HEIGHT);
    modifiedTree.insertLeaf(modifiedLeaf);
    bytes32 modifiedRoot = modifiedTree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, K1, root);

    (bytes32[] memory path,) = modifiedTree.computeSiblingPath(0);

    vm.expectRevert(abi.encodeWithSelector(Errors.MerkleLib__InvalidRoot.selector, root, modifiedRoot, modifiedLeaf, 0));
    outbox.consume(fakeMessage, DEFAULT_EPOCH, K1, 0, path);
  }

  // This test takes awhile so to keep it somewhat reasonable we've set a limit on the amount of fuzz runs
  /// forge-config: default.fuzz.runs = 64
  function testInsertAndConsumeWithVariedRecipients(
    address[256] calldata _recipients,
    uint256 _epochNumber,
    uint8 _size
  ) public {
    Epoch epoch = Epoch.wrap(bound(_epochNumber, 1, 256));
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
    emit IOutbox.RootAdded(epoch, K1, root);
    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(epoch, K1, root);

    for (uint256 i = 0; i < numberOfMessages; i++) {
      (bytes32[] memory path, bytes32 leaf) = tree.computeSiblingPath(i);
      uint256 leafId = 2 ** treeHeight + i;

      vm.expectEmit(true, true, true, true, address(outbox));
      emit IOutbox.MessageConsumed(epoch, root, leaf, leafId, K1);
      vm.prank(_recipients[i]);
      outbox.consume(messages[i], epoch, K1, i, path);
    }
  }

  function testCheckOutOfBoundsStatus(Epoch _epoch, uint256 _leafId) public view {
    bool outOfBounds = outbox.hasMessageBeenConsumedAtEpoch(_epoch, _leafId);
    assertFalse(outOfBounds);
  }

  function testGetRootData() public {
    bytes32 root = epochTree.computeRoot();

    vm.startPrank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, 1, root);
    outbox.insert(DEFAULT_EPOCH, 2, root);
    vm.stopPrank();

    assertEq(root, outbox.getRootData(DEFAULT_EPOCH, 1));
    assertEq(root, outbox.getRootData(DEFAULT_EPOCH, 2));

    // numCheckpointsInEpoch=0 and >MAX both return zero, no revert.
    assertEq(bytes32(0), outbox.getRootData(DEFAULT_EPOCH, 0));
    assertEq(bytes32(0), outbox.getRootData(DEFAULT_EPOCH, 3));
    assertEq(bytes32(0), outbox.getRootData(DEFAULT_EPOCH, MAX_CHECKPOINTS_PER_EPOCH + 1));

    // Unrelated epoch returns zero for any K.
    Epoch otherEpoch = DEFAULT_EPOCH + Epoch.wrap(1);
    assertEq(bytes32(0), outbox.getRootData(otherEpoch, 1));
    bytes32[MAX_CHECKPOINTS_PER_EPOCH] memory otherRoots = outbox.getRoots(otherEpoch);
    for (uint256 i = 0; i < MAX_CHECKPOINTS_PER_EPOCH; i++) {
      assertEq(otherRoots[i], bytes32(0));
    }
  }

  function testGetRootsReturnsAllSlots() public {
    bytes32 r1 = bytes32(uint256(0xa));
    bytes32 r3 = bytes32(uint256(0xb));
    bytes32 rMax = bytes32(uint256(0xc));

    vm.startPrank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, 1, r1);
    outbox.insert(DEFAULT_EPOCH, 3, r3);
    outbox.insert(DEFAULT_EPOCH, MAX_CHECKPOINTS_PER_EPOCH, rMax);
    vm.stopPrank();

    bytes32[MAX_CHECKPOINTS_PER_EPOCH] memory roots = outbox.getRoots(DEFAULT_EPOCH);
    assertEq(roots[0], r1);
    assertEq(roots[1], bytes32(0));
    assertEq(roots[2], r3);
    for (uint256 i = 3; i < MAX_CHECKPOINTS_PER_EPOCH - 1; i++) {
      assertEq(roots[i], bytes32(0));
    }
    assertEq(roots[MAX_CHECKPOINTS_PER_EPOCH - 1], rMax);
  }

  function testMessageConsumedEventCarriesNumCheckpoints() public {
    // Insert two distinct roots at K=1 and K=2 for the same epoch. Consume one message against
    // each root and verify the emitted MessageConsumed carries the exact numCheckpointsInEpoch
    // the caller proved against, so a log-only indexer can recover the AZIP-14 root slot without
    // decoding calldata or replaying RootAdded state. The two messages live at different
    // positions so their leaf ids are distinct (the bitmap is shared across roots in the epoch).
    DataStructures.L2ToL1Msg memory m0 = _fakeMessage(address(this), 700);
    DataStructures.L2ToL1Msg memory m1 = _fakeMessage(address(this), 701);

    bytes32 leaf0 = m0.sha256ToField();
    bytes32 leaf1 = m1.sha256ToField();

    NaiveMerkle tree0 = new NaiveMerkle(1);
    tree0.insertLeaf(leaf0);
    tree0.insertLeaf(bytes32(uint256(0)));
    bytes32 root0 = tree0.computeRoot();

    NaiveMerkle tree1 = new NaiveMerkle(1);
    tree1.insertLeaf(bytes32(uint256(0)));
    tree1.insertLeaf(leaf1);
    bytes32 root1 = tree1.computeRoot();

    vm.startPrank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, 1, root0);
    outbox.insert(DEFAULT_EPOCH, 2, root1);
    vm.stopPrank();

    uint256 leafId0 = (1 << 1) + 0;
    uint256 leafId1 = (1 << 1) + 1;
    (bytes32[] memory path0,) = tree0.computeSiblingPath(0);
    (bytes32[] memory path1,) = tree1.computeSiblingPath(1);

    vm.expectEmit(true, true, true, true, address(outbox));
    emit IOutbox.MessageConsumed(DEFAULT_EPOCH, root0, leaf0, leafId0, 1);
    outbox.consume(m0, DEFAULT_EPOCH, 1, 0, path0);

    vm.expectEmit(true, true, true, true, address(outbox));
    emit IOutbox.MessageConsumed(DEFAULT_EPOCH, root1, leaf1, leafId1, 2);
    outbox.consume(m1, DEFAULT_EPOCH, 2, 1, path1);
  }

  function testRootAddedEventCarriesNumCheckpoints() public {
    bytes32 r1 = bytes32(uint256(0xa));
    bytes32 r2 = bytes32(uint256(0xb));
    bytes32 r3 = bytes32(uint256(0xc));

    vm.startPrank(ROLLUP_CONTRACT);
    vm.expectEmit(true, true, true, true, address(outbox));
    emit IOutbox.RootAdded(DEFAULT_EPOCH, 1, r1);
    outbox.insert(DEFAULT_EPOCH, 1, r1);

    vm.expectEmit(true, true, true, true, address(outbox));
    emit IOutbox.RootAdded(DEFAULT_EPOCH, 2, r2);
    outbox.insert(DEFAULT_EPOCH, 2, r2);

    vm.expectEmit(true, true, true, true, address(outbox));
    emit IOutbox.RootAdded(DEFAULT_EPOCH, 3, r3);
    outbox.insert(DEFAULT_EPOCH, 3, r3);
    vm.stopPrank();

    assertEq(outbox.getRootData(DEFAULT_EPOCH, 1), r1);
    assertEq(outbox.getRootData(DEFAULT_EPOCH, 2), r2);
    assertEq(outbox.getRootData(DEFAULT_EPOCH, 3), r3);
  }

  function testConsumeAgainstFirstRootOfMultiple() public {
    // Single message included in the first (smaller) root, then a second root is inserted on top.
    // Consuming against the first root must still succeed.
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();
    epochTree.insertLeaf(leaf);
    bytes32 firstRoot = epochTree.computeRoot();

    // Insert a second (different) root for the same epoch at K=2.
    bytes32 secondRoot = bytes32(uint256(uint256(firstRoot) ^ 0x1));

    vm.startPrank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, 1, firstRoot);
    outbox.insert(DEFAULT_EPOCH, 2, secondRoot);
    vm.stopPrank();

    uint256 leafIndex = 0;
    uint256 leafId = 2 ** DEFAULT_TREE_HEIGHT + leafIndex;
    (bytes32[] memory path,) = epochTree.computeSiblingPath(leafIndex);

    vm.expectEmit(true, true, true, true, address(outbox));
    emit IOutbox.MessageConsumed(DEFAULT_EPOCH, firstRoot, leaf, leafId, 1);
    outbox.consume(fakeMessage, DEFAULT_EPOCH, 1, leafIndex, path);

    assertTrue(outbox.hasMessageBeenConsumedAtEpoch(DEFAULT_EPOCH, leafId));
  }

  function testReplayAcrossRootsRejected() public {
    // Build a wonky tree so the leaf id of an earlier-checkpoint message is preserved when the tree grows.
    // After consuming against the first root, attempting to replay against a second root with the same leaf id
    // must revert with Outbox__AlreadyNullified.
    DataStructures.L2ToL1Msg[] memory msgs = new DataStructures.L2ToL1Msg[](3);
    bytes32[] memory leaves = new bytes32[](3);
    for (uint256 i = 0; i < 3; i++) {
      msgs[i] = _fakeMessage(address(this), i + 123);
      leaves[i] = msgs[i].sha256ToField();
    }

    // First root (K=1): wonky tree with the first 2 messages.
    //    firstRoot
    //     /    \
    //   m0      m1
    bytes32 firstRoot;
    {
      NaiveMerkle firstTree = new NaiveMerkle(1);
      firstTree.insertLeaf(leaves[0]);
      firstTree.insertLeaf(leaves[1]);
      firstRoot = firstTree.computeRoot();
    }

    // Second root (K=2): an extended wonky tree that still has m0 at the top-left position.
    //    secondRoot
    //     /    \
    //   m0    subtree(m1,m2)
    bytes32 secondRoot;
    bytes32 subtreeRoot;
    {
      NaiveMerkle subtree = new NaiveMerkle(1);
      subtree.insertLeaf(leaves[1]);
      subtree.insertLeaf(leaves[2]);
      subtreeRoot = subtree.computeRoot();
      NaiveMerkle secondTree = new NaiveMerkle(1);
      secondTree.insertLeaf(leaves[0]);
      secondTree.insertLeaf(subtreeRoot);
      secondRoot = secondTree.computeRoot();
    }

    vm.startPrank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, 1, firstRoot);
    outbox.insert(DEFAULT_EPOCH, 2, secondRoot);
    vm.stopPrank();

    // leaves[0]'s leaf id is the same against either root because its position in the wonky tree is preserved.
    uint256 leafId = (1 << 1);

    // Consume against the first root: sibling is leaves[1].
    {
      bytes32[] memory path = new bytes32[](1);
      path[0] = leaves[1];
      outbox.consume(msgs[0], DEFAULT_EPOCH, 1, 0, path);
      assertTrue(outbox.hasMessageBeenConsumedAtEpoch(DEFAULT_EPOCH, leafId));
    }

    // Attempt to replay against the second root: must revert because the bitmap is shared.
    // Against the second root, m0's sibling is `subtreeRoot`.
    {
      bytes32[] memory path = new bytes32[](1);
      path[0] = subtreeRoot;
      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, DEFAULT_EPOCH, leafId));
      outbox.consume(msgs[0], DEFAULT_EPOCH, 2, 0, path);
    }

    // A message that only exists in the second root can still be consumed against K=2.
    // leaves[2] sits at leafIndex=3 (depth 2): subtree(m1,m2) right child.
    {
      uint256 m2LeafIndex = 3;
      uint256 m2LeafId = (1 << 2) + m2LeafIndex;
      bytes32[] memory m2Path = new bytes32[](2);
      m2Path[0] = leaves[1];
      m2Path[1] = leaves[0];

      vm.expectEmit(true, true, true, true, address(outbox));
      emit IOutbox.MessageConsumed(DEFAULT_EPOCH, secondRoot, leaves[2], m2LeafId, 2);
      outbox.consume(msgs[2], DEFAULT_EPOCH, 2, m2LeafIndex, m2Path);
    }
  }

  // Companion to testReplayAcrossRootsRejected. Consumes msgs[0] against the K=2 root first
  // (forcing MerkleLib to actually accept the path against the second root, proving it's a valid
  // proof), and then attempts to replay against K=1. The replay must revert.
  function testReplayAcrossRootsRejectedReverseOrder() public {
    DataStructures.L2ToL1Msg[] memory msgs = new DataStructures.L2ToL1Msg[](3);
    bytes32[] memory leaves = new bytes32[](3);
    for (uint256 i = 0; i < 3; i++) {
      msgs[i] = _fakeMessage(address(this), i + 200);
      leaves[i] = msgs[i].sha256ToField();
    }

    bytes32 firstRoot;
    {
      NaiveMerkle firstTree = new NaiveMerkle(1);
      firstTree.insertLeaf(leaves[0]);
      firstTree.insertLeaf(leaves[1]);
      firstRoot = firstTree.computeRoot();
    }

    bytes32 secondRoot;
    bytes32 subtreeRoot;
    {
      NaiveMerkle subtree = new NaiveMerkle(1);
      subtree.insertLeaf(leaves[1]);
      subtree.insertLeaf(leaves[2]);
      subtreeRoot = subtree.computeRoot();
      NaiveMerkle secondTree = new NaiveMerkle(1);
      secondTree.insertLeaf(leaves[0]);
      secondTree.insertLeaf(subtreeRoot);
      secondRoot = secondTree.computeRoot();
    }

    vm.startPrank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, 1, firstRoot);
    outbox.insert(DEFAULT_EPOCH, 2, secondRoot);
    vm.stopPrank();

    uint256 leafId = (1 << 1);

    // Consume msgs[0] against the SECOND root first. This goes through MerkleLib verification
    // and only succeeds if the (path, leafIndex) genuinely proves m0 against secondRoot.
    {
      bytes32[] memory path = new bytes32[](1);
      path[0] = subtreeRoot;
      vm.expectEmit(true, true, true, true, address(outbox));
      emit IOutbox.MessageConsumed(DEFAULT_EPOCH, secondRoot, leaves[0], leafId, 2);
      outbox.consume(msgs[0], DEFAULT_EPOCH, 2, 0, path);
      assertTrue(outbox.hasMessageBeenConsumedAtEpoch(DEFAULT_EPOCH, leafId));
    }

    // Now replay against K=1 with a valid first-root path. Must revert at the shared bitmap check.
    {
      bytes32[] memory path = new bytes32[](1);
      path[0] = leaves[1];
      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, DEFAULT_EPOCH, leafId));
      outbox.consume(msgs[0], DEFAULT_EPOCH, 1, 0, path);
    }
  }

  function testConsumeOneOutHashAsRoot() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();

    // There's only 1 message in the entire epoch, so the root is the leaf.
    bytes32 root = leaf;

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, K1, leaf);

    uint256 leafIndex = 0;
    uint256 leafId = 1;

    bool statusBeforeConsumption = outbox.hasMessageBeenConsumedAtEpoch(DEFAULT_EPOCH, leafId);
    assertEq(abi.encode(0), abi.encode(statusBeforeConsumption));

    vm.expectEmit(true, true, true, true, address(outbox));
    emit IOutbox.MessageConsumed(DEFAULT_EPOCH, root, leaf, leafId, K1);
    bytes32[] memory path = new bytes32[](0);
    outbox.consume(fakeMessage, DEFAULT_EPOCH, K1, leafIndex, path);

    bool statusAfterConsumption = outbox.hasMessageBeenConsumedAtEpoch(DEFAULT_EPOCH, leafId);
    assertEq(abi.encode(1), abi.encode(statusAfterConsumption));
  }

  function testConsumeMessagesInWonkyTree() public {
    DataStructures.L2ToL1Msg[] memory fakeMessages = new DataStructures.L2ToL1Msg[](3);
    bytes32[] memory leaves = new bytes32[](3);
    for (uint256 i = 0; i < 3; i++) {
      fakeMessages[i] = _fakeMessage(address(this), i);
      leaves[i] = fakeMessages[i].sha256ToField();
    }

    // Build a wonky tree of 3 txs. Each tx has 1 message, so the txOutHash equals the only leaf.
    //    outHash
    //     /   \
    //    .   tx2
    //  /   \
    // tx0 tx1

    NaiveMerkle subtree = new NaiveMerkle(1);
    subtree.insertLeaf(leaves[0]);
    subtree.insertLeaf(leaves[1]);
    bytes32 subtreeRoot = subtree.computeRoot();

    NaiveMerkle topTree = new NaiveMerkle(1);
    topTree.insertLeaf(subtreeRoot);
    topTree.insertLeaf(leaves[2]);
    bytes32 root = topTree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, K1, root);

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
      outbox.consume(fakeMessages[msgIndex], DEFAULT_EPOCH, K1, leafIndex, path);

      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, DEFAULT_EPOCH, leafId));
      outbox.consume(fakeMessages[msgIndex], DEFAULT_EPOCH, K1, leafIndex, path);
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
      outbox.consume(fakeMessages[msgIndex], DEFAULT_EPOCH, K1, leafIndex, path);

      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, DEFAULT_EPOCH, leafId));
      outbox.consume(fakeMessages[msgIndex], DEFAULT_EPOCH, K1, leafIndex, path);
    }

    // Consume the message of tx2.
    {
      uint256 msgIndex = 2;
      uint256 leafIndex = 1;
      uint256 leafId = 2 ** 1 + 1;
      (bytes32[] memory path,) = topTree.computeSiblingPath(1);
      outbox.consume(fakeMessages[msgIndex], DEFAULT_EPOCH, K1, leafIndex, path);

      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, DEFAULT_EPOCH, leafId));
      outbox.consume(fakeMessages[msgIndex], DEFAULT_EPOCH, K1, leafIndex, path);
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

    bytes32[] memory txOutHashes = new bytes32[](3);

    txOutHashes[0] = leaves[0];

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

    bytes32 subtreeRoot;
    {
      NaiveMerkle subtree = new NaiveMerkle(1);
      subtree.insertLeaf(txOutHashes[0]);
      subtree.insertLeaf(txOutHashes[1]);
      subtreeRoot = subtree.computeRoot();
    }

    {
      NaiveMerkle topTree = new NaiveMerkle(1);
      topTree.insertLeaf(subtreeRoot);
      topTree.insertLeaf(txOutHashes[2]);
      bytes32 root = topTree.computeRoot();

      vm.prank(ROLLUP_CONTRACT);
      outbox.insert(DEFAULT_EPOCH, K1, root);
    }

    // Consume messages[0] in tx0.
    {
      uint256 msgIndex = 0;
      uint256 leafIndex = 0;
      uint256 leafId = 2 ** 2;
      bytes32[] memory path = new bytes32[](2);
      path[0] = txOutHashes[1];
      path[1] = txOutHashes[2];
      outbox.consume(fakeMessages[msgIndex], DEFAULT_EPOCH, K1, leafIndex, path);

      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, DEFAULT_EPOCH, leafId));
      outbox.consume(fakeMessages[msgIndex], DEFAULT_EPOCH, K1, leafIndex, path);
    }

    // Consume messages[2] in tx1.
    {
      uint256 msgIndex = 2;
      uint256 leafIndex = 5;
      uint256 leafId = 2 ** 4 + leafIndex;
      bytes32[] memory path = new bytes32[](4);
      path[0] = leaves[1];
      path[1] = leaves[3];
      path[2] = txOutHashes[0];
      path[3] = txOutHashes[2];
      outbox.consume(fakeMessages[msgIndex], DEFAULT_EPOCH, K1, leafIndex, path);

      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, DEFAULT_EPOCH, leafId));
      outbox.consume(fakeMessages[msgIndex], DEFAULT_EPOCH, K1, leafIndex, path);
    }

    // Consume messages[4] in tx2.
    {
      uint256 msgIndex = 4;
      uint256 leafIndex = 4;
      uint256 leafId = 2 ** 3 + leafIndex;
      bytes32[] memory path = new bytes32[](3);
      path[0] = leaves[5];
      path[1] = leaves[6];
      path[2] = subtreeRoot;
      outbox.consume(fakeMessages[msgIndex], DEFAULT_EPOCH, K1, leafIndex, path);

      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, DEFAULT_EPOCH, leafId));
      outbox.consume(fakeMessages[msgIndex], DEFAULT_EPOCH, K1, leafIndex, path);
    }

    // Consume messages[6] in tx2.
    {
      uint256 msgIndex = 6;
      uint256 leafIndex = 3;
      uint256 leafId = 2 ** 2 + leafIndex;
      bytes32[] memory path = new bytes32[](2);
      path[0] = tx2SubtreeRoot;
      path[1] = subtreeRoot;
      outbox.consume(fakeMessages[msgIndex], DEFAULT_EPOCH, K1, leafIndex, path);

      vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__AlreadyNullified.selector, DEFAULT_EPOCH, leafId));
      outbox.consume(fakeMessages[msgIndex], DEFAULT_EPOCH, K1, leafIndex, path);
    }
  }

  // This test checks that the status of existing messages is preserved when a new (extending) root is inserted
  // for the same epoch.
  function testConsumeAgainFailAfterChainProgressed() public {
    DataStructures.L2ToL1Msg[] memory fakeMessages = new DataStructures.L2ToL1Msg[](3);
    bytes32[] memory leaves = new bytes32[](3);
    for (uint256 i = 0; i < 3; i++) {
      fakeMessages[i] = _fakeMessage(address(this), i + 123);
      leaves[i] = fakeMessages[i].sha256ToField();
    }

    // First, insert the root of a short partial proof covering 2 checkpoints (K=2).
    epochTree.insertLeaf(leaves[0]);
    epochTree.insertLeaf(leaves[1]);

    bytes32 rootForShortProof = epochTree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, 2, rootForShortProof);

    // Consume leaves[1] against K=2.
    {
      uint256 leafIndex = 1;
      _consumeMessageAtEpoch(DEFAULT_EPOCH, 2, epochTree, leafIndex, leaves[leafIndex], fakeMessages[leafIndex]);
    }

    // Then, insert the root of an extending proof covering 3 checkpoints (K=3).
    epochTree.insertLeaf(leaves[2]);
    bytes32 rootForLongProof = epochTree.computeRoot();

    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, 3, rootForLongProof);

    assertEq(outbox.getRootData(DEFAULT_EPOCH, 2), rootForShortProof);
    assertEq(outbox.getRootData(DEFAULT_EPOCH, 3), rootForLongProof);

    // Cannot consume leaves[1] again against either root: the bitmap is shared.
    {
      uint256 leafIndex = 1;
      _consumeNullifiedMessageAtEpoch(DEFAULT_EPOCH, 2, epochTree, leafIndex, fakeMessages[leafIndex]);
      _consumeNullifiedMessageAtEpoch(DEFAULT_EPOCH, 3, epochTree, leafIndex, fakeMessages[leafIndex]);
    }

    // leaves[0] can still be consumed against either root.
    {
      uint256 leafIndex = 0;
      _consumeMessageAtEpoch(DEFAULT_EPOCH, 3, epochTree, leafIndex, leaves[leafIndex], fakeMessages[leafIndex]);
    }

    // New leaf leaves[2] can be consumed against K=3.
    {
      uint256 leafIndex = 2;
      _consumeMessageAtEpoch(DEFAULT_EPOCH, 3, epochTree, leafIndex, leaves[leafIndex], fakeMessages[leafIndex]);
    }
  }

  // This test checks that the status of existing messages is preserved when the root for a new epoch is inserted.
  function testConsumeMessagesInTwoEpochs() public {
    DataStructures.L2ToL1Msg[] memory fakeMessages = new DataStructures.L2ToL1Msg[](2);
    bytes32[] memory leaves = new bytes32[](2);
    for (uint256 i = 0; i < 2; i++) {
      fakeMessages[i] = _fakeMessage(address(this), i + 123);
      leaves[i] = fakeMessages[i].sha256ToField();
    }
    epochTree.insertLeaf(leaves[0]);
    epochTree.insertLeaf(leaves[1]);
    bytes32 root = epochTree.computeRoot();

    Epoch epoch1 = DEFAULT_EPOCH;
    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(epoch1, K1, root);

    {
      uint256 leafIndex = 1;
      _consumeMessageAtEpoch(epoch1, K1, epochTree, leafIndex, leaves[leafIndex], fakeMessages[leafIndex]);
    }

    Epoch epoch2 = epoch1 + Epoch.wrap(1);
    vm.prank(ROLLUP_CONTRACT);
    outbox.insert(epoch2, K1, root);

    // Cannot consume leaves[1] again in the first epoch.
    {
      uint256 leafIndex = 1;
      _consumeNullifiedMessageAtEpoch(epoch1, K1, epochTree, leafIndex, fakeMessages[leafIndex]);
    }

    // The same leaf leaves[1] in the second epoch can be consumed.
    {
      uint256 leafIndex = 1;
      _consumeMessageAtEpoch(epoch2, K1, epochTree, leafIndex, leaves[leafIndex], fakeMessages[leafIndex]);
    }

    // leaves[0] in the first epoch can still be consumed.
    {
      uint256 leafIndex = 0;
      _consumeMessageAtEpoch(epoch1, K1, epochTree, leafIndex, leaves[leafIndex], fakeMessages[leafIndex]);
    }
  }

  // Inserting the same root value at two distinct K values produces two addressable entries.
  // Consuming against either marks the shared bitmap, blocking a second consume against the other
  // for the same leaf id.
  function testDuplicateRootInsertedAtDistinctIndices() public {
    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 123);
    bytes32 leaf = fakeMessage.sha256ToField();
    epochTree.insertLeaf(leaf);
    bytes32 root = epochTree.computeRoot();

    vm.startPrank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, 1, root);
    outbox.insert(DEFAULT_EPOCH, 2, root);
    vm.stopPrank();

    assertEq(outbox.getRootData(DEFAULT_EPOCH, 1), root);
    assertEq(outbox.getRootData(DEFAULT_EPOCH, 2), root);

    _consumeMessageAtEpoch(DEFAULT_EPOCH, 1, epochTree, 0, leaf, fakeMessage);
    _consumeNullifiedMessageAtEpoch(DEFAULT_EPOCH, 2, epochTree, 0, fakeMessage);
  }

  // Different leaf ids within the same epoch but across different roots can each be consumed
  // independently — the bitmap only blocks a given leaf id, not arbitrary leaves on the same root.
  function testDistinctLeafIdsAcrossRootsConsumeIndependently() public {
    DataStructures.L2ToL1Msg memory msgA = _fakeMessage(address(this), 1);
    DataStructures.L2ToL1Msg memory msgB = _fakeMessage(address(this), 2);
    bytes32 leafA = msgA.sha256ToField();
    bytes32 leafB = msgB.sha256ToField();

    NaiveMerkle treeA = new NaiveMerkle(DEFAULT_TREE_HEIGHT);
    treeA.insertLeaf(leafA);
    bytes32 rootA = treeA.computeRoot();

    NaiveMerkle treeB = new NaiveMerkle(1);
    treeB.insertLeaf(leafB);
    bytes32 rootB = treeB.computeRoot();

    vm.startPrank(ROLLUP_CONTRACT);
    outbox.insert(DEFAULT_EPOCH, 1, rootA);
    outbox.insert(DEFAULT_EPOCH, 2, rootB);
    vm.stopPrank();

    uint256 leafIdA = (1 << DEFAULT_TREE_HEIGHT) + 0;
    uint256 leafIdB = (1 << 1) + 0;
    assertTrue(leafIdA != leafIdB);

    _consumeMessageAtEpoch(DEFAULT_EPOCH, 1, treeA, 0, leafA, msgA);
    _consumeMessageAtEpoch(DEFAULT_EPOCH, 2, treeB, 0, leafB, msgB);

    assertTrue(outbox.hasMessageBeenConsumedAtEpoch(DEFAULT_EPOCH, leafIdA));
    assertTrue(outbox.hasMessageBeenConsumedAtEpoch(DEFAULT_EPOCH, leafIdB));
  }

  // Bitmap state and roots must be isolated between epochs even when both have multiple inserts.
  function testMultiRootEpochsAreIsolated() public {
    Epoch epoch1 = DEFAULT_EPOCH;
    Epoch epoch2 = DEFAULT_EPOCH + Epoch.wrap(1);

    DataStructures.L2ToL1Msg memory fakeMessage = _fakeMessage(address(this), 7);
    bytes32 leaf = fakeMessage.sha256ToField();
    epochTree.insertLeaf(leaf);
    bytes32 root = epochTree.computeRoot();

    bytes32 sentinel = bytes32(uint256(0xdead));

    vm.startPrank(ROLLUP_CONTRACT);
    outbox.insert(epoch1, 1, root);
    outbox.insert(epoch1, 2, sentinel);
    outbox.insert(epoch2, 1, root);
    outbox.insert(epoch2, 2, sentinel);
    vm.stopPrank();

    uint256 leafIndex = 0;
    uint256 leafId = (1 << DEFAULT_TREE_HEIGHT) + leafIndex;

    _consumeMessageAtEpoch(epoch1, 1, epochTree, leafIndex, leaf, fakeMessage);

    assertTrue(outbox.hasMessageBeenConsumedAtEpoch(epoch1, leafId));
    assertFalse(outbox.hasMessageBeenConsumedAtEpoch(epoch2, leafId));

    _consumeMessageAtEpoch(epoch2, 1, epochTree, leafIndex, leaf, fakeMessage);

    _consumeNullifiedMessageAtEpoch(epoch2, 1, epochTree, leafIndex, fakeMessage);
  }

  // Fuzz: inserting N non-zero roots at arbitrary distinct K values in [1, MAX] keeps each
  // (K, root) pair retrievable via getRootData/getRoots and emits matching RootAdded events.
  function testFuzzInsertManyRootsIndexingAndEvents(bytes32[] calldata _roots) public {
    uint256 n = _roots.length;
    vm.assume(n > 0 && n <= MAX_CHECKPOINTS_PER_EPOCH);

    vm.startPrank(ROLLUP_CONTRACT);
    for (uint256 i = 0; i < n; i++) {
      vm.assume(_roots[i] != bytes32(0));
      uint256 k = i + 1;
      vm.expectEmit(true, true, true, true, address(outbox));
      emit IOutbox.RootAdded(DEFAULT_EPOCH, k, _roots[i]);
      outbox.insert(DEFAULT_EPOCH, k, _roots[i]);
    }
    vm.stopPrank();

    for (uint256 i = 0; i < n; i++) {
      assertEq(outbox.getRootData(DEFAULT_EPOCH, i + 1), _roots[i]);
    }
    bytes32[MAX_CHECKPOINTS_PER_EPOCH] memory roots = outbox.getRoots(DEFAULT_EPOCH);
    for (uint256 i = 0; i < n; i++) {
      assertEq(roots[i], _roots[i]);
    }
    for (uint256 i = n; i < MAX_CHECKPOINTS_PER_EPOCH; i++) {
      assertEq(roots[i], bytes32(0));
    }
  }
}
