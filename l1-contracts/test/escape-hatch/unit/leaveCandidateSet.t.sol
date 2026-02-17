// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchBase, EscapeHatchConfig} from "../base.sol";
import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";

contract EscapeHatchLeaveCandidateSetTest is EscapeHatchBase {
  function test_GivenCallerStatusIsNotEXITING(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should revert {EscapeHatch__InvalidStatus}

    vm.expectRevert(
      abi.encodeWithSelector(Errors.EscapeHatch__InvalidStatus.selector, uint8(Status.EXITING), uint8(Status.NONE))
    );
    vm.prank(CANDIDATE1);
    escapeHatch.leaveCandidateSet();

    _joinCandidateSetWithConfig(CANDIDATE1);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.EscapeHatch__InvalidStatus.selector, uint8(Status.EXITING), uint8(Status.ACTIVE))
    );
    vm.prank(CANDIDATE1);
    escapeHatch.leaveCandidateSet();

    _warpForwardEpochs(config.frequency);

    escapeHatch.selectCandidates();
    vm.expectRevert(
      abi.encodeWithSelector(Errors.EscapeHatch__InvalidStatus.selector, uint8(Status.EXITING), uint8(Status.PROPOSING))
    );
    vm.prank(CANDIDATE1);
    escapeHatch.leaveCandidateSet();
  }

  modifier givenCallerStatusIsEXITING(EscapeHatchConfig memory _config) {
    // Apply config
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

    // Prepare the hatch with no candidates (so no one gets selected as proposer)
    escapeHatch.selectCandidates();

    // Now join candidate set (after hatch is prepared, they won't be selected)
    _joinCandidateSetWithConfig(CANDIDATE1);

    // Initiate exit (before freeze for next hatch) so exitableAt = current timestamp
    vm.prank(CANDIDATE1);
    escapeHatch.initiateExit();
    _;
  }

  function test_WhenExitableAtHasNotBeenReached(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should revert {EscapeHatch__NotExitableYet}
    //
    // To get an EXITING candidate with exitableAt in the future, we call initiateExit()
    // AFTER the freeze timestamp for the next hatch. This pushes exitableAt to the
    // first epoch of (currentHatch + 2).

    // Setup escape hatch with bounded config
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

    // Warp to safe epoch
    _warpToSafeEpoch();

    // Prepare hatch so CANDIDATE1 won't be selected as proposer when we call initiateExit
    escapeHatch.selectCandidates();

    // Join candidate set
    _joinCandidateSetWithConfig(CANDIDATE1);

    // Get the freeze timestamp for the next target hatch
    // The next selection (during currentHatch + 1) prepares targetHatch = currentHatch + 1 + lagInHatches
    Epoch currentEpoch = _getCurrentEpoch();
    Hatch currentHatch = escapeHatch.getHatch(currentEpoch);
    Hatch nextTargetHatch = currentHatch + Hatch.wrap(1 + config.lagInHatches);
    uint256 nextFreezeTimestamp = escapeHatch.getSetTimestamp(nextTargetHatch);

    // Warp to the freeze timestamp (not beyond the hatch start)
    vm.warp(nextFreezeTimestamp);

    // Now call initiateExit - exitableAt will be pushed to first epoch of hatch after next
    vm.prank(CANDIDATE1);
    escapeHatch.initiateExit();

    // Verify status is EXITING and exitableAt is in the future
    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Status should be EXITING");
    assertTrue(info.exitableAt > block.timestamp, "exitableAt should be in the future");

    // Try to leave before exitableAt - should revert with NotExitableYet
    vm.expectRevert(
      abi.encodeWithSelector(Errors.EscapeHatch__NotExitableYet.selector, info.exitableAt, block.timestamp)
    );
    vm.prank(CANDIDATE1);
    escapeHatch.leaveCandidateSet();
  }

  modifier whenExitableAtHasBeenReached() {
    // For the givenCallerStatusIsEXITING modifier, exitableAt is already set to current timestamp
    // (because initiateExit was called before freeze), so we're already past exitableAt.
    // This modifier is a marker for tree structure clarity.
    _;
  }

  function test_GivenCallerWasNotPunished(EscapeHatchConfig memory _config, uint256 _timeAfterExitable)
    external
    givenCallerStatusIsEXITING(_config)
    whenExitableAtHasBeenReached
  {
    // it should delete candidate data
    // it should transfer correct refund to caller
    // it should emit CandidateExited event
    //
    // Key properties:
    // - Refund = max(0, amount - WITHDRAWAL_TAX)
    // - Once exitableAt is reached, leaving can happen at ANY future time with same refund
    // - Fuzzing covers amount => tax, amount

    // Bound time after exitable (0 to 10 years)
    _timeAfterExitable = bound(_timeAfterExitable, 0, 365 days * 10);

    // Jump additional time into the future - leaving should still work with same refund
    vm.warp(block.timestamp + _timeAfterExitable);

    uint256 balanceBefore = bondToken.balanceOf(CANDIDATE1);
    uint96 expectedRefund = config.bondSize - config.withdrawalTax;

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.CandidateExited(CANDIDATE1, expectedRefund);

    vm.prank(CANDIDATE1);
    escapeHatch.leaveCandidateSet();

    // Verify candidate data is deleted
    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.NONE), "Status should be NONE");
    assertEq(info.amount, 0, "Amount should be 0");
    assertEq(info.exitableAt, 0, "exitableAt should be 0");
    assertEq(info.lastCheckpointNumber, 0, "lastCheckpointNumber should be 0");
    assertEq(info.lastSubmittedArchive, bytes32(0), "lastSubmittedArchive should be 0");

    // Verify token transfer
    assertEq(bondToken.balanceOf(CANDIDATE1), balanceBefore + expectedRefund, "Refund amount mismatch");
  }

  function test_GivenCallerWasPunished(EscapeHatchConfig memory _config, uint256 _timeAfterValidation)
    external
    givenValidConfig(_config)
    whenExitableAtHasBeenReached
  {
    // it should delete candidate data
    // it should transfer correct refund to caller
    // it should emit CandidateExited event
    //
    // Key properties:
    // - Refund = max(0, amount - WITHDRAWAL_TAX) where amount = BOND_SIZE - FAILED_HATCH_PUNISHMENT
    // - After validation, leaving can happen at ANY future time with same refund
    // - Fuzzing covers amount > tax, amount == tax, amount < tax cases naturally

    // Bound time after validation (0 to 10 years)
    _timeAfterValidation = bound(_timeAfterValidation, 0, 365 days * 10);

    _deployWithFakeRollup();

    // Warp to safe epoch using FakeRollup timing (after deploying FakeRollup)
    _warpToSafeEpoch();

    _joinCandidateSetWithConfig(CANDIDATE1);
    _warpForwardEpochs(config.frequency);
    escapeHatch.selectCandidates();

    Epoch currentEpoch = _getCurrentEpoch();
    Hatch currentHatch = escapeHatch.getHatch(currentEpoch);
    Hatch preparedHatch = currentHatch + Hatch.wrap(config.lagInHatches);

    // Warp past exitableAt
    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    vm.warp(info.exitableAt);

    // Validate proof submission - proposer didn't submit, so they get punished
    escapeHatch.validateProofSubmission(preparedHatch);

    // After punishment: amount = bondSize - failedHatchPunishment
    uint96 amountAfterPunishment = config.bondSize - config.failedHatchPunishment;

    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(info.amount, amountAfterPunishment, "Amount after punishment mismatch");

    // Jump additional time into the future - leaving should still work with same refund
    vm.warp(block.timestamp + _timeAfterValidation);

    // Calculate expected refund
    uint96 expectedRefund =
      amountAfterPunishment > config.withdrawalTax ? amountAfterPunishment - config.withdrawalTax : 0;

    uint256 balanceBefore = bondToken.balanceOf(CANDIDATE1);

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.CandidateExited(CANDIDATE1, expectedRefund);

    vm.prank(CANDIDATE1);
    escapeHatch.leaveCandidateSet();

    // Verify candidate data is deleted
    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.NONE), "Status should be NONE");
    assertEq(info.amount, 0, "Amount should be 0");
    assertEq(info.exitableAt, 0, "exitableAt should be 0");
    assertEq(info.lastCheckpointNumber, 0, "lastCheckpointNumber should be 0");
    assertEq(info.lastSubmittedArchive, bytes32(0), "lastSubmittedArchive should be 0");

    // Verify token transfer
    assertEq(bondToken.balanceOf(CANDIDATE1), balanceBefore + expectedRefund, "Refund after punishment mismatch");
  }
}
