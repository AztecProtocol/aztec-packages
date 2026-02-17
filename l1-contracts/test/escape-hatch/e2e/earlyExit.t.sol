// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchBase} from "../base.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";

/**
 * @title EscapeHatchEarlyExitTest
 * @notice Audit finding: Exit initiation blocked during early system startup
 *
 * @dev Severity: Low
 *      Category: Liveness
 *
 *      Summary:
 *      The exit initiation flow in EscapeHatch is blocked during early system startup due to
 *      deterministic underflow in epoch arithmetic. Because `initiateExit()` always invokes
 *      `selectCandidates()` first, any revert in the selection logic prevents candidates from
 *      transitioning into the EXITING state.
 *
 *      Root Cause:
 *      `getSetTimestamp(hatch)` computes:
 *        freezeEpoch = firstEpoch(hatch - LAG_IN_HATCHES) - LAG_IN_EPOCHS_FOR_SET_SIZE
 *
 *      During hatch 0, when `selectCandidates()` computes the target hatch (currentHatch + LAG_IN_HATCHES),
 *      the resulting epoch arithmetic subtracts lag values from epoch 0, causing underflow.
 *
 *      Impact:
 *      - Candidates who join during the early period cannot initiate exit immediately
 *      - User bonds remain locked until the rollup advances past the early period
 *      - The lock is temporary - once the system progresses past the bootstrap window,
 *        exit becomes possible (this happens fairly quickly as epochs advance)
 *      - Still violates the principle: if you can join, you should be able to exit
 *
 *      Fix:
 *      Block `joinCandidateSet()` when `getSetTimestamp()` would revert. This ensures that
 *      if a user can join, they can also exit - the simplest invariant to maintain.
 *
 *      Test Structure:
 *      1. test_cannotJoinDuringEarlyPeriod - The fix: joining is blocked during early period
 *      2. test_joinAndExitWorksAfterEarlyPeriod - Normal operation after early period
 */
contract EscapeHatchEarlyExitTest is EscapeHatchBase {
  /**
   * @notice The fix: Cannot join during early period when exit would be impossible
   *
   * @dev During early operation, `getSetTimestamp()` would revert due to epoch arithmetic
   *      constraints, making exit impossible. The fix blocks joining in this state.
   */
  function test_cannotJoinDuringEarlyPeriod() public {
    // Verify we're at early operation (epoch 0, hatch 0)
    Epoch currentEpoch = _getCurrentEpoch();
    Hatch currentHatch = escapeHatch.getCurrentHatch();
    assertEq(Epoch.unwrap(currentEpoch), 0, "Should be at epoch 0");
    assertEq(Hatch.unwrap(currentHatch), 0, "Should be at hatch 0");

    // The target hatch that would be checked
    Hatch targetHatch = currentHatch + Hatch.wrap(escapeHatch.getLagInHatches());

    // Verify that getSetTimestamp reverts with the correct error
    vm.expectRevert(abi.encodeWithSelector(Errors.EscapeHatch__HatchTooEarly.selector, targetHatch));
    escapeHatch.getSetTimestamp(targetHatch);

    // The fix: joining should be blocked when exit would be impossible
    _mintAndApprove(CANDIDATE1, DEFAULT_BOND_SIZE);
    vm.expectRevert(abi.encodeWithSelector(Errors.EscapeHatch__HatchTooEarly.selector, targetHatch));
    vm.prank(CANDIDATE1);
    escapeHatch.joinCandidateSet();
  }

  /**
   * @notice Normal operation: Join and exit works after the early period
   *
   * @dev Once the system advances past the early period, the epoch arithmetic no longer
   *      causes issues and both join and exit work as expected.
   */
  function test_joinAndExitWorksAfterEarlyPeriod() public {
    _warpToSafeEpoch();

    // Verify we're past the early period
    Hatch currentHatch = escapeHatch.getCurrentHatch();
    Hatch targetHatch = currentHatch + Hatch.wrap(escapeHatch.getLagInHatches());

    // getSetTimestamp should work now
    uint32 freezeTs = escapeHatch.getSetTimestamp(targetHatch);
    assertTrue(freezeTs > 0, "Should return valid timestamp after early period");

    // Join succeeds
    _joinCandidateSet(CANDIDATE1);

    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.ACTIVE), "Should be ACTIVE");

    // Exit succeeds
    vm.prank(CANDIDATE1);
    escapeHatch.initiateExit();

    info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Should be EXITING");
  }

  /**
   * @notice Fuzz test: If join succeeds, immediate exit must also succeed
   *
   * @dev Tests across various epochs that the invariant holds:
   *      - Either both join AND exit work (normal operation)
   *      - Or join is blocked (early period)
   *      - Never: join succeeds but exit fails
   *
   * @param _epoch The epoch to test at (bounded to reasonable range)
   */
  function test_joinSuccessImpliesExitSuccess(uint256 _epoch) public {
    _epoch = bound(_epoch, 0, config.frequency * 4);
    _warpToEpoch(_epoch);

    _mintAndApprove(CANDIDATE1, DEFAULT_BOND_SIZE);

    vm.startPrank(CANDIDATE1);
    try escapeHatch.joinCandidateSet() {
      // Join succeeded - exit MUST also succeed for the fix to be valid
      escapeHatch.initiateExit();

      CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
      assertEq(uint8(info.status), uint8(Status.EXITING), "If join succeeds, exit must succeed");
    } catch {
      // Join failed (early period) - invariant trivially holds
    }
    vm.stopPrank();
  }
}
