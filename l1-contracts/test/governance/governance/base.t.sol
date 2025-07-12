// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Proposal, ProposalState} from "@aztec/governance/interfaces/IGovernance.sol";
import {IMintableERC20} from "@aztec/shared/interfaces/IMintableERC20.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {DEPOSIT_GRANULARITY_SECONDS} from "@aztec/governance/libraries/UserLib.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {
  ProposalLib,
  VoteTabulationReturn,
  VoteTabulationInfo
} from "@aztec/governance/libraries/ProposalLib.sol";

import {
  CallAssetPayload, UpgradePayload, CallRevertingPayload, EmptyPayload
} from "./TestPayloads.sol";

contract GovernanceBase is TestBase {
  using ProposalLib for Proposal;

  IMintableERC20 internal token;
  Registry internal registry;
  Governance internal governance;
  GovernanceProposer internal governanceProposer;

  mapping(bytes32 => Proposal) internal proposals;
  mapping(bytes32 => uint256) internal proposalIds;
  Proposal internal proposal;
  uint256 proposalId;

  function setUp() public virtual {
    token = IMintableERC20(address(new TestERC20("test", "TEST", address(this))));

    registry = new Registry(address(this), token);
    governanceProposer = new GovernanceProposer(registry, IGSE(address(0x03)), 677, 1000);

    governance = new Governance(
      token, address(governanceProposer), address(this), TestConstants.getGovernanceConfiguration()
    );

    vm.prank(address(governance));
    governance.openFloodgates();

    registry.transferOwnership(address(governance));

    {
      CallAssetPayload payload = new CallAssetPayload(token, address(governance));
      vm.prank(address(governanceProposer));
      governance.propose(payload);

      proposalIds["call_asset"] = governance.proposalCount() - 1;
      proposals["call_asset"] = governance.getProposal(proposalIds["call_asset"]);
    }

    {
      UpgradePayload payload = new UpgradePayload(registry);
      vm.prank(address(governanceProposer));
      governance.propose(payload);

      proposalIds["upgrade"] = governance.proposalCount() - 1;
      proposals["upgrade"] = governance.getProposal(proposalIds["upgrade"]);
    }

    {
      CallRevertingPayload payload = new CallRevertingPayload();
      vm.prank(address(governanceProposer));
      governance.propose(payload);

      proposalIds["revert"] = governance.proposalCount() - 1;
      proposals["revert"] = governance.getProposal(proposalIds["revert"]);
    }

    {
      EmptyPayload payload = new EmptyPayload();
      vm.prank(address(governanceProposer));
      governance.propose(payload);

      proposalIds["empty"] = governance.proposalCount() - 1;
      proposals["empty"] = governance.getProposal(proposalIds["empty"]);
    }
  }

  function _statePending(bytes32 _proposalName) internal {
    proposal = proposals[_proposalName];
    proposalId = proposalIds[_proposalName];
  }

  function _stateActive(bytes32 _proposalName) internal {
    proposal = proposals[_proposalName];
    proposalId = proposalIds[_proposalName];

    // @note We jump to the point where it becomes active
    vm.warp(Timestamp.unwrap(proposal.pendingThrough()) + DEPOSIT_GRANULARITY_SECONDS);

    assertTrue(governance.getProposalState(proposalId) == ProposalState.Active);
  }

  function _stateDropped(bytes32 _proposalName, address _proposer) internal {
    proposal = proposals[_proposalName];
    proposalId = proposalIds[_proposalName];

    vm.assume(_proposer != proposal.proposer);

    vm.prank(address(governance));
    governance.updateGovernanceProposer(_proposer);
  }

  function _stateRejected(bytes32 _proposalName) internal {
    // We just take a really simple case here. As the cases area covered separately in `voteTabulation.t.sol`
    // We simple throw no votes at all.
    proposal = proposals[_proposalName];
    proposalId = proposalIds[_proposalName];

    vm.warp(Timestamp.unwrap(proposal.activeThrough()) + 1);

    assertTrue(governance.getProposalState(proposalId) == ProposalState.Rejected);
  }

  function _stateQueued(
    bytes32 _proposalName,
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) internal {
    vm.assume(_voter != address(0));
    proposal = proposals[_proposalName];
    proposalId = proposalIds[_proposalName];

    uint256 totalPower = bound(_totalPower, proposal.config.minimumVotes, type(uint128).max);
    uint256 votesNeeded = Math.mulDiv(totalPower, proposal.config.quorum, 1e18, Math.Rounding.Ceil);
    uint256 votesCast = bound(_votesCast, votesNeeded, totalPower);

    uint256 yeaLimitFraction = Math.ceilDiv(1e18 + proposal.config.voteDifferential, 2);
    uint256 yeaLimit = Math.mulDiv(votesCast, yeaLimitFraction, 1e18, Math.Rounding.Ceil);

    uint256 yeas = yeaLimit == votesCast ? votesCast : bound(_yeas, yeaLimit + 1, votesCast);

    token.mint(_voter, totalPower);
    vm.startPrank(_voter);
    token.approve(address(governance), totalPower);
    governance.deposit(_voter, totalPower);
    vm.stopPrank();

    _stateActive(_proposalName);

    vm.startPrank(_voter);
    governance.vote(proposalId, yeas, true);
    governance.vote(proposalId, votesCast - yeas, false);
    vm.stopPrank();

    vm.warp(Timestamp.unwrap(proposal.activeThrough()) + 1);

    assertEq(governance.getProposalState(proposalId), ProposalState.Queued, "invalid state");
  }

  function _stateExecutable(
    bytes32 _proposalName,
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) internal {
    proposal = proposals[_proposalName];
    proposalId = proposalIds[_proposalName];

    _stateQueued(_proposalName, _voter, _totalPower, _votesCast, _yeas);

    vm.warp(Timestamp.unwrap(proposal.queuedThrough()) + 1);

    assertEq(governance.getProposalState(proposalId), ProposalState.Executable, "invalid state");
  }

  function _stateExpired(
    bytes32 _proposalName,
    address _voter,
    uint256 _totalPower,
    uint256 _votesCast,
    uint256 _yeas
  ) internal {
    proposal = proposals[_proposalName];
    proposalId = proposalIds[_proposalName];

    _stateExecutable(_proposalName, _voter, _totalPower, _votesCast, _yeas);

    vm.warp(Timestamp.unwrap(proposal.executableThrough()) + 1);

    assertEq(governance.getProposalState(proposalId), ProposalState.Expired, "invalid state");
  }

  function assertEq(VoteTabulationReturn a, VoteTabulationReturn b) internal {
    if (a != b) {
      emit log("Error: a == b not satisfied [VoteTabulationReturn]");
      emit log_named_uint("      Left", uint256(a));
      emit log_named_uint("     Right", uint256(b));
      fail();
    }
  }

  function assertEq(VoteTabulationReturn a, VoteTabulationReturn b, string memory err) internal {
    if (a != b) {
      emit log_named_string("Error", err);
      assertEq(a, b);
    }
  }

  function assertEq(VoteTabulationInfo a, VoteTabulationInfo b) internal {
    if (a != b) {
      emit log("Error: a == b not satisfied [VoteTabulationInfo]");
      emit log_named_uint("      Left", uint256(a));
      emit log_named_uint("     Right", uint256(b));
      fail();
    }
  }

  function assertEq(VoteTabulationInfo a, VoteTabulationInfo b, string memory err) internal {
    if (a != b) {
      emit log_named_string("Error", err);
      assertEq(a, b);
    }
  }

  function assertEq(ProposalState a, ProposalState b) internal {
    if (a != b) {
      emit log("Error: a == b not satisfied [ProposalState]");
      emit log_named_uint("      Left", uint256(a));
      emit log_named_uint("     Right", uint256(b));
      fail();
    }
  }

  function assertEq(ProposalState a, ProposalState b, string memory err) internal {
    if (a != b) {
      emit log_named_string("Error", err);
      assertEq(a, b);
    }
  }
}
