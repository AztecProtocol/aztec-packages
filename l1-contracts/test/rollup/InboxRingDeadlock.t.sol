// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {TestERC20} from "src/mock/TestERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {IInbox, MAX_MSGS_PER_BUCKET} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Slot} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {MIN_BUCKET_RING_SIZE} from "@aztec/core/messagebridge/Inbox.sol";
import {InboxHarness} from "../harnesses/InboxHarness.sol";
import {ProposeLibHarness} from "./ProposeInboxConsumption.t.sol";

/**
 * Why unconsumed buckets must never be evicted, from the consumption side. A proposal can only reference a
 * retained bucket, and it can only consume MAX_L1_TO_L2_MSGS_PER_CHECKPOINT messages beyond its parent's
 * cumulative total. Those two limits close against each other: heavy traffic pushes the buckets whose delta from
 * a stalled parent total still fits the cap out of the retained window, and every bucket left in the window is
 * too far ahead of that parent to be consumed in one checkpoint. A chain whose consumption stalled at genesis
 * then has no proposable cursor at all, and no amount of waiting produces one — the gap is permanent.
 *
 * With overwrite protection the gap cannot open: sends halt at the ring wall instead of evicting, so the oldest
 * unconsumed bucket stays retained and stays proposable.
 */
contract InboxRingDeadlockTest is Test {
  uint256 internal constant GENESIS_TIME = 100_000;
  uint256 internal constant SLOT_DURATION = 72;
  uint256 internal constant EPOCH_DURATION = 32;
  uint256 internal constant ETHEREUM_SLOT_DURATION = 12;

  // Far enough into the chain that the traffic below, which spans more L1 blocks than the ring holds buckets,
  // lands entirely before the proposal's timestamp.
  Slot internal constant SLOT = Slot.wrap(100);

  ProposeLibHarness internal rollup;
  InboxHarness internal inbox;
  uint256 internal version = 0;

  function setUp() public {
    vm.warp(GENESIS_TIME);
    rollup = new ProposeLibHarness(GENESIS_TIME, SLOT_DURATION, EPOCH_DURATION, ETHEREUM_SLOT_DURATION);

    IERC20 feeAsset = new TestERC20("Fee Asset", "FA", address(this));
    inbox = new InboxHarness(address(rollup), feeAsset, version, MIN_BUCKET_RING_SIZE);
  }

  // Sends one message, discarding the return values so a send fronted by `vm.expectRevert` has no returndata to
  // decode.
  function _send(uint256 _salt) internal {
    inbox.sendL2Message(
      DataStructures.L2Actor({actor: bytes32(uint256(0x1000 + _salt)), version: version}),
      bytes32(uint256(0x2000 + _salt)),
      bytes32(uint256(0x3000 + _salt))
    );
  }

  // Drives the Inbox to `_targetBucketSeq` with the traffic shape that opens the cap-versus-window gap: four L1
  // blocks of MAX_MSGS_PER_BUCKET messages each, taking the cumulative total to exactly the per-checkpoint cap, a
  // fifth block with the one message past it, then one message per L1 block.
  function _driveTraffic(uint256 _targetBucketSeq, bool _forceProvenConsumed) internal {
    for (uint256 l1Block = 1; inbox.getCurrentBucketSeq() < _targetBucketSeq; l1Block++) {
      vm.roll(block.number + 1);
      vm.warp(block.timestamp + ETHEREUM_SLOT_DURATION);

      uint256 count = l1Block <= 4 ? MAX_MSGS_PER_BUCKET : 1;
      for (uint256 i = 0; i < count; i++) {
        _send(inbox.getTotalMessagesInserted());
      }

      if (_forceProvenConsumed) {
        uint64 newest = inbox.getCurrentBucketSeq();
        vm.prank(address(rollup));
        inbox.markProvenConsumed(newest);
      }
    }
  }

  // Standing in for a contract without overwrite protection: the proven-consumed record is pushed to the newest
  // bucket every L1 block, ahead of any real consumption, so eviction is never refused and the retained window
  // slides off the only buckets a chain stalled at genesis could have proposed. The same sequence doubles as the
  // damage model for an unfaithful rollup: a consumption claim not backed by a proven checkpoint reproduces the
  // unprotected behavior exactly.
  function testDeadlockWithoutProtection() public {
    _driveTraffic(MIN_BUCKET_RING_SIZE + 4, true);

    uint256 current = inbox.getCurrentBucketSeq();
    assertEq(current, MIN_BUCKET_RING_SIZE + 4, "traffic drove the ring past one wrap");

    vm.warp(GENESIS_TIME + Slot.unwrap(SLOT) * SLOT_DURATION);

    // The buckets whose delta from a parent total of zero fits the cap are buckets 0 through 4, and every one of
    // them has been overwritten.
    for (uint256 hint = 0; hint <= 4; hint++) {
      vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__BucketOutOfWindow.selector, hint, current));
      rollup.validateInboxConsumption(inbox, bytes32(0), hint, SLOT, 0);
    }

    // Every bucket still retained is too far ahead of that parent total to be consumed in one checkpoint, so no
    // reference at all is proposable and the pending chain can never cross the gap.
    for (uint256 hint = 5; hint <= current; hint++) {
      IInbox.InboxBucket memory bucket = inbox.getBucket(hint);
      assertGt(bucket.totalMsgCount, Constants.MAX_L1_TO_L2_MSGS_PER_CHECKPOINT, "bucket past the cap");

      vm.expectRevert(
        abi.encodeWithSelector(Errors.Rollup__TooManyInboxMessagesConsumed.selector, bucket.totalMsgCount)
      );
      rollup.validateInboxConsumption(inbox, bucket.rollingHash, hint, SLOT, 0);
    }
  }

  // The same traffic against the real contract: nothing is proven-consumed, so sends halt at the ring wall with
  // the whole window intact.
  function testProtectionPreventsDeadlock() public {
    _driveTraffic(MIN_BUCKET_RING_SIZE, false);
    assertEq(inbox.getCurrentBucketSeq(), MIN_BUCKET_RING_SIZE, "ring filled to one wrap");

    vm.roll(block.number + 1);
    vm.warp(block.timestamp + ETHEREUM_SLOT_DURATION);
    vm.expectRevert(abi.encodeWithSelector(Errors.Inbox__WouldOverwriteUnconsumedBucket.selector, uint64(1)));
    _send(0xdead);

    assertEq(inbox.getCurrentBucketSeq(), MIN_BUCKET_RING_SIZE, "sends halted rather than evicting bucket 1");

    vm.warp(GENESIS_TIME + Slot.unwrap(SLOT) * SLOT_DURATION);

    // One bucket's delta is at most MAX_MSGS_PER_BUCKET and so always fits the per-checkpoint cap, so the oldest
    // unconsumed bucket - which the protection never lets be evicted - always yields a proposable cursor. Here
    // that cursor is bucket 4, whose delta is exactly the cap; the next bucket exceeds it, so mandatory
    // consumption passes via the cap escape.
    IInbox.InboxBucket memory cursor = inbox.getBucket(4);
    uint256 consumed = rollup.validateInboxConsumption(inbox, cursor.rollingHash, 4, SLOT, 0);
    assertEq(consumed, Constants.MAX_L1_TO_L2_MSGS_PER_CHECKPOINT, "a proposable cursor survives");
  }
}
