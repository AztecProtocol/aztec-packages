// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchIntegrationBase} from "../integration/EscapeHatchIntegrationBase.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {ProposeArgs} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {CommitteeAttestations, Signature} from "@aztec/core/libraries/rollup/AttestationLib.sol";

/**
 * @title EscapeHatchMultipleCandidatesTest
 * @notice E2E test: Multiple candidates - random selection
 *
 * @dev Test scenario:
 *      ├── Step 1: Multiple candidates join
 *      ├── Step 2: selectCandidates is called
 *      │   └── exactly one candidate is selected based on deterministic seed
 *      ├── Step 3: Only selected candidate can propose during hatch
 *      ├── Step 4: Selected candidate proposes and proves
 *      └── Step 5: Non-selected candidates remain ACTIVE
 */
contract EscapeHatchMultipleCandidatesTest is EscapeHatchIntegrationBase {
  function test_multipleCandidates() public setup(48, 48) progressEpochsToInclusion {
    full = load("empty_checkpoint_1");
    _deployEscapeHatch();

    // =========================================
    // Step 1: Multiple candidates join
    // =========================================
    _joinCandidateSet(CANDIDATE1);
    _joinCandidateSet(CANDIDATE2);
    _joinCandidateSet(CANDIDATE3);

    assertEq(escapeHatch.getCandidateCount(), 3, "Should have 3 candidates");

    // =========================================
    // Step 2: selectCandidates - exactly one selected
    // =========================================
    targetHatch = _selectCandidateForHatch();

    address selectedProposer = escapeHatch.getDesignatedProposer(targetHatch);

    // Verify that one candidate was selected
    assertTrue(
      selectedProposer == CANDIDATE1 || selectedProposer == CANDIDATE2 || selectedProposer == CANDIDATE3,
      "Selected proposer should be one of the candidates"
    );

    // Verify only the selected candidate has PROPOSING status
    uint256 proposingCount = 0;
    if (escapeHatch.getCandidateInfo(CANDIDATE1).status == Status.PROPOSING) proposingCount++;
    if (escapeHatch.getCandidateInfo(CANDIDATE2).status == Status.PROPOSING) proposingCount++;
    if (escapeHatch.getCandidateInfo(CANDIDATE3).status == Status.PROPOSING) proposingCount++;

    assertEq(proposingCount, 1, "Exactly one candidate should be PROPOSING");

    // =========================================
    // Step 3: Only selected candidate can propose
    // =========================================
    _warpToHatch(targetHatch);

    // Identify non-selected candidates
    address[] memory nonSelected = new address[](2);
    uint256 idx = 0;
    if (CANDIDATE1 != selectedProposer) nonSelected[idx++] = CANDIDATE1;
    if (CANDIDATE2 != selectedProposer) nonSelected[idx++] = CANDIDATE2;
    if (CANDIDATE3 != selectedProposer) nonSelected[idx++] = CANDIDATE3;

    // Non-selected candidates should NOT be able to propose
    for (uint256 i = 0; i < 2; i++) {
      address nonSelectedCandidate = nonSelected[i];

      (ProposeArgs memory args, bytes memory blobs) = _buildProposeArgs(nonSelectedCandidate);
      skipBlobCheck(address(rollup));

      vm.expectRevert(
        abi.encodeWithSelector(
          Errors.Rollup__InvalidEscapeHatchProposer.selector, selectedProposer, nonSelectedCandidate
        )
      );

      vm.prank(nonSelectedCandidate);
      rollup.propose(
        args,
        CommitteeAttestations({signatureIndices: "", signaturesOrAddresses: ""}),
        new address[](0),
        Signature({v: 0, r: 0, s: 0}),
        blobs
      );
    }

    // =========================================
    // Step 4: Selected candidate proposes and proves
    // =========================================
    _proposeWithHatch(selectedProposer);
    assertEq(rollup.getPendingCheckpointNumber(), 1, "Selected proposer should be able to propose");

    _proveCheckpoints("empty_checkpoint_", 1, 1, address(this));

    _warpToExitableAt(selectedProposer);

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(targetHatch, selectedProposer, true, 0);

    escapeHatch.validateProofSubmission(targetHatch);

    // =========================================
    // Step 5: Verify final states
    // =========================================
    // Selected proposer should be EXITING with full bond
    CandidateInfo memory info = escapeHatch.getCandidateInfo(selectedProposer);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Selected proposer should be EXITING");
    assertEq(info.amount, DEFAULT_BOND_SIZE, "No punishment should be applied");

    // Non-selected candidates should still be ACTIVE
    for (uint256 i = 0; i < 2; i++) {
      info = escapeHatch.getCandidateInfo(nonSelected[i]);
      assertEq(uint8(info.status), uint8(Status.ACTIVE), "Non-selected candidate should remain ACTIVE");
    }
  }
}
