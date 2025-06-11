// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {GovernanceBase} from "./base.t.sol";
import {IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";

contract ProposeTest is GovernanceBase {
  function test_WhenCallerIsNotGovernanceProposer() external {
    // it revert
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__CallerNotGovernanceProposer.selector,
        address(this),
        address(governanceProposer)
      )
    );
    governance.propose(IPayload(address(0)));
  }

  function test_WhenCallerIsGovernanceProposer(address _proposal) external {
    // it creates a new proposal with current config
    // it emits a {ProposalCreated} event
    // it returns true

    DataStructures.Configuration memory config = governance.getConfiguration();

    proposalId = governance.proposalCount();

    vm.expectEmit(true, true, true, true, address(governance));
    emit IGovernance.Proposed(proposalId, _proposal);

    vm.prank(address(governanceProposer));
    governance.propose(IPayload(_proposal));

    DataStructures.Proposal memory proposal = governance.getProposal(proposalId);
    assertEq(proposal.config.executionDelay, config.executionDelay);
    assertEq(proposal.config.gracePeriod, config.gracePeriod);
    assertEq(proposal.config.minimumVotes, config.minimumVotes);
    assertEq(proposal.config.quorum, config.quorum);
    assertEq(proposal.config.voteDifferential, config.voteDifferential);
    assertEq(proposal.config.votingDelay, config.votingDelay);
    assertEq(proposal.config.votingDuration, config.votingDuration);
    assertEq(proposal.creation, Timestamp.wrap(block.timestamp));
    assertEq(proposal.proposer, address(governanceProposer));
    assertEq(proposal.summedBallot.nea, 0);
    assertEq(proposal.summedBallot.yea, 0);
    assertTrue(proposal.state == DataStructures.ProposalState.Pending);
  }
}
