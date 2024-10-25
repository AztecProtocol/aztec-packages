// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {ApellaBase} from "./base.t.sol";
import {IApella} from "@aztec/governance/interfaces/IApella.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";

contract ProposeWithLockTest is ApellaBase {
  function test_WhenCallerHaveInsufficientPower() external {
    // it revert
    DataStructures.Configuration memory config = apella.getConfiguration();
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Apella__InsufficientPower.selector, address(this), 0, config.proposeConfig.lockAmount
      )
    );
    apella.proposeWithLock(IPayload(address(0)), address(this));
  }

  function test_WhenCallerHaveSufficientPower(address _proposal) external {
    // it creates a withdrawal with the lock amount and delay
    // it creates a new proposal with current config
    // it emits a {ProposalCreated} event
    // it returns true
    DataStructures.Configuration memory config = apella.getConfiguration();
    token.mint(address(this), config.proposeConfig.lockAmount);

    token.approve(address(apella), config.proposeConfig.lockAmount);
    apella.deposit(address(this), config.proposeConfig.lockAmount);

    proposalId = apella.proposalCount();

    vm.expectEmit(true, true, true, true, address(apella));
    emit IApella.Proposed(proposalId, _proposal);

    assertTrue(apella.proposeWithLock(IPayload(_proposal), address(this)));

    DataStructures.Proposal memory proposal = apella.getProposal(proposalId);
    assertEq(proposal.config.executionDelay, config.executionDelay);
    assertEq(proposal.config.gracePeriod, config.gracePeriod);
    assertEq(proposal.config.minimumVotes, config.minimumVotes);
    assertEq(proposal.config.quorum, config.quorum);
    assertEq(proposal.config.voteDifferential, config.voteDifferential);
    assertEq(proposal.config.votingDelay, config.votingDelay);
    assertEq(proposal.config.votingDuration, config.votingDuration);
    assertEq(proposal.creation, Timestamp.wrap(block.timestamp));
    assertEq(proposal.gerousia, address(gerousia));
    assertEq(proposal.summedBallot.nea, 0);
    assertEq(proposal.summedBallot.yea, 0);
    assertTrue(proposal.state == DataStructures.ProposalState.Pending);
  }
}
