// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {TestERC20} from "src/mock/TestERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {
  ProposeLib,
  INBOX_LAG_SECONDS,
  MAX_L1_TO_L2_MSGS_PER_CHECKPOINT
} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {TimeLib, Slot, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {MIN_BUCKET_RING_SIZE} from "@aztec/core/messagebridge/Inbox.sol";
import {InboxHarness} from "../harnesses/InboxHarness.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";

contract ProposeLibHarness {
  constructor(uint256 _genesisTime, uint256 _slotDuration, uint256 _epochDuration) {
    TimeLib.initialize(_genesisTime, _slotDuration, _epochDuration, 1);
  }

  function validateInboxConsumption(
    IInbox _inbox,
    bytes32 _inboxRollingHash,
    uint256 _bucketHint,
    Slot _slotNumber,
    uint256 _parentTotalMsgCount
  ) external view returns (uint256) {
    return ProposeLib.validateInboxConsumption(
      _inbox, _inboxRollingHash, _bucketHint, _slotNumber, _parentTotalMsgCount
    );
  }
}

contract ProposeInboxConsumptionTest is Test {
  uint256 internal constant GENESIS_TIME = 100_000;
  uint256 internal constant SLOT_DURATION = 36;
  uint256 internal constant EPOCH_DURATION = 32;
  uint256 internal constant HEIGHT = 10;

  Slot internal constant SLOT = Slot.wrap(10);

  ProposeLibHarness internal rollup;
  InboxHarness internal inbox;
  uint256 internal version = 0;

  // Start of the build frame for a checkpoint proposed in SLOT: it is built during the previous slot.
  uint256 internal buildFrameStart = GENESIS_TIME + (Slot.unwrap(SLOT) - 1) * SLOT_DURATION;
  // Buckets at or before the cutoff must be consumed by the checkpoint.
  uint256 internal cutoff = buildFrameStart - INBOX_LAG_SECONDS;

  function setUp() public {
    vm.warp(GENESIS_TIME);
    rollup = new ProposeLibHarness(GENESIS_TIME, SLOT_DURATION, EPOCH_DURATION);
    inbox = _deployInbox(TestConstants.AZTEC_INBOX_BUCKET_RING_SIZE);
  }

  function _deployInbox(uint256 _ringSize) internal returns (InboxHarness) {
    IERC20 feeAsset = new TestERC20("Fee Asset", "FA", address(this));
    return new InboxHarness(address(rollup), feeAsset, version, HEIGHT, TestConstants.AZTEC_INBOX_LAG, _ringSize);
  }

  function _send(uint256 _salt) internal {
    inbox.sendL2Message(
      DataStructures.L2Actor({actor: bytes32(uint256(0x1000 + _salt)), version: version}),
      bytes32(uint256(0x2000 + _salt)),
      bytes32(uint256(0x3000 + _salt))
    );
  }

  function _sendMany(uint256 _count) internal {
    for (uint256 i = 0; i < _count; i++) {
      _send(i);
    }
  }

  function testEmptyInbox() public {
    uint256 consumed = rollup.validateInboxConsumption(inbox, bytes32(0), 0, SLOT, 0);
    assertEq(consumed, 0, "consumed nothing on empty inbox");
  }

  function testEmptyInboxRejectsNonZeroHash() public {
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__InvalidInboxRollingHash.selector, bytes32(0), bytes32(uint256(1)))
    );
    rollup.validateInboxConsumption(inbox, bytes32(uint256(1)), 0, SLOT, 0);
  }

  function testConsumeUpToLatestBucket() public {
    vm.warp(cutoff);
    _sendMany(3);
    bytes32 endHash = inbox.getBucket(1).rollingHash;

    vm.warp(GENESIS_TIME + Slot.unwrap(SLOT) * SLOT_DURATION);
    uint256 consumed = rollup.validateInboxConsumption(inbox, endHash, 1, SLOT, 0);
    assertEq(consumed, 3, "consumed all three messages");
  }

  function testExactCutoffBucketMustBeConsumed() public {
    // A bucket created exactly at the cutoff is the "latest bucket at/before build-frame start minus lag":
    // consuming nothing is no longer allowed.
    vm.warp(cutoff);
    _send(0);

    vm.warp(GENESIS_TIME + Slot.unwrap(SLOT) * SLOT_DURATION);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__UnconsumedInboxMessages.selector, 1));
    rollup.validateInboxConsumption(inbox, bytes32(0), 0, SLOT, 0);
  }

  function testBucketPastCutoffNeedNotBeConsumed() public {
    vm.warp(cutoff + 1);
    _send(0);

    vm.warp(GENESIS_TIME + Slot.unwrap(SLOT) * SLOT_DURATION);
    uint256 consumed = rollup.validateInboxConsumption(inbox, bytes32(0), 0, SLOT, 0);
    assertEq(consumed, 0, "nothing consumed");
  }

  function testCapEscape() public {
    // One more message than the checkpoint cap, all before the cutoff. They spill over into buckets
    // 1..4 of 256 (the per-bucket cap) plus bucket 5 with the single excess message.
    vm.warp(cutoff - 100);
    _sendMany(MAX_L1_TO_L2_MSGS_PER_CHECKPOINT + 1);
    assertEq(inbox.getCurrentBucketSeq(), 5, "expected five buckets");

    vm.warp(GENESIS_TIME + Slot.unwrap(SLOT) * SLOT_DURATION);

    // Consuming through bucket 4 exhausts the cap exactly, so bucket 5 escapes the censorship assert
    // even though it is old.
    bytes32 endHash = inbox.getBucket(4).rollingHash;
    uint256 consumed = rollup.validateInboxConsumption(inbox, endHash, 4, SLOT, 0);
    assertEq(consumed, MAX_L1_TO_L2_MSGS_PER_CHECKPOINT, "consumed the full cap");
  }

  function testNoCapEscapeAtExactCap() public {
    vm.warp(cutoff - 100);
    _sendMany(MAX_L1_TO_L2_MSGS_PER_CHECKPOINT + 1);

    vm.warp(GENESIS_TIME + Slot.unwrap(SLOT) * SLOT_DURATION);

    // Stopping at bucket 3 leaves bucket 4 unconsumed; consuming through it would total exactly the cap,
    // which fits in one checkpoint, so there is no escape and the old bucket must be consumed.
    bytes32 endHash = inbox.getBucket(3).rollingHash;
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__UnconsumedInboxMessages.selector, 4));
    rollup.validateInboxConsumption(inbox, endHash, 3, SLOT, 0);
  }

  function testCapEscapeAccountsForParentTotal() public {
    // Same layout as testCapEscape, but the parent checkpoint had already consumed one message:
    // buckets 2..5 then hold cap messages total, which fit in one checkpoint, so no escape from bucket 1.
    vm.warp(cutoff - 100);
    _sendMany(MAX_L1_TO_L2_MSGS_PER_CHECKPOINT + 1);

    vm.warp(GENESIS_TIME + Slot.unwrap(SLOT) * SLOT_DURATION);

    bytes32 endHash = inbox.getBucket(4).rollingHash;
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__UnconsumedInboxMessages.selector, 5));
    rollup.validateInboxConsumption(inbox, endHash, 4, SLOT, 1);
  }

  function testStaleHashRejection() public {
    vm.warp(cutoff);
    _send(0);
    vm.roll(block.number + 1);
    vm.warp(cutoff + 10);
    _send(1);

    bytes32 staleHash = inbox.getBucket(1).rollingHash;
    bytes32 currentHash = inbox.getBucket(2).rollingHash;

    vm.warp(GENESIS_TIME + Slot.unwrap(SLOT) * SLOT_DURATION);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidInboxRollingHash.selector, currentHash, staleHash));
    rollup.validateInboxConsumption(inbox, staleHash, 2, SLOT, 0);
  }

  function testUnknownHashRejection() public {
    vm.warp(cutoff);
    _send(0);

    bytes32 unknownHash = bytes32(uint256(0xdead));
    bytes32 bucketHash = inbox.getBucket(1).rollingHash;

    vm.warp(GENESIS_TIME + Slot.unwrap(SLOT) * SLOT_DURATION);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidInboxRollingHash.selector, bucketHash, unknownHash));
    rollup.validateInboxConsumption(inbox, unknownHash, 1, SLOT, 0);
  }

  function testHintBeyondCurrentBucketRejected() public {
    vm.warp(cutoff);
    _send(0);

    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__BucketOutOfWindow.selector, 2, 1));
    rollup.validateInboxConsumption(inbox, bytes32(0), 2, SLOT, 0);
  }

  function testHintOnOverwrittenBucketRejected() public {
    InboxHarness ringInbox = _deployInbox(MIN_BUCKET_RING_SIZE);

    // One bucket per L1 block; after MIN_BUCKET_RING_SIZE + 1 buckets the ring has wrapped past bucket 1,
    // so a hint pointing at it must be rejected before any cutoff logic runs.
    for (uint256 i = 1; i <= MIN_BUCKET_RING_SIZE + 1; i++) {
      vm.roll(block.number + 1);
      vm.warp(block.timestamp + 1);
      ringInbox.sendL2Message(
        DataStructures.L2Actor({actor: bytes32(uint256(0x1000 + i)), version: version}),
        bytes32(uint256(0x2000 + i)),
        bytes32(uint256(0x3000 + i))
      );
    }

    // No proposal-time warp: the loop above has already moved past SLOT's proposal time, and the revert fires
    // in getBucket before any cutoff logic reads the clock.
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__BucketOutOfWindow.selector, 1, MIN_BUCKET_RING_SIZE + 1));
    rollup.validateInboxConsumption(ringInbox, bytes32(0), 1, SLOT, 0);
  }

  function testConsumeBackwardsReverts() public {
    // Buckets 1 and 2 exist with distinct cumulative totals. A proposal that references bucket 1 while its
    // parent already consumed through bucket 2 would move consumption backwards.
    vm.warp(cutoff - 100);
    _send(0);
    vm.roll(block.number + 1);
    vm.warp(cutoff - 50);
    _send(1);

    uint256 parentTotal = inbox.getBucket(2).totalMsgCount;
    uint256 bucketTotal = inbox.getBucket(1).totalMsgCount;
    bytes32 bucketHash = inbox.getBucket(1).rollingHash;

    vm.warp(GENESIS_TIME + Slot.unwrap(SLOT) * SLOT_DURATION);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__InboxConsumptionBehindParent.selector, parentTotal, bucketTotal)
    );
    rollup.validateInboxConsumption(inbox, bucketHash, 1, SLOT, parentTotal);
  }

  function testEqualReferenceConsumesNothing() public {
    // The parent already consumed the current bucket; re-referencing it with an equal parent total consumes
    // nothing and returns the unchanged cumulative total. No newer pre-cutoff bucket exists.
    vm.warp(cutoff);
    _sendMany(2);
    uint256 total = inbox.getBucket(1).totalMsgCount;
    bytes32 endHash = inbox.getBucket(1).rollingHash;

    vm.warp(GENESIS_TIME + Slot.unwrap(SLOT) * SLOT_DURATION);
    uint256 consumed = rollup.validateInboxConsumption(inbox, endHash, 1, SLOT, total);
    assertEq(consumed, total, "equal reference returns the unchanged total");
  }

  function testCapUpperBoundReverts() public {
    // One more message than the checkpoint cap, all before the cutoff, referenced in a single proposal from
    // a fresh parent: the consumed delta exceeds what the circuits can insert.
    vm.warp(cutoff - 100);
    _sendMany(MAX_L1_TO_L2_MSGS_PER_CHECKPOINT + 1);
    assertEq(inbox.getCurrentBucketSeq(), 5, "expected five buckets");

    bytes32 endHash = inbox.getBucket(5).rollingHash;

    vm.warp(GENESIS_TIME + Slot.unwrap(SLOT) * SLOT_DURATION);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__TooManyInboxMessagesConsumed.selector, MAX_L1_TO_L2_MSGS_PER_CHECKPOINT + 1)
    );
    rollup.validateInboxConsumption(inbox, endHash, 5, SLOT, 0);
  }
}
