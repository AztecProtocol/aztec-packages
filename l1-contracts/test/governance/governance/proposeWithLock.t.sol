// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {GovernanceBase} from "./base.t.sol";
import {IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";

contract ProposeWithLockTest is GovernanceBase {
  function test_WhenCallerHasInsufficientPower() external {
    // it revert
    DataStructures.Configuration memory config = governance.getConfiguration();
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__InsufficientPower.selector,
        address(this),
        0,
        config.proposeConfig.lockAmount
      )
    );
    governance.proposeWithLock(IPayload(address(0)), address(this));
  }

  function test_WhenCallerHasSufficientPower(address _proposal) external {
    // it creates a withdrawal with the lock amount and delay
    // it creates a new proposal with current config
    // it emits a {ProposalCreated} event
    // it returns true
    DataStructures.Configuration memory config = governance.getConfiguration();
    token.mint(address(this), config.proposeConfig.lockAmount);

    token.approve(address(governance), config.proposeConfig.lockAmount);
    governance.deposit(address(this), config.proposeConfig.lockAmount);

    proposalId = governance.proposalCount();

    vm.expectEmit(true, true, true, true, address(governance));
    emit IGovernance.Proposed(proposalId, _proposal);

    assertTrue(governance.proposeWithLock(IPayload(_proposal), address(this)));

    DataStructures.Proposal memory proposal = governance.getProposal(proposalId);
    assertEq(proposal.config.executionDelay, config.executionDelay);
    assertEq(proposal.config.gracePeriod, config.gracePeriod);
    assertEq(proposal.config.minimumVotes, config.minimumVotes);
    assertEq(proposal.config.quorum, config.quorum);
    assertEq(proposal.config.voteDifferential, config.voteDifferential);
    assertEq(proposal.config.votingDelay, config.votingDelay);
    assertEq(proposal.config.votingDuration, config.votingDuration);
    assertEq(proposal.creation, Timestamp.wrap(block.timestamp));
    assertEq(proposal.governanceProposer, address(governanceProposer));
    assertEq(proposal.summedBallot.nea, 0);
    assertEq(proposal.summedBallot.yea, 0);
    assertTrue(proposal.state == DataStructures.ProposalState.Pending);
  }
}
