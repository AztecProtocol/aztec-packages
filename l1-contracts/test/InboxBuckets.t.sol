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
    (bytes32 leaf,) = _inbox.sendL2Message(
      DataStructures.L2Actor({actor: bytes32(uint256(0x1000 + _salt)), version: version}),
      bytes32(uint256(0x2000 + _salt)),
      bytes32(uint256(0x3000 + _salt))
    );
    expectedRollingHash = Hash.accumulateInboxRollingHash(expectedRollingHash, leaf);
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

  // Shared test vectors for the rolling-hash chain, pinned across the noir circuits, the TS mirror,
  // and this L1 implementation. Generated from an independent sha256 implementation.
  function testRollingHashTestVectors() public pure {
    bytes32 h = Hash.accumulateInboxRollingHash(bytes32(0), bytes32(uint256(11)));
    assertEq(h, 0x00815fb1e9d2076ae5761439b6144ad11da69eb6c41ab2aca39e770407ad8d12, "chain(0, [11])");

    h = Hash.accumulateInboxRollingHash(h, bytes32(uint256(22)));
    h = Hash.accumulateInboxRollingHash(h, bytes32(uint256(33)));
    assertEq(h, 0x0014cae968461979aab6d33266a2310ed234d3f6cf4472737c57551db07bd0da, "chain(0, [11, 22, 33])");

    h = bytes32(0);
    for (uint256 i = 1; i <= 256; i++) {
      h = Hash.accumulateInboxRollingHash(h, bytes32(i));
    }
    assertEq(h, 0x00ea95b96f17b75be03525b35a2a1918b42f03ad8c00a437cf641751825f3992, "chain(0, [1..=256])");

    h = Hash.accumulateInboxRollingHash(bytes32(uint256(0x2a)), bytes32(uint256(7)));
    assertEq(h, 0x0032a934005556d1b9d22708666ee8b05f91fafad624dd64a6ea878e048e5438, "chain(0x2a, [7])");

    h = Hash.accumulateInboxRollingHash(h, bytes32(uint256(8)));
    assertEq(h, 0x0054d96b8a074a5030a5838972d0a3c04ba47cf5956348c853e02e9566233f65, "chain(0x2a, [7, 8])");
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
    bytes32 leaf1 = _send(inbox, 1);
    bytes32 chain1 = Hash.accumulateInboxRollingHash(bytes32(0), leaf1);
    bytes32 leaf2 = _send(inbox, 2);
    bytes32 chain2 = Hash.accumulateInboxRollingHash(chain1, leaf2);
    bytes32 leaf3 = _send(inbox, 3);
    bytes32 chain3 = Hash.accumulateInboxRollingHash(chain2, leaf3);

    assertEq(inbox.getCurrentBucketSeq(), 1, "all messages share one bucket");

    IInbox.InboxBucket memory bucket = inbox.getBucket(1);
    assertEq(bucket.rollingHash, chain3, "bucket rolling hash");
    assertEq(bucket.totalMsgCount, 3, "bucket cumulative total");
    assertEq(bucket.timestamp, uint64(block.timestamp), "bucket timestamp");
    assertEq(bucket.msgCount, 3, "bucket msg count");
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
    bytes32 inboxRollingHash = Hash.accumulateInboxRollingHash(bytes32(0), leaf);

    vm.expectEmit(true, true, true, true, address(inbox));
    emit IInbox.MessageSent(message.index, leaf, inboxRollingHash, 1);
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
    assertEq(bucket2.rollingHash, Hash.accumulateInboxRollingHash(bucket1.rollingHash, leaf3), "chain continuity");
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
    assertEq(bucket2.rollingHash, Hash.accumulateInboxRollingHash(bucket1.rollingHash, leaf), "chain continuity");
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
