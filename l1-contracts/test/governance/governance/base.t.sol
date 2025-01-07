// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {Governance} from "@aztec/governance/Governance.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {IMintableERC20} from "@aztec/governance/interfaces/IMintableERC20.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {Math} from "@oz/utils/math/Math.sol";

import {
  ProposalLib,
  VoteTabulationReturn,
  VoteTabulationInfo
} from "@aztec/governance/libraries/ProposalLib.sol";

import {
  CallAssetPayload, UpgradePayload, CallRevertingPayload, EmptyPayload
} from "./TestPayloads.sol";

contract GovernanceBase is TestBase {
  using ProposalLib for DataStructures.Proposal;

  IMintableERC20 internal token;
  Registry internal registry;
  Governance internal governance;
  GovernanceProposer internal governanceProposer;

  mapping(bytes32 => DataStructures.Proposal) internal proposals;
  mapping(bytes32 => uint256) internal proposalIds;
  DataStructures.Proposal internal proposal;
  uint256 proposalId;

  function setUp() public virtual {
    token = IMintableERC20(address(new TestERC20("test", "TEST", address(this))));

    registry = new Registry(address(this));
    governanceProposer = new GovernanceProposer(registry, 677, 1000);

    governance = new Governance(token, address(governanceProposer));
    registry.transferOwnership(address(governance));

    {
      CallAssetPayload payload = new CallAssetPayload(token, address(governance));
      vm.prank(address(governanceProposer));
      assertTrue(governance.propose(payload));

      proposalIds["call_asset"] = governance.proposalCount() - 1;
      proposals["call_asset"] = governance.getProposal(proposalIds["call_asset"]);
    }

    {
      UpgradePayload payload = new UpgradePayload(registry);
      vm.prank(address(governanceProposer));
      assertTrue(governance.propose(payload));

      proposalIds["upgrade"] = governance.proposalCount() - 1;
      proposals["upgrade"] = governance.getProposal(proposalIds["upgrade"]);
    }

    {
      CallRevertingPayload payload = new CallRevertingPayload();
      vm.prank(address(governanceProposer));
      assertTrue(governance.propose(payload));

      proposalIds["revert"] = governance.proposalCount() - 1;
      proposals["revert"] = governance.getProposal(proposalIds["revert"]);
    }

    {
      EmptyPayload payload = new EmptyPayload();
      vm.prank(address(governanceProposer));
      assertTrue(governance.propose(payload));

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
    vm.warp(Timestamp.unwrap(proposal.pendingThrough()) + 1);

    assertTrue(governance.getProposalState(proposalId) == DataStructures.ProposalState.Active);
  }

  function _stateDropped(bytes32 _proposalName, address _governanceProposer) internal {
    proposal = proposals[_proposalName];
    proposalId = proposalIds[_proposalName];

    vm.assume(_governanceProposer != proposal.governanceProposer);

    vm.prank(address(governance));
    governance.updateGovernanceProposer(_governanceProposer);
  }

  function _stateRejected(bytes32 _proposalName) internal {
    // We just take a really simple case here. As the cases area covered separately in `voteTabulation.t.sol`
    // We simple throw no votes at all.
    proposal = proposals[_proposalName];
    proposalId = proposalIds[_proposalName];

    vm.warp(Timestamp.unwrap(proposal.activeThrough()) + 1);

    assertTrue(governance.getProposalState(proposalId) == DataStructures.ProposalState.Rejected);
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

    assertEq(
      governance.getProposalState(proposalId), DataStructures.ProposalState.Queued, "invalid state"
    );
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

    assertEq(
      governance.getProposalState(proposalId),
      DataStructures.ProposalState.Executable,
      "invalid state"
    );
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

    assertEq(
      governance.getProposalState(proposalId), DataStructures.ProposalState.Expired, "invalid state"
    );
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

  function assertEq(DataStructures.ProposalState a, DataStructures.ProposalState b) internal {
    if (a != b) {
      emit log("Error: a == b not satisfied [DataStructures.ProposalState]");
      emit log_named_uint("      Left", uint256(a));
      emit log_named_uint("     Right", uint256(b));
      fail();
    }
  }

  function assertEq(
    DataStructures.ProposalState a,
    DataStructures.ProposalState b,
    string memory err
  ) internal {
    if (a != b) {
      emit log_named_string("Error", err);
      assertEq(a, b);
    }
  }
}
