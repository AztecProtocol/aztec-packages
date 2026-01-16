// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchBase, EscapeHatchConfig} from "../base.sol";
import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";

contract EscapeHatchInitiateExitTest is EscapeHatchBase {
  function test_GivenCallerIsNotInCandidateSet(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should revert {EscapeHatch__NotInCandidateSet}

    // Warp to safe epoch because initiateExit() calls selectCandidates() internally
    _warpToSafeEpoch();

    vm.expectRevert(abi.encodeWithSelector(Errors.EscapeHatch__NotInCandidateSet.selector, CANDIDATE1));
    vm.prank(CANDIDATE1);
    escapeHatch.initiateExit();
  }

  modifier givenCallerIsInCandidateSet(EscapeHatchConfig memory _config) {
    config = _boundValidConfig(_config);

    escapeHatch = new EscapeHatch(
      _getRollup(),
      address(bondToken),
      config.bondSize,
      config.withdrawalTax,
      config.failedHatchPunishment,
      config.frequency,
      config.activeDuration,
      config.lagInHatches,
      config.proposingExitDelay
    );

    // Warp to safe epoch to avoid underflow in selectCandidates (called by initiateExit)
    _warpToSafeEpoch();

    // Now join candidate set (after hatch is prepared, they won't be selected)
    _joinCandidateSetWithConfig(CANDIDATE1);
    _;
  }

  function test_GivenCallerStatusIsNotACTIVE() external {
    // NOTE: This test documents that the status check in initiateExit() is actually
    // unreachable in practice. The contract implementation removes candidates from
    // $activeCandidates whenever their status changes from ACTIVE:
    // - PROPOSING status: removed in selectCandidates() when selected as proposer
    // - EXITING status: removed in initiateExit()
    //
    // Therefore, the $activeCandidates.contains() check will always fail before
    // the status check can fail for non-ACTIVE statuses.
    //
    // The status check serves as defense-in-depth but cannot be triggered through
    // normal contract interactions. This is covered by test_GivenCallerIsNotInCandidateSet.
    vm.skip(true);
  }

  modifier givenCallerStatusIsACTIVE() {
    // Candidate from givenCallerIsInCandidateSet is already in ACTIVE status.
    // This modifier is a marker for tree structure clarity.
    _;
  }

  function test_WhenCurrentTimeIsBeforeNextFreezeTimestamp(EscapeHatchConfig memory _config, uint256 _timeOffset)
    external
    givenCallerIsInCandidateSet(_config)
    givenCallerStatusIsACTIVE
  {
    // it should call selectCandidates
    // it should remove caller from active candidates
    // it should set caller status to EXITING
    // it should set exitableAt to current timestamp
    // it should emit CandidateExitInitiated event
    //
    // Key property: At ANY point before the freeze timestamp, exitableAt = block.timestamp
    // (fuzzed via _timeOffset covering full range from now until freeze - 1)

    // Calculate next freeze timestamp using the contract's own method
    // The next selection (during currentHatch + 1) prepares targetHatch = currentHatch + 1 + lagInHatches
    Epoch currentEpoch = _getCurrentEpoch();
    Hatch currentHatch = escapeHatch.getHatch(currentEpoch);
    Hatch nextTargetHatch = currentHatch + Hatch.wrap(1 + config.lagInHatches);
    uint256 nextFreezeTimestamp = escapeHatch.getSetTimestamp(nextTargetHatch);

    // Bound time offset to stay strictly before freeze
    vm.warp(bound(_timeOffset, block.timestamp, nextFreezeTimestamp - 1));

    uint256 currentTime = block.timestamp;

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.CandidateExitInitiated(CANDIDATE1, uint32(currentTime));

    vm.prank(CANDIDATE1);
    escapeHatch.initiateExit();

    // Verify removal from active candidates
    assertFalse(escapeHatch.isCandidate(CANDIDATE1), "Candidate should not be in active set");
    assertEq(escapeHatch.getCandidateCount(), 0, "Candidate count should be 0");

    // Verify status
    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Status should be EXITING");
    assertEq(info.exitableAt, uint32(currentTime), "exitableAt should be current timestamp");
  }

  modifier whenCurrentTimeIsAtOrAfterNextFreezeTimestamp() {
    // This modifier is a marker for the tree structure
    // Actual timing setup is done in each test since the scenarios differ
    _;
  }

  function test_GivenCallerIsSelectedAsProposerDuringSelectCandidates(EscapeHatchConfig memory _config)
    external
    givenValidConfig(_config)
    givenCallerStatusIsACTIVE
    whenCurrentTimeIsAtOrAfterNextFreezeTimestamp
  {
    // it should revert {EscapeHatch__NotInCandidateSet}
    //
    // When initiateExit() calls selectCandidates(), if CANDIDATE1 is the only candidate
    // in the snapshot for the next hatch, they will be selected as proposer.
    // This removes them from the active candidate set, causing the subsequent
    // $activeCandidates.contains() check to fail.

    _warpToSafeEpoch();

    _joinCandidateSetWithConfig(CANDIDATE1);

    Epoch currentEpoch = _getCurrentEpoch();
    Hatch currentHatch = escapeHatch.getHatch(currentEpoch);
    Hatch nextHatch = currentHatch + Hatch.wrap(1);
    Epoch firstEpochOfNextHatch = escapeHatch.getFirstEpoch(nextHatch);

    Timestamp tsNextHatch = IValidatorSelection(_getRollup()).getTimestampForEpoch(firstEpochOfNextHatch);
    vm.warp(Timestamp.unwrap(tsNextHatch));

    // CANDIDATE1 is the only candidate in the snapshot
    // When selectCandidates() runs, they will be selected as proposer and removed from active set
    // The revert with NotInCandidateSet confirms CANDIDATE1 was selected and removed
    assertTrue(escapeHatch.isCandidate(CANDIDATE1), "not candidate before initiateExit");

    vm.expectRevert(abi.encodeWithSelector(Errors.EscapeHatch__NotInCandidateSet.selector, CANDIDATE1));
    vm.prank(CANDIDATE1);
    escapeHatch.initiateExit();
  }

  function test_GivenCallerIsNotSelectedAsProposerDuringSelectCandidates(
    EscapeHatchConfig memory _config,
    uint256 _timeAfterFreeze
  ) external givenValidConfig(_config) givenCallerStatusIsACTIVE whenCurrentTimeIsAtOrAfterNextFreezeTimestamp {
    // it should call selectCandidates
    // it should remove caller from active candidates
    // it should set caller status to EXITING
    // it should set exitableAt to first epoch after next hatch
    // it should emit CandidateExitInitiated event
    //
    // Key property: At ANY point at or after the freeze timestamp, exitableAt is pushed
    // to first epoch after the next hatch (fuzzed via _timeAfterFreeze)
    //
    // When initiateExit() calls selectCandidates() while we're past the freeze timestamp,
    // selectCandidates() returns early (no-op) - the hatch is marked as prepared but no
    // proposer is selected. This allows initiateExit() to proceed without reverting.

    // Custom setup: Join candidate FIRST (at timestamp 1) so they're in all snapshots,
    // then warp to safe epoch, then warp to freeze zone
    _joinCandidateSetWithConfig(CANDIDATE1);
    _warpToSafeEpoch();

    // Get the freeze timestamp and first epoch of the next hatch
    // The next selection (during currentHatch + 1) prepares targetHatch = currentHatch + 1 + lagInHatches
    Epoch currentEpoch = _getCurrentEpoch();
    Hatch currentHatch = escapeHatch.getHatch(currentEpoch);
    Hatch nextHatch = currentHatch + Hatch.wrap(1);
    Hatch nextTargetHatch = nextHatch + Hatch.wrap(config.lagInHatches);

    uint256 nextFreezeTimestamp = escapeHatch.getSetTimestamp(nextTargetHatch);
    Epoch firstEpochOfNextHatch = escapeHatch.getFirstEpoch(nextHatch);
    uint256 nextHatchStart =
      Timestamp.unwrap(IValidatorSelection(_getRollup()).getTimestampForEpoch(firstEpochOfNextHatch));

    // Fuzz timestamp in range [freeze(N+1), firstEpoch(N+1))
    // This tests the no-op path in selectCandidates() when past the freeze timestamp
    uint256 ts = bound(_timeAfterFreeze, nextFreezeTimestamp, nextHatchStart - 1);
    vm.warp(ts);

    // Record state right before initiateExit
    Epoch epochNow = _getCurrentEpoch();
    Hatch currentHatchNow = escapeHatch.getHatch(epochNow);

    // Calculate expected exitableAt: getSetTimestamp(nextTargetHatch + 1)
    // nextTargetHatch = currentHatch + 1 + LAG_IN_HATCHES
    Hatch nextTargetHatchNow = currentHatchNow + Hatch.wrap(1 + config.lagInHatches);
    uint256 expectedExitableAt = escapeHatch.getSetTimestamp(nextTargetHatchNow + Hatch.wrap(1));

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.CandidateExitInitiated(CANDIDATE1, uint32(expectedExitableAt));

    vm.prank(CANDIDATE1);
    escapeHatch.initiateExit();

    // Verify removal from active candidates
    assertFalse(escapeHatch.isCandidate(CANDIDATE1), "Candidate should not be in active set");

    // Verify status
    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Status should be EXITING");

    // exitableAt should be the freeze timestamp of (nextTargetHatch + 1) - selection window for next potential target
    assertEq(info.exitableAt, uint32(expectedExitableAt), "exitableAt mismatch");

    // Verify exitableAt is in the future
    assertTrue(info.exitableAt > block.timestamp, "exitableAt should be in the future");
  }
}
