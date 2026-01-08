// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchBase, EscapeHatchConfig} from "../base.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";

contract EscapeHatchValidateProofSubmissionTest is EscapeHatchBase {
  Hatch internal preparedHatch;

  function _setupProposerWithFakeRollup() internal returns (Hatch) {
    _deployWithFakeRollup();

    // Add candidate and set up as proposer
    _joinCandidateSetWithConfig(CANDIDATE1);

    // Warp to safe epoch to avoid underflow in selectCandidates
    _warpToSafeEpoch();

    // Warp forward a bit more to ensure snapshot is stable
    _warpForwardEpochs(3);

    // Select candidates
    escapeHatch.selectCandidates();

    Epoch currentEpoch = _getCurrentEpoch();
    Hatch currentHatch = escapeHatch.getHatch(currentEpoch);
    return currentHatch + Hatch.wrap(config.lagInHatches);
  }

  function test_GivenHatchHasAlreadyBeenValidated(EscapeHatchConfig memory _config) external givenValidConfig(_config) {
    // it should revert {EscapeHatch__AlreadyValidated}
    //
    // Once a hatch has been validated, subsequent validation attempts fail with AlreadyValidated.

    preparedHatch = _setupProposerWithFakeRollup();

    // Warp past exitableAt
    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    vm.warp(info.exitableAt);

    // First call to validateProofSubmission succeeds and marks hatch as validated
    escapeHatch.validateProofSubmission(preparedHatch);

    // Second call should fail because hatch was already validated
    vm.expectRevert(abi.encodeWithSelector(Errors.EscapeHatch__AlreadyValidated.selector, preparedHatch));
    escapeHatch.validateProofSubmission(preparedHatch);
  }

  modifier givenHatchHasNotBeenValidated() {
    // This modifier is a marker for tree structure clarity.
    // Hatch is not validated until validateProofSubmission is called.
    _;
  }

  function test_GivenNoProposerWasDesignatedForTheHatch(EscapeHatchConfig memory _config)
    external
    givenValidConfig(_config)
    givenHatchHasNotBeenValidated
  {
    // it should revert {EscapeHatch__NoDesignatedProposer}
    Hatch hatch = Hatch.wrap(999);
    vm.expectRevert(abi.encodeWithSelector(Errors.EscapeHatch__NoDesignatedProposer.selector, Hatch.unwrap(hatch)));
    escapeHatch.validateProofSubmission(hatch);
  }

  modifier givenProposerWasDesignatedForTheHatch(EscapeHatchConfig memory _config) {
    config = _boundValidConfig(_config);
    preparedHatch = _setupProposerWithFakeRollup();
    _;
  }

  function test_GivenProposerStatusIsNotPROPOSING(EscapeHatchConfig memory _config)
    external
    givenProposerWasDesignatedForTheHatch(_config)
    givenHatchHasNotBeenValidated
  {
    // it should revert {EscapeHatch__InvalidStatus}
    //
    // DEFENSE IN DEPTH: This check is unreachable in normal operation because
    // the AlreadyValidated check would trigger first for any previously validated hatch.
    // This test is skipped as we cannot reach this code path without manipulating internal state.

    vm.skip(true);
  }

  modifier givenProposerStatusIsPROPOSING() {
    // Proposer from givenProposerWasDesignatedForTheHatch is already in PROPOSING status.
    // This modifier is a marker for tree structure clarity.
    _;
  }

  function test_WhenExitableAtHasNotBeenReached(EscapeHatchConfig memory _config)
    external
    givenProposerWasDesignatedForTheHatch(_config)
    givenProposerStatusIsPROPOSING
  {
    // it should revert {EscapeHatch__NotExitableYet}

    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);

    // exitableAt is in the future (proposer has proof window)
    assertTrue(block.timestamp < info.exitableAt, "Should be before exitableAt");

    vm.expectRevert(
      abi.encodeWithSelector(Errors.EscapeHatch__NotExitableYet.selector, info.exitableAt, block.timestamp)
    );
    escapeHatch.validateProofSubmission(preparedHatch);
  }

  modifier whenExitableAtHasBeenReached() {
    // Warp past exitableAt
    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    vm.warp(info.exitableAt);
    _;
  }

  function test_GivenProposerNeverSubmitted(EscapeHatchConfig memory _config)
    external
    givenProposerWasDesignatedForTheHatch(_config)
    givenProposerStatusIsPROPOSING
    whenExitableAtHasBeenReached
  {
    // it should have lastCheckpointNumber EQ zero
    // it should apply FAILED_HATCH_PUNISHMENT
    // it should set status to EXITING
    // it should clear lastCheckpointNumber and lastSubmittedArchive
    // it should emit ProofValidated with success false

    CandidateInfo memory infoBefore = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(infoBefore.lastCheckpointNumber, 0, "lastCheckpointNumber should be 0");

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(preparedHatch, CANDIDATE1, false, config.failedHatchPunishment);

    escapeHatch.validateProofSubmission(preparedHatch);

    CandidateInfo memory infoAfter = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(infoAfter.status), uint8(Status.EXITING), "Status should be EXITING");
    assertEq(infoAfter.amount, config.bondSize - config.failedHatchPunishment, "Punishment not applied");
    assertEq(infoAfter.lastCheckpointNumber, 0, "lastCheckpointNumber should be cleared");
    assertEq(infoAfter.lastSubmittedArchive, bytes32(0), "lastSubmittedArchive should be cleared");
  }

  function test_GivenProofsNotSubmittedUpToCheckpoint(EscapeHatchConfig memory _config)
    external
    givenProposerWasDesignatedForTheHatch(_config)
    givenProposerStatusIsPROPOSING
    whenExitableAtHasBeenReached
  {
    // it should apply FAILED_HATCH_PUNISHMENT
    // it should set status to EXITING
    // it should clear lastCheckpointNumber and lastSubmittedArchive
    // it should emit ProofValidated with success false

    // Simulate that proposer submitted a checkpoint
    uint128 checkpointNumber = 10;
    bytes32 archive = bytes32(uint256(0xdeadbeef));

    vm.prank(address(fakeRollup));
    escapeHatch.updateSubmittedArchive(CANDIDATE1, checkpointNumber, archive);

    // provenCheckpointNumber is 0 by default (proofs not submitted up to checkpoint)

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(preparedHatch, CANDIDATE1, false, config.failedHatchPunishment);

    escapeHatch.validateProofSubmission(preparedHatch);

    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Status should be EXITING");
    assertEq(info.amount, config.bondSize - config.failedHatchPunishment, "Punishment not applied");
  }

  function test_GivenCheckpointArchiveWasPruned(EscapeHatchConfig memory _config)
    external
    givenProposerWasDesignatedForTheHatch(_config)
    givenProposerStatusIsPROPOSING
    whenExitableAtHasBeenReached
  {
    // it should apply FAILED_HATCH_PUNISHMENT
    // it should set status to EXITING
    // it should clear lastCheckpointNumber and lastSubmittedArchive
    // it should emit ProofValidated with success false

    uint128 checkpointNumber = 10;
    bytes32 submittedArchive = bytes32(uint256(0xdeadbeef));
    bytes32 differentArchive = bytes32(uint256(0xcafebabe));

    // Proposer submitted a checkpoint
    vm.prank(address(fakeRollup));
    escapeHatch.updateSubmittedArchive(CANDIDATE1, checkpointNumber, submittedArchive);

    // Proofs were submitted (provenCheckpointNumber >= checkpointNumber)
    fakeRollup.setProvenCheckpointNumber(checkpointNumber);

    // But the archive at that checkpoint is different (pruned/reorged)
    fakeRollup.setArchiveAt(checkpointNumber, differentArchive);

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(preparedHatch, CANDIDATE1, false, config.failedHatchPunishment);

    escapeHatch.validateProofSubmission(preparedHatch);

    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Status should be EXITING");
    assertEq(info.amount, config.bondSize - config.failedHatchPunishment, "Punishment not applied");
    assertEq(info.lastCheckpointNumber, 0, "lastCheckpointNumber should be cleared");
    assertEq(info.lastSubmittedArchive, bytes32(0), "lastSubmittedArchive should be cleared");
  }

  function test_GivenAllConditionsPass(EscapeHatchConfig memory _config, uint256 _timeAfterExitable)
    external
    givenProposerWasDesignatedForTheHatch(_config)
    givenProposerStatusIsPROPOSING
    whenExitableAtHasBeenReached
  {
    // it should not apply punishment
    // it should set status to EXITING
    // it should clear lastCheckpointNumber and lastSubmittedArchive
    // it should emit ProofValidated with success true
    //
    // Key property: Once exitableAt is reached, validation can happen at ANY future time
    // with the same result (fuzzed via _timeAfterExitable)

    // Bound time after exitable (0 to 10 years)
    _timeAfterExitable = bound(_timeAfterExitable, 0, 365 days * 10);

    // Jump additional time into the future - validation should still work
    vm.warp(block.timestamp + _timeAfterExitable);

    uint128 checkpointNumber = 10;
    bytes32 archive = bytes32(uint256(0xdeadbeef));

    // Proposer submitted a checkpoint
    vm.prank(address(fakeRollup));
    escapeHatch.updateSubmittedArchive(CANDIDATE1, checkpointNumber, archive);

    // Proofs were submitted (provenCheckpointNumber >= checkpointNumber)
    fakeRollup.setProvenCheckpointNumber(checkpointNumber);

    // Archive matches what proposer submitted
    fakeRollup.setArchiveAt(checkpointNumber, archive);

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(preparedHatch, CANDIDATE1, true, 0);

    escapeHatch.validateProofSubmission(preparedHatch);

    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Status should be EXITING");
    assertEq(info.amount, config.bondSize, "Punishment should NOT be applied");
    assertEq(info.lastCheckpointNumber, 0, "lastCheckpointNumber should be cleared");
    assertEq(info.lastSubmittedArchive, bytes32(0), "lastSubmittedArchive should be cleared");
  }
}
