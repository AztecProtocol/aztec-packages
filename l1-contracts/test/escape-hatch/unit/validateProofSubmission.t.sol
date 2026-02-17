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

    // Warp to safe epoch to avoid HatchTooEarly when joining
    _warpToSafeEpoch();

    // Add candidate and set up as proposer
    _joinCandidateSetWithConfig(CANDIDATE1);

    // Warp forward to ensure candidate is in snapshot
    _warpForwardEpochs(config.frequency);

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

  modifier givenEscapeHatchWasNOTActiveForEntirePeriod() {
    // Simulate deactivation: FakeRollup now reports no escape hatch for any epoch.
    // This makes wasActiveEntirePeriod = false.
    fakeRollup.setEscapeHatch(address(0));
    _;
  }

  function test_GivenProposerNeverSubmitted(EscapeHatchConfig memory _config)
    external
    givenProposerWasDesignatedForTheHatch(_config)
    givenProposerStatusIsPROPOSING
    whenExitableAtHasBeenReached
    givenEscapeHatchWasNOTActiveForEntirePeriod
  {
    // it should not apply punishment
    // it should set status to EXITING
    // it should clear lastCheckpointNumber and lastSubmittedArchive
    // it should set isHatchValidated to true
    // it should emit ProofValidated with success true and zero punishment
    //
    // Simulates governance deactivating the escape hatch during the proposer's window.
    // The proposer did nothing (lastCheckpointNumber == 0) and the escape hatch was disrupted,
    // so no punishment is applied.

    CandidateInfo memory infoBefore = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(infoBefore.lastCheckpointNumber, 0, "lastCheckpointNumber should be 0");
    assertFalse(escapeHatch.isHatchValidated(preparedHatch), "Hatch should not be validated yet");

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(preparedHatch, CANDIDATE1, true, 0);

    escapeHatch.validateProofSubmission(preparedHatch);

    assertTrue(escapeHatch.isHatchValidated(preparedHatch), "Hatch should be validated");
    CandidateInfo memory infoAfter = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(infoAfter.status), uint8(Status.EXITING), "Status should be EXITING");
    assertEq(infoAfter.amount, config.bondSize, "Punishment should NOT be applied");
    assertEq(infoAfter.lastCheckpointNumber, 0, "lastCheckpointNumber should be cleared");
    assertEq(infoAfter.lastSubmittedArchive, bytes32(0), "lastSubmittedArchive should be cleared");
  }

  function test_GivenProposerDidSubmit(EscapeHatchConfig memory _config)
    external
    givenProposerWasDesignatedForTheHatch(_config)
    givenProposerStatusIsPROPOSING
    whenExitableAtHasBeenReached
    givenEscapeHatchWasNOTActiveForEntirePeriod
  {
    // it should apply normal validation (punish on failure)
    //
    // Even though the escape hatch was deactivated, the proposer submitted a checkpoint.
    // They are on the hook for normal validation regardless of escape hatch changes,
    // since proofs go to the rollup directly and are unaffected by escape hatch changes.

    uint128 checkpointNumber = 10;
    bytes32 archive = bytes32(uint256(0xdeadbeef));

    // Proposer submitted a checkpoint before deactivation
    vm.prank(address(fakeRollup));
    escapeHatch.updateSubmittedArchive(CANDIDATE1, checkpointNumber, archive);

    // provenCheckpointNumber is 0 by default (proofs not submitted up to checkpoint)
    // Normal validation kicks in and punishes for failed proof submission.

    assertFalse(escapeHatch.isHatchValidated(preparedHatch), "Hatch should not be validated yet");

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(preparedHatch, CANDIDATE1, false, config.failedHatchPunishment);

    escapeHatch.validateProofSubmission(preparedHatch);

    assertTrue(escapeHatch.isHatchValidated(preparedHatch), "Hatch should be validated");
    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Status should be EXITING");
    assertEq(info.amount, config.bondSize - config.failedHatchPunishment, "Punishment should be applied");
  }

  // ============ Middle-epoch gap tests ============
  //
  // These tests verify the loop in validateProofSubmission that checks EVERY epoch in the
  // active period. A simpler first-and-last check would miss the case where governance
  // briefly deactivates and re-activates the escape hatch mid-window, creating a gap only
  // in the middle epochs.
  //
  // Requires activeDuration >= 3 so there exists a middle epoch distinct from first and last.

  modifier givenMiddleEpochGap() {
    // Skip fuzz runs where activeDuration < 3 (no distinct middle epoch exists)
    vm.assume(config.activeDuration >= 3);

    // Override a middle epoch to address(0) while first and last remain active.
    // This simulates governance briefly deactivating and re-activating the escape hatch.
    Epoch firstEpoch = escapeHatch.getFirstEpoch(preparedHatch);
    fakeRollup.setEscapeHatchForEpoch(Epoch.unwrap(firstEpoch) + 1, address(0));
    _;
  }

  function test_GivenMiddleEpochGapAndProposerNeverSubmitted(EscapeHatchConfig memory _config)
    external
    givenProposerWasDesignatedForTheHatch(_config)
    givenProposerStatusIsPROPOSING
    whenExitableAtHasBeenReached
    givenMiddleEpochGap
  {
    // it should detect the gap via the epoch loop
    // it should not apply punishment
    // it should set status to EXITING
    // it should clear lastCheckpointNumber and lastSubmittedArchive
    // it should set isHatchValidated to true
    //
    // First and last epochs are active, but a middle epoch is not.
    // A first-and-last check would incorrectly report wasActiveEntirePeriod = true.

    CandidateInfo memory infoBefore = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(infoBefore.lastCheckpointNumber, 0, "lastCheckpointNumber should be 0");
    assertFalse(escapeHatch.isHatchValidated(preparedHatch), "Hatch should not be validated yet");

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(preparedHatch, CANDIDATE1, true, 0);

    escapeHatch.validateProofSubmission(preparedHatch);

    assertTrue(escapeHatch.isHatchValidated(preparedHatch), "Hatch should be validated");
    CandidateInfo memory infoAfter = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(infoAfter.status), uint8(Status.EXITING), "Status should be EXITING");
    assertEq(infoAfter.amount, config.bondSize, "Punishment should NOT be applied");
    assertEq(infoAfter.lastCheckpointNumber, 0, "lastCheckpointNumber should be cleared");
    assertEq(infoAfter.lastSubmittedArchive, bytes32(0), "lastSubmittedArchive should be cleared");
  }

  function test_GivenMiddleEpochGapAndProposerDidSubmit(EscapeHatchConfig memory _config)
    external
    givenProposerWasDesignatedForTheHatch(_config)
    givenProposerStatusIsPROPOSING
    whenExitableAtHasBeenReached
    givenMiddleEpochGap
  {
    // it should detect the gap via the epoch loop
    // it should apply normal validation and punish on failure
    // it should set status to EXITING
    //
    // Same governance flip-flop as above, but the proposer DID submit a checkpoint.
    // Even though the escape hatch had a gap, the proposer is on the hook because they proposed.
    // Proofs go to the rollup directly and are unaffected by escape hatch changes.

    uint128 checkpointNumber = 10;
    bytes32 archive = bytes32(uint256(0xdeadbeef));

    vm.prank(address(fakeRollup));
    escapeHatch.updateSubmittedArchive(CANDIDATE1, checkpointNumber, archive);

    // provenCheckpointNumber is 0 by default (proofs not submitted up to checkpoint)

    assertFalse(escapeHatch.isHatchValidated(preparedHatch), "Hatch should not be validated yet");

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(preparedHatch, CANDIDATE1, false, config.failedHatchPunishment);

    escapeHatch.validateProofSubmission(preparedHatch);

    assertTrue(escapeHatch.isHatchValidated(preparedHatch), "Hatch should be validated");
    CandidateInfo memory infoAfter = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(infoAfter.status), uint8(Status.EXITING), "Status should be EXITING");
    assertEq(infoAfter.amount, config.bondSize - config.failedHatchPunishment, "Punishment should be applied");
  }

  modifier givenEscapeHatchWasActiveForEntirePeriod() {
    // FakeRollup already reports this contract as the escape hatch for all epochs.
    // This modifier is a marker for tree structure clarity.
    _;
  }

  function test_GivenNoCheckpointWasSubmitted(EscapeHatchConfig memory _config)
    external
    givenProposerWasDesignatedForTheHatch(_config)
    givenProposerStatusIsPROPOSING
    whenExitableAtHasBeenReached
    givenEscapeHatchWasActiveForEntirePeriod
  {
    // it should have lastCheckpointNumber EQ zero
    // it should apply FAILED_HATCH_PUNISHMENT
    // it should set status to EXITING
    // it should clear lastCheckpointNumber and lastSubmittedArchive
    // it should emit ProofValidated with success false

    CandidateInfo memory infoBefore = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(infoBefore.lastCheckpointNumber, 0, "lastCheckpointNumber should be 0");
    assertFalse(escapeHatch.isHatchValidated(preparedHatch), "Hatch should not be validated yet");

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(preparedHatch, CANDIDATE1, false, config.failedHatchPunishment);

    escapeHatch.validateProofSubmission(preparedHatch);

    assertTrue(escapeHatch.isHatchValidated(preparedHatch), "Hatch should be validated");
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
    givenEscapeHatchWasActiveForEntirePeriod
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

    assertFalse(escapeHatch.isHatchValidated(preparedHatch), "Hatch should not be validated yet");

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(preparedHatch, CANDIDATE1, false, config.failedHatchPunishment);

    escapeHatch.validateProofSubmission(preparedHatch);

    assertTrue(escapeHatch.isHatchValidated(preparedHatch), "Hatch should be validated");
    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Status should be EXITING");
    assertEq(info.amount, config.bondSize - config.failedHatchPunishment, "Punishment not applied");
  }

  function test_GivenCheckpointArchiveWasPruned(EscapeHatchConfig memory _config)
    external
    givenProposerWasDesignatedForTheHatch(_config)
    givenProposerStatusIsPROPOSING
    whenExitableAtHasBeenReached
    givenEscapeHatchWasActiveForEntirePeriod
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

    assertFalse(escapeHatch.isHatchValidated(preparedHatch), "Hatch should not be validated yet");

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(preparedHatch, CANDIDATE1, false, config.failedHatchPunishment);

    escapeHatch.validateProofSubmission(preparedHatch);

    assertTrue(escapeHatch.isHatchValidated(preparedHatch), "Hatch should be validated");
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
    givenEscapeHatchWasActiveForEntirePeriod
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

    assertFalse(escapeHatch.isHatchValidated(preparedHatch), "Hatch should not be validated yet");

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(preparedHatch, CANDIDATE1, true, 0);

    escapeHatch.validateProofSubmission(preparedHatch);

    assertTrue(escapeHatch.isHatchValidated(preparedHatch), "Hatch should be validated");
    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Status should be EXITING");
    assertEq(info.amount, config.bondSize, "Punishment should NOT be applied");
    assertEq(info.lastCheckpointNumber, 0, "lastCheckpointNumber should be cleared");
    assertEq(info.lastSubmittedArchive, bytes32(0), "lastSubmittedArchive should be cleared");
  }
}
