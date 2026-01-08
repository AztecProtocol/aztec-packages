// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchIntegrationBase} from "../integration/EscapeHatchIntegrationBase.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";

/**
 * @title EscapeHatchFailedToProposeTest
 * @notice E2E test: Candidate fails to propose during hatch
 *
 * @dev Test scenario:
 *      ├── Step 1: Candidate joins and is selected
 *      ├── Step 2: Escape hatch window passes without proposal
 *      │   └── lastCheckpointNumber remains 0
 *      ├── Step 3: After proof submission window
 *      │   └── validateProofSubmission is called
 *      │       ├── it should mark as failed
 *      │       └── it should apply FAILED_HATCH_PUNISHMENT
 *      └── Step 4: Candidate leaves with reduced bond
 *          └── refund = amount - WITHDRAWAL_TAX (where amount = BOND_SIZE - punishment)
 */
contract EscapeHatchFailedToProposeTest is EscapeHatchIntegrationBase {
  function test_failedToPropose() public setup(48, 48) progressEpochsToInclusion {
    full = load("empty_checkpoint_1");
    _deployEscapeHatch();

    // =========================================
    // Step 1: Candidate joins and is selected
    // =========================================
    _joinCandidateSet(CANDIDATE1);

    targetHatch = _selectCandidateForHatch();

    assertEq(escapeHatch.getDesignatedProposer(targetHatch), CANDIDATE1, "CANDIDATE1 should be proposer");

    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.PROPOSING), "Status should be PROPOSING");
    assertEq(info.amount, DEFAULT_BOND_SIZE, "Should have full bond");

    // =========================================
    // Step 2: Escape hatch window passes WITHOUT proposal
    // =========================================
    _warpToHatch(targetHatch);

    // Candidate does NOT propose - simulating failure to act
    // lastCheckpointNumber remains 0

    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(info.lastCheckpointNumber, 0, "lastCheckpointNumber should remain 0");
    assertEq(info.lastSubmittedArchive, bytes32(0), "lastSubmittedArchive should remain 0");

    // Verify no checkpoint was proposed
    assertEq(rollup.getPendingCheckpointNumber(), 0, "No checkpoint should be proposed");

    // =========================================
    // Step 3: After proof submission window - validate failure
    // =========================================
    _warpToExitableAt(CANDIDATE1);

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(targetHatch, CANDIDATE1, false, DEFAULT_FAILED_HATCH_PUNISHMENT);

    escapeHatch.validateProofSubmission(targetHatch);

    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Status should be EXITING");
    assertEq(info.amount, DEFAULT_BOND_SIZE - DEFAULT_FAILED_HATCH_PUNISHMENT, "Punishment should be applied");

    // =========================================
    // Step 4: Candidate leaves with reduced bond
    // =========================================
    uint256 balanceBefore = testERC20.balanceOf(CANDIDATE1);

    // Expected refund = (BOND_SIZE - punishment) - WITHDRAWAL_TAX
    uint256 expectedRefund = (DEFAULT_BOND_SIZE - DEFAULT_FAILED_HATCH_PUNISHMENT) - DEFAULT_WITHDRAWAL_TAX;

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.CandidateExited(CANDIDATE1, expectedRefund);

    vm.prank(CANDIDATE1);
    escapeHatch.leaveCandidateSet();

    assertEq(testERC20.balanceOf(CANDIDATE1), balanceBefore + expectedRefund, "Should receive reduced refund");

    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.NONE), "Status should be NONE");
    assertEq(info.amount, 0, "Amount should be 0");
  }
}
