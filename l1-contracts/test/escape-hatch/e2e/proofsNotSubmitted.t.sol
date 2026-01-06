// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchIntegrationBase} from "../integration/EscapeHatchIntegrationBase.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";

/**
 * @title EscapeHatchProofsNotSubmittedTest
 * @notice E2E test: Candidate proposes but proofs not submitted in time
 *
 * @dev Test scenario:
 *      ├── Step 1: Candidate joins and is selected
 *      ├── Step 2: Proposer submits checkpoint
 *      │   └── lastCheckpointNumber is set
 *      ├── Step 3: Proofs are NOT submitted before window ends
 *      │   └── provenCheckpointNumber < lastCheckpointNumber
 *      └── Step 4: After proof submission window
 *          └── validateProofSubmission is called
 *              ├── it should mark as failed
 *              └── it should apply FAILED_HATCH_PUNISHMENT
 *
 * Note: This differs from failedToPropose where the candidate never proposes.
 * Here, the candidate DOES propose, but the prover fails to submit proofs.
 * The candidate is still punished because the hatch duty wasn't fully completed.
 */
contract EscapeHatchProofsNotSubmittedTest is EscapeHatchIntegrationBase {
  function test_proofsNotSubmitted() public setup(4, 4) progressEpochsToInclusion {
    full = load("empty_checkpoint_1");
    _deployEscapeHatch();

    // =========================================
    // Step 1: Candidate joins and is selected
    // =========================================
    _joinCandidateSet(CANDIDATE1);

    targetHatch = _selectCandidateForHatch();

    address selectedProposer = escapeHatch.getDesignatedProposer(targetHatch);
    assertEq(selectedProposer, CANDIDATE1, "CANDIDATE1 should be selected");

    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.PROPOSING), "Should be PROPOSING after selection");

    // =========================================
    // Step 2: Proposer submits checkpoint
    // =========================================
    _warpToHatch(targetHatch);

    _proposeWithHatch(CANDIDATE1);

    uint256 pendingCheckpoint = rollup.getPendingCheckpointNumber();
    assertEq(pendingCheckpoint, 1, "Should have proposed checkpoint");

    // =========================================
    // Step 3: Proofs are NOT submitted - we just skip the proof submission
    // =========================================
    // Note: We intentionally DO NOT call _proveCheckpoints here

    // provenCheckpointNumber should still be 0 (nothing proven)
    uint256 provenCheckpoint = rollup.getProvenCheckpointNumber();
    assertEq(provenCheckpoint, 0, "No checkpoints should be proven");

    // =========================================
    // Step 4: After proof submission window, validate
    // =========================================
    _warpToExitableAt(CANDIDATE1);

    // validateProofSubmission should detect the missing proof and punish
    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(targetHatch, CANDIDATE1, false, DEFAULT_FAILED_HATCH_PUNISHMENT);

    escapeHatch.validateProofSubmission(targetHatch);

    // Verify punishment was applied
    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Should be EXITING after validation");
    assertEq(info.amount, DEFAULT_BOND_SIZE - DEFAULT_FAILED_HATCH_PUNISHMENT, "Bond should be reduced by punishment");

    // =========================================
    // Verify: Candidate can still leave with reduced bond
    // =========================================
    uint256 balanceBefore = testERC20.balanceOf(CANDIDATE1);
    uint256 expectedRefund = (DEFAULT_BOND_SIZE - DEFAULT_FAILED_HATCH_PUNISHMENT) - DEFAULT_WITHDRAWAL_TAX;

    vm.prank(CANDIDATE1);
    escapeHatch.leaveCandidateSet();

    assertEq(testERC20.balanceOf(CANDIDATE1), balanceBefore + expectedRefund, "Should receive reduced refund");

    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.NONE), "Status should be NONE after leaving");
  }
}
