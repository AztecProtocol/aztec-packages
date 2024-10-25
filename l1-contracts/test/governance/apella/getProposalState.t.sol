// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {ApellaBase} from "./base.t.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {ProposalLib, VoteTabulationReturn} from "@aztec/governance/libraries/ProposalLib.sol";

contract GetProposalStateTest is ApellaBase {
  using ProposalLib for DataStructures.Proposal;

  function test_WhenProposalIsOutOfBounds(uint256 _index) external {
    // it revert
    uint256 index = bound(_index, apella.proposalCount(), type(uint256).max);
    vm.expectRevert(abi.encodeWithSelector(Errors.Apella__ProposalDoesNotExists.selector, index));
    apella.getProposalState(index);
  }

  modifier whenValidProposalId() {
    _;
  }

  modifier givenStateIsStable() {
    _;
  }

  function test_GivenStateIsExecuted(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external whenValidProposalId givenStateIsStable {
    // it return Executed
    _stateExecutable("empty", _voter, _totalPower, _votesCast, _yeas);
    apella.execute(proposalId);

    assertEq(proposal.state, DataStructures.ProposalState.Pending);
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Executed);
  }

  function test_GivenStateIsDropped(address _gerousia)
    external
    whenValidProposalId
    givenStateIsStable
  {
    // it return Dropped
    _stateDropped("empty", _gerousia);

    assertEq(proposal.state, DataStructures.ProposalState.Pending);
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Dropped);

    apella.dropProposal(proposalId);

    DataStructures.Proposal memory fresh = apella.getProposal(proposalId);
    assertEq(fresh.state, DataStructures.ProposalState.Dropped);
  }

  modifier givenStateIsUnstable() {
    _;

    DataStructures.Proposal memory fresh = apella.getProposal(proposalId);
    assertEq(fresh.state, DataStructures.ProposalState.Pending);
  }

  function test_GivenGerousiaHaveChanged(address _gerousia)
    external
    whenValidProposalId
    givenStateIsUnstable
  {
    // it return Dropped
    _stateDropped("empty", _gerousia);

    assertEq(proposal.state, DataStructures.ProposalState.Pending);
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Dropped);
  }

  modifier givenGerousiaIsUnchanged() {
    _;
  }

  function test_WhenVotingDelayHaveNotPassed(uint256 _timeJump)
    external
    whenValidProposalId
    givenStateIsUnstable
    givenGerousiaIsUnchanged
  {
    // it return Pending
    _statePending("empty");

    uint256 time = bound(_timeJump, block.timestamp, Timestamp.unwrap(proposal.pendingThrough()));
    vm.warp(time);

    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Pending);
  }

  modifier whenVotingDelayHavePassed() {
    _;
  }

  function test_WhenVotingDurationHaveNotPassed(uint256 _timeJump)
    external
    whenValidProposalId
    givenStateIsUnstable
    givenGerousiaIsUnchanged
    whenVotingDelayHavePassed
  {
    // it return Active
    _stateActive("empty");

    uint256 time = bound(_timeJump, block.timestamp, Timestamp.unwrap(proposal.activeThrough()));
    vm.warp(time);

    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Active);
  }

  modifier whenVotingDurationHavePassed() {
    _;
  }

  function test_GivenVoteTabulationIsRejected()
    external
    whenValidProposalId
    givenStateIsUnstable
    givenGerousiaIsUnchanged
    whenVotingDelayHavePassed
    whenVotingDurationHavePassed
  {
    // it return Rejected
    _stateRejected("empty");

    uint256 totalPower = apella.totalPowerAt(Timestamp.wrap(block.timestamp));
    (VoteTabulationReturn vtr,) = proposal.voteTabulation(totalPower);
    assertEq(vtr, VoteTabulationReturn.Rejected, "invalid return value");
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Rejected);
  }

  function test_GivenVoteTabulationIsInvalid(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  )
    external
    whenValidProposalId
    givenStateIsUnstable
    givenGerousiaIsUnchanged
    whenVotingDelayHavePassed
    whenVotingDurationHavePassed
  {
    // it return Rejected
    _stateQueued("empty", _voter, _totalPower, _votesCast, _yeas);

    // We can overwrite the quorum to be 0 to hit an invalid case
    assertGt(apella.getProposal(proposalId).config.quorum, 0);
    bytes32 slot =
      bytes32(uint256(keccak256(abi.encodePacked(uint256(proposalId), uint256(1)))) + 6);
    vm.store(address(apella), slot, 0);
    assertEq(apella.getProposal(proposalId).config.quorum, 0);

    uint256 totalPower = apella.totalPowerAt(Timestamp.wrap(block.timestamp));

    proposal = apella.getProposal(proposalId);
    (VoteTabulationReturn vtr,) = proposal.voteTabulation(totalPower);
    assertEq(vtr, VoteTabulationReturn.Invalid, "invalid return value");
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Rejected);
  }

  modifier givenVoteTabulationIsAccepted(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) {
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
    givenGerousiaIsUnchanged
    whenVotingDelayHavePassed
    whenVotingDurationHavePassed
    givenVoteTabulationIsAccepted(_voter, _totalPower, _votesCast, _yeas)
  {
    // it return Queued
    uint256 time = bound(_timeJump, block.timestamp, Timestamp.unwrap(proposal.queuedThrough()));
    vm.warp(time);

    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Queued);
  }

  modifier givenExecutionDelayHavePassed() {
    vm.warp(Timestamp.unwrap(proposal.queuedThrough()) + 1);
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
    givenGerousiaIsUnchanged
    whenVotingDelayHavePassed
    whenVotingDurationHavePassed
    givenVoteTabulationIsAccepted(_voter, _totalPower, _votesCast, _yeas)
    givenExecutionDelayHavePassed
  {
    // it return Executable
    uint256 time = bound(_timeJump, block.timestamp, Timestamp.unwrap(proposal.executableThrough()));
    vm.warp(time);

    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Executable);
  }

  function test_GivenGracePeriodHavePassed(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  )
    external
    whenValidProposalId
    givenStateIsUnstable
    givenGerousiaIsUnchanged
    whenVotingDelayHavePassed
    whenVotingDurationHavePassed
    givenVoteTabulationIsAccepted(_voter, _totalPower, _votesCast, _yeas)
    givenExecutionDelayHavePassed
  {
    // it return Expired
    vm.warp(Timestamp.unwrap(proposal.executableThrough()) + 1);
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Expired);
  }
}
