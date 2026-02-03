// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {stdStorage, StdStorage} from "forge-std/Test.sol";

import {GovernanceBase} from "./base.t.sol";
import {Proposal, ProposalState} from "@aztec/governance/interfaces/IGovernance.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {VoteTabulationReturn} from "@aztec/governance/libraries/ProposalLib.sol";
import {TestGov} from "@test/governance/helpers/TestGov.sol";

contract GetProposalStateTest is GovernanceBase {
  using stdStorage for StdStorage;

  function test_WhenProposalIsOutOfBounds(uint256 _index) external {
    // it revert
    uint256 index = bound(_index, governance.proposalCount(), type(uint256).max);
    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__ProposalDoesNotExists.selector, index));
    governance.getProposalState(index);
  }

  modifier whenValidProposalId() {
    _;
  }

  modifier givenStateIsStable() {
    _;
  }

  function test_GivenStateIsExecuted(address _voter, uint256 _totalPower, uint256 _votesCast, uint256 _yeas)
    external
    whenValidProposalId
    givenStateIsStable
  {
    // it return Executed
    _stateExecutable("empty", _voter, _totalPower, _votesCast, _yeas);
    governance.execute(proposalId);

    assertEq(proposal.cachedState, ProposalState.Pending);
    assertEq(governance.getProposalState(proposalId), ProposalState.Executed);
  }

  function test_GivenStateIsDropped(address _governanceProposer) external whenValidProposalId givenStateIsStable {
    // it return Dropped
    _stateDroppable("empty", _governanceProposer);

    assertEq(proposal.cachedState, ProposalState.Pending);
    assertEq(governance.getProposalState(proposalId), ProposalState.Droppable);

    governance.dropProposal(proposalId);

    Proposal memory fresh = governance.getProposal(proposalId);
    assertEq(fresh.cachedState, ProposalState.Dropped);
  }

  modifier givenStateIsUnstable() {
    _;

    Proposal memory fresh = governance.getProposal(proposalId);
    assertEq(fresh.cachedState, ProposalState.Pending);
  }

  function test_GivenGovernanceProposerHaveChanged(address _governanceProposer)
    external
    whenValidProposalId
    givenStateIsUnstable
  {
    // it return Dropped
    _stateDroppable("empty", _governanceProposer);

    assertEq(proposal.cachedState, ProposalState.Pending);
    assertEq(governance.getProposalState(proposalId), ProposalState.Droppable);
  }

  modifier givenGovernanceProposerIsUnchanged() {
    _;
  }

  function test_WhenVotingDelayHaveNotPassed(uint256 _timeJump)
    external
    whenValidProposalId
    givenStateIsUnstable
    givenGovernanceProposerIsUnchanged
  {
    // it return Pending
    _statePending("empty");

    uint256 time = bound(_timeJump, block.timestamp, Timestamp.unwrap(upw.pendingThrough(proposal)));
    vm.warp(time);

    assertEq(governance.getProposalState(proposalId), ProposalState.Pending);
  }

  modifier whenVotingDelayHavePassed() {
    _;
  }

  function test_WhenVotingDurationHaveNotPassed(uint256 _timeJump)
    external
    whenValidProposalId
    givenStateIsUnstable
    givenGovernanceProposerIsUnchanged
    whenVotingDelayHavePassed
  {
    // it return Active
    _stateActive("empty");

    uint256 time = bound(_timeJump, block.timestamp, Timestamp.unwrap(upw.activeThrough(proposal)));
    vm.warp(time);

    assertEq(governance.getProposalState(proposalId), ProposalState.Active);
  }

  modifier whenVotingDurationHavePassed() {
    _;
  }

  function test_GivenVoteTabulationIsRejected()
    external
    whenValidProposalId
    givenStateIsUnstable
    givenGovernanceProposerIsUnchanged
    whenVotingDelayHavePassed
    whenVotingDurationHavePassed
  {
    // it return Rejected
    _stateRejected("empty");

    uint256 totalPower = governance.totalPowerNow();
    (VoteTabulationReturn vtr,) = upw.voteTabulation(proposal, totalPower);
    assertEq(vtr, VoteTabulationReturn.Rejected, "invalid return value");
    assertEq(governance.getProposalState(proposalId), ProposalState.Rejected);
  }

  function test_GivenVoteTabulationIsInvalid(address _voter, uint256 _totalPower, uint256 _votesCast, uint256 _yeas)
    external
    whenValidProposalId
    givenStateIsUnstable
    givenGovernanceProposerIsUnchanged
    whenVotingDelayHavePassed
    whenVotingDurationHavePassed
  {
    // it return Rejected
    _stateQueued("empty", _voter, _totalPower, _votesCast, _yeas);

    // We can overwrite the quorum to be 0 to hit an invalid case
    assertGt(governance.getProposal(proposalId).config.quorum, 0);
    TestGov(address(governance)).test__overrideQuorum(proposalId, 0);
    assertEq(governance.getProposal(proposalId).config.quorum, 0);

    uint256 totalPower = governance.totalPowerNow();

    proposal = governance.getProposal(proposalId);
    (VoteTabulationReturn vtr,) = upw.voteTabulation(proposal, totalPower);
    assertEq(vtr, VoteTabulationReturn.Invalid, "invalid return value");
    assertEq(governance.getProposalState(proposalId), ProposalState.Rejected);
  }

  modifier givenVoteTabulationIsAccepted(address _voter, uint256 _totalPower, uint256 _votesCast, uint256 _yeas) {
    _stateQueued("empty", _voter, _totalPower, _votesCast, _yeas);
    _;
  }

  function test_GivenExecutionDelayHaveNotPassed(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas,
    uint256 _timeJump
  )
    external
    whenValidProposalId
    givenStateIsUnstable
    givenGovernanceProposerIsUnchanged
    whenVotingDelayHavePassed
    whenVotingDurationHavePassed
    givenVoteTabulationIsAccepted(_voter, _totalPower, _votesCast, _yeas)
  {
    // it return Queued
    uint256 time = bound(_timeJump, block.timestamp, Timestamp.unwrap(upw.queuedThrough(proposal)));
    vm.warp(time);

    assertEq(governance.getProposalState(proposalId), ProposalState.Queued);
  }

  modifier givenExecutionDelayHavePassed() {
    vm.warp(Timestamp.unwrap(upw.queuedThrough(proposal)) + 1);
    _;
  }

  function test_GivenGracePeriodHaveNotPassed(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas,
    uint256 _timeJump
  )
    external
    whenValidProposalId
    givenStateIsUnstable
    givenGovernanceProposerIsUnchanged
    whenVotingDelayHavePassed
    whenVotingDurationHavePassed
    givenVoteTabulationIsAccepted(_voter, _totalPower, _votesCast, _yeas)
    givenExecutionDelayHavePassed
  {
    // it return Executable
    uint256 time = bound(_timeJump, block.timestamp, Timestamp.unwrap(upw.executableThrough(proposal)));
    vm.warp(time);

    assertEq(governance.getProposalState(proposalId), ProposalState.Executable);
  }

  function test_GivenGracePeriodHavePassed(address _voter, uint256 _totalPower, uint256 _votesCast, uint256 _yeas)
    external
    whenValidProposalId
    givenStateIsUnstable
    givenGovernanceProposerIsUnchanged
    whenVotingDelayHavePassed
    whenVotingDurationHavePassed
    givenVoteTabulationIsAccepted(_voter, _totalPower, _votesCast, _yeas)
    givenExecutionDelayHavePassed
  {
    // it return Expired
    vm.warp(Timestamp.unwrap(upw.executableThrough(proposal)) + 1);
    assertEq(governance.getProposalState(proposalId), ProposalState.Expired);
  }
}
