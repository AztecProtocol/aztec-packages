// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchIntegrationBase} from "../integration/EscapeHatchIntegrationBase.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch, Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

/**
 * @title EscapeHatchCandidateExitTest
 * @notice E2E tests for candidate exit timing
 *
 * @dev Exit timing has two distinct windows:
 *
 *      Known Window (start of hatch N → freeze of hatch N+1):
 *      ├── Selection for current period already happened
 *      ├── If selected: must complete hatch duty before exiting
 *      └── If not selected: can exit immediately
 *
 *      Flux Window (freeze of hatch N+1 → start of hatch N+1):
 *      ├── You're in the snapshot for hatch N+1 selection
 *      ├── Selection can't happen yet (randao not frozen)
 *      └── If initiateExit called: forced delay until hatch N+1 ends
 */
contract EscapeHatchCandidateExitTest is EscapeHatchIntegrationBase {
  /**
   * @notice Known window: Selected candidate must complete hatch duty before exiting
   *
   * @dev Scenario:
   *      ├── Two candidates join
   *      ├── Warp to known window, selection happens
   *      ├── Selected candidate cannot just exit - must complete duty
   *      └── After proposing and proving, can finally exit
   */
  function test_exitDuringKnownWindow_whenSelected() public setup(4, 4) progressEpochsToInclusion {
    full = load("empty_checkpoint_1");
    _deployEscapeHatch();

    // Two candidates join
    _joinCandidateSet(CANDIDATE1);
    _joinCandidateSet(CANDIDATE2);

    // Warp to known window and trigger selection
    targetHatch = _selectCandidateForHatch();

    address selectedProposer = escapeHatch.getDesignatedProposer(targetHatch);
    assertTrue(selectedProposer != address(0), "Should have selected a proposer");

    CandidateInfo memory info = escapeHatch.getCandidateInfo(selectedProposer);
    assertEq(uint8(info.status), uint8(Status.PROPOSING), "Selected should be PROPOSING");

    // Selected candidate cannot exit while PROPOSING - removed from candidate set on selection
    vm.expectRevert(abi.encodeWithSelector(Errors.EscapeHatch__NotInCandidateSet.selector, selectedProposer));
    vm.prank(selectedProposer);
    escapeHatch.initiateExit();

    // Selected candidate must complete hatch duty
    _warpToHatch(targetHatch);

    _proposeWithHatch(selectedProposer);
    assertEq(rollup.getPendingCheckpointNumber(), 1, "Should have proposed");

    _proveCheckpoints("empty_checkpoint_", 1, 1, address(this));

    _warpToExitableAt(selectedProposer);

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.ProofValidated(targetHatch, selectedProposer, true, 0);
    escapeHatch.validateProofSubmission(targetHatch);

    // Now can finally exit
    info = escapeHatch.getCandidateInfo(selectedProposer);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Should be EXITING after validation");
    assertEq(info.amount, DEFAULT_BOND_SIZE, "No punishment - full bond retained");

    uint256 balanceBefore = testERC20.balanceOf(selectedProposer);
    uint256 expectedRefund = DEFAULT_BOND_SIZE - DEFAULT_WITHDRAWAL_TAX;

    vm.prank(selectedProposer);
    escapeHatch.leaveCandidateSet();

    assertEq(
      testERC20.balanceOf(selectedProposer), balanceBefore + expectedRefund, "Should receive full refund minus tax"
    );
    assertEq(uint8(escapeHatch.getCandidateInfo(selectedProposer).status), uint8(Status.NONE), "Should be NONE");
  }

  /**
   * @notice Known window: Non-selected candidate can exit immediately
   *
   * @dev Scenario:
   *      ├── Two candidates join
   *      ├── Warp to known window, selection happens
   *      ├── Non-selected candidate initiates exit
   *      └── exitableAt = current timestamp (immediate exit)
   */
  function test_exitDuringKnownWindow_whenNotSelected(uint256 _ts) public setup(4, 4) progressEpochsToInclusion {
    full = load("empty_checkpoint_1");
    _deployEscapeHatch();

    // Two candidates join
    _joinCandidateSet(CANDIDATE1);
    _joinCandidateSet(CANDIDATE2);

    // Warp to start of known window (start of hatch 1)
    _warpForwardEpochs(DEFAULT_FREQUENCY);

    Hatch currentHatch = escapeHatch.getHatch(rollup.getCurrentEpoch());
    // The next selection (during currentHatch + 1) prepares targetHatch = currentHatch + 1 + lagInHatches
    // We need the freeze timestamp for that target hatch to know when the next freeze window starts
    Hatch nextTargetHatch = currentHatch + Hatch.wrap(1 + escapeHatch.getLagInHatches());
    uint256 nextFreezeTimestamp = escapeHatch.getSetTimestamp(nextTargetHatch);

    // Bound to known window: current time to just before next freeze
    vm.warp(bound(_ts, block.timestamp, nextFreezeTimestamp - 1));

    // Trigger selection
    escapeHatch.selectCandidates();

    Hatch preparedHatch = currentHatch + Hatch.wrap(escapeHatch.getLagInHatches());
    address selectedProposer = escapeHatch.getDesignatedProposer(preparedHatch);
    address nonSelectedCandidate = (selectedProposer == CANDIDATE1) ? CANDIDATE2 : CANDIDATE1;

    // Verify non-selected is still ACTIVE
    CandidateInfo memory info = escapeHatch.getCandidateInfo(nonSelectedCandidate);
    assertEq(uint8(info.status), uint8(Status.ACTIVE), "Non-selected should be ACTIVE");

    // Non-selected initiates exit - should be immediate
    vm.prank(nonSelectedCandidate);
    escapeHatch.initiateExit();

    info = escapeHatch.getCandidateInfo(nonSelectedCandidate);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Should be EXITING");
    assertEq(info.exitableAt, block.timestamp, "exitableAt should be current timestamp (immediate)");

    // Can leave immediately
    uint256 balanceBefore = testERC20.balanceOf(nonSelectedCandidate);
    uint256 expectedRefund = DEFAULT_BOND_SIZE - DEFAULT_WITHDRAWAL_TAX;

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.CandidateExited(nonSelectedCandidate, expectedRefund);

    vm.prank(nonSelectedCandidate);
    escapeHatch.leaveCandidateSet();

    assertEq(testERC20.balanceOf(nonSelectedCandidate), balanceBefore + expectedRefund, "Should receive refund");
    assertEq(uint8(escapeHatch.getCandidateInfo(nonSelectedCandidate).status), uint8(Status.NONE), "Should be NONE");
  }

  /**
   * @notice Flux window: Exit is delayed because candidate might be selected
   *
   * @dev Scenario:
   *      ├── Two candidates join
   *      ├── Selection happens BEFORE the flux window
   *      ├── Warp to flux window (after freeze of hatch N+1, before start of hatch N+1)
   *      ├── Candidate initiates exit during flux window
   *      └── exitableAt = after hatch N+1 ends (forced delay)
   *
   *      Note: With the SelectionTooLate fix, selectCandidates() cannot be called
   *      during the flux window. It must be called earlier. However, initiateExit()
   *      works because its internal selectCandidates() call returns early if the
   *      hatch is already prepared.
   */
  function test_exitDuringFluxWindow(uint256 _ts) public setup(4, 4) progressEpochsToInclusion {
    full = load("empty_checkpoint_1");
    _deployEscapeHatch();

    // Two candidates join
    _joinCandidateSet(CANDIDATE1);
    _joinCandidateSet(CANDIDATE2);

    // Warp to start of hatch 1 to avoid underflows in freeze timestamp calculations
    _warpForwardEpochs(DEFAULT_FREQUENCY);

    // Calculate flux window boundaries and determine selected candidate
    uint256 freezeTimestamp;
    uint256 startOfNextHatch;
    address nonSelectedCandidate;
    Hatch nextHatch;
    {
      // Flux window: freeze of NEXT targetHatch → start of NEXT hatch
      // The NEXT selection (during currentHatch + 1) prepares targetHatch = currentHatch + 1 + LAG_IN_HATCHES
      Hatch currentHatch = escapeHatch.getHatch(rollup.getCurrentEpoch());
      nextHatch = currentHatch + Hatch.wrap(1);
      Hatch nextTargetHatch = nextHatch + Hatch.wrap(escapeHatch.getLagInHatches());
      freezeTimestamp = escapeHatch.getSetTimestamp(nextTargetHatch);
      // The start of the next hatch (when selection could happen)
      startOfNextHatch = Timestamp.unwrap(rollup.getTimestampForEpoch(escapeHatch.getFirstEpoch(nextHatch)));

      // Selection MUST happen BEFORE the flux window (due to SelectionTooLate check)
      // Warp to just before the freeze timestamp
      vm.warp(freezeTimestamp - 1);

      // Trigger selection now (before flux window)
      escapeHatch.selectCandidates();

      // Determine selected vs non-selected candidate
      Hatch hatchAfterWarp = escapeHatch.getHatch(rollup.getCurrentEpoch());
      Hatch preparedHatch = hatchAfterWarp + Hatch.wrap(escapeHatch.getLagInHatches());
      address selectedProposer = escapeHatch.getDesignatedProposer(preparedHatch);
      nonSelectedCandidate = (selectedProposer == CANDIDATE1) ? CANDIDATE2 : CANDIDATE1;
    }

    // NOW warp into the flux window
    vm.warp(bound(_ts, freezeTimestamp, startOfNextHatch - 1));

    // Verify non-selected is still ACTIVE
    CandidateInfo memory info = escapeHatch.getCandidateInfo(nonSelectedCandidate);
    assertEq(uint8(info.status), uint8(Status.ACTIVE), "Non-selected should be ACTIVE");

    // Non-selected initiates exit during flux window - should be delayed
    vm.prank(nonSelectedCandidate);
    escapeHatch.initiateExit();

    info = escapeHatch.getCandidateInfo(nonSelectedCandidate);
    assertEq(uint8(info.status), uint8(Status.EXITING), "Should be EXITING");

    // Expected exitableAt is getSetTimestamp(nextTargetHatch + 1)
    // nextTargetHatch = currentHatch + 1 + LAG_IN_HATCHES = nextHatch + LAG_IN_HATCHES
    Hatch nextTargetHatch = nextHatch + Hatch.wrap(escapeHatch.getLagInHatches());
    uint256 expectedTime = escapeHatch.getSetTimestamp(nextTargetHatch + Hatch.wrap(1));

    // exitableAt should be in the future (delayed) because we're in flux window
    assertEq(info.exitableAt, expectedTime, "exitableAt should be in the future (delayed)");

    // Cannot leave yet
    vm.expectRevert(
      abi.encodeWithSelector(Errors.EscapeHatch__NotExitableYet.selector, info.exitableAt, block.timestamp)
    );
    vm.prank(nonSelectedCandidate);
    escapeHatch.leaveCandidateSet();

    // Warp to exitableAt and leave
    vm.warp(info.exitableAt);

    uint256 balanceBefore = testERC20.balanceOf(nonSelectedCandidate);
    uint256 expectedRefund = DEFAULT_BOND_SIZE - DEFAULT_WITHDRAWAL_TAX;

    vm.prank(nonSelectedCandidate);
    escapeHatch.leaveCandidateSet();

    assertEq(testERC20.balanceOf(nonSelectedCandidate), balanceBefore + expectedRefund, "Should receive refund");
    assertEq(uint8(escapeHatch.getCandidateInfo(nonSelectedCandidate).status), uint8(Status.NONE), "Should be NONE");
  }
}
