// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchIntegrationBase} from "../integration/EscapeHatchIntegrationBase.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {ProposeArgs} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {CommitteeAttestations, Signature} from "@aztec/core/libraries/rollup/AttestationLib.sol";

/**
 * @title EscapeHatchHappyPathTest
 * @notice Integration test: Happy path - candidate joins, is selected, proposes, proves, exits
 *    ├── Step 1: Candidate joins
 *    │   ├── it should transfer bond from candidate
 *    │   └── it should add candidate to active set
 *    ├── Step 2: Time advances to selection window
 *    │   └── selectCandidates is called
 *    │       ├── it should select the candidate as proposer
 *    │       └── it should set status to PROPOSING
 *    ├── Step 3: During escape hatch window
 *    │   ├── proposer calls propose on Rollup
 *    │   │   ├── it should allow proposer to propose
 *    │   │   └── it should update lastCheckpointNumber and lastSubmittedArchive
 *    ├── Step 4: Proofs are submitted for the epoch
 *    │   └── provenCheckpointNumber >= lastCheckpointNumber
 *    ├── Step 5: After proof submission window
 *    │   └── validateProofSubmission is called
 *    │       ├── it should mark as successful
 *    │       ├── it should set status to EXITING
 *    │       └── it should not apply punishment
 *    └── Step 6: Candidate leaves
 *        ├── it should return bond minus WITHDRAWAL_TAX
 *        └── it should delete candidate data
 */
contract EscapeHatchHappyPathTest is EscapeHatchIntegrationBase {
  function test_happyPath() public setup(48, 48) progressEpochsToInclusion {
    full = load("empty_checkpoint_1");
    _deployEscapeHatch();

    // Step 1: Candidate joins
    _joinCandidateSet(CANDIDATE1);

    // Step 2: Selection
    targetHatch = _selectCandidateForHatch();
    assertEq(escapeHatch.getDesignatedProposer(targetHatch), CANDIDATE1, "CANDIDATE1 should be proposer");

    // Step 3: Propose
    _warpToHatch(targetHatch);
    bytes32 archiveRoot = _proposeWithHatch(CANDIDATE1);
    assertEq(rollup.getPendingCheckpointNumber(), 1, "Should have proposed checkpoint 1");

    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(info.lastCheckpointNumber, 1, "Checkpoint number should be recorded");
    assertEq(info.lastSubmittedArchive, archiveRoot, "Archive should be recorded");

    // Step 4: Submit proofs
    _proveCheckpoints("empty_checkpoint_", 1, 1, address(this));
    assertGe(rollup.getProvenCheckpointNumber(), 1, "Proven checkpoint should be >= 1");

    // Step 5: Validate (success, no punishment)
    _warpToExitableAt(CANDIDATE1);

    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    uint96 amountBefore = info.amount;

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(targetHatch, CANDIDATE1, true, 0);

    escapeHatch.validateProofSubmission(targetHatch);

    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(info.amount, amountBefore, "Amount should be unchanged (no punishment)");
    assertEq(uint8(info.status), uint8(Status.EXITING), "Status should be EXITING");

    // Step 6: Leave with bond minus tax
    uint256 balanceBefore = testERC20.balanceOf(CANDIDATE1);
    uint256 expectedRefund = DEFAULT_BOND_SIZE - DEFAULT_WITHDRAWAL_TAX;

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.CandidateExited(CANDIDATE1, expectedRefund);

    vm.prank(CANDIDATE1);
    escapeHatch.leaveCandidateSet();

    assertEq(testERC20.balanceOf(CANDIDATE1), balanceBefore + expectedRefund, "Should receive bond minus tax");

    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.NONE), "Status should be NONE");
  }
}
