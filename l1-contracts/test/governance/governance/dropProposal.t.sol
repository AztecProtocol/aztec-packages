// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceBase} from "./base.t.sol";
import {ProposalState} from "@aztec/governance/interfaces/IGovernance.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract DropProposalTest is GovernanceBase {
  modifier givenProposalIsStable() {
    _;
  }

  function test_GivenProposalIsDropped(address _governanceProposer) external givenProposalIsStable {
    // it revert
    _stateDropped("empty", _governanceProposer);
    assertEq(governance.getProposal(proposalId).state, ProposalState.Pending);
    assertEq(governance.getProposalState(proposalId), ProposalState.Dropped);
    assertTrue(governance.dropProposal(proposalId));
    assertEq(governance.getProposal(proposalId).state, ProposalState.Dropped);

    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__ProposalAlreadyDropped.selector));
    governance.dropProposal(proposalId);
  }

  function test_GivenProposalIsExecuted(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenProposalIsStable {
    // it revert
    _stateExecutable("empty", _voter, _totalPower, _votesCast, _yeas);
    assertTrue(governance.execute(proposalId));
    assertEq(governance.getProposal(proposalId).state, ProposalState.Executed);

    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__ProposalCannotBeDropped.selector));
    governance.dropProposal(proposalId);
  }

  modifier givenProposalIsUnstable() {
    _;
  }

  modifier whenGetProposalStateIsNotDropped() {
    _;
    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__ProposalCannotBeDropped.selector));
    governance.dropProposal(proposalId);
  }

  function test_WhenGetProposalStateIsPending()
    external
    givenProposalIsUnstable
    whenGetProposalStateIsNotDropped
  {
    // it revert
    _statePending("empty");
    assertEq(governance.getProposalState(proposalId), ProposalState.Pending);
  }

  function test_WhenGetProposalStateIsActive()
    external
    givenProposalIsUnstable
    whenGetProposalStateIsNotDropped
  {
    // it revert
    _stateActive("empty");
    assertEq(governance.getProposalState(proposalId), ProposalState.Active);
  }

  function test_WhenGetProposalStateIsQueued(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenProposalIsUnstable whenGetProposalStateIsNotDropped {
    // it revert
    _stateQueued("empty", _voter, _totalPower, _votesCast, _yeas);
    assertEq(governance.getProposalState(proposalId), ProposalState.Queued);
  }

  function test_WhenGetProposalStateIsExecutable(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenProposalIsUnstable whenGetProposalStateIsNotDropped {
    // it revert
    _stateExecutable("empty", _voter, _totalPower, _votesCast, _yeas);
    assertEq(governance.getProposalState(proposalId), ProposalState.Executable);
  }

  function test_WhenGetProposalStateIsRejected()
    external
    givenProposalIsUnstable
    whenGetProposalStateIsNotDropped
  {
    // it revert
    _stateRejected("empty");
    assertEq(governance.getProposalState(proposalId), ProposalState.Rejected);
  }

  function test_WhenGetProposalStateIsExecuted(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenProposalIsUnstable whenGetProposalStateIsNotDropped {
    // it revert
    _stateExecutable("empty", _voter, _totalPower, _votesCast, _yeas);
    assertTrue(governance.execute(proposalId));
    assertEq(governance.getProposalState(proposalId), ProposalState.Executed);
  }

  function test_WhenGetProposalStateIsExpired(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenProposalIsUnstable whenGetProposalStateIsNotDropped {
    // it revert
    _stateExpired("empty", _voter, _totalPower, _votesCast, _yeas);
    assertEq(governance.getProposalState(proposalId), ProposalState.Expired);
  }

  function test_WhenGetProposalStateIsDropped(address _governanceProposer)
    external
    givenProposalIsUnstable
  {
    // it updates state to Dropped
    // it return true

    _stateDropped("empty", _governanceProposer);
    assertEq(governance.getProposal(proposalId).state, ProposalState.Pending);
    assertEq(governance.getProposalState(proposalId), ProposalState.Dropped);
    assertTrue(governance.dropProposal(proposalId));
    assertEq(governance.getProposal(proposalId).state, ProposalState.Dropped);
    assertEq(governance.getProposalState(proposalId), ProposalState.Dropped);
  }
}
