// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceBase} from "../base.t.sol";
import {EmptyPayload} from "../TestPayloads.sol";
import {
  IGovernance,
  Configuration,
  Proposal,
  ProposalState,
  Withdrawal
} from "@aztec/governance/interfaces/IGovernance.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {ConfigurationLib} from "@aztec/governance/libraries/ConfigurationLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";

contract UpdateConfigurationPayload is IPayload {
  IGovernance internal immutable GOVERNANCE;
  Configuration internal configuration;

  constructor(IGovernance _governance, Configuration memory _configuration) {
    GOVERNANCE = _governance;
    configuration = _configuration;
  }

  function getActions() external view override(IPayload) returns (IPayload.Action[] memory) {
    IPayload.Action[] memory res = new IPayload.Action[](1);
    Configuration memory updatedConfiguration = configuration;

    res[0] = Action({
      target: address(GOVERNANCE),
      data: abi.encodeWithSelector(IGovernance.updateConfiguration.selector, updatedConfiguration)
    });

    return res;
  }

  function getURI() external pure override(IPayload) returns (string memory) {
    return "UpdateConfigurationPayload";
  }
}

contract VoteAndExitAfterConfigChangeTest is GovernanceBase {
  address internal constant VOTER = address(0xb0b);
  uint256 internal constant VOTER_POWER = 400e18;

  function test_CannotFinalizeWithdrawBeforeVotedProposalIsExecutableAfterConfigReduction() external {
    token.mint(VOTER, VOTER_POWER);
    vm.startPrank(VOTER);
    token.approve(address(governance), VOTER_POWER);
    governance.deposit(VOTER, VOTER_POWER);
    vm.stopPrank();

    Configuration memory shortConfig = governance.getConfiguration();
    shortConfig.votingDelay = ConfigurationLib.TIME_LOWER;
    shortConfig.votingDuration = ConfigurationLib.TIME_LOWER;
    shortConfig.executionDelay = ConfigurationLib.TIME_LOWER;

    UpdateConfigurationPayload configPayload =
      new UpdateConfigurationPayload(IGovernance(address(governance)), shortConfig);

    vm.prank(address(governanceProposer));
    governance.propose(configPayload);
    uint256 configProposalId = governance.proposalCount() - 1;
    Proposal memory configProposal = governance.getProposal(configProposalId);

    vm.warp(block.timestamp + 200);

    EmptyPayload laterPayload = new EmptyPayload();
    vm.prank(address(governanceProposer));
    governance.propose(laterPayload);
    uint256 laterProposalId = governance.proposalCount() - 1;
    Proposal memory laterProposal = governance.getProposal(laterProposalId);

    vm.warp(Timestamp.unwrap(upw.pendingThrough(laterProposal)) + 1);

    vm.startPrank(VOTER);
    governance.vote(configProposalId, VOTER_POWER, true);
    governance.vote(laterProposalId, VOTER_POWER, true);
    vm.stopPrank();

    Timestamp laterVoteExit = Timestamp.wrap(
      Timestamp.unwrap(upw.queuedThrough(laterProposal)) + Timestamp.unwrap(laterProposal.config.votingDelay) / 5 + 1
    );

    vm.warp(Timestamp.unwrap(upw.queuedThrough(configProposal)) + 1);
    assertEq(governance.getProposalState(configProposalId), ProposalState.Executable);
    governance.execute(configProposalId);

    Timestamp liveConfigUnlock = Timestamp.wrap(block.timestamp) + upw.getWithdrawalDelay(shortConfig);
    assertLt(Timestamp.unwrap(liveConfigUnlock), Timestamp.unwrap(laterVoteExit));

    vm.prank(VOTER);
    uint256 withdrawalId = governance.initiateWithdraw(VOTER, VOTER_POWER);

    Withdrawal memory withdrawal = governance.getWithdrawal(withdrawalId);
    assertEq(withdrawal.unlocksAt, laterVoteExit);

    vm.warp(Timestamp.unwrap(liveConfigUnlock));
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__WithdrawalNotUnlockedYet.selector, Timestamp.wrap(block.timestamp), withdrawal.unlocksAt
      )
    );
    governance.finalizeWithdraw(withdrawalId);

    vm.warp(Timestamp.unwrap(withdrawal.unlocksAt));
    assertEq(governance.getProposalState(laterProposalId), ProposalState.Executable);
    governance.finalizeWithdraw(withdrawalId);
  }
}
