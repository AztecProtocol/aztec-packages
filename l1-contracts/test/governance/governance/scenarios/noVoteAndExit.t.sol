// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceBase} from "../base.t.sol";
import {Proposal, ProposalState, Withdrawal} from "@aztec/governance/interfaces/IGovernance.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {DEPOSIT_GRANULARITY_SECONDS} from "@aztec/governance/libraries/UserLib.sol";

contract NoVoteAndExitTest is GovernanceBase {
  using ProposalLib for Proposal;
  // Ensure that it is not possible to BOTH vote on proposal AND withdraw the funds before
  // it can be executed

  function test_CannotVoteAndExit(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external {
    bytes32 _proposalName = "empty";

    vm.assume(_voter != address(0));
    proposal = proposals[_proposalName];
    proposalId = proposalIds[_proposalName];

    uint256 totalPower = bound(_totalPower, proposal.config.minimumVotes, type(uint128).max);
    uint256 votesNeeded = Math.mulDiv(totalPower, proposal.config.quorum, 1e18, Math.Rounding.Ceil);
    uint256 votesCast = bound(_votesCast, votesNeeded, totalPower);

    uint256 yeaLimitFraction = Math.ceilDiv(1e18 + proposal.config.voteDifferential, 2);
    uint256 yeaLimit = Math.mulDiv(votesCast, yeaLimitFraction, 1e18, Math.Rounding.Ceil);

    uint256 yeas = yeaLimit == votesCast ? votesCast : bound(_yeas, yeaLimit + 1, votesCast);

    token.mint(_voter, totalPower);
    vm.startPrank(_voter);
    token.approve(address(governance), totalPower);
    governance.deposit(_voter, totalPower);
    vm.stopPrank();

    // Jump up to the point where the proposal becomes active
    vm.warp(Timestamp.unwrap(proposal.pendingThrough()) + DEPOSIT_GRANULARITY_SECONDS);

    assertEq(governance.getProposalState(proposalId), ProposalState.Active);

    vm.prank(_voter);
    governance.vote(proposalId, yeas, true);
    vm.prank(_voter);
    governance.vote(proposalId, votesCast - yeas, false);

    vm.prank(_voter);
    uint256 withdrawalId = governance.initiateWithdraw(_voter, totalPower);

    // Jump to the block just before we become executable.
    vm.warp(Timestamp.unwrap(proposal.queuedThrough()));
    assertEq(governance.getProposalState(proposalId), ProposalState.Queued);

    vm.warp(Timestamp.unwrap(proposal.queuedThrough()) + 1);
    assertEq(governance.getProposalState(proposalId), ProposalState.Executable);

    Withdrawal memory withdrawal = governance.getWithdrawal(withdrawalId);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__WithdrawalNotUnlockedYet.selector,
        Timestamp.wrap(block.timestamp),
        withdrawal.unlocksAt
      )
    );
    governance.finaliseWithdraw(withdrawalId);

    governance.execute(proposalId);
  }
}
