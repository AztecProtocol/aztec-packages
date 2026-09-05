// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {TestERC20} from "src/mock/TestERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {IInbox, MAX_MSGS_PER_BUCKET} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {ENDPOINT_WALKBACK_PROBES, MIN_BUCKET_RING_SIZE} from "@aztec/core/messagebridge/Inbox.sol";
import {InboxHarness} from "./harnesses/InboxHarness.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";

/**
 * `getBucketAtOrBeforeTotal`: the newest live bucket whose cumulative total is at or below a bound. Every test
 * compares against a brute-force walk over `getBucket`, which is the reference definition of "live".
 */
contract InboxBucketSearchTest is Test {
  uint256 internal constant RING_SIZE = MIN_BUCKET_RING_SIZE;

  InboxHarness internal inbox;
  uint256 internal version = 0;

  function setUp() public {
    IERC20 feeAsset = new TestERC20("Fee Asset", "FA", address(this));
    inbox = new InboxHarness(address(this), feeAsset, version, RING_SIZE);
  }

  function _send(uint256 _salt) internal {
    inbox.sendL2Message(
      DataStructures.L2Actor({actor: bytes32(uint256(0x1000 + _salt)), version: version}),
      bytes32(uint256(0x2000 + _salt)),
      bytes32(uint256(0x3000 + _salt))
    );
  }

  // Opens one bucket per L1 block, each holding `_sizes[i]` messages.
  function _openBuckets(uint256[] memory _sizes) internal {
    for (uint256 i = 0; i < _sizes.length; i++) {
      vm.roll(block.number + 1);
      vm.warp(block.timestamp + 12);
      for (uint256 j = 0; j < _sizes[i]; j++) {
        _send(inbox.getTotalMessagesInserted());
      }
    }
  }

  // Opens `_count` single-message buckets, one per L1 block, keeping proven consumption trailing so the ring may
  // wrap past its oldest entries.
  function _openSingleMessageBuckets(uint256 _count) internal {
    for (uint256 i = 0; i < _count; i++) {
      vm.roll(block.number + 1);
      vm.warp(block.timestamp + 12);
      _send(inbox.getTotalMessagesInserted());
      inbox.markProvenConsumed(inbox.getCurrentBucketSeq() - 1);
    }
  }

  function _oldestLiveSeq() internal view returns (uint256) {
    uint256 current = inbox.getCurrentBucketSeq();
    if (current >= RING_SIZE) {
      return current - RING_SIZE + 1;
    }
    return 0;
  }

  // Reference: walks every live bucket from newest to oldest and returns the first whose total fits the bound.
  function _bruteForce(uint64 _bound) internal view returns (bool found, uint256 seq) {
    uint256 oldest = _oldestLiveSeq();
    for (uint256 s = inbox.getCurrentBucketSeq(); s >= oldest; s--) {
      if (inbox.getBucket(s).totalMsgCount <= _bound) {
        return (true, s);
      }
      if (s == 0) {
        break;
      }
    }
    return (false, 0);
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

  // Asserts the search agrees with the brute-force reference for `_bound`, including the not-found revert.
  function _assertAgreesWithReference(uint64 _bound) internal {
    (bool found, uint256 expectedSeq) = _bruteForce(_bound);
    if (!found) {
      uint64 oldestTotal = inbox.getBucket(_oldestLiveSeq()).totalMsgCount;
      vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__NoBucketAtOrBeforeTotal.selector, _bound, oldestTotal));
      inbox.getBucketAtOrBeforeTotal(_bound);
      return;
    }
    (uint64 seq, IInbox.InboxBucket memory bucket) = inbox.getBucketAtOrBeforeTotal(_bound);
    assertEq(seq, expectedSeq, "sequence");
    _assertBucketEq(bucket, inbox.getBucket(expectedSeq), "bucket data");
  }

  // Storage slot holding the packed (totalMsgCount, timestamp, msgCount) word of the ring entry for `_seq`.
  function _totalsSlotOf(uint256 _seq) internal pure returns (bytes32) {
    // `buckets` is the first storage variable; the struct's bytes32 occupies the base slot, the packed word the next.
    return bytes32(uint256(keccak256(abi.encode(_seq % RING_SIZE, uint256(0)))) + 1);
  }

  function _countReadsOf(bytes32[] memory _reads, bytes32 _slot) internal pure returns (uint256 count) {
    for (uint256 i = 0; i < _reads.length; i++) {
      if (_reads[i] == _slot) {
        count++;
      }
    }
  }

  function testGenesisOnEmptyInbox() public view {
    (uint64 seq, IInbox.InboxBucket memory bucket) = inbox.getBucketAtOrBeforeTotal(0);
    assertEq(seq, 0, "genesis seq for bound 0");
    assertEq(bucket.totalMsgCount, 0, "genesis total");

    (seq,) = inbox.getBucketAtOrBeforeTotal(type(uint64).max);
    assertEq(seq, 0, "genesis is the only bucket, whatever the bound");
  }

  // With fewer live entries than probes, the walk reaches genesis and stops there: the bound is never below the
  // genesis total, so nothing is dereferenced below sequence zero.
  function testFewerLiveEntriesThanProbes() public {
    uint256[] memory sizes = new uint256[](2);
    sizes[0] = 3;
    sizes[1] = 2;
    _openBuckets(sizes);
    assertEq(inbox.getCurrentBucketSeq(), 2, "two buckets plus genesis");

    _assertAgreesWithReference(0); // genesis
    _assertAgreesWithReference(2); // still genesis: bucket 1 ends at 3
    _assertAgreesWithReference(3); // exact hit on bucket 1
    _assertAgreesWithReference(4); // interior of bucket 2
    _assertAgreesWithReference(5); // exact hit on the current bucket
    _assertAgreesWithReference(type(uint64).max);
  }

  // Exact bounds land on the bucket ending there; interior bounds fall back to the previous bucket.
  function testExactAndInteriorBounds() public {
    uint256[] memory sizes = new uint256[](4);
    sizes[0] = 1;
    sizes[1] = 3;
    sizes[2] = 2;
    sizes[3] = 4;
    _openBuckets(sizes);
    // Totals: 1, 4, 6, 10.
    (uint64 seq,) = inbox.getBucketAtOrBeforeTotal(4);
    assertEq(seq, 2, "exact bound on bucket 2");
    (seq,) = inbox.getBucketAtOrBeforeTotal(5);
    assertEq(seq, 2, "interior of bucket 3 resolves to bucket 2");
    (seq,) = inbox.getBucketAtOrBeforeTotal(9);
    assertEq(seq, 3, "interior of the current bucket resolves to bucket 3");
    for (uint64 bound = 0; bound <= 11; bound++) {
      _assertAgreesWithReference(bound);
    }
  }

  // A full bucket and the spill-over bucket that follows it in the same L1 block are distinct endpoints.
  function testFullAndSpilledBucketsInOneBlock() public {
    uint256 cap = MAX_MSGS_PER_BUCKET;
    assertEq(cap, Constants.MAX_L1_TO_L2_MSGS_PER_BLOCK, "bucket cap is the generated per-block cap");
    for (uint256 i = 0; i < cap + 1; i++) {
      _send(i);
    }
    assertEq(inbox.getCurrentBucketSeq(), 2, "cap plus one spills into a second bucket");

    (uint64 seq, IInbox.InboxBucket memory bucket) = inbox.getBucketAtOrBeforeTotal(uint64(cap));
    assertEq(seq, 1, "the full bucket");
    assertEq(bucket.msgCount, cap, "full");
    (seq, bucket) = inbox.getBucketAtOrBeforeTotal(uint64(cap + 1));
    assertEq(seq, 2, "the spilled bucket");
    assertEq(bucket.msgCount, 1, "one spilled message");
    (seq,) = inbox.getBucketAtOrBeforeTotal(uint64(cap - 1));
    assertEq(seq, 0, "nothing but genesis fits below the full bucket");
  }

  // Each of the walkback probes can be the one that hits, and the probe count bounds the storage reads.
  function testHitOnEachWalkbackProbe() public {
    uint256[] memory sizes = new uint256[](8);
    for (uint256 i = 0; i < sizes.length; i++) {
      sizes[i] = 2;
    }
    _openBuckets(sizes);
    uint256 current = inbox.getCurrentBucketSeq();

    for (uint256 probe = 0; probe < ENDPOINT_WALKBACK_PROBES; probe++) {
      uint256 target = current - probe;
      uint64 bound = inbox.getBucket(target).totalMsgCount;

      vm.record();
      (uint64 seq,) = inbox.getBucketAtOrBeforeTotal(bound);
      (bytes32[] memory reads,) = vm.accesses(address(inbox));

      assertEq(seq, target, "probe hit");
      // One read of the sequence word, one totals read per probed entry, and the two-slot copy of the result.
      assertLe(reads.length, 1 + (probe + 1) + 2, "walk stays within the probed entries");
      for (uint256 s = target + 1; s <= current; s++) {
        assertEq(_countReadsOf(reads, _totalsSlotOf(s)), 1, "each missed entry is probed exactly once");
      }
    }
  }

  // Bounds just beyond the walk fall through to the binary search, which agrees with the reference and never
  // re-reads the entries the walk already excluded.
  function testFallbackBeyondWalkback() public {
    uint256[] memory sizes = new uint256[](12);
    for (uint256 i = 0; i < sizes.length; i++) {
      sizes[i] = 3;
    }
    _openBuckets(sizes);
    uint256 current = inbox.getCurrentBucketSeq();
    uint256 firstUnscanned = current - ENDPOINT_WALKBACK_PROBES;

    // Exactly the first entry beyond the walk, then the interior just below it.
    uint64 bound = inbox.getBucket(firstUnscanned).totalMsgCount;
    vm.record();
    (uint64 seq,) = inbox.getBucketAtOrBeforeTotal(bound);
    (bytes32[] memory reads,) = vm.accesses(address(inbox));
    assertEq(seq, firstUnscanned, "first unscanned entry");
    for (uint256 s = firstUnscanned + 1; s <= current; s++) {
      assertEq(_countReadsOf(reads, _totalsSlotOf(s)), 1, "scanned suffix is not searched again");
    }

    (seq,) = inbox.getBucketAtOrBeforeTotal(bound - 1);
    assertEq(seq, firstUnscanned - 1, "interior below the first unscanned entry");

    for (uint64 b = 0; b <= uint64(current * 3 + 1); b++) {
      _assertAgreesWithReference(b);
    }
  }

  // Once the ring has wrapped, the genesis bucket and every other overwritten entry drop out of the candidates;
  // the oldest retained bucket is a hit at its own total and the search reverts one below it.
  function testRingWrapExcludesOverwrittenEntries() public {
    uint256 extra = 40;
    _openSingleMessageBuckets(RING_SIZE + extra);
    uint256 current = inbox.getCurrentBucketSeq();
    assertEq(current, RING_SIZE + extra, "one bucket per block");
    uint256 oldest = current - RING_SIZE + 1;
    assertEq(oldest, extra + 1, "oldest live entry");

    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__BucketOutOfWindow.selector, 0, current));
    inbox.getBucket(0);

    // The bound qualifies the overwritten genesis, but genesis is no longer live; the ring slot it shared now
    // holds bucket RING_SIZE, whose total is far above the bound.
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__NoBucketAtOrBeforeTotal.selector, 0, oldest));
    inbox.getBucketAtOrBeforeTotal(0);

    // Totals equal the sequence here, so the oldest entry hits exactly at its own total and misses one below.
    (uint64 seq,) = inbox.getBucketAtOrBeforeTotal(uint64(oldest));
    assertEq(seq, oldest, "oldest live entry is a hit at its total");
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__NoBucketAtOrBeforeTotal.selector, oldest - 1, oldest));
    inbox.getBucketAtOrBeforeTotal(uint64(oldest - 1));

    // The whole live window agrees with the reference, including bounds that only the binary search reaches.
    for (uint256 s = oldest; s <= current; s += 7) {
      _assertAgreesWithReference(uint64(s));
    }
    _assertAgreesWithReference(uint64(current));
    _assertAgreesWithReference(type(uint64).max);
  }

  // The binary search reads a logarithmic number of entries on top of the fixed walk.
  function testFallbackReadsAreLogarithmic() public {
    _openSingleMessageBuckets(RING_SIZE + 3);
    uint256 oldest = _oldestLiveSeq();

    vm.record();
    (uint64 seq,) = inbox.getBucketAtOrBeforeTotal(uint64(oldest));
    (bytes32[] memory reads,) = vm.accesses(address(inbox));
    assertEq(seq, oldest, "oldest entry via the fallback");

    uint256 log2Ring = 0;
    while ((1 << log2Ring) < RING_SIZE) {
      log2Ring++;
    }
    // Sequence word, the probes, the oldest-entry check, at most log2(ring) bisection reads, and the result copy.
    assertLe(reads.length, 1 + ENDPOINT_WALKBACK_PROBES + 1 + log2Ring + 2, "bounded search");
  }

  // At the sequence type's maximum, the live-interval arithmetic must not overflow and the returned sequence must
  // survive the narrowing cast. The ring is populated by hand since no test can send that many messages.
  function testMaximumSequenceArithmetic() public {
    uint64 current = type(uint64).max;
    uint64 oldest = current - uint64(RING_SIZE) + 1;
    inbox.setCurrentBucketSeq(current);
    for (uint64 s = oldest;; s++) {
      uint64 total = 1000 + (s - oldest) * 2;
      inbox.setBucket(
        s,
        IInbox.InboxBucket({rollingHash: bytes32(uint256(s)), totalMsgCount: total, timestamp: uint64(s), msgCount: 2})
      );
      if (s == current) {
        break;
      }
    }

    (uint64 seq, IInbox.InboxBucket memory bucket) = inbox.getBucketAtOrBeforeTotal(type(uint64).max);
    assertEq(seq, current, "current bucket at the sequence maximum");
    assertEq(bucket.rollingHash, bytes32(uint256(current)), "current bucket data");

    (seq,) = inbox.getBucketAtOrBeforeTotal(1000);
    assertEq(seq, oldest, "oldest live entry, found by the fallback");
    (seq,) = inbox.getBucketAtOrBeforeTotal(1001);
    assertEq(seq, oldest, "interior above the oldest entry");
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__NoBucketAtOrBeforeTotal.selector, 999, 1000));
    inbox.getBucketAtOrBeforeTotal(999);

    for (uint64 k = 0; k < 6; k++) {
      uint64 target = current - k;
      (seq,) = inbox.getBucketAtOrBeforeTotal(1000 + (target - oldest) * 2 + 1);
      assertEq(seq, target, "walk and fallback near the maximum");
    }
  }

  function testFuzzAgreesWithReference(uint256 _seed) public {
    uint256[] memory sizes = new uint256[](16);
    for (uint256 i = 0; i < sizes.length; i++) {
      sizes[i] = 1 + (uint256(keccak256(abi.encode(_seed, i))) % 5);
    }
    _openBuckets(sizes);

    uint64 total = inbox.getTotalMessagesInserted();
    for (uint64 bound = 0; bound <= total + 1; bound++) {
      _assertAgreesWithReference(bound);
    }
  }
}
