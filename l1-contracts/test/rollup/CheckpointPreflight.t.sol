// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../base/DecoderBase.sol";
import {RollupBase, IInstance} from "../base/RollupBase.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";

import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {CheckpointHeaderValidationFlags, CheckpointPreflightArgs, EthValue} from "@aztec/core/interfaces/IRollup.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {ProposeArgs, OracleInput} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

// solhint-disable comprehensive-interface

/**
 * `validateCheckpointHeaderAndInbox` against `propose`: with the same parent state and execution timestamp the
 * preflight must accept exactly the headers `propose` accepts, resolving the consumed total to the bucket
 * `propose` then validates from the returned hint. Blob and signature checks are skipped on both sides
 * (`ignoreDA`, no attestations, committee size zero), so parity here covers the parent, header and Inbox rules.
 */
contract CheckpointPreflightTest is RollupBase {
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;

  // Chain tips live in the first word of the STF namespaced storage: pending in the upper 128 bits, proven below.
  bytes32 internal constant STF_STORAGE_POSITION = keccak256("aztec.stf.storage");

  uint256 internal SLOT_DURATION;

  constructor() {
    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS,
      TestConstants.ETHEREUM_SLOT_DURATION
    );
    SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;
  }

  modifier setUpFor(string memory _name) {
    {
      DecoderBase.Full memory full = load(_name);
      uint256 slotNumber = Slot.unwrap(full.checkpoint.header.slotNumber);
      uint256 initialTime = Timestamp.unwrap(full.checkpoint.header.timestamp) - slotNumber * SLOT_DURATION;
      vm.warp(initialTime);
    }

    RollupBuilder builder =
      new RollupBuilder(address(this)).setTargetCommitteeSize(0).setProvingCostPerMana(EthValue.wrap(1000));
    builder.deploy();
    rollup = IInstance(address(builder.getConfig().rollup));
    inbox = Inbox(address(rollup.getInbox()));
    _;
  }

  // Builds the fixture's header the way `_proposeCheckpoint` does, at the given slot, without touching the Inbox
  // or the clock. The Inbox rolling hash is left for the caller to pin.
  function _buildHeader(string memory _name, uint256 _slotNumber) internal returns (DecoderBase.Full memory full) {
    full = load(_name);
    Slot slotNumber = Slot.wrap(_slotNumber);
    Timestamp ts = rollup.getTimestampForSlot(slotNumber);
    full.checkpoint.header.timestamp = ts;
    full.checkpoint.header.slotNumber = slotNumber;
    uint128 minFee = SafeCast.toUint128(rollup.getManaMinFeeAt(ts, true));
    full.checkpoint.header.gasFees.feePerL2Gas = minFee;
    full.checkpoint.header.totalManaUsed = 0;
    full.checkpoint.header.accumulatedFees = 0;
    full.checkpoint.header.coinbase = address(bytes20("sequencer"));
  }

  function _warpToSlot(uint256 _slotNumber) internal {
    vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(Slot.wrap(_slotNumber))));
  }

  // Sends `_count` messages in a fresh L1 block `_secondsBack` seconds before the current time, then restores the
  // clock. Returns the bucket they landed in.
  function _seedMessagesAt(uint256 _timestamp, uint256 _count) internal returns (uint64 bucketSeq) {
    uint256 now_ = block.timestamp;
    vm.roll(block.number + 1);
    vm.warp(_timestamp);
    bytes32[] memory contents = new bytes32[](_count);
    for (uint256 i = 0; i < _count; i++) {
      contents[i] = bytes32(uint256(keccak256(abi.encode(_timestamp, i))) % Constants.MAX_FIELD_VALUE);
    }
    _populateInbox(address(this), bytes32(uint256(0x5678)), contents);
    bucketSeq = inbox.getCurrentBucketSeq();
    vm.warp(now_);
  }

  function _preflightArgs(ProposedHeader memory _header, uint64 _expectedTotal, uint256 _expectedParent)
    internal
    view
    returns (CheckpointPreflightArgs memory)
  {
    return CheckpointPreflightArgs({
      header: _header,
      attestations: AttestationLibHelper.packAttestations(attestations),
      signers: signers,
      attestationsAndSignersSignature: attestationsAndSignersSignature,
      digest: bytes32(0),
      blobsHash: _header.blobsHash,
      flags: CheckpointHeaderValidationFlags({ignoreDA: true}),
      expectedTotal: _expectedTotal,
      expectedParentCheckpointNumber: _expectedParent
    });
  }

  function _preflight(ProposedHeader memory _header, uint64 _expectedTotal, uint256 _expectedParent)
    internal
    returns (uint64)
  {
    return rollup.validateCheckpointHeaderAndInbox(_preflightArgs(_header, _expectedTotal, _expectedParent));
  }

  function _propose(DecoderBase.Full memory _full, uint256 _bucketHint) internal {
    skipBlobCheck(address(rollup));
    proposedHeaders[_full.checkpoint.checkpointNumber] = _full.checkpoint.header;
    rollup.propose(
      ProposeArgs({
        header: _full.checkpoint.header,
        archive: _full.checkpoint.archive,
        oracleInput: OracleInput(0),
        bucketHint: _bucketHint
      }),
      AttestationLibHelper.packAttestations(attestations),
      signers,
      attestationsAndSignersSignature,
      _full.checkpoint.blobCommitments
    );
  }

  function _proposeExpectingRevert(DecoderBase.Full memory _full, uint256 _bucketHint, bytes memory _revert) internal {
    skipBlobCheck(address(rollup));
    vm.expectRevert(_revert);
    rollup.propose(
      ProposeArgs({
        header: _full.checkpoint.header,
        archive: _full.checkpoint.archive,
        oracleInput: OracleInput(0),
        bucketHint: _bucketHint
      }),
      AttestationLibHelper.packAttestations(attestations),
      signers,
      attestationsAndSignersSignature,
      _full.checkpoint.blobCommitments
    );
  }

  function _setTips(uint256 _pending, uint256 _proven) internal {
    vm.store(address(rollup), STF_STORAGE_POSITION, bytes32((_pending << 128) | _proven));
  }

  // Happy path on a fresh chain: the preflight resolves the consumed total to the bucket holding the messages and
  // `propose` accepts that bucket as its hint.
  function testPreflightThenProposeOnFreshChain() public setUpFor("mixed_checkpoint_1") {
    _warpToSlot(1);
    uint64 seeded = _seedMessagesAt(block.timestamp - 100, 16);
    assertEq(seeded, 1, "messages opened bucket 1");

    DecoderBase.Full memory full = _buildHeader("mixed_checkpoint_1", 1);
    full.checkpoint.header.inboxRollingHash = inbox.getBucket(1).rollingHash;

    uint64 hint = _preflight(full.checkpoint.header, 16, 0);
    assertEq(hint, 1, "resolved the consumed total to bucket 1");

    _propose(full, hint);
    assertEq(rollup.getPendingCheckpointNumber(), 1, "proposed with the returned hint");
  }

  // Consuming nothing resolves to the genesis bucket, exactly as `propose` accepts hint zero.
  function testPreflightConsumingNothingResolvesGenesis() public setUpFor("mixed_checkpoint_1") {
    _warpToSlot(1);
    DecoderBase.Full memory full = _buildHeader("mixed_checkpoint_1", 1);
    full.checkpoint.header.inboxRollingHash = bytes32(0);

    uint64 hint = _preflight(full.checkpoint.header, 0, 0);
    assertEq(hint, 0, "genesis bucket");
    _propose(full, hint);
  }

  // A consumed total inside a bucket has no snapshot to check against and is rejected before any hash comparison.
  function testPreflightRejectsInteriorTotal() public setUpFor("mixed_checkpoint_1") {
    _warpToSlot(1);
    _seedMessagesAt(block.timestamp - 100, 16);
    DecoderBase.Full memory full = _buildHeader("mixed_checkpoint_1", 1);
    full.checkpoint.header.inboxRollingHash = inbox.getBucket(1).rollingHash;

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InboxTotalNotAtBucketBoundary.selector, 10, 0));
    _preflight(full.checkpoint.header, 10, 0);
  }

  // A total past the newest bucket resolves to that bucket and is then rejected as a non-boundary.
  function testPreflightRejectsTotalPastNewestBucket() public setUpFor("mixed_checkpoint_1") {
    _warpToSlot(1);
    _seedMessagesAt(block.timestamp - 100, 16);
    DecoderBase.Full memory full = _buildHeader("mixed_checkpoint_1", 1);

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InboxTotalNotAtBucketBoundary.selector, 17, 16));
    _preflight(full.checkpoint.header, 17, 0);
  }

  // Wrong hash: preflight and `propose` reject the same header with the same error.
  function testPreflightAndProposeRejectWrongHash() public setUpFor("mixed_checkpoint_1") {
    _warpToSlot(1);
    _seedMessagesAt(block.timestamp - 100, 16);
    bytes32 bucketHash = inbox.getBucket(1).rollingHash;
    bytes32 wrongHash = bytes32(uint256(bucketHash) ^ 1);

    DecoderBase.Full memory full = _buildHeader("mixed_checkpoint_1", 1);
    full.checkpoint.header.inboxRollingHash = wrongHash;

    bytes memory expected =
      abi.encodeWithSelector(Errors.Rollup__InvalidInboxRollingHash.selector, bucketHash, wrongHash);
    vm.expectRevert(expected);
    _preflight(full.checkpoint.header, 16, 0);
    _proposeExpectingRevert(full, 1, expected);
  }

  // The caller's parent claim is checked against the parent `propose` would use, not trusted.
  function testPreflightRejectsWrongParentIdentity() public setUpFor("mixed_checkpoint_1") {
    _warpToSlot(1);
    DecoderBase.Full memory full = _buildHeader("mixed_checkpoint_1", 1);
    full.checkpoint.header.inboxRollingHash = bytes32(0);

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__UnexpectedParentCheckpoint.selector, 1, 0));
    _preflight(full.checkpoint.header, 0, 1);
  }

  // A bucket opened in the execution block is still mutable: at an equal timestamp both calls reject it, one L1
  // block later both accept it.
  function testPreflightSettlementAtEqualAndLaterTimestamps() public setUpFor("mixed_checkpoint_1") {
    _warpToSlot(1);
    uint256 slotStart = block.timestamp;
    // Seed in the execution block itself.
    bytes32[] memory contents = new bytes32[](3);
    for (uint256 i = 0; i < 3; i++) {
      contents[i] = bytes32(uint256(0x100 + i));
    }
    _populateInbox(address(this), bytes32(uint256(0x5678)), contents);
    assertEq(inbox.getBucket(1).timestamp, slotStart, "bucket opened in the execution block");

    DecoderBase.Full memory full = _buildHeader("mixed_checkpoint_1", 1);
    full.checkpoint.header.inboxRollingHash = inbox.getBucket(1).rollingHash;

    bytes memory expected = abi.encodeWithSelector(Errors.Rollup__InboxBucketStillMutable.selector, 1);
    vm.expectRevert(expected);
    _preflight(full.checkpoint.header, 3, 0);
    _proposeExpectingRevert(full, 1, expected);

    vm.roll(block.number + 1);
    vm.warp(slotStart + 1);
    assertEq(_preflight(full.checkpoint.header, 3, 0), 1, "settled one block later");
    _propose(full, 1);
  }

  // Censorship: a bucket at or before the cutoff must be consumed; both calls point at it.
  function testPreflightAndProposeEnforceCensorship() public setUpFor("mixed_checkpoint_1") {
    _warpToSlot(1);
    uint256 slotStart = block.timestamp;
    uint256 cutoff = slotStart - SLOT_DURATION - TestConstants.ETHEREUM_SLOT_DURATION;
    _seedMessagesAt(cutoff - 24, 4); // bucket 1
    _seedMessagesAt(cutoff, 2); // bucket 2, exactly at the cutoff: mandatory

    DecoderBase.Full memory full = _buildHeader("mixed_checkpoint_1", 1);
    full.checkpoint.header.inboxRollingHash = inbox.getBucket(1).rollingHash;

    bytes memory expected = abi.encodeWithSelector(Errors.Rollup__UnconsumedInboxMessages.selector, 2);
    vm.expectRevert(expected);
    _preflight(full.checkpoint.header, 4, 0);
    _proposeExpectingRevert(full, 1, expected);

    // Consuming through bucket 2 satisfies both.
    full.checkpoint.header.inboxRollingHash = inbox.getBucket(2).rollingHash;
    assertEq(_preflight(full.checkpoint.header, 6, 0), 2, "mandatory bucket consumed");
    _propose(full, 2);
  }

  // A bucket past the cutoff is optional: stopping before it is accepted by both calls.
  function testPreflightAllowsSkippingBucketPastCutoff() public setUpFor("mixed_checkpoint_1") {
    _warpToSlot(1);
    uint256 slotStart = block.timestamp;
    uint256 cutoff = slotStart - SLOT_DURATION - TestConstants.ETHEREUM_SLOT_DURATION;
    _seedMessagesAt(cutoff - 24, 4);
    _seedMessagesAt(cutoff + 1, 2);

    DecoderBase.Full memory full = _buildHeader("mixed_checkpoint_1", 1);
    full.checkpoint.header.inboxRollingHash = inbox.getBucket(1).rollingHash;
    assertEq(_preflight(full.checkpoint.header, 4, 0), 1, "optional bucket left for later");
    _propose(full, 1);
  }

  // Cap: more than the per-checkpoint maximum before the cutoff. Consuming to the cap is accepted (the excess bucket
  // escapes censorship); one bucket further is rejected by both calls.
  function testPreflightAndProposeEnforceCap() public setUpFor("mixed_checkpoint_1") {
    _warpToSlot(1);
    uint256 slotStart = block.timestamp;
    uint256 cutoff = slotStart - SLOT_DURATION - TestConstants.ETHEREUM_SLOT_DURATION;
    _seedMessagesAt(cutoff - 100, Constants.MAX_L1_TO_L2_MSGS_PER_CHECKPOINT + 1);
    assertEq(inbox.getCurrentBucketSeq(), 5, "four full buckets plus the excess");

    DecoderBase.Full memory full = _buildHeader("mixed_checkpoint_1", 1);
    full.checkpoint.header.inboxRollingHash = inbox.getBucket(5).rollingHash;
    uint64 overCap = uint64(Constants.MAX_L1_TO_L2_MSGS_PER_CHECKPOINT + 1);
    bytes memory expected = abi.encodeWithSelector(Errors.Rollup__TooManyInboxMessagesConsumed.selector, overCap);
    vm.expectRevert(expected);
    _preflight(full.checkpoint.header, overCap, 0);
    _proposeExpectingRevert(full, 5, expected);

    full.checkpoint.header.inboxRollingHash = inbox.getBucket(4).rollingHash;
    uint64 cap = uint64(Constants.MAX_L1_TO_L2_MSGS_PER_CHECKPOINT);
    assertEq(_preflight(full.checkpoint.header, cap, 0), 4, "cap-escaped endpoint");
    _propose(full, 4);
  }

  // Building on a published parent: the parent's stored total, not the caller, sets the floor.
  function testPreflightOnPublishedParent() public setUpFor("mixed_checkpoint_1") {
    _warpToSlot(1);
    _seedMessagesAt(block.timestamp - 100, 16);
    DecoderBase.Full memory first = _buildHeader("mixed_checkpoint_1", 1);
    first.checkpoint.header.inboxRollingHash = inbox.getBucket(1).rollingHash;
    _propose(first, _preflight(first.checkpoint.header, 16, 0));

    _warpToSlot(2);
    // Past the cutoff, so bucket 2 is optional for this slot.
    _seedMessagesAt(block.timestamp - 50, 5);
    DecoderBase.Full memory second = _buildHeader("mixed_checkpoint_2", 2);

    // Re-referencing the parent's bucket consumes nothing and is fine; going behind it is not.
    second.checkpoint.header.inboxRollingHash = inbox.getBucket(1).rollingHash;
    assertEq(_preflight(second.checkpoint.header, 16, 1), 1, "equal reference consumes nothing");
    second.checkpoint.header.inboxRollingHash = bytes32(0);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InboxConsumptionBehindParent.selector, 16, 0));
    _preflight(second.checkpoint.header, 0, 1);

    // Claiming the wrong parent fails even with an otherwise valid header.
    second.checkpoint.header.inboxRollingHash = inbox.getBucket(2).rollingHash;
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__UnexpectedParentCheckpoint.selector, 0, 1));
    _preflight(second.checkpoint.header, 21, 0);

    uint64 hint = _preflight(second.checkpoint.header, 21, 1);
    assertEq(hint, 2, "resolved against the published parent");
    _propose(second, hint);
  }

  // Once the pending chain is prunable, the effective parent is the proven tip: a header built on the pruned
  // checkpoint is rejected for the parent mismatch and one built on the proven tip passes, matching `propose`,
  // which prunes before validating.
  function testPreflightFollowsAutomaticPrune() public setUpFor("mixed_checkpoint_1") {
    _warpToSlot(1);
    _seedMessagesAt(block.timestamp - 100, 16);
    DecoderBase.Full memory first = _buildHeader("mixed_checkpoint_1", 1);
    first.checkpoint.header.inboxRollingHash = inbox.getBucket(1).rollingHash;
    _propose(first, 1);
    assertEq(rollup.getPendingCheckpointNumber(), 1, "checkpoint 1 pending");

    Slot prunableAt = rollup.getCheckpoint(1).slotNumber + Epoch.wrap(2).toSlots();
    _warpToSlot(Slot.unwrap(prunableAt));
    assertTrue(rollup.canPruneAtTime(Timestamp.wrap(block.timestamp)), "pending chain is prunable");

    // Built on checkpoint 1, which the prune will remove.
    DecoderBase.Full memory stale = _buildHeader("mixed_checkpoint_2", Slot.unwrap(prunableAt));
    stale.checkpoint.header.inboxRollingHash = inbox.getBucket(1).rollingHash;
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__UnexpectedParentCheckpoint.selector, 1, 0));
    _preflight(stale.checkpoint.header, 16, 1);

    // Built on the proven tip: consumes bucket 1 again from a parent total of zero.
    DecoderBase.Full memory replacement = _buildHeader("empty_checkpoint_1", Slot.unwrap(prunableAt));
    replacement.checkpoint.header.inboxRollingHash = inbox.getBucket(1).rollingHash;
    assertEq(_preflight(replacement.checkpoint.header, 16, 0), 1, "resolved against the proven tip");
    _propose(replacement, 1);
    assertEq(rollup.getPendingCheckpointNumber(), 1, "replacement chain proposed after the prune");
  }

  // An earlier invalidation rewinds the pending tip; the preflight follows the tips in storage, as a simulation
  // whose state override reflects a bundled invalidate transaction would see.
  function testPreflightFollowsInvalidatedParent() public setUpFor("mixed_checkpoint_1") {
    _warpToSlot(1);
    _seedMessagesAt(block.timestamp - 100, 16);
    DecoderBase.Full memory first = _buildHeader("mixed_checkpoint_1", 1);
    first.checkpoint.header.inboxRollingHash = inbox.getBucket(1).rollingHash;
    _propose(first, 1);

    _warpToSlot(2);
    _seedMessagesAt(block.timestamp - 100, 5);
    DecoderBase.Full memory second = _buildHeader("mixed_checkpoint_2", 2);
    second.checkpoint.header.inboxRollingHash = inbox.getBucket(2).rollingHash;
    _propose(second, 2);
    assertEq(rollup.getPendingCheckpointNumber(), 2, "two checkpoints pending");

    // Invalidate checkpoint 2 by rewinding the tips, as the invalidation path does.
    _setTips(1, 0);
    assertEq(rollup.getPendingCheckpointNumber(), 1, "checkpoint 2 invalidated");

    _warpToSlot(3);
    // A header built on the invalidated checkpoint 2 no longer has a parent.
    DecoderBase.Full memory onInvalidated = _buildHeader("mixed_checkpoint_2", 3);
    onInvalidated.checkpoint.header.lastArchiveRoot = second.checkpoint.archive;
    onInvalidated.checkpoint.header.inboxRollingHash = inbox.getBucket(2).rollingHash;
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__UnexpectedParentCheckpoint.selector, 2, 1));
    _preflight(onInvalidated.checkpoint.header, 21, 2);

    // The replacement for checkpoint 2 builds on checkpoint 1's archive and total.
    DecoderBase.Full memory replacement = _buildHeader("mixed_checkpoint_2", 3);
    replacement.checkpoint.header.inboxRollingHash = inbox.getBucket(2).rollingHash;
    assertEq(_preflight(replacement.checkpoint.header, 21, 1), 2, "resolved against checkpoint 1");
    _propose(replacement, 2);
    assertEq(rollup.getPendingCheckpointNumber(), 2, "replacement proposed");
  }

  // The header checks are the shared ones: a wrong archive for the derived parent fails in the preflight as in
  // `propose`, even when the parent identity claim is right.
  function testPreflightSharesHeaderValidation() public setUpFor("mixed_checkpoint_1") {
    _warpToSlot(1);
    DecoderBase.Full memory full = _buildHeader("mixed_checkpoint_1", 1);
    bytes32 genesisArchive = full.checkpoint.header.lastArchiveRoot;
    full.checkpoint.header.lastArchiveRoot = bytes32(uint256(genesisArchive) ^ 1);
    full.checkpoint.header.inboxRollingHash = bytes32(0);

    bytes memory expected = abi.encodeWithSelector(
      Errors.Rollup__InvalidArchive.selector, genesisArchive, full.checkpoint.header.lastArchiveRoot
    );
    vm.expectRevert(expected);
    _preflight(full.checkpoint.header, 0, 0);
    _proposeExpectingRevert(full, 0, expected);
  }
}
