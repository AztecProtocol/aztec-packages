// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {TestERC20} from "src/mock/TestERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {IInbox, MAX_MSGS_PER_BUCKET} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {MIN_BUCKET_RING_SIZE} from "@aztec/core/messagebridge/Inbox.sol";
import {InboxHarness} from "./harnesses/InboxHarness.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";

contract InboxBucketsTest is Test {
  InboxHarness internal inbox;
  uint256 internal version = 0;
  bytes32 internal expectedRollingHash;

  function setUp() public {
    inbox = _deployInbox(TestConstants.AZTEC_INBOX_BUCKET_RING_SIZE);
  }

  function _deployInbox(uint256 _ringSize) internal returns (InboxHarness) {
    IERC20 feeAsset = new TestERC20("Fee Asset", "FA", address(this));
    return new InboxHarness(address(this), feeAsset, version, _ringSize);
  }

  function _send(InboxHarness _inbox, uint256 _salt) internal returns (bytes32) {
    uint64 seqBefore = _inbox.getCurrentBucketSeq();
    (bytes32 leaf,) = _inbox.sendL2Message(
      DataStructures.L2Actor({actor: bytes32(uint256(0x1000 + _salt)), version: version}),
      bytes32(uint256(0x2000 + _salt)),
      bytes32(uint256(0x3000 + _salt))
    );
    // A message opens a bucket exactly when it advances the bucket sequence: the first message of an L1 block, or
    // the message that spills over out of a full bucket.
    bool opensBucket = _inbox.getCurrentBucketSeq() != seqBefore;
    expectedRollingHash = Hash.accumulateInboxRollingHash(expectedRollingHash, leaf, opensBucket);
    return leaf;
  }

  // Sends a message and returns the gas consumed by the external `sendL2Message` call. The
  // recipient/content/secretHash are built before the measurement window so only the call is timed. The
  // figure is warm execution gas including the CALL overhead; it excludes the 21k intrinsic tx cost, calldata
  // gas, and the cold-access surcharge a standalone EOA transaction pays on its first touch of each slot.
  function _measureSend(InboxHarness _inbox, uint256 _salt) internal returns (uint256 gasUsed) {
    DataStructures.L2Actor memory recipient =
      DataStructures.L2Actor({actor: bytes32(uint256(0x1000 + _salt)), version: version});
    bytes32 content = bytes32(uint256(0x2000 + _salt));
    bytes32 secretHash = bytes32(uint256(0x3000 + _salt));

    uint256 gasBefore = gasleft();
    _inbox.sendL2Message(recipient, content, secretHash);
    gasUsed = gasBefore - gasleft();
  }

  // Shared test vectors for the rolling-hash chain, pinned across the noir circuits, the TS mirror, and this L1
  // implementation. Derived independently of all three by `scripts/inbox_rolling_hash_vectors.py`. Leaves are
  // grouped per bucket: the first leaf of each group opens a bucket.
  function testRollingHashTestVectors() public pure {
    bytes32 h = Hash.accumulateInboxRollingHash(bytes32(0), bytes32(uint256(11)), true);
    assertEq(h, 0x00551b59fed79dcce036e55050cf38ef367abfec03557e234866ac023879b245, "chain(0, [[11]])");

    h = Hash.accumulateInboxRollingHash(h, bytes32(uint256(22)), false);
    h = Hash.accumulateInboxRollingHash(h, bytes32(uint256(33)), false);
    assertEq(h, 0x00e6cba8a055d279f8568edc4d0969a107fcda0c48347afdfd3dfeb053aa22c7, "chain(0, [[11, 22, 33]])");

    h = bytes32(0);
    for (uint256 i = 1; i <= 256; i++) {
      h = Hash.accumulateInboxRollingHash(h, bytes32(i), i == 1);
    }
    assertEq(h, 0x009ff152cad9525e1c092ae6d4fb390149de5599eac09b76b0ebd1c6e26bb504, "chain(0, [[1..=256]])");

    h = Hash.accumulateInboxRollingHash(bytes32(uint256(0x2a)), bytes32(uint256(7)), true);
    assertEq(h, 0x00f13cb848052a7ab6f1de788a5979f5a5caa8c11cf176715d63481618e3b575, "chain(0x2a, [[7]])");

    h = Hash.accumulateInboxRollingHash(h, bytes32(uint256(8)), false);
    assertEq(h, 0x00d84d0b60599b1c7380a723d84310d40efaa4f5673dd62e0af41b03bc9a07a6, "chain(0x2a, [[7, 8]])");

    // The same four leaves in one bucket and split across two buckets reach different chain positions.
    h = bytes32(0);
    uint256[4] memory leaves = [uint256(11), 22, 33, 44];
    for (uint256 i = 0; i < 4; i++) {
      h = Hash.accumulateInboxRollingHash(h, bytes32(leaves[i]), i == 0);
    }
    assertEq(h, 0x00e37b7cc5526ab379c54209bc1c6a4ba2c457d024330281b97a533561701551, "chain(0, [[11, 22, 33, 44]])");

    bytes32 split = bytes32(0);
    for (uint256 i = 0; i < 4; i++) {
      split = Hash.accumulateInboxRollingHash(split, bytes32(leaves[i]), i == 0 || i == 2);
    }
    assertEq(
      split, 0x00fa0346e7c4ee1bdf29a48af28182fdc236e2936e4d0c2e951dbd4b9b6464fc, "chain(0, [[11, 22], [33, 44]])"
    );
    assertTrue(h != split, "bucket boundaries change the chain");
  }

  function testGenesisBucket() public {
    assertEq(inbox.getCurrentBucketSeq(), 0, "genesis seq");

    IInbox.InboxBucket memory bucket = inbox.getBucket(0);
    assertEq(bucket.rollingHash, bytes32(0), "genesis rolling hash");
    assertEq(bucket.totalMsgCount, 0, "genesis total");
    assertEq(bucket.timestamp, uint64(block.timestamp), "genesis timestamp");
    assertEq(bucket.msgCount, 0, "genesis msg count");

    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__BucketOutOfWindow.selector, 1, 0));
    inbox.getBucket(1);
  }

  function testFirstMessageOpensBucketOne() public {
    // Even in the deployment block, the first message must not absorb into the genesis bucket: a
    // checkpoint consuming no messages needs a bucket whose rolling hash matches its parent's chain
    // position, which for the first checkpoint is the zero genesis bucket.
    _send(inbox, 0);

    assertEq(inbox.getCurrentBucketSeq(), 1, "current seq");
    assertEq(inbox.getBucket(0).rollingHash, bytes32(0), "genesis untouched");
    assertEq(inbox.getBucket(0).msgCount, 0, "genesis still empty");
    assertEq(inbox.getBucket(1).msgCount, 1, "bucket 1 has the message");
  }

  function testAccumulationWithinSingleBlock() public {
    // Only the first message of the block opens a bucket; the rest continue it.
    bytes32 leaf1 = _send(inbox, 1);
    bytes32 chain1 = Hash.accumulateInboxRollingHash(bytes32(0), leaf1, true);
    bytes32 leaf2 = _send(inbox, 2);
    bytes32 chain2 = Hash.accumulateInboxRollingHash(chain1, leaf2, false);
    bytes32 leaf3 = _send(inbox, 3);
    bytes32 chain3 = Hash.accumulateInboxRollingHash(chain2, leaf3, false);

    assertEq(inbox.getCurrentBucketSeq(), 1, "all messages share one bucket");

    IInbox.InboxBucket memory bucket = inbox.getBucket(1);
    assertEq(bucket.rollingHash, chain3, "bucket rolling hash");
    assertEq(bucket.totalMsgCount, 3, "bucket cumulative total");
    assertEq(bucket.timestamp, uint64(block.timestamp), "bucket timestamp");
    assertEq(bucket.msgCount, 3, "bucket msg count");
  }

  function testBucketBoundariesChangeTheChain() public {
    // Two messages sent in one L1 block share a bucket; the same two messages one L1 block apart open two buckets.
    // The leaves are identical either way, so only the bucket-start separator tells the two histories apart.
    InboxHarness oneBucket = _deployInbox(TestConstants.AZTEC_INBOX_BUCKET_RING_SIZE);
    bytes32 leafA = _send(oneBucket, 1);
    bytes32 leafB = _send(oneBucket, 2);
    assertEq(oneBucket.getCurrentBucketSeq(), 1, "both messages in one bucket");
    bytes32 oneBucketHash = oneBucket.getState().rollingHash;

    InboxHarness twoBuckets = _deployInbox(TestConstants.AZTEC_INBOX_BUCKET_RING_SIZE);
    assertEq(_send(twoBuckets, 1), leafA, "same first leaf");
    vm.roll(block.number + 1);
    vm.warp(block.timestamp + 12);
    assertEq(_send(twoBuckets, 2), leafB, "same second leaf");
    assertEq(twoBuckets.getCurrentBucketSeq(), 2, "one bucket per block");

    assertTrue(oneBucketHash != twoBuckets.getState().rollingHash, "packing is committed to");
  }

  function testStateReturnsCurrentPositionAtomically() public {
    // Genesis: nothing inserted, bucket 0 current, zero rolling hash.
    IInbox.InboxState memory state = inbox.getState();
    assertEq(state.rollingHash, bytes32(0), "genesis rolling hash");
    assertEq(state.totalMessagesInserted, 0, "genesis total");
    assertEq(state.currentBucketSeq, 0, "genesis seq");

    // One message: the state mirrors bucket 1's running values.
    _send(inbox, 1);
    state = inbox.getState();
    assertEq(state.rollingHash, expectedRollingHash, "rolling hash after first message");
    assertEq(state.totalMessagesInserted, 1, "total after first message");
    assertEq(state.currentBucketSeq, 1, "seq after first message");

    // A new L1 block opens a new bucket; the state keeps tracking the newest one.
    vm.warp(block.timestamp + 12);
    _send(inbox, 2);
    _send(inbox, 3);
    state = inbox.getState();
    assertEq(state.rollingHash, expectedRollingHash, "rolling hash after rollover");
    assertEq(state.totalMessagesInserted, 3, "total after rollover");
    assertEq(state.currentBucketSeq, 2, "seq after rollover");

    // The atomic read always equals the (seq, bucket) pair read through the two-call path.
    IInbox.InboxBucket memory bucket = inbox.getBucket(state.currentBucketSeq);
    assertEq(state.rollingHash, bucket.rollingHash, "state vs bucket rolling hash");
    assertEq(state.totalMessagesInserted, bucket.totalMsgCount, "state vs bucket total");
  }

  function testMessageSentEventCarriesBucketData() public {
    DataStructures.L2Actor memory recipient =
      DataStructures.L2Actor({actor: bytes32(uint256(0x1000)), version: version});
    bytes32 content = bytes32(uint256(0x2000));
    bytes32 secretHash = bytes32(uint256(0x3000));

    DataStructures.L1ToL2Msg memory message = DataStructures.L1ToL2Msg({
      sender: DataStructures.L1Actor(address(this), block.chainid),
      recipient: recipient,
      content: content,
      secretHash: secretHash,
      // Compact cumulative index: the first message against a fresh Inbox has index 0.
      index: inbox.getState().totalMessagesInserted
    });
    bytes32 leaf = Hash.sha256ToField(message);
    bytes32 inboxRollingHash = Hash.accumulateInboxRollingHash(bytes32(0), leaf, true);

    vm.expectEmit(true, true, true, true, address(inbox));
    emit IInbox.MessageSent(leaf, inboxRollingHash, 1, message);
    inbox.sendL2Message(recipient, content, secretHash);
  }

  function testSnapshotBoundariesAcrossBlocks() public {
    _send(inbox, 1);
    _send(inbox, 2);
    IInbox.InboxBucket memory bucket1 = inbox.getBucket(1);

    vm.roll(block.number + 1);
    vm.warp(block.timestamp + 12);

    bytes32 leaf3 = _send(inbox, 3);

    assertEq(inbox.getCurrentBucketSeq(), 2, "new block opens a new bucket");

    // The previous bucket's snapshot is frozen at its end-of-block state.
    IInbox.InboxBucket memory bucket1After = inbox.getBucket(1);
    assertEq(bucket1After.rollingHash, bucket1.rollingHash, "bucket 1 rolling hash frozen");
    assertEq(bucket1After.totalMsgCount, 2, "bucket 1 total frozen");
    assertEq(bucket1After.msgCount, 2, "bucket 1 msg count frozen");
    assertEq(bucket1After.timestamp, bucket1.timestamp, "bucket 1 timestamp frozen");

    // The new bucket continues the chain from the previous bucket.
    IInbox.InboxBucket memory bucket2 = inbox.getBucket(2);
    assertEq(bucket2.rollingHash, Hash.accumulateInboxRollingHash(bucket1.rollingHash, leaf3, true), "chain continuity");
    assertEq(bucket2.rollingHash, expectedRollingHash, "chain matches reference");
    assertEq(bucket2.totalMsgCount, 3, "cumulative total spans buckets");
    assertEq(bucket2.timestamp, uint64(block.timestamp), "bucket 2 timestamp");
    assertEq(bucket2.msgCount, 1, "bucket 2 msg count");
  }

  function testRolloverIntoNextBucket() public {
    uint256 cap = MAX_MSGS_PER_BUCKET;
    for (uint256 i = 0; i < cap; i++) {
      _send(inbox, i);
    }
    assertEq(inbox.getCurrentBucketSeq(), 1, "cap messages fit in one bucket");
    IInbox.InboxBucket memory bucket1 = inbox.getBucket(1);
    assertEq(bucket1.msgCount, cap, "bucket 1 full");

    // The next message in the same L1 block spills over into a new bucket with the same timestamp.
    bytes32 leaf = _send(inbox, cap);
    assertEq(inbox.getCurrentBucketSeq(), 2, "rollover opened next bucket");

    IInbox.InboxBucket memory bucket2 = inbox.getBucket(2);
    assertEq(bucket2.rollingHash, Hash.accumulateInboxRollingHash(bucket1.rollingHash, leaf, true), "chain continuity");
    assertEq(bucket2.totalMsgCount, cap + 1, "cumulative total");
    assertEq(bucket2.timestamp, bucket1.timestamp, "same block, same timestamp");
    assertEq(bucket2.msgCount, 1, "spilled message only");

    assertEq(inbox.getBucket(1).msgCount, cap, "bucket 1 untouched by rollover");
  }

  function testRingWraparound() public {
    InboxHarness ringInbox = _deployInbox(MIN_BUCKET_RING_SIZE);
    expectedRollingHash = 0;

    // One bucket per L1 block; after MIN_BUCKET_RING_SIZE + 1 buckets the ring has wrapped past bucket 1.
    for (uint256 i = 1; i <= MIN_BUCKET_RING_SIZE + 1; i++) {
      vm.roll(block.number + 1);
      vm.warp(block.timestamp + 12);
      _send(ringInbox, i);
      // Evicting a ring slot requires the proven chain to have consumed it, so keep consumption trailing the sends.
      ringInbox.markProvenConsumed(uint64(i - 1));
    }

    uint256 current = ringInbox.getCurrentBucketSeq();
    assertEq(current, MIN_BUCKET_RING_SIZE + 1, "one bucket per block");

    // Buckets 0 and 1 have been overwritten: their ring slots were reused by buckets
    // MIN_BUCKET_RING_SIZE and MIN_BUCKET_RING_SIZE + 1.
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__BucketOutOfWindow.selector, 0, current));
    ringInbox.getBucket(0);
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__BucketOutOfWindow.selector, 1, current));
    ringInbox.getBucket(1);

    // The live window is intact, with per-bucket data at the right ring slots.
    uint64 previousTimestamp = 0;
    for (uint256 seq = current - MIN_BUCKET_RING_SIZE + 1; seq <= current; seq++) {
      IInbox.InboxBucket memory bucket = ringInbox.getBucket(seq);
      assertEq(bucket.totalMsgCount, seq, "cumulative total");
      assertEq(bucket.msgCount, 1, "one message per bucket");
      assertGt(bucket.timestamp, previousTimestamp, "timestamps increase per bucket");
      previousTimestamp = bucket.timestamp;
    }
    assertEq(ringInbox.getBucket(current).rollingHash, expectedRollingHash, "chain matches reference");

    // Buckets ahead of the current one do not exist yet.
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__BucketOutOfWindow.selector, current + 1, current));
    ringInbox.getBucket(current + 1);
  }

  function testConstructorRevertsBelowRingFloor() public {
    IERC20 feeAsset = new TestERC20("Fee Asset", "FA", address(this));
    vm.expectRevert("BUCKET RING TOO SMALL");
    new InboxHarness(address(this), feeAsset, version, MIN_BUCKET_RING_SIZE - 1);
  }

  // Gas cost of a message absorbed into an already-open bucket (the common per-message case): the
  // second message of an L1 block updates the live bucket in place without opening a new ring slot.
  function testGasSendIntoExistingBucket() public {
    _send(inbox, 0);
    assertEq(inbox.getCurrentBucketSeq(), 1, "warmup opened bucket 1");

    uint256 gasUsed = _measureSend(inbox, 1);
    emit log_named_uint("gas: absorb into existing bucket", gasUsed);

    assertEq(inbox.getCurrentBucketSeq(), 1, "absorbed without opening a new bucket");
  }

  // Gas cost of the first message of a new L1 block: a larger timestamp opens the next bucket,
  // writing a fresh ring slot.
  function testGasSendFirstMessageOfNewBlock() public {
    _send(inbox, 0);
    assertEq(inbox.getCurrentBucketSeq(), 1, "warmup opened bucket 1");

    vm.roll(block.number + 1);
    vm.warp(block.timestamp + 12);

    uint256 gasUsed = _measureSend(inbox, 1);
    emit log_named_uint("gas: first message of a new L1 block", gasUsed);

    assertEq(inbox.getCurrentBucketSeq(), 2, "new block opened bucket 2");
  }

  // Gas cost of a rollover opening mid-block: once a bucket reaches MAX_MSGS_PER_BUCKET, the next
  // message in the same L1 block opens a new bucket even though the timestamp is unchanged.
  function testGasSendRolloverMidBlock() public {
    uint256 cap = MAX_MSGS_PER_BUCKET;
    for (uint256 i = 0; i < cap; i++) {
      _send(inbox, i);
    }
    assertEq(inbox.getCurrentBucketSeq(), 1, "cap messages fit in bucket 1");

    uint256 gasUsed = _measureSend(inbox, cap);
    emit log_named_uint("gas: rollover open mid-block", gasUsed);

    assertEq(inbox.getCurrentBucketSeq(), 2, "rollover opened bucket 2");
  }

  // Gas cost of the first-ever message against a freshly deployed Inbox: the rolling-hash slot and bucket 1
  // are written cold. This is the cold-storage case for the first message.
  function testGasSendFirstEverMessage() public {
    assertEq(inbox.getCurrentBucketSeq(), 0, "no message sent yet");

    uint256 gasUsed = _measureSend(inbox, 0);
    emit log_named_uint("gas: first-ever message", gasUsed);

    assertEq(inbox.getCurrentBucketSeq(), 1, "first message opened bucket 1");
  }
}
