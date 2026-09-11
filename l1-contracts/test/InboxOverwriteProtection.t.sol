// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {TestERC20} from "src/mock/TestERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {IInbox, MAX_MSGS_PER_BUCKET} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {MIN_BUCKET_RING_SIZE} from "@aztec/core/messagebridge/Inbox.sol";
import {InboxHarness} from "./harnesses/InboxHarness.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";

// Sends a batch of messages in one L1 transaction and lets a revert from any of them bubble out, taking the
// whole batch with it. Models a portal or bridge that fans several messages out per call.
contract RevertingBatchSender {
  function sendMany(IInbox _inbox, uint256 _version, uint256 _count) external {
    for (uint256 i = 0; i < _count; i++) {
      _inbox.sendL2Message(
        DataStructures.L2Actor({actor: bytes32(uint256(0x5000 + i)), version: _version}),
        bytes32(uint256(0x6000 + i)),
        bytes32(uint256(0x7000 + i))
      );
    }
  }
}

// Same batch, but each send is wrapped in try/catch, so a revert on one message does not undo the others.
contract CatchingBatchSender {
  function sendMany(IInbox _inbox, uint256 _version, uint256 _count) external returns (uint256 succeeded) {
    for (uint256 i = 0; i < _count; i++) {
      try _inbox.sendL2Message(
        DataStructures.L2Actor({actor: bytes32(uint256(0x5000 + i)), version: _version}),
        bytes32(uint256(0x6000 + i)),
        bytes32(uint256(0x7000 + i))
      ) {
        succeeded += 1;
      } catch {}
    }
  }
}

/**
 * Overwrite protection on the bucket ring: opening a bucket reuses the ring slot of the bucket
 * BUCKET_RING_SIZE positions back, and the open is refused unless the proven chain has consumed that slot.
 * The Inbox in these tests is owned by the test contract, which stands in for the rollup and pushes the
 * proven-consumed record directly.
 */
