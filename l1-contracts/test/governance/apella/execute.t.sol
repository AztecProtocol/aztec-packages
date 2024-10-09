// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {ApellaBase} from "./base.t.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {IApella} from "@aztec/governance/interfaces/IApella.sol";
import {
  ProposalLib,
  VoteTabulationReturn,
  VoteTabulationInfo
} from "@aztec/governance/libraries/ProposalLib.sol";

import {CallAssetPayload, UpgradePayload, CallRevertingPayload} from "./TestPayloads.sol";

contract ExecuteTest is ApellaBase {
  using ProposalLib for DataStructures.Proposal;

  uint256 internal depositPower;

  modifier givenStateIsNotExecutable() {
    _;
    vm.expectRevert(abi.encodeWithSelector(Errors.Apella__ProposalNotExecutable.selector));
    apella.execute(proposalId);
  }

  function test_GivenStateIsPending() external givenStateIsNotExecutable {
    // it revert
    _statePending("empty");
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Pending);
  }

  function test_GivenStateIsActive() external givenStateIsNotExecutable {
    // it revert
    _stateActive("empty");
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Active);
  }

  function test_GivenStateIsQueued(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenStateIsNotExecutable {
    // it revert
    _stateQueued("empty", _voter, _totalPower, _votesCast, _yeas);
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Queued);
  }

  function test_GivenStateIsRejected() external givenStateIsNotExecutable {
    // it revert
    _stateRejected("empty");
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Rejected);
  }

  function test_GivenStateIsDropped(address _gerousia) external givenStateIsNotExecutable {
    // it revert
    _stateDropped("empty", _gerousia);
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Dropped);
  }

  function test_GivenStateIsExecuted(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenStateIsNotExecutable {
    // it revert
    _stateExecutable("empty", _voter, _totalPower, _votesCast, _yeas);
    assertTrue(apella.execute(proposalId));
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Executed);
  }

  function test_GivenStateIsExpired(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenStateIsNotExecutable {
    // it revert
    _stateExpired("empty", _voter, _totalPower, _votesCast, _yeas);
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Expired);
  }

  modifier givenStateIsExecutable(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas,
    bytes32 _proposalName
  ) {
    _stateExecutable(_proposalName, _voter, _totalPower, _votesCast, _yeas);
    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Executable);
    _;
  }

  function test_GivenPayloadCallAsset(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenStateIsExecutable(_voter, _totalPower, _votesCast, _yeas, "call_asset") {
    // it revert

    vm.expectRevert(abi.encodeWithSelector(Errors.Apella__CannotCallAsset.selector));
    apella.execute(proposalId);
  }

  modifier givenPayloadDontCallAsset() {
    _;
  }

  function test_GivenAPayloadCallFails(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  )
    external
    givenStateIsExecutable(_voter, _totalPower, _votesCast, _yeas, "revert")
    givenPayloadDontCallAsset
  {
    // it revert

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Apella__CallFailed.selector,
        address(CallRevertingPayload(address(proposal.payload)).TARGET())
      )
    );
    apella.execute(proposalId);
  }

  function test_GivenAllPayloadCallSucceeds(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  )
    external
    givenStateIsExecutable(_voter, _totalPower, _votesCast, _yeas, "upgrade")
    givenPayloadDontCallAsset
  {
    // it updates state to Executed
    // it executes the calls
    // it emits {ProposalExecuted} event
    // it return true

    vm.expectEmit(true, true, true, true, address(apella));
    emit IApella.ProposalExecuted(proposalId);
    assertTrue(apella.execute(proposalId));

    proposal = apella.getProposal(proposalId);

    assertEq(apella.getProposalState(proposalId), DataStructures.ProposalState.Executed);
    assertEq(proposal.state, DataStructures.ProposalState.Executed);
    address rollup = registry.getRollup();
    assertEq(rollup, UpgradePayload(address(proposal.payload)).NEW_ROLLUP());
  }
}
