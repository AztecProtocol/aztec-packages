// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchBase, EscapeHatchConfig} from "../base.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IEscapeHatchCore, Status, CandidateInfo, Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";

contract EscapeHatchJoinCandidateSetTest is EscapeHatchBase {
  function test_GivenCallerIsAlreadyInCandidateSet(EscapeHatchConfig memory _config)
    external
    givenValidConfig(_config)
  {
    // it should revert {EscapeHatch__AlreadyInCandidateSet}
    _joinCandidateSetWithConfig(CANDIDATE1);

    // Try to join again
    _mintAndApprove(CANDIDATE1, config.bondSize);
    vm.expectRevert(abi.encodeWithSelector(Errors.EscapeHatch__AlreadyInCandidateSet.selector, CANDIDATE1));
    vm.prank(CANDIDATE1);
    escapeHatch.joinCandidateSet();
  }

  modifier givenCallerIsNotInCandidateSet() {
    // Fresh address CANDIDATE1 is not in candidate set by default
    _;
  }

  function test_GivenCallerHasNon_NONEStatus(EscapeHatchConfig memory _config)
    external
    givenValidConfig(_config)
    givenCallerIsNotInCandidateSet
  {
    // it should revert {EscapeHatch__InvalidStatus}

    // Warp to safe epoch first to avoid underflow in selectCandidates
    _warpToSafeEpoch();

    // Prepare the hatch with no candidates (so no one gets selected as proposer)
    escapeHatch.selectCandidates();

    // Now join candidate set (after hatch is prepared, they won't be selected)
    _joinCandidateSetWithConfig(CANDIDATE1);

    _warpForwardEpochs(config.frequency);

    escapeHatch.selectCandidates();
    Hatch hatch = escapeHatch.getHatch(rollup.getCurrentEpoch()) + Hatch.wrap(escapeHatch.getLagInHatches());
    assertEq(escapeHatch.getDesignatedProposer(hatch), CANDIDATE1, "candidate 1 not chosen");

    // Now candidate has PROPOSING status, try to join again (they're removed from active set)
    _mintAndApprove(CANDIDATE1, config.bondSize);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.EscapeHatch__InvalidStatus.selector, uint8(Status.NONE), uint8(Status.PROPOSING))
    );
    vm.prank(CANDIDATE1);
    escapeHatch.joinCandidateSet();

    vm.warp(escapeHatch.getCandidateInfo(CANDIDATE1).exitableAt);
    escapeHatch.validateProofSubmission(hatch);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.EscapeHatch__InvalidStatus.selector, uint8(Status.NONE), uint8(Status.EXITING))
    );
    vm.prank(CANDIDATE1);
    escapeHatch.joinCandidateSet();
  }

  modifier givenCallerHasNONEStatus() {
    // Fresh address CANDIDATE1 has NONE status by default
    _;
  }

  function test_RevertGiven_CallerHasInsufficientBondTokenBalance(EscapeHatchConfig memory _config)
    external
    givenValidConfig(_config)
    givenCallerIsNotInCandidateSet
    givenCallerHasNONEStatus
  {
    // it should revert
    vm.prank(CANDIDATE1);
    bondToken.approve(address(escapeHatch), config.bondSize);

    vm.expectRevert(
      abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, CANDIDATE1, 0, config.bondSize)
    );
    vm.prank(CANDIDATE1);
    escapeHatch.joinCandidateSet();
  }

  modifier givenCallerHasSufficientBondTokenBalance() {
    vm.prank(bondToken.owner());
    bondToken.mint(CANDIDATE1, config.bondSize);
    _;
  }

  function test_RevertGiven_CallerHasNotApprovedBondToken(EscapeHatchConfig memory _config)
    external
    givenValidConfig(_config)
    givenCallerIsNotInCandidateSet
    givenCallerHasNONEStatus
    givenCallerHasSufficientBondTokenBalance
  {
    // it should revert
    vm.expectRevert(
      abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(escapeHatch), 0, config.bondSize)
    );
    vm.prank(CANDIDATE1);
    escapeHatch.joinCandidateSet();
  }

  function test_GivenCallerHasApprovedBondToken(EscapeHatchConfig memory _config)
    external
    givenValidConfig(_config)
    givenCallerIsNotInCandidateSet
    givenCallerHasNONEStatus
    givenCallerHasSufficientBondTokenBalance
  {
    // it should add caller to active candidates
    // it should set caller status to ACTIVE
    // it should set caller amount to BOND_SIZE
    // it should transfer BOND_SIZE from caller
    // it should emit CandidateJoined event

    // Approve (mint already done by givenCallerHasSufficientBondTokenBalance modifier)
    vm.prank(CANDIDATE1);
    bondToken.approve(address(escapeHatch), config.bondSize);

    uint256 balanceBefore = bondToken.balanceOf(CANDIDATE1);
    uint256 contractBalanceBefore = bondToken.balanceOf(address(escapeHatch));

    vm.expectEmit(true, true, true, true);
    emit IEscapeHatchCore.CandidateJoined(CANDIDATE1, config.bondSize);

    vm.prank(CANDIDATE1);
    escapeHatch.joinCandidateSet();

    // Verify candidate is in active set
    assertTrue(escapeHatch.isCandidate(CANDIDATE1), "Candidate not in active set");
    assertEq(escapeHatch.getCandidateCount(), 1, "Candidate count mismatch");

    // Verify candidate info
    CandidateInfo memory info = escapeHatch.getCandidateInfo(CANDIDATE1);
    assertEq(uint8(info.status), uint8(Status.ACTIVE), "Status not ACTIVE");
    assertEq(info.amount, config.bondSize, "Amount mismatch");

    // Verify token transfer
    assertEq(bondToken.balanceOf(CANDIDATE1), balanceBefore - config.bondSize, "Candidate balance not reduced");
    assertEq(
      bondToken.balanceOf(address(escapeHatch)),
      contractBalanceBefore + config.bondSize,
      "Contract balance not increased"
    );
  }
}
