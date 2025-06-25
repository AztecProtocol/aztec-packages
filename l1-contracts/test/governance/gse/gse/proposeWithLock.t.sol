// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {WithGSE} from "./base.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IGSECore} from "@aztec/governance/GSE.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {
  Configuration,
  Proposal,
  ProposalState,
  IGovernance,
  Withdrawal
} from "@aztec/governance/interfaces/IGovernance.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";

contract ProposeWithLockTest is WithGSE {
  function test_WhenCallerHasInsufficientBalance() external {
    // it revert
    Configuration memory config = governance.getConfiguration();
    vm.expectRevert(
      abi.encodeWithSelector(
        IERC20Errors.ERC20InsufficientAllowance.selector,
        address(gse),
        0,
        config.proposeConfig.lockAmount
      )
    );
    gse.proposeWithLock(IPayload(address(0)), address(this));
  }

  function test_WhenCallerHasSufficientBalance(address _proposal) external {
    // it creates a withdrawal with the lock amount and delay
    // it creates a new proposal with current config
    // it emits a {ProposalCreated} event
    // it returns true
    Configuration memory config = governance.getConfiguration();
    vm.prank(stakingAsset.owner());
    stakingAsset.mint(address(this), config.proposeConfig.lockAmount);
    stakingAsset.approve(address(gse), config.proposeConfig.lockAmount);

    uint256 proposalId = governance.proposalCount();

    vm.expectEmit(true, true, true, true, address(governance));
    emit IGovernance.Proposed(proposalId, _proposal);

    gse.proposeWithLock(IPayload(_proposal), address(this));

    Proposal memory proposal = governance.getProposal(proposalId);
    assertEq(proposal.config.executionDelay, config.executionDelay);
    assertEq(proposal.config.gracePeriod, config.gracePeriod);
    assertEq(proposal.config.minimumVotes, config.minimumVotes);
    assertEq(proposal.config.quorum, config.quorum);
    assertEq(proposal.config.voteDifferential, config.voteDifferential);
    assertEq(proposal.config.votingDelay, config.votingDelay);
    assertEq(proposal.config.votingDuration, config.votingDuration);
    assertEq(proposal.creation, Timestamp.wrap(block.timestamp));
    assertEq(proposal.proposer, address(governance));
    assertEq(proposal.summedBallot.nea, 0);
    assertEq(proposal.summedBallot.yea, 0);
    assertTrue(proposal.state == ProposalState.Pending);
    assertEq(stakingAsset.balanceOf(address(gse)), 0);
    assertEq(stakingAsset.balanceOf(address(this)), 0);
    assertEq(stakingAsset.balanceOf(address(governance)), config.proposeConfig.lockAmount);

    Withdrawal memory withdrawal = governance.getWithdrawal(0);
    assertEq(withdrawal.claimed, false);
    assertEq(withdrawal.amount, config.proposeConfig.lockAmount);
    assertEq(withdrawal.recipient, address(this));
  }
}
