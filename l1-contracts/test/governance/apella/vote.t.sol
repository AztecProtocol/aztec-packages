// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {ApellaBase} from "./base.t.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {ProposalLib} from "@aztec/governance/libraries/ProposalLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {IApella} from "@aztec/governance/interfaces/IApella.sol";

contract VoteTest is ApellaBase {
  using ProposalLib for DataStructures.Proposal;

  uint256 internal depositPower;

  function setUp() public override(ApellaBase) {
    super.setUp();

    proposal = proposals["empty"];
    proposalId = proposalIds["empty"];
  }

  modifier givenStateIsNotActive(address _voter, uint256 _amount, bool _support) {
    _;
    vm.prank(_voter);
    vm.expectRevert(abi.encodeWithSelector(Errors.Apella__ProposalNotActive.selector));
    apella.vote(proposalId, _amount, _support);
  }

  function test_GivenStateIsPending(address _voter, uint256 _amount, bool _support)
    external
    givenStateIsNotActive(_voter, _amount, _support)
  {
    // it revert
    _statePending("empty");
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Pending);
  }

  function test_GivenStateIsQueued(
    address _voter,
    uint256 _amount,
    bool _support,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenStateIsNotActive(_voter, _amount, _support) {
    // it revert
    _stateQueued("empty", _voter, _totalPower, _votesCast, _yeas);
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Queued);
  }

  function test_GivenStateIsExecutable(
    address _voter,
    uint256 _amount,
    bool _support,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenStateIsNotActive(_voter, _amount, _support) {
    // it revert
    _stateExecutable("empty", _voter, _totalPower, _votesCast, _yeas);
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Executable);
  }

  function test_GivenStateIsRejected(address _voter, uint256 _amount, bool _support)
    external
    givenStateIsNotActive(_voter, _amount, _support)
  {
    // it revert
    _stateRejected("empty");
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Rejected);
  }

  function test_GivenStateIsDropped(
    address _voter,
    uint256 _amount,
    bool _support,
    address _gerousia
  ) external givenStateIsNotActive(_voter, _amount, _support) {
    // it revert
    _stateDropped("empty", _gerousia);
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Dropped);
  }

  function test_GivenStateIsExpired(
    address _voter,
    uint256 _amount,
    bool _support,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenStateIsNotActive(_voter, _amount, _support) {
    // it revert
    _stateExpired("empty", _voter, _totalPower, _votesCast, _yeas);
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Expired);
  }

  modifier givenStateIsActive(address _voter, uint256 _depositPower) {
    vm.assume(_voter != address(0));
    depositPower = bound(_depositPower, 1, type(uint128).max);

    token.mint(_voter, depositPower);
    vm.startPrank(_voter);
    token.approve(address(apella), depositPower);
    apella.deposit(_voter, depositPower);
    vm.stopPrank();

    assertEq(token.balanceOf(address(apella)), depositPower);
    assertEq(apella.powerAt(_voter, Timestamp.wrap(block.timestamp)), depositPower);

    _stateActive("empty");

    _;
  }

  function test_GivenAmountLargerThanAvailablePower(
    address _voter,
    uint256 _depositPower,
    uint256 _votePower,
    bool _support
  ) external givenStateIsActive(_voter, _depositPower) {
    // it revert

    uint256 power = bound(_votePower, depositPower + 1, type(uint256).max);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Apella__InsufficientPower.selector, _voter, depositPower, power)
    );
    vm.prank(_voter);
    apella.vote(proposalId, power, _support);
  }

  function test_GivenAmountSmallerOrEqAvailablePower(
    address _voter,
    uint256 _depositPower,
    uint256 _votePower,
    bool _support
  ) external givenStateIsActive(_voter, _depositPower) {
    // it increase yea or nea on user ballot by amount
    // it increase yea or nea on total by amount
    // it emits {VoteCast} event
    // it returns true

    uint256 power = bound(_votePower, 1, depositPower);

    vm.expectEmit(true, true, true, true, address(apella));
    emit IApella.VoteCast(proposalId, _voter, _support, power);
    vm.prank(_voter);
    apella.vote(proposalId, power, _support);

    DataStructures.Proposal memory fresh = apella.getProposal(proposalId);

    assertEq(proposal.config.executionDelay, fresh.config.executionDelay, "executionDelay");
    assertEq(proposal.config.gracePeriod, fresh.config.gracePeriod, "gracePeriod");
    assertEq(proposal.config.minimumVotes, fresh.config.minimumVotes, "minimumVotes");
    assertEq(proposal.config.quorum, fresh.config.quorum, "quorum");
    assertEq(proposal.config.voteDifferential, fresh.config.voteDifferential, "voteDifferential");
    assertEq(proposal.config.votingDelay, fresh.config.votingDelay, "votingDelay");
    assertEq(proposal.config.votingDuration, fresh.config.votingDuration, "votingDuration");
    assertEq(proposal.creation, fresh.creation, "creation");
    assertEq(proposal.gerousia, fresh.gerousia, "gerousia");
    assertEq(proposal.summedBallot.nea + (_support ? 0 : power), fresh.summedBallot.nea, "nea");
    assertEq(proposal.summedBallot.yea + (_support ? power : 0), fresh.summedBallot.yea, "yea");
    // The "written" state is still the same.
    assertTrue(proposal.state == fresh.state, "state");
  }
}
