// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchBase, EscapeHatchConfig} from "../base.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";

contract EscapeHatchSelectCandidatesTest is EscapeHatchBase {
  function test_GivenHatchIsAlreadyPrepared(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should return early as no-op

    // Warp to safe epoch to avoid underflow
    _warpToSafeEpoch();

    // First, trigger selectCandidates
    escapeHatch.selectCandidates();

    // Get the hatch that was prepared
    Hatch currentHatch = escapeHatch.getCurrentHatch();
    Hatch preparedHatch = currentHatch + Hatch.wrap(config.lagInHatches);

    assertTrue(escapeHatch.isHatchPrepared(preparedHatch), "Hatch should be prepared");

    // Call again - should be no-op
    vm.record();
    escapeHatch.selectCandidates();
    (, bytes32[] memory writes) = vm.accesses(address(escapeHatch));
    assertEq(writes.length, 0);

    // Still prepared, no errors
    assertTrue(escapeHatch.isHatchPrepared(preparedHatch), "Hatch should still be prepared");
  }

  modifier givenHatchIsNotPrepared() {
    _;
  }

  function test_GivenSetIsNotStable(EscapeHatchConfig memory _config)
    external
    givenHatchIsNotPrepared
    givenValidConfig(_config)
  {
    // it should revert {EscapeHatch__SetUnstable}
    //
    // DEFENSE IN DEPTH: The SetUnstable check in selectCandidates() cannot trigger
    // with valid configurations due to the constructor constraint:
    //   `frequency > LAG_IN_EPOCHS_FOR_SET_SIZE`
    //   `LAG_IN_EPOCHS_FOR_SET_SIZE > LAG_IN_EPOCHS_FOR_RANDAO`
    //
    // This ensures that by the time we're in any hatch H, its sample timestamp
    // is always strictly in the past. The check remains in the contract as defense
    // in depth - if constraints ever change or there's a bug elsewhere, this check
    // provides an additional safety net.
    //
    // Why we can't test it:
    // - selectCandidates() uses _getSetSampleTimestamp(currentHatch)
    // - For the check to fail, we'd need: sampleTs(currentHatch) >= block.timestamp
    // - But by definition, when we're in hatch H, its sample timestamp is in the past
    //   as its value is the start of the hatch - LAG_IN_EPOCHS_FOR_SET_SIZE
    //
    // We keep this test (skipped) to document the code path exists and why it's
    // unreachable, rather than silently omitting it from the test suite.

    vm.skip(true);
  }

  modifier givenSetIsStable() {
    _;
  }

  function test_GivenCandidateSetSizeIsZeroAtSnapshotTime(EscapeHatchConfig memory _config)
    external
    givenHatchIsNotPrepared
    givenSetIsStable
    givenValidConfig(_config)
  {
    // it should set isHatchPrepared for the hatch
    // it should not set designatedProposer

    // Warp to safe epoch to avoid underflow
    _warpToSafeEpoch();

    // No candidates joined
    assertEq(escapeHatch.getCandidateCount(), 0, "Should have no candidates");

    escapeHatch.selectCandidates();

    Hatch currentHatch = escapeHatch.getCurrentHatch();
    Hatch preparedHatch = currentHatch + Hatch.wrap(config.lagInHatches);

    // Hatch is prepared but no proposer
    assertTrue(escapeHatch.isHatchPrepared(preparedHatch), "Hatch should be prepared");
    assertEq(escapeHatch.getDesignatedProposer(preparedHatch), address(0), "Should have no proposer");
  }

  modifier givenCandidateSetSizeIsNon_zeroAtSnapshotTime() {
    _;
  }

  function test_GivenCurrentTimeIsAtOrAfterNextSnapshotTimestamp(EscapeHatchConfig memory _config, uint256 _ts)
    external
    givenHatchIsNotPrepared
    givenSetIsStable
    givenCandidateSetSizeIsNon_zeroAtSnapshotTime
    givenValidConfig(_config)
  {
    // it should set isHatchPrepared for the hatch
    // it should not set designatedProposer
    //
    // When selection happens after the freeze timestamp for the next hatch,
    // we return early (no-op) rather than revert. This allows initiateExit
    // to proceed even when we're past the selection window.
    // The hatch is marked as prepared but no proposer is selected.

    // Join a candidate early
    _joinCandidateSetWithConfig(CANDIDATE1);

    // Warp to safe epoch first
    _warpToSafeEpoch();

    // Get current hatch and next hatch's snapshot timestamp
    // The next selection (during currentHatch + 1) prepares targetHatch = currentHatch + 1 + lagInHatches
    Hatch currentHatch = escapeHatch.getCurrentHatch();
    Hatch nextHatch = currentHatch + Hatch.wrap(1);
    Hatch targetHatch = currentHatch + Hatch.wrap(config.lagInHatches);
    Hatch nextTargetHatch = nextHatch + Hatch.wrap(config.lagInHatches);
    uint256 nextSnapshotTs = escapeHatch.getSetTimestamp(nextTargetHatch);
    uint256 nextHatchTs = Timestamp.unwrap(rollup.getTimestampForEpoch(escapeHatch.getFirstEpoch(nextHatch)));

    // Warp into the freezer (past the next snapshot timestamp but before next hatch)
    vm.warp(bound(_ts, nextSnapshotTs, nextHatchTs - 1));

    // selectCandidates should succeed as no-op (no revert)
    vm.record();
    escapeHatch.selectCandidates();
    (, bytes32[] memory writes) = vm.accesses(address(escapeHatch));

    // Only 1 write: setting isHatchPrepared bitmap
    assertEq(writes.length, 1, "Should only write isHatchPrepared");

    // Verify hatch is prepared but no proposer
    assertTrue(escapeHatch.isHatchPrepared(targetHatch), "Hatch should be prepared");
    assertEq(escapeHatch.getDesignatedProposer(targetHatch), address(0), "Should have no proposer");

    // Candidate should still be in active set (not selected)
    assertTrue(escapeHatch.isCandidate(CANDIDATE1), "Candidate should still be in active set");

    // Verify that selection works normally when we advance to the next hatch
    vm.warp(nextHatchTs);
    escapeHatch.selectCandidates();

    // Now the next target hatch should be prepared with a proposer
    assertTrue(escapeHatch.isHatchPrepared(nextTargetHatch), "Next hatch should be prepared");
    assertEq(escapeHatch.getDesignatedProposer(nextTargetHatch), CANDIDATE1, "Should have proposer now");
  }

  modifier givenCurrentTimeIsBeforeNextSnapshotTimestamp() {
    _;
  }

  function test_GivenRandaoCheckpointedAtOrBeforeTheFreezeDiffers(uint256 _randaoBeforeFreeze, uint256 _randaoAtFreeze)
    external
    givenHatchIsNotPrepared
    givenSetIsStable
    givenCandidateSetSizeIsNon_zeroAtSnapshotTime
    givenCurrentTimeIsBeforeNextSnapshotTimestamp
  {
    // it should select the same proposer
    //
    // A RANDAO checkpointed at or before the freeze is known while the candidate set can still be
    // changed, so a selection that depends on it lets candidates tune the set to pick the proposer.

    _assertRollupRandaoLagIsNonZero();
    (Hatch targetHatch, uint256 selectionTs) = _joinCandidatesForNextHatch();
    uint256 freezeTs = escapeHatch.getSetTimestamp(targetHatch);
    uint256 seedTs = escapeHatch.getSeedTimestamp(targetHatch);
    uint256 randaoAfterFreeze = uint256(keccak256("randao after freeze"));

    uint256 snapshot = vm.snapshotState();
    _checkpointRandaoAt(freezeTs - EPOCH_DURATION, uint256(keccak256("randao before freeze")));
    _checkpointRandaoAt(freezeTs, uint256(keccak256("randao at freeze")));
    _checkpointRandaoAt(seedTs, randaoAfterFreeze);
    vm.warp(selectionTs);
    escapeHatch.selectCandidates();
    address expected = escapeHatch.getDesignatedProposer(targetHatch);
    vm.revertToState(snapshot);

    _checkpointRandaoAt(freezeTs - EPOCH_DURATION, _randaoBeforeFreeze);
    _checkpointRandaoAt(freezeTs, _randaoAtFreeze);
    _checkpointRandaoAt(seedTs, randaoAfterFreeze);
    vm.warp(selectionTs);
    escapeHatch.selectCandidates();
    assertEq(
      escapeHatch.getDesignatedProposer(targetHatch), expected, "RANDAO known before the freeze changed the proposer"
    );
  }

  function test_GivenRandaoCheckpointedAfterTheFreeze(uint256 _randaoAfterFreeze)
    external
    givenHatchIsNotPrepared
    givenSetIsStable
    givenCandidateSetSizeIsNon_zeroAtSnapshotTime
    givenCurrentTimeIsBeforeNextSnapshotTimestamp
  {
    // it should compute deterministic index from hatch and the seed derived from that RANDAO

    _assertRollupRandaoLagIsNonZero();
    (Hatch targetHatch, uint256 selectionTs) = _joinCandidatesForNextHatch();
    uint256 freezeTs = escapeHatch.getSetTimestamp(targetHatch);
    uint256 seedTs = escapeHatch.getSeedTimestamp(targetHatch);

    _checkpointRandaoAt(freezeTs - EPOCH_DURATION, uint256(keccak256("randao before freeze")));
    _checkpointRandaoAt(freezeTs, uint256(keccak256("randao at freeze")));
    _checkpointRandaoAt(seedTs, _randaoAfterFreeze);
    vm.warp(selectionTs);
    address expected = _expectedProposer(targetHatch, _randaoAfterFreeze);

    escapeHatch.selectCandidates();
    assertEq(escapeHatch.getDesignatedProposer(targetHatch), expected, "proposer not derived from post-freeze RANDAO");
  }

  function test_GivenNoRandaoCheckpointedAfterTheFreeze(uint256 _randaoAtFreeze)
    external
    givenHatchIsNotPrepared
    givenSetIsStable
    givenCandidateSetSizeIsNon_zeroAtSnapshotTime
    givenCurrentTimeIsBeforeNextSnapshotTimestamp
  {
    // it should compute deterministic index from hatch and the seed derived from the previous checkpoint
    //
    // The rollup records no checkpoint for an epoch in which no transaction reaches it, so its lookup for
    // the seed epoch returns the latest earlier checkpoint, which candidates may know before the freeze.

    _assertRollupRandaoLagIsNonZero();
    (Hatch targetHatch, uint256 selectionTs) = _joinCandidatesForNextHatch();
    uint256 freezeTs = escapeHatch.getSetTimestamp(targetHatch);

    _checkpointRandaoAt(freezeTs - EPOCH_DURATION, uint256(keccak256("randao before freeze")));
    _checkpointRandaoAt(freezeTs, _randaoAtFreeze);
    vm.warp(selectionTs);
    address expected = _expectedProposer(targetHatch, _randaoAtFreeze);

    escapeHatch.selectCandidates();
    assertEq(escapeHatch.getDesignatedProposer(targetHatch), expected, "proposer not derived from previous checkpoint");
  }

  /// @dev With a zero rollup lag the escape hatch has nothing to compensate for, and the RANDAO tests
  ///      would pass against a contract that ignores the lag.
  function _assertRollupRandaoLagIsNonZero() internal view {
    assertGt(rollup.getLagInEpochsForRandao(), 0, "rollup RANDAO lag must be non-zero for this test to be meaningful");
  }

  /// @dev Joins three candidates and returns the hatch prepared by the first selection of the next hatch,
  ///      with the timestamp at which that selection runs. The candidates join well before the target
  ///      hatch's freeze, so all three are in its snapshot.
  function _joinCandidatesForNextHatch() internal returns (Hatch targetHatch, uint256 selectionTs) {
    _warpToSafeEpoch();
    _joinCandidateSet(CANDIDATE1);
    _joinCandidateSet(CANDIDATE2);
    _joinCandidateSet(CANDIDATE3);

    Hatch nextHatch = escapeHatch.getCurrentHatch() + Hatch.wrap(1);
    targetHatch = nextHatch + Hatch.wrap(config.lagInHatches);
    selectionTs = Timestamp.unwrap(rollup.getTimestampForEpoch(escapeHatch.getFirstEpoch(nextHatch)));
  }

  /// @dev Records `_randao` in the rollup as the RANDAO of the epoch starting at `_epochStartTs`.
  ///      Checkpoints must be recorded in increasing epoch order.
  function _checkpointRandaoAt(uint256 _epochStartTs, uint256 _randao) internal {
    vm.warp(_epochStartTs);
    vm.prevrandao(_randao);
    rollup.checkpointRandao();
  }

  /// @dev The candidate the escape hatch must designate for `_targetHatch` when `_randao` is the RANDAO the
  ///      rollup's lookup returns for the hatch's seed epoch.
  function _expectedProposer(Hatch _targetHatch, uint256 _randao) internal view returns (address) {
    // The rollup derives an epoch's seed from the RANDAO checkpointed lagInEpochsForRandao epochs earlier,
    // so the seed built from the seed epoch's RANDAO belongs to the epoch that many epochs later. The
    // rollup stores only the low 224 bits of a RANDAO.
    Epoch seedEpoch = rollup.getEpochAt(Timestamp.wrap(escapeHatch.getSeedTimestamp(_targetHatch)));
    Epoch queriedEpoch = seedEpoch + Epoch.wrap(rollup.getLagInEpochsForRandao());
    uint256 seed = uint256(keccak256(abi.encode(queriedEpoch, uint224(_randao))));
    uint256 setSize = escapeHatch.getCandidateCountForHatch(_targetHatch);
    uint256 index = uint256(keccak256(abi.encode(_targetHatch, seed))) % setSize;
    return escapeHatch.getCandidateAtIndexForHatch(index, _targetHatch);
  }

  modifier givenSelectedCandidateStatusIsACTIVE() {
    _;
  }

  function test_GivenSelectedCandidateStatusIsACTIVE(EscapeHatchConfig memory _config)
    external
    givenHatchIsNotPrepared
    givenSetIsStable
    givenCandidateSetSizeIsNon_zeroAtSnapshotTime
    givenCurrentTimeIsBeforeNextSnapshotTimestamp
    givenSelectedCandidateStatusIsACTIVE
    givenValidConfig(_config)
  {
    // it should set isHatchPrepared for the hatch
    // it should compute deterministic index from hatch and seed
    // it should set designatedProposer for the hatch
    // it should remove proposer from active candidates
    // it should set proposer status to PROPOSING
    // it should set proposer exitableAt to end of proof window
    // it should emit CandidateSelected event

    // Add a candidate and warp forward to ensure they're in the snapshot
    _joinCandidateSetWithConfig(CANDIDATE1);

    // Warp forward to ensure candidate is in snapshot for selection
    _warpForwardEpochs(config.frequency);

    Epoch currentEpoch = _getCurrentEpoch();
    Hatch currentHatch = escapeHatch.getHatch(currentEpoch);
    Hatch preparedHatch = currentHatch + Hatch.wrap(config.lagInHatches);

    assertTrue(escapeHatch.isCandidate(CANDIDATE1), "Candidate should be in active set");
    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.CandidateSelected(preparedHatch, CANDIDATE1);

    vm.record();
    escapeHatch.selectCandidates();

    (, bytes32[] memory writes) = vm.accesses(address(escapeHatch));
    // 1. set bitmap for hatch prepared (1 sstore)
    // 2. set designated proposer (1 sstore)
    // 3. remove active (5 sstore :skull:)
    // 4. status update (1 sstore)
    // 5. exitable at update (1 sstore, same slot as above)
    // Coverage disables optimizer-driven slot packing, so the candidate metadata updates
    // expand into three additional writes and we observe 12 stores instead of 9.
    uint256 expectedWrites = isCoverage() ? 12 : 9;
    assertEq(writes.length, expectedWrites, "invalid number of writes");

    // Verify hatch is prepared
    assertTrue(escapeHatch.isHatchPrepared(preparedHatch), "Hatch should be prepared");

    // Verify proposer is set
    assertEq(escapeHatch.getDesignatedProposer(preparedHatch), CANDIDATE1, "Proposer should be CANDIDATE1");

    // Verify candidate removed from active set and has PROPOSING status
    assertFalse(escapeHatch.isCandidate(CANDIDATE1), "Candidate should be removed from active set");
    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.PROPOSING), "Status should be PROPOSING");
    assertEq(info.amount, config.bondSize, "Amount should match fuzzed bondSize");

    // Verify exitableAt calculation:
    // exitableAt = first epoch of hatch + ACTIVE_DURATION + proofSubmissionEpochs + PROPOSING_EXIT_DELAY
    Epoch hatchStart = escapeHatch.getFirstEpoch(preparedHatch);
    uint256 proofSubmissionEpochs = IRollup(_getRollup()).getProofSubmissionEpochs();
    Epoch exitableEpoch = Epoch.wrap(Epoch.unwrap(hatchStart) + config.activeDuration + proofSubmissionEpochs);
    uint256 expectedExitableAt =
      Timestamp.unwrap(IValidatorSelection(_getRollup()).getTimestampForEpoch(exitableEpoch))
      + config.proposingExitDelay;
    assertEq(info.exitableAt, uint32(expectedExitableAt), "exitableAt mismatch");
  }

  modifier givenSelectedCandidateStatusIsEXITING() {
    _;
  }

  function test_GivenSelectedCandidateStatusIsEXITING(EscapeHatchConfig memory _config)
    external
    givenHatchIsNotPrepared
    givenSetIsStable
    givenCandidateSetSizeIsNon_zeroAtSnapshotTime
    givenCurrentTimeIsBeforeNextSnapshotTimestamp
    givenSelectedCandidateStatusIsEXITING
    givenValidConfig(_config)
  {
    // it should still select the candidate from snapshot
    // it should NOT remove from active candidates (already removed)
    // it should set proposer status to PROPOSING (overwriting EXITING)
    // it should set proposer exitableAt to end of proof window
    // it should emit CandidateSelected event
    //
    // This test demonstrates that a candidate who initiated exit AFTER the freeze
    // but BEFORE selectCandidates() is called will still be selected (they're in
    // the historical snapshot). Their EXITING status is overwritten to PROPOSING.
    //
    // Setup: We need 2 candidates because initiateExit() internally calls selectCandidates().
    // If there's only 1 candidate, they get selected during their own exit call.
    // With 2 candidates, we first prepare a hatch (selecting one), then the other can exit.
    // For the second hatch, if the exiting candidate is selected, we test our scenario.

    // Join both candidates
    _joinCandidateSetWithConfig(CANDIDATE1);
    _joinCandidateSetWithConfig(CANDIDATE2);

    // Warp forward to ensure candidates are in snapshot for selection
    _warpForwardEpochs(config.frequency);

    // Get current state
    Epoch currentEpoch = _getCurrentEpoch();
    Hatch currentHatch = escapeHatch.getHatch(currentEpoch);
    Hatch firstHatchToPrepare = currentHatch + Hatch.wrap(config.lagInHatches);

    // First selection - one candidate will be selected
    escapeHatch.selectCandidates();

    // Determine which candidate was selected and which can exit
    address firstProposer = escapeHatch.getDesignatedProposer(firstHatchToPrepare);
    address exitingCandidate = (firstProposer == CANDIDATE1) ? CANDIDATE2 : CANDIDATE1;

    // exitingCandidate can now safely call initiateExit
    // (hatch already prepared, so internal selectCandidates is no-op)
    // But first we jump into the freezer to ensure we are still eligible for selection
    Hatch nextHatch = currentHatch + Hatch.wrap(1);
    uint256 nextHatchTs = Timestamp.unwrap(rollup.getTimestampForEpoch(escapeHatch.getFirstEpoch(nextHatch)));
    vm.warp(nextHatchTs - 1);

    vm.prank(exitingCandidate);
    escapeHatch.initiateExit();

    // Verify exitingCandidate is now EXITING
    CandidateInfo memory infoAfterExit = escapeHatch.getCandidateInfo(exitingCandidate);
    assertEq(uint8(infoAfterExit.status), uint8(Status.EXITING), "Status should be EXITING after initiateExit");
    assertFalse(escapeHatch.isCandidate(exitingCandidate), "Should be removed from active set");

    // Get the second hatch to prepare
    Hatch secondHatchToPrepare = nextHatch + Hatch.wrap(config.lagInHatches);
    assertFalse(escapeHatch.isHatchPrepared(secondHatchToPrepare), "hatch already prepared");
    vm.warp(nextHatchTs);

    // Call selectCandidates for the second hatch
    vm.record();
    escapeHatch.selectCandidates();

    (, bytes32[] memory writes) = vm.accesses(address(escapeHatch));
    // 1. set bitmap for hatch prepared (1 sstore)
    // 2. set designated proposer (1 sstore)
    // 3. NO NEED TO REMOVE, ALREADY DONE :happy:
    // 3. status update (1 sstore)
    // 4. exitable at update (1 sstore, same slot as above
    assertEq(writes.length, 1 + 1 + 1 + 1, "invalid number of writes");

    // Check who was selected for the second hatch
    address secondProposer = escapeHatch.getDesignatedProposer(secondHatchToPrepare);
    assertEq(secondProposer, exitingCandidate, "exiting candidate not chosen");

    // exitingCandidate was selected! Verify the EXITING -> PROPOSING transition.
    CandidateInfo memory infoAfterSelection = escapeHatch.getCandidateInfo(exitingCandidate);
    assertEq(
      uint8(infoAfterSelection.status), uint8(Status.PROPOSING), "Status should be PROPOSING (overwriting EXITING)"
    );

    // Verify they're still not in active candidates (already removed during initiateExit)
    assertFalse(escapeHatch.isCandidate(exitingCandidate), "Should still not be in active set");

    // Verify exitableAt is set to end of proof window + PROPOSING_EXIT_DELAY
    Epoch hatchStart = escapeHatch.getFirstEpoch(secondHatchToPrepare);
    uint256 proofSubmissionEpochs = IRollup(_getRollup()).getProofSubmissionEpochs();
    Epoch exitableEpoch = Epoch.wrap(Epoch.unwrap(hatchStart) + config.activeDuration + proofSubmissionEpochs);
    uint256 expectedExitableAt =
      Timestamp.unwrap(IValidatorSelection(_getRollup()).getTimestampForEpoch(exitableEpoch))
      + config.proposingExitDelay;
    assertEq(infoAfterSelection.exitableAt, uint32(expectedExitableAt), "exitableAt should be end of proof window");
  }

  modifier givenSelectedCandidateStatusIsNONE() {
    _;
  }

  function test_GivenSelectedCandidateStatusIsNONE(EscapeHatchConfig memory _config)
    external
    givenHatchIsNotPrepared
    givenSetIsStable
    givenCandidateSetSizeIsNon_zeroAtSnapshotTime
    givenCurrentTimeIsBeforeNextSnapshotTimestamp
    givenSelectedCandidateStatusIsNONE
    givenValidConfig(_config)
  {
    // it should set isHatchPrepared for the hatch
    // it should not set designatedProposer
    // it should not modify the candidate
    // it should not emit CandidateSelected event
    //
    // A candidate in the historical snapshot can have fully left the set (status NONE, bond
    // refunded) by the time selection runs: initiateExit skips selection while this contract
    // is not the rollup's active escape hatch, so an exit in that state leaves the hatch
    // unprepared, and the snapshot still contains the candidate once the hatch is active again.
    // Such a candidate has nothing at stake and must not be designated proposer.

    _deployWithFakeRollup();
    _warpToSafeEpoch();

    _joinCandidateSetWithConfig(CANDIDATE1);

    // Warp forward to ensure candidate is in snapshot for selection
    _warpForwardEpochs(config.frequency);

    Hatch currentHatch = escapeHatch.getHatch(_getCurrentEpoch());
    Hatch preparedHatch = currentHatch + Hatch.wrap(config.lagInHatches);
    assertEq(escapeHatch.getCandidateCountForHatch(preparedHatch), 1, "Candidate should be in snapshot");

    // Deactivate the hatch, then fully exit: selection is skipped, and we are before the next
    // freeze so the exit is immediate.
    fakeRollup.setEscapeHatch(address(0));

    vm.prank(CANDIDATE1);
    escapeHatch.initiateExit();
    vm.prank(CANDIDATE1);
    escapeHatch.leaveCandidateSet();

    assertFalse(escapeHatch.isHatchPrepared(preparedHatch), "Hatch must not be prepared while inactive");
    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.NONE), "Status should be NONE after leaving");
    assertEq(info.amount, 0, "Bond should be refunded");
    assertEq(escapeHatch.getCandidateCountForHatch(preparedHatch), 1, "Candidate should still be in snapshot");

    // Reactivate the hatch, still within the selection window
    fakeRollup.setEscapeHatch(address(escapeHatch));

    vm.record();
    vm.recordLogs();
    escapeHatch.selectCandidates();

    (, bytes32[] memory writes) = vm.accesses(address(escapeHatch));
    assertEq(writes.length, 1, "Should only write isHatchPrepared");
    assertEq(vm.getRecordedLogs().length, 0, "Should not emit any event");

    assertTrue(escapeHatch.isHatchPrepared(preparedHatch), "Hatch should be prepared");
    assertEq(escapeHatch.getDesignatedProposer(preparedHatch), address(0), "Should have no proposer");

    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.NONE), "Status should remain NONE");
    assertEq(info.amount, 0, "Amount should remain zero");
    assertFalse(escapeHatch.isCandidate(CANDIDATE1), "Candidate should not be in active set");
  }
}

/// @notice Selection tests under a rollup `lagInEpochsForRandao` of 1.
/// @dev The escape hatch compensates for the rollup's lag when it queries the seed, so the
///      freeze-before-RANDAO ordering must hold for any value.
contract EscapeHatchSelectCandidatesRandaoLagOneTest is EscapeHatchSelectCandidatesTest {
  function _lagInEpochsForRandao() internal pure override returns (uint256) {
    return 1;
  }
}
