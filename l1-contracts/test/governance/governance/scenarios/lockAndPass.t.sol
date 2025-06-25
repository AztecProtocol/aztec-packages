// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {GovernanceBase} from "../base.t.sol";
import {
  IGovernance,
  Proposal,
  ProposalState,
  Configuration
} from "@aztec/governance/interfaces/IGovernance.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {UpgradePayload, FakeRollup} from "../TestPayloads.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";

contract LockAndPassTest is GovernanceBase {
  using ProposalLib for Proposal;

  function setUp() public override {
    super.setUp();

    FakeRollup newRollup = new FakeRollup();
    vm.prank(address(governance));
    registry.addRollup(IRollup(address(newRollup)));
  }

  function test_LockVoteAndExecute() external {
    Configuration memory config = governance.getConfiguration();
    token.mint(address(this), config.proposeConfig.lockAmount);

    UpgradePayload payload = new UpgradePayload(registry);
    assertNotEq(address(payload.NEW_ROLLUP()), address(registry.getCanonicalRollup()));

    token.approve(address(governance), config.proposeConfig.lockAmount);
    governance.deposit(address(this), config.proposeConfig.lockAmount);

    proposalId = governance.proposalCount();
    vm.expectEmit(true, true, true, true, address(governance));
    emit IGovernance.Proposed(proposalId, address(payload));
    governance.proposeWithLock(IPayload(address(payload)), address(this));

    proposal = governance.getProposal(proposalId);
    assertEq(address(proposal.payload), address(payload));

    token.mint(address(this), config.minimumVotes);
    token.approve(address(governance), config.minimumVotes);
    governance.deposit(address(this), config.minimumVotes);

    vm.warp(Timestamp.unwrap(proposal.pendingThrough()) + 1);
    assertEq(governance.getProposalState(proposalId), ProposalState.Active);

    vm.prank(address(this));
    governance.vote(proposalId, config.minimumVotes, true);

    vm.warp(Timestamp.unwrap(proposal.activeThrough()) + 1);
    assertEq(governance.getProposalState(proposalId), ProposalState.Queued);

    vm.warp(Timestamp.unwrap(proposal.queuedThrough()) + 1);
    assertEq(governance.getProposalState(proposalId), ProposalState.Executable);

    assertNotEq(address(registry.getCanonicalRollup()), address(payload.NEW_ROLLUP()));
    governance.execute(proposalId);
    assertEq(address(registry.getCanonicalRollup()), address(payload.NEW_ROLLUP()));

    assertEq(governance.getProposalState(proposalId), ProposalState.Executed);
    assertEq(registry.numberOfVersions(), 2);
  }
}
