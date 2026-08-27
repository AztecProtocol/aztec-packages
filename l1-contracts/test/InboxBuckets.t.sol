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
    uint64 seqAfter = _inbox.getCurrentBucketSeq();
    bool opensBucket = seqAfter != seqBefore;
    expectedRollingHash =
      Hash.accumulateInboxRollingHash(expectedRollingHash, leaf, opensBucket, _inbox.getBucket(seqAfter).timestamp);
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
  // grouped per bucket: the first leaf of each group opens a bucket, and every leaf of a group links with the
  // group's timestamp.
  function testRollingHashTestVectors() public pure {
    uint64 ts = 1000;

    bytes32 h = Hash.accumulateInboxRollingHash(bytes32(0), bytes32(uint256(11)), true, ts);
    assertEq(h, 0x00a547352c19bddb35bcc0ce9a278ada5344922ba4e0c85463f2150ba5de7064, "chain(0, [(1000, [11])])");

    h = Hash.accumulateInboxRollingHash(h, bytes32(uint256(22)), false, ts);
    h = Hash.accumulateInboxRollingHash(h, bytes32(uint256(33)), false, ts);
    assertEq(h, 0x00e767ae30130bf27ed2ece5f6685d6d93d835eca2750e5c3d51aa622ba65ae1, "chain(0, [(1000, [11,22,33])])");

    h = bytes32(0);
    for (uint256 i = 1; i <= 256; i++) {
      h = Hash.accumulateInboxRollingHash(h, bytes32(i), i == 1, ts);
    }
    assertEq(h, 0x004360c26448f4003eb2d256b8561a671d419abc720f2e2366210afe6b50c5e0, "chain(0, [(1000, [1..=256])])");

    h = Hash.accumulateInboxRollingHash(bytes32(uint256(0x2a)), bytes32(uint256(7)), true, ts);
    assertEq(h, 0x0031fe0f1cb02f3ca761ac9340fdfbfde3ae8bd082e7115b9a3f467b38d23869, "chain(0x2a, [(1000, [7])])");

    h = Hash.accumulateInboxRollingHash(h, bytes32(uint256(8)), false, ts);
    assertEq(h, 0x00b1e0bf8cec0ee768fb5fad71cbc3f84e5298fdc77b4680d821165433944437, "chain(0x2a, [(1000, [7, 8])])");

    // The same four leaves in one bucket and split across two buckets reach different chain positions.
    h = bytes32(0);
    uint256[4] memory leaves = [uint256(11), 22, 33, 44];
    for (uint256 i = 0; i < 4; i++) {
      h = Hash.accumulateInboxRollingHash(h, bytes32(leaves[i]), i == 0, ts);
    }
    assertEq(h, 0x003a0be72baad115a70b7b945d4b9df5a097f85f5bd545a3148828bd85a71f0b, "chain(0, [(1000, [11,22,33,44])])");

    bytes32 split = bytes32(0);
    for (uint256 i = 0; i < 4; i++) {
      split = Hash.accumulateInboxRollingHash(split, bytes32(leaves[i]), i == 0 || i == 2, ts);
    }
    assertEq(
      split,
      0x006449486fd6561793f12c478f5f5401fa3b1d083206a5d6982635c1b9caee48,
      "chain(0, [(1000, [11,22]), (1000, [33,44])])"
    );
    assertTrue(h != split, "bucket boundaries change the chain");

    // The same leaves and the same grouping, with the second bucket a second later.
    bytes32 retimed = bytes32(0);
    for (uint256 i = 0; i < 4; i++) {
      retimed = Hash.accumulateInboxRollingHash(retimed, bytes32(leaves[i]), i == 0 || i == 2, i < 2 ? ts : ts + 1);
    }
    assertEq(
      retimed,
      0x00cb36ebc4a3b5cf0adfda4a42c0011deae1d407fa3191acece69dacdd16594b,
      "chain(0, [(1000, [11,22]), (1001, [33,44])])"
    );
    assertTrue(retimed != split, "bucket timestamps change the chain");

    // Timestamp extremes: the eight big-endian bytes are absorbed as-is.
    assertEq(
      Hash.accumulateInboxRollingHash(bytes32(0), bytes32(uint256(11)), true, 0),
      0x00277b3c9e3871988dcb2ad539e4a567db746f01d3e06573a13eafab5dc92eaa,
      "chain(0, [(0, [11])])"
    );
    assertEq(
      Hash.accumulateInboxRollingHash(bytes32(0), bytes32(uint256(11)), true, type(uint64).max),
      0x001e0d6e38689a3dbd197f379b6cb95abbe87158852e98e3489b0cb040452dbd,
      "chain(0, [(2**64-1, [11])])"
    );
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
    uint64 ts = uint64(block.timestamp);
    bytes32 leaf1 = _send(inbox, 1);
    bytes32 chain1 = Hash.accumulateInboxRollingHash(bytes32(0), leaf1, true, ts);
    bytes32 leaf2 = _send(inbox, 2);
    bytes32 chain2 = Hash.accumulateInboxRollingHash(chain1, leaf2, false, ts);
    bytes32 leaf3 = _send(inbox, 3);
    bytes32 chain3 = Hash.accumulateInboxRollingHash(chain2, leaf3, false, ts);

    assertEq(inbox.getCurrentBucketSeq(), 1, "all messages share one bucket");

    IInbox.InboxBucket memory bucket = inbox.getBucket(1);
    assertEq(bucket.rollingHash, chain3, "bucket rolling hash");
    assertEq(bucket.totalMsgCount, 3, "bucket cumulative total");
    assertEq(bucket.timestamp, uint64(block.timestamp), "bucket timestamp");
    assertEq(bucket.msgCount, 3, "bucket msg count");
  }

  function testBucketBoundariesChangeTheChain() public {
    // Two messages sent in one L1 block share a bucket; the same two messages one L1 block apart open two buckets.
    // The leaves are identical either way, so only the packing (and, with it, the second bucket's timestamp) tells
    // the two histories apart.
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

  function testBucketTimestampChangesTheChain() public {
    // The same message packed into the same bucket, sent at two different L1 timestamps. Nothing else differs: the
    // leaf carries no time, so only the timestamp in the rolling-hash link separates the two chains. This is what
    // lets a node detect an L1 reorg that re-mines the same messages into re-timed blocks.
    InboxHarness early = _deployInbox(TestConstants.AZTEC_INBOX_BUCKET_RING_SIZE);
    bytes32 leaf = _send(early, 1);

    vm.warp(block.timestamp + 12);
    InboxHarness late = _deployInbox(TestConstants.AZTEC_INBOX_BUCKET_RING_SIZE);
    assertEq(_send(late, 1), leaf, "same leaf");

    assertEq(early.getBucket(1).msgCount, late.getBucket(1).msgCount, "same packing");
    assertTrue(early.getState().rollingHash != late.getState().rollingHash, "bucket time is committed to");
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
    bytes32 inboxRollingHash = Hash.accumulateInboxRollingHash(bytes32(0), leaf, true, uint64(block.timestamp));

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
    assertEq(
      bucket2.rollingHash,
      Hash.accumulateInboxRollingHash(bucket1.rollingHash, leaf3, true, bucket2.timestamp),
      "chain continuity"
    );
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
    assertEq(
      bucket2.rollingHash,
      Hash.accumulateInboxRollingHash(bucket1.rollingHash, leaf, true, bucket2.timestamp),
      "chain continuity"
    );
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
