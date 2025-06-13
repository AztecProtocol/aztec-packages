// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceBase} from "./base.t.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Proposal, ProposalState, IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";
import {
  ProposalLib,
  VoteTabulationReturn,
  VoteTabulationInfo
} from "@aztec/governance/libraries/ProposalLib.sol";

import {CallAssetPayload, UpgradePayload, CallRevertingPayload} from "./TestPayloads.sol";

contract ExecuteTest is GovernanceBase {
  using ProposalLib for Proposal;

  uint256 internal depositPower;

  modifier givenStateIsNotExecutable() {
    _;
    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__ProposalNotExecutable.selector));
    governance.execute(proposalId);
  }

  function test_GivenStateIsPending() external givenStateIsNotExecutable {
    // it revert
    _statePending("empty");
    assertEq(governance.getProposalState(proposalId), ProposalState.Pending);
  }

  function test_GivenStateIsActive() external givenStateIsNotExecutable {
    // it revert
    _stateActive("empty");
    assertEq(governance.getProposalState(proposalId), ProposalState.Active);
  }

  function test_GivenStateIsQueued(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenStateIsNotExecutable {
    // it revert
    _stateQueued("empty", _voter, _totalPower, _votesCast, _yeas);
    assertEq(governance.getProposalState(proposalId), ProposalState.Queued);
  }

  function test_GivenStateIsRejected() external givenStateIsNotExecutable {
    // it revert
    _stateRejected("empty");
    assertEq(governance.getProposalState(proposalId), ProposalState.Rejected);
  }

  function test_GivenStateIsDropped(address _governanceProposer) external givenStateIsNotExecutable {
    // it revert
    _stateDropped("empty", _governanceProposer);
    assertEq(governance.getProposalState(proposalId), ProposalState.Dropped);
  }

  function test_GivenStateIsExecuted(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenStateIsNotExecutable {
    // it revert
    _stateExecutable("empty", _voter, _totalPower, _votesCast, _yeas);
    assertTrue(governance.execute(proposalId));
    assertEq(governance.getProposalState(proposalId), ProposalState.Executed);
  }

  function test_GivenStateIsExpired(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenStateIsNotExecutable {
    // it revert
    _stateExpired("empty", _voter, _totalPower, _votesCast, _yeas);
    assertEq(governance.getProposalState(proposalId), ProposalState.Expired);
  }

  modifier givenStateIsExecutable(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas,
    bytes32 _proposalName
  ) {
    _stateExecutable(_proposalName, _voter, _totalPower, _votesCast, _yeas);
    assertEq(governance.getProposalState(proposalId), ProposalState.Executable);
    _;
  }

  function test_GivenPayloadCallAsset(
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) external givenStateIsExecutable(_voter, _totalPower, _votesCast, _yeas, "call_asset") {
    // it revert

    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__CannotCallAsset.selector));
    governance.execute(proposalId);
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
        Errors.Governance__CallFailed.selector,
        address(CallRevertingPayload(address(proposal.payload)).TARGET())
      )
    );
    governance.execute(proposalId);
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

    vm.expectEmit(true, true, true, true, address(governance));
    emit IGovernance.ProposalExecuted(proposalId);
    assertTrue(governance.execute(proposalId));

    proposal = governance.getProposal(proposalId);

    assertEq(governance.getProposalState(proposalId), ProposalState.Executed);
    assertEq(proposal.state, ProposalState.Executed);
    address rollup = address(registry.getCanonicalRollup());
    assertEq(rollup, UpgradePayload(address(proposal.payload)).NEW_ROLLUP());
  }
}
