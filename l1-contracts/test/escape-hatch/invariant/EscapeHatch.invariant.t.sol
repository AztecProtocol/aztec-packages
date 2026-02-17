// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {EscapeHatchBase} from "../base.sol";
import {EscapeHatchHandler} from "./EscapeHatchHandler.sol";
import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {IEscapeHatch, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";

/**
 * @title EscapeHatchInvariantTest
 * @notice Invariant tests for EscapeHatch contract
 *
 * @dev Tests key invariants from EscapeHatch.invariant.tree:
 *      - PROPOSING status implies amount == BOND_SIZE
 *      - $activeCandidates.length() == count of candidates with ACTIVE status
 *      - Bond token balance >= sum of all candidate amounts
 *      - Status/set membership consistency
 */
contract EscapeHatchInvariantTest is EscapeHatchBase {
  EscapeHatchHandler public handler;

  function setUp() public override {
    super.setUp();

    // Deploy handler
    handler = new EscapeHatchHandler(escapeHatch, bondToken, address(rollup));

    // Target only the handler for fuzzing
    targetContract(address(handler));

    // Warp to a safe epoch to avoid underflows
    _warpToSafeEpoch();
  }

  // ============ Core Invariants ============

  /**
   * @notice PROPOSING status implies amount == BOND_SIZE (has full stake at risk)
   */
  function invariant_proposingHasStake() public view {
    uint256 candidateCount = handler.getAllCandidatesCount();
    uint256 bondSize = uint256(handler.escapeHatch().getBondSize());

    for (uint256 i = 0; i < candidateCount; i++) {
      address candidate = handler.getAllCandidate(i);
      CandidateInfo memory info = escapeHatch.getCandidateInfo(candidate);

      if (info.status == Status.PROPOSING) {
        assertEq(info.amount, bondSize, "PROPOSING candidate must have stake at risk");
      }
    }
  }

  /**
   * @notice $activeCandidates.length() == count of candidates with ACTIVE status
   * @dev Set size must match status count
   */
  function invariant_candidateCountMatchesActiveStatus() public view {
    uint256 candidateCount = handler.getAllCandidatesCount();
    uint256 activeCount = 0;

    for (uint256 i = 0; i < candidateCount; i++) {
      address candidate = handler.getAllCandidate(i);
      CandidateInfo memory info = escapeHatch.getCandidateInfo(candidate);

      if (info.status == Status.ACTIVE) {
        activeCount++;
      }
    }

    assertEq(escapeHatch.getCandidateCount(), activeCount, "Candidate count must match ACTIVE status count");
  }

  /**
   * @notice Contract token balance >= sum of all candidate amounts
   * @dev Contract must always be solvent
   */
  function invariant_solvency() public view {
    uint256 candidateCount = handler.getAllCandidatesCount();
    uint256 totalAmounts = 0;

    for (uint256 i = 0; i < candidateCount; i++) {
      address candidate = handler.getAllCandidate(i);
      CandidateInfo memory info = escapeHatch.getCandidateInfo(candidate);
      totalAmounts += info.amount;
    }

    assertGe(
      bondToken.balanceOf(address(escapeHatch)),
      totalAmounts,
      "Contract must hold enough tokens for all candidate amounts"
    );
  }

  /**
   * @notice Candidate in $activeCandidates implies status is ACTIVE
   * @dev If address is in set, status must be ACTIVE. And opposite
   *      if ACTIVE must be in set.
   */
  function invariant_inSetEqualsActiveStatus() public view {
    uint256 candidateCount = handler.getAllCandidatesCount();

    for (uint256 i = 0; i < candidateCount; i++) {
      address candidate = handler.getAllCandidate(i);
      bool inSet = escapeHatch.isCandidate(candidate);
      bool isActive = escapeHatch.getCandidateInfo(candidate).status == Status.ACTIVE;

      assertEq(inSet, isActive, "Candidate inset != active");
    }
  }

  /**
   * @notice Status NONE implies amount is 0
   * @dev Cleaned up state after leaving
   */
  function invariant_noneStatusImpliesZeroAmount() public view {
    uint256 candidateCount = handler.getAllCandidatesCount();

    for (uint256 i = 0; i < candidateCount; i++) {
      address candidate = handler.getAllCandidate(i);
      CandidateInfo memory info = escapeHatch.getCandidateInfo(candidate);

      if (info.status == Status.NONE) {
        assertEq(info.amount, 0, "NONE status must have zero amount");
      }
    }
  }

  /**
   * @notice Candidate amount never exceeds BOND_SIZE
   * @dev Amount starts at BOND_SIZE and can only decrease via punishment
   */
  function invariant_amountNeverExceedsBondSize() public view {
    uint256 candidateCount = handler.getAllCandidatesCount();

    for (uint256 i = 0; i < candidateCount; i++) {
      address candidate = handler.getAllCandidate(i);
      CandidateInfo memory info = escapeHatch.getCandidateInfo(candidate);

      assertLe(info.amount, escapeHatch.getBondSize(), "Amount must never exceed BOND_SIZE");
    }
  }

  /**
   * @notice Each hatch can only be validated successfully once
   */
  function invariant_hatchValidatedAtMostOnce() public view {
    uint256 preparedCount = handler.getPreparedHatchesCount();

    for (uint256 i = 0; i < preparedCount; i++) {
      Hatch hatch = handler.getPreparedHatch(i);
      uint256 validations = handler.getSuccessfulValidations(hatch);

      assertLe(validations, 1, "Hatch validated more than once - vulnerability detected!");
    }
  }

  // ============ Debug Helper ============

  /**
   * @notice Called after each invariant run for debugging
   */
  function afterInvariant() public view {
    console.log("=== Invariant Run Stats ===");
    console.log("Join calls:", handler.joinCalls());
    console.log("InitiateExit calls:", handler.initiateExitCalls());
    console.log("Leave calls:", handler.leaveCalls());
    console.log("Select calls:", handler.selectCalls());
    console.log("Validate calls:", handler.validateCalls());
    console.log("Successful validate calls:", handler.successfulValidateCalls());
    console.log("Warp calls:", handler.warpCalls());
    console.log("Total candidates tracked:", handler.getAllCandidatesCount());
    console.log("Active candidate count:", escapeHatch.getCandidateCount());
    console.log("Prepared hatches tracked:", handler.getPreparedHatchesCount());
  }
}