contract InboxOverwriteProtectionTest is Test {
  uint256 internal constant RING_SIZE = MIN_BUCKET_RING_SIZE;

  InboxHarness internal inbox;
  uint256 internal version = 0;

  function setUp() public {
    inbox = _deployInbox(address(this));
  }

  function _deployInbox(address _rollup) internal returns (InboxHarness) {
    IERC20 feeAsset = new TestERC20("Fee Asset", "FA", address(this));
    return new InboxHarness(_rollup, feeAsset, version, RING_SIZE);
  }

  function _send(InboxHarness _inbox, uint256 _salt) internal returns (bytes32 leaf, uint256 index) {
    (leaf, index) = _inbox.sendL2Message(
      DataStructures.L2Actor({actor: bytes32(uint256(0x1000 + _salt)), version: version}),
      bytes32(uint256(0x2000 + _salt)),
      bytes32(uint256(0x3000 + _salt))
    );
  }

  // Sends without touching the return values: an intercepted revert leaves no returndata to decode, so a send
  // fronted by `vm.expectRevert` must not be the one that assigns them.
  function _sendExpectingOverwriteRevert(InboxHarness _inbox, uint256 _salt, uint64 _evicted) internal {
    DataStructures.L2Actor memory recipient =
      DataStructures.L2Actor({actor: bytes32(uint256(0x1000 + _salt)), version: version});
    bytes32 content = bytes32(uint256(0x2000 + _salt));
    bytes32 secretHash = bytes32(uint256(0x3000 + _salt));

    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__WouldOverwriteUnconsumedBucket.selector, _evicted));
    _inbox.sendL2Message(recipient, content, secretHash);
  }

  // Opens `_count` buckets, one per L1 block: a strictly larger block timestamp forces the message into a
  // freshly opened bucket. The last bucket is left open in the current L1 block.
  function _openBuckets(InboxHarness _inbox, uint256 _count) internal {
    uint256 startSeq = _inbox.getCurrentBucketSeq();
    for (uint256 i = 0; i < _count; i++) {
      vm.roll(block.number + 1);
      vm.warp(block.timestamp + 12);
      _send(_inbox, startSeq + i);
    }
    assertEq(_inbox.getCurrentBucketSeq(), startSeq + _count, "buckets opened");
  }

  // Fills the ring exactly once. Opening bucket RING_SIZE evicts the genesis bucket, which is consumed from the
  // start, so it is allowed; the next bucket opening is the first one that can be refused.
  function _reachRingWall(InboxHarness _inbox) internal {
    _openBuckets(_inbox, RING_SIZE);
    assertEq(_inbox.getRingHeadroom(), 0, "ring wall reached");
  }

  function _assertBucketEq(IInbox.InboxBucket memory _actual, IInbox.InboxBucket memory _expected, string memory _err)
    internal
    pure
  {
    assertEq(_actual.rollingHash, _expected.rollingHash, _err);
    assertEq(_actual.totalMsgCount, _expected.totalMsgCount, _err);
    assertEq(_actual.timestamp, _expected.timestamp, _err);
    assertEq(_actual.msgCount, _expected.msgCount, _err);
  }

  // With nothing proven-consumed, the ring fills to one wrap and then refuses the bucket that would overwrite
  // bucket 1: its messages are still in flight, so the send is what has to fail, and it must fail without
  // leaving a trace.
  function testWrapIntoUnconsumedReverts() public {
    _reachRingWall(inbox);

    IInbox.InboxBucket memory head = inbox.getBucket(RING_SIZE);
    IInbox.InboxBucket memory oldest = inbox.getBucket(1);
    uint64 totalBefore = inbox.getTotalMessagesInserted();
    assertEq(oldest.totalMsgCount, 1, "bucket 1 holds the first message");

    vm.roll(block.number + 1);
    vm.warp(block.timestamp + 12);
    _sendExpectingOverwriteRevert(inbox, 999, 1);

    assertEq(inbox.getCurrentBucketSeq(), RING_SIZE, "current bucket unchanged");
    assertEq(inbox.getTotalMessagesInserted(), totalBefore, "no message inserted");
    _assertBucketEq(inbox.getBucket(RING_SIZE), head, "head bucket untouched");
    _assertBucketEq(inbox.getBucket(1), oldest, "oldest unconsumed bucket untouched");
    assertEq(inbox.getRingHeadroom(), 0, "still no headroom");
  }

  // The check compares the proven-consumed record against the exact bucket being evicted: releasing bucket 1
  // unlocks exactly one more opening, and the one after it stops on bucket 2.
  function testExactBoundaryUnlocksOneBucket() public {
    _reachRingWall(inbox);

    vm.roll(block.number + 1);
    vm.warp(block.timestamp + 12);
    _sendExpectingOverwriteRevert(inbox, 1000, 1);

    inbox.markProvenConsumed(1);
    _send(inbox, 1000);
    assertEq(inbox.getCurrentBucketSeq(), RING_SIZE + 1, "releasing the evicted bucket allowed the opening");

    vm.roll(block.number + 1);
    vm.warp(block.timestamp + 12);
    _sendExpectingOverwriteRevert(inbox, 1001, 2);
    assertEq(inbox.getCurrentBucketSeq(), RING_SIZE + 1, "one release unlocks one opening only");
  }

  // A halted send is resumable: once the proven chain releases the bucket, the same message goes in, extends the
  // rolling-hash chain from the ring head, and takes the index the failed attempt left unused.
  function testResumeAfterProvingPreservesChain() public {
    _reachRingWall(inbox);

    bytes32 headHash = inbox.getBucket(RING_SIZE).rollingHash;
    uint64 totalBefore = inbox.getTotalMessagesInserted();

    vm.roll(block.number + 1);
    vm.warp(block.timestamp + 12);
    _sendExpectingOverwriteRevert(inbox, 1234, 1);

    inbox.markProvenConsumed(1);
    (bytes32 leaf, uint256 index) = _send(inbox, 1234);

    IInbox.InboxBucket memory opened = inbox.getBucket(RING_SIZE + 1);
    assertEq(opened.rollingHash, Hash.accumulateInboxRollingHash(headHash, leaf), "chain continues from the ring head");
    assertEq(index, totalBefore, "the failed send consumed no index");
    assertEq(opened.totalMsgCount, totalBefore + 1, "cumulative total advanced by one");
  }

  // Only proven consumption releases a bucket. L1 blocks going by does not, so a chain that stops proving keeps
  // the Inbox halted for as long as it stalls rather than recovering on its own.
  function testTimeAloneDoesNotUnlock() public {
    _reachRingWall(inbox);

    for (uint256 i = 0; i < 5; i++) {
      vm.roll(block.number + 1);
      vm.warp(block.timestamp + 12);
      _sendExpectingOverwriteRevert(inbox, 2000 + i, 1);
      assertEq(inbox.getCurrentBucketSeq(), RING_SIZE, "still at the ring wall");
      assertEq(inbox.getRingHeadroom(), 0, "still no headroom");
    }

    inbox.markProvenConsumed(1);
    _send(inbox, 2100);
    assertEq(inbox.getCurrentBucketSeq(), RING_SIZE + 1, "proven consumption is the only unlock");
  }

  // The proven-consumed record decides which ring slots may be overwritten, so only the rollup may move it.
  function testMarkProvenConsumedOnlyRollup() public {
    InboxHarness rollupOwned = _deployInbox(address(0xbeef));
    _send(rollupOwned, 0);

    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__Unauthorized.selector));
    rollupOwned.markProvenConsumed(1);
    assertEq(rollupOwned.getProvenConsumedBucketSeq(), 0, "record unchanged");

    vm.prank(address(0xbeef));
    rollupOwned.markProvenConsumed(1);
    assertEq(rollupOwned.getProvenConsumedBucketSeq(), 1, "the rollup moved the record");
  }

  // The record only moves forward: the rollup pushes it on every proven-tip advance, and a shorter epoch proof
  // or a re-submission must not walk it back and re-lock slots the ring may already have reused.
  function testMarkProvenConsumedMonotonic() public {
    _openBuckets(inbox, 6);

    inbox.markProvenConsumed(5);
    assertEq(inbox.getProvenConsumedBucketSeq(), 5, "record set");

    inbox.markProvenConsumed(3);
    assertEq(inbox.getProvenConsumedBucketSeq(), 5, "a lower value is a no-op");

    inbox.markProvenConsumed(5);
    assertEq(inbox.getProvenConsumedBucketSeq(), 5, "an equal value is a no-op");

    inbox.markProvenConsumed(6);
    assertEq(inbox.getProvenConsumedBucketSeq(), 6, "a higher value advances");
  }

  // A record ahead of the newest bucket would release ring slots that hold nothing yet, so it is rejected
  // rather than clamped: it can only come from the rollup and the Inbox disagreeing about the window.
  function testMarkProvenConsumedAheadOfCurrentReverts() public {
    _openBuckets(inbox, 3);
    uint64 current = inbox.getCurrentBucketSeq();

    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__BucketOutOfWindow.selector, current + 1, current));
    inbox.markProvenConsumed(current + 1);
    assertEq(inbox.getProvenConsumedBucketSeq(), 0, "record unchanged");
  }

  // Headroom counts bucket openings left, not messages: it drops by one per bucket opened, is untouched by a
  // message absorbed into the open bucket, and rises by exactly what the proven chain releases.
  function testRingHeadroomSemantics() public {
    assertEq(inbox.getRingHeadroom(), RING_SIZE, "genesis: the whole ring is available");

    _send(inbox, 0);
    assertEq(inbox.getRingHeadroom(), RING_SIZE - 1, "the first message opened one bucket");

    _send(inbox, 1);
    assertEq(inbox.getRingHeadroom(), RING_SIZE - 1, "absorbing into the open bucket opens nothing");

    _openBuckets(inbox, 3);
    assertEq(inbox.getRingHeadroom(), RING_SIZE - 4, "one opening each");

    inbox.markProvenConsumed(2);
    assertEq(inbox.getRingHeadroom(), RING_SIZE - 2, "released two buckets");

    inbox.markProvenConsumed(4);
    assertEq(inbox.getRingHeadroom(), RING_SIZE, "released the remaining two");

    // At zero headroom the wall applies to bucket openings only: a bucket still open in the current L1 block and
    // below the per-bucket cap keeps absorbing, so messages are not blocked until a rollover is needed.
    InboxHarness wallInbox = _deployInbox(address(this));
    _reachRingWall(wallInbox);

    uint64 totalBefore = wallInbox.getTotalMessagesInserted();
    _send(wallInbox, 4242);
    assertEq(wallInbox.getTotalMessagesInserted(), totalBefore + 1, "absorbed at zero headroom");
    assertEq(wallInbox.getCurrentBucketSeq(), RING_SIZE, "no bucket opened");
    assertEq(wallInbox.getRingHeadroom(), 0, "headroom still zero");

    vm.roll(block.number + 1);
    vm.warp(block.timestamp + 12);
    _sendExpectingOverwriteRevert(wallInbox, 4243, 1);
  }

  // A batching caller that lets a revert bubble loses the whole batch at the ring wall: the head bucket is full,
  // so the batch's first send has to roll over into a slot that is not released yet.
  function testRevertingBatchIsAtomic() public {
    _reachRingWall(inbox);
    for (uint256 i = 1; i < MAX_MSGS_PER_BUCKET; i++) {
      _send(inbox, 3000 + i);
    }
    assertEq(inbox.getBucket(RING_SIZE).msgCount, MAX_MSGS_PER_BUCKET, "head bucket full");

    uint64 totalBefore = inbox.getTotalMessagesInserted();
    RevertingBatchSender sender = new RevertingBatchSender();

    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__WouldOverwriteUnconsumedBucket.selector, uint64(1)));
    sender.sendMany(inbox, version, 5);

    assertEq(inbox.getTotalMessagesInserted(), totalBefore, "no message from the batch landed");
    assertEq(inbox.getCurrentBucketSeq(), RING_SIZE, "no bucket opened");
  }

  // A batching caller that swallows the revert keeps the sends that fit before the wall: the head bucket is one
  // short of the per-bucket cap, so the first send absorbs and only the rollovers after it are refused.
  function testCatchingBatchKeepsPreWallSends() public {
    _reachRingWall(inbox);
    for (uint256 i = 1; i < MAX_MSGS_PER_BUCKET - 1; i++) {
      _send(inbox, 4000 + i);
    }
    assertEq(inbox.getBucket(RING_SIZE).msgCount, MAX_MSGS_PER_BUCKET - 1, "head bucket one short of full");

    uint64 totalBefore = inbox.getTotalMessagesInserted();
    CatchingBatchSender sender = new CatchingBatchSender();

    uint256 succeeded = sender.sendMany(inbox, version, 5);

    assertEq(succeeded, 1, "only the send that fit before the wall");
    assertEq(inbox.getTotalMessagesInserted(), totalBefore + 1, "exactly one message landed");
    assertEq(inbox.getCurrentBucketSeq(), RING_SIZE, "no bucket opened");
  }

  /// forge-config: default.fuzz.runs = 32
  // Random interleavings of bucket openings and proven-consumption releases, starting at the ring wall so every
  // run exercises both sides of the check, against a model of the ring: no sequence of the two overwrites a
  // bucket the proven chain has not released, and every refused send names the exact bucket it would have
  // destroyed.
  function testFuzzNoUnconsumedOverwrite(uint256 _seed) public {
    _reachRingWall(inbox);
    uint256 modelCurrent = RING_SIZE;

    uint256 modelProven = 0;
    uint256 modelTotal = modelCurrent;

    for (uint256 i = 0; i < 16; i++) {
      uint256 entropy = uint256(keccak256(abi.encodePacked(_seed, i)));

      if (entropy % 3 == 0) {
        uint256 target = modelProven + ((entropy >> 8) % 8);
        if (target > modelCurrent) {
          target = modelCurrent;
        }
        inbox.markProvenConsumed(uint64(target));
        modelProven = target;
        continue;
      }

      vm.roll(block.number + 1);
      vm.warp(block.timestamp + 12);

      uint256 opening = modelCurrent + 1;
      if (opening < RING_SIZE || modelProven >= opening - RING_SIZE) {
        _send(inbox, 5000 + i);
        modelCurrent = opening;
        modelTotal += 1;
      } else {
        _sendExpectingOverwriteRevert(inbox, 5000 + i, uint64(opening - RING_SIZE));
      }
    }

    assertEq(inbox.getCurrentBucketSeq(), modelCurrent, "current bucket tracks the model");
    assertEq(inbox.getProvenConsumedBucketSeq(), modelProven, "proven-consumed record tracks the model");
    assertEq(inbox.getRingHeadroom(), modelProven + RING_SIZE - modelCurrent, "headroom tracks the model");
    assertEq(inbox.getTotalMessagesInserted(), modelTotal, "every allowed send landed and no refused one did");

    if (modelProven < modelCurrent) {
      // Every bucket in this run holds exactly one message, so the oldest unreleased bucket's cumulative total
      // is its own sequence number: a wrapped-over slot would report someone else's.
      IInbox.InboxBucket memory oldest = inbox.getBucket(modelProven + 1);
      assertEq(oldest.msgCount, 1, "oldest unreleased bucket holds its own message");
      assertEq(oldest.totalMsgCount, modelProven + 1, "oldest unreleased bucket was never overwritten");
    }
  }
}
