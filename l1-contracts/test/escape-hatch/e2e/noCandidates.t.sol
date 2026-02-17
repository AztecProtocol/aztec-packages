// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchIntegrationBase} from "../integration/EscapeHatchIntegrationBase.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";

/**
 * @title EscapeHatchNoCandidatesTest
 * @notice E2E test: No candidates - hatch opens with no proposer
 *
 * @dev Test scenario:
 *      ├── Step 1: No candidates have joined
 *      ├── Step 2: selectCandidates is called
 *      │   └── isHatchPrepared is set but no designatedProposer
 *      └── Step 3: isHatchOpen returns (false, address(0))
 *          └── normal committee consensus applies
 */
contract EscapeHatchNoCandidatesTest is EscapeHatchIntegrationBase {
  function test_noCandidates() public setup(4, 4) progressEpochsToInclusion {
    full = load("mixed_checkpoint_1");
    _deployEscapeHatch();

    // =========================================
    // Step 1: No candidates have joined
    // =========================================
    assertEq(escapeHatch.getCandidateCount(), 0, "Should have no candidates");

    // =========================================
    // Step 2: selectCandidates is called
    // =========================================
    // Warp to selection window
    _warpToEpoch(DEFAULT_FREQUENCY);
    _warpForwardEpochs(3);

    // Selection should succeed but with no proposer selected
    escapeHatch.selectCandidates();

    Hatch currentHatch = escapeHatch.getHatch(rollup.getCurrentEpoch());
    Hatch preparedHatch = currentHatch + Hatch.wrap(escapeHatch.getLagInHatches());

    // Hatch should be prepared but with no designated proposer
    assertTrue(escapeHatch.isHatchPrepared(preparedHatch), "Hatch should be prepared");
    assertEq(escapeHatch.getDesignatedProposer(preparedHatch), address(0), "No proposer should be designated");

    // =========================================
    // Step 3: isHatchOpen returns (false, address(0))
    // =========================================
    // Warp to the hatch window
    Epoch firstEpochOfHatch = escapeHatch.getFirstEpoch(preparedHatch);
    _warpToEpoch(Epoch.unwrap(firstEpochOfHatch));

    // isHatchOpen should return false because there's no designated proposer
    (bool isOpen, address proposer) = escapeHatch.isHatchOpen(rollup.getCurrentEpoch());
    assertFalse(isOpen, "Hatch should NOT be open (no proposer)");
    assertEq(proposer, address(0), "Proposer should be zero address");

    // =========================================
    // Verify: Normal committee consensus applies
    // =========================================
    // Since escape hatch is not open, normal committee proposal should work
    _proposeWithCommittee();

    assertEq(rollup.getPendingCheckpointNumber(), 1, "Committee should be able to propose normally");
  }

  function test_noCandidates_rollupNotAffected() public setup(4, 4) progressEpochsToInclusion {
    full = load("mixed_checkpoint_1");
    _deployEscapeHatch();

    // No candidates, no selection
    assertEq(escapeHatch.getCandidateCount(), 0, "Should have no candidates");

    // Warp to what would be an escape hatch epoch
    _warpToEpoch(DEFAULT_FREQUENCY);

    // isHatchOpen should return false for any epoch when no selection has occurred
    Epoch currentEpoch = rollup.getCurrentEpoch();
    (bool isOpen,) = escapeHatch.isHatchOpen(currentEpoch);
    assertFalse(isOpen, "Hatch should not be open");

    // Normal committee consensus should work without any escape hatch interference
    _proposeWithCommittee();

    assertEq(rollup.getPendingCheckpointNumber(), 1, "Committee proposal should succeed");
  }
}
