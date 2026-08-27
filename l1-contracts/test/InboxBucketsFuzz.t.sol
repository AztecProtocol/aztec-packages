// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {TestERC20} from "src/mock/TestERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {IInbox, MAX_MSGS_PER_BUCKET} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {InboxHarness} from "./harnesses/InboxHarness.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";

/**
 * Randomized coverage of the Inbox send path: batches of messages spread over several L1 blocks, with batches
 * large enough to exceed the per-bucket cap and roll over. Every run re-derives the whole bucket ring from the
 * message leaves the Inbox returned and the per-L1-block batch sizes, so an accumulation, rollover, or
 * snapshot-boundary bug shows up as a mismatch against the model rather than as a missing assertion. The
 * hand-written boundary cases live in InboxBuckets.t.sol; consumption and ring wraparound are out of scope.
 */
contract InboxBucketsFuzzTest is Test {
  // Number of L1 blocks a multi-block run spans. Small enough that the bucket ring never wraps.
  uint256 internal constant L1_BLOCKS = 6;

  /// Where one L1 block's batch of messages landed: the contiguous run of buckets it opened.
  struct BlockBatch {
    uint256 timestamp;
    uint256 firstSeq;
    uint256 lastSeq;
    uint256 msgCount;
  }

  InboxHarness internal inbox;
  uint256 internal version = 0;
  uint256 internal cap;

  // Every leaf the Inbox returned, in insertion order. The rolling-hash chain is recomputed from these.
  bytes32[] internal leaves;

  // One entry per L1 block that sent at least one message, in block order.
  BlockBatch[] internal batches;

  function setUp() public {
    IERC20 feeAsset = new TestERC20("Fee Asset", "FA", address(this));
    inbox = new InboxHarness(address(this), feeAsset, version, TestConstants.AZTEC_INBOX_BUCKET_RING_SIZE);
    cap = MAX_MSGS_PER_BUCKET;
  }

  /// forge-config: default.fuzz.runs = 128
  function testFuzzBucketsAcrossL1Blocks(
    uint8[L1_BLOCKS] memory _msgsPerBlock,
    uint16[L1_BLOCKS] memory _blockGaps,
    uint8 _rolloverBlock,
    uint16 _rolloverCount,
    uint256 _seed
  ) public {
    // One block per run always crosses the per-bucket cap, so every run exercises a rollover alongside the
    // ordinary same-block accumulation and new-block bucket opening.
    uint256 rolloverBlock = bound(_rolloverBlock, 0, L1_BLOCKS - 1);
    uint256 rolloverCount = bound(_rolloverCount, cap + 1, cap + 8);

    for (uint256 b = 0; b < L1_BLOCKS; b++) {
      if (b > 0) {
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + bound(_blockGaps[b], 1, 3600));
      }
      _sendBlock(b == rolloverBlock ? rolloverCount : bound(_msgsPerBlock[b], 0, 12), _seed);
    }

    _assertBucketRing();
  }

  /// forge-config: default.fuzz.runs = 32
  function testFuzzRolloverChainWithinOneL1Block(uint16 _msgCount, uint256 _seed) public {
    // Several buckets' worth of messages in a single L1 block: each message arriving at a full bucket opens the
    // next ring slot at the same timestamp, so the block owns a run of buckets rather than one.
    _sendBlock(bound(_msgCount, cap + 1, 2 * cap + 5), _seed);
    _assertBucketRing();
  }

  // Sends `_count` messages in the current L1 block and checks what the batch did to the ring: it opened one
  // bucket per cap-sized slice, every bucket it opened carries this block's timestamp, and the bucket the
  // previous L1 block left behind is frozen.
  function _sendBlock(uint256 _count, uint256 _seed) internal {
    uint256 seqBefore = inbox.getCurrentBucketSeq();
    IInbox.InboxBucket memory frozen = inbox.getBucket(seqBefore);
    uint256 totalBefore = leaves.length;

    for (uint256 i = 0; i < _count; i++) {
      _send(_seed);
    }

    uint256 seqAfter = inbox.getCurrentBucketSeq();
    assertEq(seqAfter, seqBefore + (_count + cap - 1) / cap, "buckets opened by this L1 block");
    _assertBucketEq(inbox.getBucket(seqBefore), frozen, "bucket left by the previous L1 block is frozen");

    if (_count == 0) {
      return;
    }

    for (uint256 seq = seqBefore + 1; seq <= seqAfter; seq++) {
      IInbox.InboxBucket memory bucket = inbox.getBucket(seq);
      uint256 sliceStart = (seq - seqBefore - 1) * cap;
      uint256 sliceSize = _count - sliceStart < cap ? _count - sliceStart : cap;
      assertEq(bucket.msgCount, sliceSize, "messages absorbed into bucket");
      assertEq(bucket.timestamp, block.timestamp, "bucket carries the sending L1 block's timestamp");
      assertEq(bucket.totalMsgCount, totalBefore + sliceStart + sliceSize, "bucket cumulative total");
    }

    batches.push(BlockBatch({timestamp: block.timestamp, firstSeq: seqBefore + 1, lastSeq: seqAfter, msgCount: _count}));
  }

  // Sends one message with fuzz-derived contents, checking the Inbox agrees on its leaf and compact index.
  function _send(uint256 _seed) internal {
    uint256 index = leaves.length;
    DataStructures.L2Actor memory recipient = DataStructures.L2Actor({actor: _field(_seed, index, 0), version: version});
    bytes32 content = _field(_seed, index, 1);
    bytes32 secretHash = _field(_seed, index, 2);

    (bytes32 leaf, uint256 insertedIndex) = inbox.sendL2Message(recipient, content, secretHash);

    // The leaf commits to the message and to the compact index the Inbox assigned it, so recomputing it from the
    // sent contents pins both, and the chain recomputed from these leaves is anchored to the message stream.
    bytes32 expectedLeaf = Hash.sha256ToField(
      DataStructures.L1ToL2Msg({
        sender: DataStructures.L1Actor(address(this), block.chainid),
        recipient: recipient,
        content: content,
        secretHash: secretHash,
        index: index
      })
    );
    assertEq(insertedIndex, index, "compact message index");
    assertEq(leaf, expectedLeaf, "message leaf");

    leaves.push(leaf);
  }

  // Re-derives every bucket in the ring from the recorded leaves and per-L1-block batches.
  function _assertBucketRing() internal {
    uint256 current = inbox.getCurrentBucketSeq();
    bytes32 rollingHash = 0;
    uint256 counted = 0;
    uint256 previousTimestamp = 0;

    for (uint256 seq = 1; seq <= current; seq++) {
      IInbox.InboxBucket memory bucket = inbox.getBucket(seq);
      assertGt(bucket.msgCount, 0, "bucket holds at least one message");
      assertLe(bucket.msgCount, cap, "per-bucket cap");

      for (uint256 i = 0; i < bucket.msgCount; i++) {
        // The first message of each bucket opens it and so takes the bucket-start separator; every message of the
        // bucket links with the bucket's timestamp.
        rollingHash = Hash.accumulateInboxRollingHash(rollingHash, leaves[counted + i], i == 0, bucket.timestamp);
      }
      counted += bucket.msgCount;

      assertEq(bucket.rollingHash, rollingHash, "bucket rolling hash recomputed from the message leaves");
      assertEq(bucket.totalMsgCount, counted, "cumulative total is the sum of the per-bucket counts");
      assertGe(bucket.timestamp, previousTimestamp, "bucket timestamps never go backwards");
      previousTimestamp = bucket.timestamp;
    }

    assertEq(counted, leaves.length, "every message sent is in a bucket");
    assertEq(inbox.getTotalMessagesInserted(), leaves.length, "inbox total matches messages sent");

    // Bucket boundaries align with L1 blocks: each block owns a contiguous run of buckets holding exactly the
    // messages it sent, all stamped with its own timestamp, so no later block extended an earlier block's bucket.
    uint256 expectedFirstSeq = 1;
    for (uint256 b = 0; b < batches.length; b++) {
      BlockBatch memory batch = batches[b];
      assertEq(batch.firstSeq, expectedFirstSeq, "L1 block's buckets follow the previous block's");

      uint256 batchCount = 0;
      for (uint256 seq = batch.firstSeq; seq <= batch.lastSeq; seq++) {
        IInbox.InboxBucket memory bucket = inbox.getBucket(seq);
        assertEq(bucket.timestamp, batch.timestamp, "bucket timestamp is its L1 block's");
        batchCount += bucket.msgCount;
      }

      assertEq(batchCount, batch.msgCount, "L1 block's messages are all in that block's buckets");
      expectedFirstSeq = batch.lastSeq + 1;
    }
    assertEq(expectedFirstSeq - 1, current, "no buckets outside the recorded L1 blocks");
  }

  function _assertBucketEq(IInbox.InboxBucket memory _actual, IInbox.InboxBucket memory _expected, string memory _err)
    internal
  {
    assertEq(_actual.rollingHash, _expected.rollingHash, _err);
    assertEq(_actual.totalMsgCount, _expected.totalMsgCount, _err);
    assertEq(_actual.timestamp, _expected.timestamp, _err);
    assertEq(_actual.msgCount, _expected.msgCount, _err);
  }

  // Fuzz-derived field element, distinct per message and per message field.
  function _field(uint256 _seed, uint256 _index, uint256 _tag) internal pure returns (bytes32) {
    return bytes32(uint256(keccak256(abi.encodePacked(_seed, _index, _tag))) % Constants.P);
  }
}
