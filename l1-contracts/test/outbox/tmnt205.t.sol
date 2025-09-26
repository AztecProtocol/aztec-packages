// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {NaiveMerkle} from "../merkle/Naive.sol";
import {MerkleLibHelper} from "../merkle/helpers/MerkleLibHelper.sol";

contract FakeRollup {
  uint256 public getProvenBlockNumber = 0;

  function setProvenBlockNum(uint256 _provenBlockNum) public {
    getProvenBlockNumber = _provenBlockNum;
  }
}

contract Tmnt205Test is Test {
  using Hash for DataStructures.L2ToL1Msg;

  address internal constant NOT_RECIPIENT = address(0x420);
  uint256 internal constant DEFAULT_TREE_HEIGHT = 2;
  uint256 internal constant AZTEC_VERSION = 1;
  uint256 internal constant BLOCK_NUMBER = 1;

  FakeRollup internal rollup;
  Outbox internal outbox;
  MerkleLibHelper internal merkleLibHelper = new MerkleLibHelper();
  DataStructures.L2ToL1Msg[] internal $msgs;
  bytes32[] internal $txOutHashes;

  bytes32 internal $root;

  function setUp() public {
    rollup = new FakeRollup();
    outbox = new Outbox(address(rollup), AZTEC_VERSION);

    $root = _buildWonkyTree();
    vm.prank(address(rollup));
    outbox.insert(BLOCK_NUMBER, $root);

    rollup.setProvenBlockNum(BLOCK_NUMBER);
  }

  function test_replays_exact() public {
    // Consume m0 at index 0.
    // Then try to consume it again, with index 4
    // If the index is not correctly validated against path length
    // it is possible for us to pass multiple different values
    // and have them all pass.

    test_replays(1 << 2);
  }

  function test_replays(uint256 _index) public {
    // We allow this to wander to ensure that it is not possible to get it through
    // with different indices either.
    uint256 leafIndex2 = bound(_index, 0, type(uint8).max);

    DataStructures.L2ToL1Msg memory message = $msgs[0];
    uint256 leafIndex = 0;
    bytes32[] memory path = new bytes32[](2);
    path[0] = $txOutHashes[1];
    path[1] = $txOutHashes[2];

    uint256 leafId = leafIndex + (1 << path.length);

    vm.expectEmit(true, true, true, true, address(outbox));
    emit IOutbox.MessageConsumed(BLOCK_NUMBER, $root, message.sha256ToField(), leafId);
    outbox.consume(message, BLOCK_NUMBER, leafIndex, path);

    // It should always revert, here, either incorrect values or already used.
    vm.expectRevert();
    outbox.consume(message, BLOCK_NUMBER, leafIndex2, path);
  }

  function test_overrides() public {
    // Try to abuse the missing check to consume an invalid id, such that another
    // cannot consumed honestly.
    //
    // Fake the leaf index to be 8 instead of 0, so we still walk full left
    // But when the `leafId` is computed it will be 8 + 1 << 2 = 12
    // Which means that it collides with m4! Without the fix, this would allow
    // consuming m0 while blocking the legitimate consumption of m4.

    // Abuser
    DataStructures.L2ToL1Msg memory a_message = $msgs[0];
    uint256 a_leafIndex = 8;
    bytes32[] memory a_path = new bytes32[](2);
    a_path[0] = $txOutHashes[1];
    a_path[1] = $txOutHashes[2];

    bytes32 messageHash = a_message.sha256ToField();

    // The merkle lib itself should throw as index is out of bounds.
    vm.expectRevert(Errors.MerkleLib__InvalidIndexForPathLength.selector);
    merkleLibHelper.verifyMembership(a_path, messageHash, a_leafIndex, $root);

    // The outbox should revert earlier to that due to the index beyond boundary
    vm.expectRevert(abi.encodeWithSelector(Errors.Outbox__LeafIndexOutOfBounds.selector, a_leafIndex, a_path.length));
    outbox.consume(a_message, BLOCK_NUMBER, a_leafIndex, a_path);

    // Real message
    DataStructures.L2ToL1Msg memory r_message = $msgs[4];
    uint256 r_leafIndex = 4;
    bytes32[] memory r_path = new bytes32[](3);
    r_path[0] = $msgs[5].sha256ToField();
    r_path[1] = $msgs[6].sha256ToField();
    NaiveMerkle leftSubTree = new NaiveMerkle(1);
    leftSubTree.insertLeaf($txOutHashes[0]);
    leftSubTree.insertLeaf($txOutHashes[1]);
    r_path[2] = leftSubTree.computeRoot();
    outbox.consume(r_message, BLOCK_NUMBER, r_leafIndex, r_path);
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

  function _buildWonkyTree() internal returns (bytes32) {
    // Builds a wonky tree where we have a total of 7 messages over 3 txs.
    //        outHash
    //     /          \
    //    .           tx2
    //   /  \        /  \
    // m0   tx1     .   m6
    //      / \    / \
    //    .   m3  m4 m5
    //   / \
    //  m1 m2
    //
    // m0: 0 + 1 << 2 = 4
    // m1: 4 + 1 << 4 = 20
    // m2: 5 + 1 << 4 = 21
    // m3: 3 + 1 << 3 = 11
    // m4: 4 + 1 << 3 = 12
    // m5: 5 + 1 << 3 = 13
    // m6: 3 + 1 << 2 = 8

    // Create some random messages
    bytes32[] memory leaves = new bytes32[](7);
    for (uint256 i = 0; i < 7; i++) {
      DataStructures.L2ToL1Msg memory message = _fakeMessage(address(this), i);
      leaves[i] = message.sha256ToField();

      $msgs.push(message);
    }

    // tx0 has 1 message, the message leaf is the root.
    $txOutHashes.push(leaves[0]);

    // Build the subtree of tx1 with 3 message.
    bytes32 tx1SubtreeRoot;
    {
      NaiveMerkle subtree = new NaiveMerkle(1);
      subtree.insertLeaf(leaves[1]);
      subtree.insertLeaf(leaves[2]);
      tx1SubtreeRoot = subtree.computeRoot();
      NaiveMerkle tx1topTree = new NaiveMerkle(1);
      tx1topTree.insertLeaf(tx1SubtreeRoot);
      tx1topTree.insertLeaf(leaves[3]);
      $txOutHashes.push(tx1topTree.computeRoot());
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
      $txOutHashes.push(tx2TopTree.computeRoot());
    }

    // First, build the left subtree with 2 txOutHashes.
    // subtreeRoot
    //  /  \
    // tx0 tx1
    bytes32 subtreeRoot;
    {
      NaiveMerkle subtree = new NaiveMerkle(1);
      subtree.insertLeaf($txOutHashes[0]);
      subtree.insertLeaf($txOutHashes[1]);
      subtreeRoot = subtree.computeRoot();
    }

    // Then, build the top tree with the subtree root and the last txOutHash.
    //      outHash
    //    /        \
    // subtreeRoot tx2
    NaiveMerkle topTree = new NaiveMerkle(1);
    topTree.insertLeaf(subtreeRoot);
    topTree.insertLeaf($txOutHashes[2]);
    return topTree.computeRoot();
  }
}
