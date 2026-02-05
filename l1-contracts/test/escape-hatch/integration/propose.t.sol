// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchIntegrationBase} from "./EscapeHatchIntegrationBase.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {ProposeArgs} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {CommitteeAttestations, Signature} from "@aztec/core/libraries/rollup/AttestationLib.sol";

/**
 * @title proposeTest
 * @notice BTT tests for propose function integration with escape hatch
 *
 * @dev Tests that proposal uses normal validator selection when escape hatch is not active,
 *      and uses escape hatch proposer selection when escape hatch is active.
 */
contract proposeTest is EscapeHatchIntegrationBase {
  // Storage variables to avoid stack-too-deep in fuzz tests
  uint256 internal upperLimit;
  address internal designatedProposer;
  bytes32 internal archiveRoot;
  ProposeArgs internal proposeArgs;
  bytes internal blobsData;

  function test_GivenEscapeHatchIsNotConfigured() external setup(4, 4) progressEpochsToInclusion {
    // it should use normal validator selection verification
    full = load("mixed_checkpoint_1");

    assertEq(address(rollup.getEscapeHatch()), address(0), "Escape hatch should not be configured");

    // Propose with proper attestations - should succeed using normal validator selection
    _proposeWithCommittee();

    // Verify checkpoint was recorded normally
    assertEq(rollup.getPendingCheckpointNumber(), 1, "Checkpoint should be proposed");
  }

  modifier givenEscapeHatchIsConfigured() {
    _deployEscapeHatch();
    _;
  }

  function test_WhenEscapeHatchIsNotOpenForCurrentEpoch(uint256 _ts)
    external
    setup(4, 4)
    progressEpochsToInclusion
    givenEscapeHatchIsConfigured
  {
    // it should use normal validator selection verification
    full = load("mixed_checkpoint_1");

    // We're at an epoch that is NOT an escape hatch epoch
    Epoch currentEpoch = rollup.getCurrentEpoch();

    upperLimit = Timestamp.unwrap(rollup.getTimestampForEpoch(rollup.getCurrentEpoch() + Epoch.wrap(2))) - 1;
    // Any time during the epoch should be acceptable
    vm.warp(bound(_ts, block.timestamp, upperLimit));

    (bool isOpen,) = escapeHatch.isHatchOpen(currentEpoch);
    assertFalse(isOpen, "Escape hatch should not be open");

    // Propose with proper attestations - should succeed using normal validator selection
    _proposeWithCommittee();

    // Verify checkpoint was recorded normally
    assertEq(rollup.getPendingCheckpointNumber(), 1, "Checkpoint should be proposed");
  }

  modifier whenEscapeHatchIsOpenForCurrentEpoch() {
    _joinCandidateSet(CANDIDATE1);
    targetHatch = _selectCandidateForHatch();
    _warpToHatch(targetHatch);

    Epoch currentEpoch = rollup.getCurrentEpoch();
    (bool isOpen,) = escapeHatch.isHatchOpen(currentEpoch);
    assertTrue(isOpen, "Escape hatch should be open");
    _;
  }

  function test_WhenCallerIsNotTheDesignatedProposer(uint256 _ts, uint256 _validatorCount, address _wrongProposer)
    external
    setup(bound(_validatorCount, 0, 4), 4)
    progressEpochsToInclusion
    givenEscapeHatchIsConfigured
    whenEscapeHatchIsOpenForCurrentEpoch
  {
    vm.assume(_wrongProposer != CANDIDATE1 && _wrongProposer != address(0));
    // it should revert with Rollup__InvalidEscapeHatchProposer
    full = load("empty_checkpoint_1");

    upperLimit = Timestamp.unwrap(rollup.getTimestampForEpoch(rollup.getCurrentEpoch() + Epoch.wrap(2))) - 1;
    // Any time during the epoch should be acceptable
    vm.warp(bound(_ts, block.timestamp, upperLimit));

    designatedProposer = escapeHatch.getDesignatedProposer(targetHatch);

    assertEq(designatedProposer, CANDIDATE1, "CANDIDATE1 should be escape hatch proposer");
    assertTrue(_wrongProposer != designatedProposer, "Wrong proposer should differ from escape hatch proposer");

    (proposeArgs, blobsData) = _buildProposeArgs(_wrongProposer);
    skipBlobCheck(address(rollup));

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__InvalidEscapeHatchProposer.selector, designatedProposer, _wrongProposer)
    );

    vm.prank(_wrongProposer);
    rollup.propose(
      proposeArgs,
      CommitteeAttestations({signatureIndices: "", signaturesOrAddresses: ""}),
      new address[](0),
      Signature({v: 0, r: 0, s: 0}),
      blobsData
    );
  }

  function test_WhenCallerIsTheDesignatedProposer(uint256 _ts, uint256 _validatorCount)
    external
    setup(bound(_validatorCount, 0, 4), 4)
    progressEpochsToInclusion
    givenEscapeHatchIsConfigured
    whenEscapeHatchIsOpenForCurrentEpoch
  {
    // it should allow the proposal
    // it should notify escape hatch of proposal via onCheckpointProposed
    // it should record the checkpoint normally
    full = load("empty_checkpoint_1");

    assertEq(escapeHatch.getDesignatedProposer(targetHatch), CANDIDATE1, "CANDIDATE1 should be escape hatch proposer");

    // Verify candidate info before proposal
    CandidateInfo memory infoBefore = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(infoBefore.lastCheckpointNumber, 0, "lastCheckpointNumber should be 0 before");
    assertEq(infoBefore.lastSubmittedArchive, bytes32(0), "lastSubmittedArchive should be 0 before");

    upperLimit = Timestamp.unwrap(rollup.getTimestampForEpoch(rollup.getCurrentEpoch() + Epoch.wrap(2))) - 1;
    // Any time during the epoch should be acceptable
    vm.warp(bound(_ts, block.timestamp, upperLimit));

    // Propose as the escape hatch proposer
    archiveRoot = _proposeWithHatch(CANDIDATE1);

    // Verify checkpoint was recorded
    assertEq(rollup.getPendingCheckpointNumber(), 1, "Checkpoint should be proposed");

    // Verify escape hatch was notified via onCheckpointProposed
    CandidateInfo memory infoAfter = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(infoAfter.lastCheckpointNumber, 1, "lastCheckpointNumber should be updated");
    assertEq(infoAfter.lastSubmittedArchive, archiveRoot, "lastSubmittedArchive should be updated");

    // Verify proposing outside escape hatch window reverts
    vm.warp(upperLimit + 1);
    (proposeArgs, blobsData) = _buildProposeArgs(CANDIDATE1);

    vm.expectRevert();
    vm.prank(CANDIDATE1);
    rollup.propose(
      proposeArgs,
      CommitteeAttestations({signatureIndices: "", signaturesOrAddresses: ""}),
      new address[](0),
      Signature({v: 0, r: 0, s: 0}),
      blobsData
    );
  }
}
