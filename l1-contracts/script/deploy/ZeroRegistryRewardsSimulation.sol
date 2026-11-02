// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {ISequencerRewardCalculator} from "@aztec/core/interfaces/ISequencerRewardCalculator.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

import {Governance} from "@aztec/governance/Governance.sol";
import {GSEPayload} from "@aztec/governance/GSEPayload.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {Proposal, ProposalState} from "@aztec/governance/interfaces/IGovernance.sol";
import {GovernanceProposer} from "@aztec/governance/proposer/GovernanceProposer.sol";

import {RegistryReductionCalculator} from "@aztec/periphery/RegistryReductionCalculator.sol";
import {ZeroRegistryRewardsPayload} from "@aztec/periphery/ZeroRegistryRewardsPayload.sol";

/**
 * @title ZeroRegistryRewardsSimulation
 * @author Aztec Labs
 * @notice Executes a {ZeroRegistryRewardsPayload} through the governance lifecycle against a state snapshot, asserts
 *         the resulting state, and reverts the snapshot so nothing persists.
 *
 * @dev Requires forked state (a real registry, GSE and governance with stake behind the canonical rollup), so it runs
 *      under `--fork-url` or against a live RPC in simulation mode:
 *        forge script script/deploy/ZeroRegistryRewardsSimulation.sol --sig 'simulate(address)' <payload> \
 *          --rpc-url $L1_RPC_URL
 *
 *      It proves the payload's actions execute and leave the expected state. It does not predict whether the
 *      proposal would pass: a simulation-only voter is given a majority of the voting power so execution is reached
 *      regardless of how power is distributed.
 */
contract ZeroRegistryRewardsSimulation is Test {
  error ZeroRegistryRewardsSimulation__SnapshotRevertFailed(uint256 snapshotId);

  /// @dev Passed as the default reward when calling the installed calculator, to check what it returns.
  uint256 internal constant PROBE_DEFAULT_REWARD = 1e18;

  /// @notice Runs the whole lifecycle and reverts the snapshot afterwards.
  /// @param _payload The deployed {ZeroRegistryRewardsPayload} to execute
  function simulate(address _payload) public {
    ZeroRegistryRewardsPayload payload = ZeroRegistryRewardsPayload(_payload);
    Governance governance = Governance(Ownable(address(payload.ROLLUP())).owner());

    uint256 snapshotId = vm.snapshotState();

    _executeThroughGovernance(payload, governance);
    _assertPostState(payload, address(governance));

    if (!vm.revertToState(snapshotId)) {
      revert ZeroRegistryRewardsSimulation__SnapshotRevertFailed(snapshotId);
    }
    console.log(unicode"[simulate] payload executes and leaves the expected state ✓");
  }

  /// @dev Mirrors what GovernanceProposer does: the payload is wrapped in a GSEPayload before being proposed, so the
  ///      simulation exercises the same shape governance will see.
  function _executeThroughGovernance(ZeroRegistryRewardsPayload _payload, Governance _governance) internal {
    GovernanceProposer proposer = GovernanceProposer(_governance.governanceProposer());
    IGSE gse = _payload.ROLLUP().getGSE();
    GSEPayload wrapped = new GSEPayload(IPayload(address(_payload)), gse, proposer.REGISTRY());

    // A simulation-only voter holding twice the total power guarantees the proposal reaches execution however
    // real power is distributed. Everything here is inside the snapshot.
    address simVoter = address(uint160(uint256(keccak256("ZeroRegistryRewardsSimulation.simVoter"))));
    uint256 simPower = _governance.totalPowerAt(Timestamp.wrap(block.timestamp - 1)) * 2;
    IERC20 govAsset = _governance.ASSET();
    deal(address(govAsset), simVoter, simPower);

    vm.startPrank(simVoter);
    govAsset.approve(address(_governance), simPower);
    _governance.deposit(simVoter, simPower);
    vm.stopPrank();

    vm.prank(address(proposer));
    uint256 proposalId = _governance.propose(IPayload(address(wrapped)));

    Proposal memory proposal = _governance.getProposal(proposalId);
    Timestamp pendingThrough =
      Timestamp.wrap(Timestamp.unwrap(proposal.creation) + Timestamp.unwrap(proposal.config.votingDelay));
    Timestamp queuedThrough = Timestamp.wrap(
      Timestamp.unwrap(pendingThrough) + Timestamp.unwrap(proposal.config.votingDuration)
        + Timestamp.unwrap(proposal.config.executionDelay)
    );

    vm.warp(Timestamp.unwrap(pendingThrough) + 1);
    assertEq(uint256(_governance.getProposalState(proposalId)), uint256(ProposalState.Active), "proposal not active");

    vm.prank(simVoter);
    _governance.vote(proposalId, simPower, true);

    vm.warp(Timestamp.unwrap(queuedThrough) + 1);
    assertEq(
      uint256(_governance.getProposalState(proposalId)), uint256(ProposalState.Executable), "proposal not executable"
    );

    _governance.execute(proposalId);
    assertEq(
      uint256(_governance.getProposalState(proposalId)), uint256(ProposalState.Executed), "proposal not executed"
    );
  }

  function _assertPostState(ZeroRegistryRewardsPayload _payload, address _governance) internal view {
    IInstance rollup = _payload.ROLLUP();
    RegistryReductionCalculator calculator = _payload.CALCULATOR();

    assertEq(
      Rollup(address(rollup)).getSequencerRewardCalculator(), address(calculator), "calculator was not installed"
    );
    assertEq(calculator.owner(), _governance, "calculator owner is not governance");
    assertEq(address(calculator.GSE()), address(rollup.getGSE()), "calculator is bound to another GSE");

    uint256 count = _payload.registryCount();
    for (uint256 i = 0; i < count; i++) {
      (bool exists, uint96 reward) = calculator.getRegistryReward(_payload.registries(i));
      assertTrue(exists, "a listed registry has no entry");
      assertEq(reward, 0, "a listed registry has a nonzero entry");
    }

    // An address with no stake does not resolve to a registry, so it must receive the default.
    address[] memory proposers = new address[](1);
    proposers[0] = address(uint160(uint256(keccak256("ZeroRegistryRewardsSimulation.unstaked"))));
    uint256[] memory rewards = ISequencerRewardCalculator(address(calculator))
      .getSequencerRewards(Epoch.wrap(0), proposers, PROBE_DEFAULT_REWARD, PROBE_DEFAULT_REWARD);
    assertEq(rewards.length, 1, "calculator answered in the wrong shape");
    assertEq(rewards[0], PROBE_DEFAULT_REWARD, "an unstaked proposer did not receive the default");
  }
}
