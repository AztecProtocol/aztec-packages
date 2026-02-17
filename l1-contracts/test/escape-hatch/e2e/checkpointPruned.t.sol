// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchIntegrationBase} from "../integration/EscapeHatchIntegrationBase.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";

/**
 * @title EscapeHatchCheckpointPrunedTest
 * @notice Integration test: Candidate's checkpoint gets pruned
 *
 * @dev Test scenario from checkpointPruned.tree:
 *      ├── Step 1: Candidate joins and is selected
 *      ├── Step 2: Proposer submits checkpoint
 *      └── Step 3: After proof submission window, without proofs landing
 *          ├── potentially prune
 *          └── validateProofSubmission is called
 *              ├── it should mark as exiting
 *              └── it should apply FAILED_HATCH_PUNISHMENT
 */
contract EscapeHatchCheckpointPrunedTest is EscapeHatchIntegrationBase {
  function test_checkpointPruned(bool _explicitPrune) public setup(48, 48) progressEpochsToInclusion {
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

    // =========================================
    // Step 2: Proposer submits checkpoint
    // =========================================
    _warpToHatch(targetHatch);

    bytes32 archiveRoot = _proposeWithHatch(CANDIDATE1);

    assertEq(rollup.getPendingCheckpointNumber(), 1, "Should have proposed checkpoint 1");

    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(info.lastCheckpointNumber, 1, "Checkpoint number should be recorded");
    assertEq(info.lastSubmittedArchive, archiveRoot, "Archive should be recorded");

    // =========================================
    // Step 3: After Proof Submission Window (no proofs)
    // =========================================
    _warpToExitableAt(CANDIDATE1);

    if (_explicitPrune) {
      rollup.prune();
      assertEq(rollup.getPendingCheckpointNumber(), 0);
    } else {
      assertEq(rollup.getPendingCheckpointNumber(), 1);
    }

    uint96 amountBefore = info.amount;

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(targetHatch, CANDIDATE1, false, DEFAULT_FAILED_HATCH_PUNISHMENT);

    escapeHatch.validateProofSubmission(targetHatch);

    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Status should be EXITING");
    assertEq(info.amount, amountBefore - DEFAULT_FAILED_HATCH_PUNISHMENT, "Punishment should be applied");
    assertEq(info.lastCheckpointNumber, 0, "lastCheckpointNumber should be cleared");
    assertEq(info.lastSubmittedArchive, bytes32(0), "lastSubmittedArchive should be cleared");
  }
}
