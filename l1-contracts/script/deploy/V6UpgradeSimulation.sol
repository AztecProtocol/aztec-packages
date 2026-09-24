// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable comprehensive-interface
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";

import {IERC20} from "@oz/token/ERC20/IERC20.sol";

import {IInstance} from "@aztec/core/interfaces/IInstance.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

import {Governance} from "@aztec/governance/Governance.sol";
import {GSEPayload} from "@aztec/governance/GSEPayload.sol";
import {IGSE} from "@aztec/governance/GSE.sol";
import {IPayload} from "@aztec/governance/interfaces/IPayload.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {Proposal, ProposalState} from "@aztec/governance/interfaces/IGovernance.sol";

import {FlushRewarder} from "@aztec/periphery/FlushRewarder.sol";
import {V6UpgradePayload} from "@aztec/periphery/V6UpgradePayload.sol";

/**
 * @title V6UpgradeSimulation
 * @author Aztec Labs
 * @notice Executes {V6UpgradePayload} through the real governance lifecycle against a state
 *         snapshot, asserts the resulting state, and reverts the snapshot so nothing persists.
 *
 * @dev Kept out of DeployRollupForUpgradeV6 on purpose: that file is a configuration table meant
 *      to be reviewed line by line, and this is cheatcode machinery. The deploy script calls
 *      {simulate} in one line after it has stopped broadcasting.
 *
 *      Requires forked state (a real registry, GSE and governance), so it runs under `--fork-url`
 *      or against a live RPC in simulation mode, not against a bare anvil.
 *
 *      What this does and does not prove: it proves the payload's actions execute correctly and
 *      leave the chain in the expected state. It does NOT predict whether the proposal would
 *      pass -- a simulation-only voter is given a majority of the voting power so execution is
 *      reached regardless of how power is really distributed.
 */
contract V6UpgradeSimulation is Test {
  error V6UpgradeSimulation__SnapshotRevertFailed(uint256 snapshotId);

  /// @notice Chain state read before execution, so the assertions afterwards compare against what
  ///         was actually there rather than against hardcoded amounts.
  struct Snapshot {
    address canonicalRollup;
    uint256 versions;
    uint256 bonusAttesters;
    uint256 rewardDistributorBalance;
    uint256 rewardDistributorAvailableToNew;
    uint256 flushFundsToMove;
    uint256 oldFlushBalance;
    uint256 newFlushBalance;
  }

  /// @notice Runs the whole lifecycle and reverts the snapshot afterwards.
  /// @dev Also the entry point for `forge script ... --sig 'simulate(address)' <payload>`.
  /// @param _payload The deployed {V6UpgradePayload} to execute
  function simulate(address _payload) public {
    V6UpgradePayload payload = V6UpgradePayload(_payload);
    IRegistry registry = payload.REGISTRY();
    Governance governance = Governance(registry.getGovernance());
    IGSE gse = IGSE(address(payload.ROLLUP().getGSE()));

    Snapshot memory before = _capture(payload, registry, gse);

    uint256 snapshotId = vm.snapshotState();

    _executeThroughGovernance(payload, governance, gse, before.canonicalRollup);
    _assertPostState(payload, registry, gse, before);

    if (!vm.revertToState(snapshotId)) {
      revert V6UpgradeSimulation__SnapshotRevertFailed(snapshotId);
    }
    console.log(unicode"[simulate] payload executes and leaves the expected state ✓");
  }

  function _capture(V6UpgradePayload _payload, IRegistry _registry, IGSE _gse)
    internal
    view
    returns (Snapshot memory s)
  {
    s.canonicalRollup = address(_registry.getCanonicalRollup());
    s.versions = _registry.numberOfVersions();
    s.bonusAttesters = _gse.getAttesterCountAtTime(_gse.getBonusInstanceAddress(), Timestamp.wrap(block.timestamp));

    IRewardDistributor distributor = _registry.getRewardDistributor();
    IERC20 rewardAsset = IERC20(Rollup(address(_payload.ROLLUP())).getFeeAsset());
    s.rewardDistributorBalance = rewardAsset.balanceOf(address(distributor));
    s.rewardDistributorAvailableToNew = distributor.availableTo(address(_payload.ROLLUP()));

    FlushRewarder oldFlush = _payload.OLD_FLUSH_REWARDER();
    if (address(oldFlush) != address(0)) {
      IERC20 flushAsset = oldFlush.REWARD_ASSET();
      s.flushFundsToMove = oldFlush.rewardsAvailable();
      s.oldFlushBalance = flushAsset.balanceOf(address(oldFlush));
      s.newFlushBalance = flushAsset.balanceOf(address(_payload.NEW_FLUSH_REWARDER()));
    }
  }

  /// @dev Mirrors what GovernanceProposer does: the payload is wrapped in a GSEPayload before
  ///      being proposed, so the simulation exercises the same shape governance will see.
  function _executeThroughGovernance(
    V6UpgradePayload _payload,
    Governance _governance,
    IGSE _gse,
    address _oldCanonical
  ) internal {
    GSEPayload wrapped = new GSEPayload(IPayload(address(_payload)), _gse, _payload.REGISTRY());

    // A simulation-only voter holding twice the total power guarantees the proposal reaches
    // execution however real power is distributed. Everything here is inside the snapshot.
    address simVoter = address(uint160(uint256(keccak256("V6UpgradeSimulation.simVoter"))));
    uint256 simPower = _governance.totalPowerAt(Timestamp.wrap(block.timestamp - 1)) * 2;
    IERC20 govAsset = _governance.ASSET();
    deal(address(govAsset), simVoter, simPower);

    vm.startPrank(simVoter);
    govAsset.approve(address(_governance), simPower);
    _governance.deposit(simVoter, simPower);
    vm.stopPrank();

    vm.prank(_governance.governanceProposer());
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

    // The outgoing rollup votes with whatever power it and the bonus instance hold, so the
    // simulation exercises the real voting path and not only the synthetic voter.
    uint256 rollupPower = _gse.getVotingPowerAt(_oldCanonical, pendingThrough);
    if (rollupPower > 0) {
      vm.prank(_oldCanonical);
      _gse.vote(proposalId, rollupPower, true);
    }
    uint256 bonusPower = _gse.getVotingPowerAt(_gse.getBonusInstanceAddress(), pendingThrough);
    if (bonusPower > 0) {
      vm.prank(_oldCanonical);
      _gse.voteWithBonus(proposalId, bonusPower, true);
    }
    vm.prank(simVoter);
    _governance.vote(proposalId, simPower, true);

    vm.warp(Timestamp.unwrap(queuedThrough) + 1);

    // Where execution is restricted to office hours, step to the next open slot. The proposal
    // survives the wait because the longest gap (Friday 17:00 to Monday 08:00, ~63h) is well
    // inside the grace period, but assert it rather than assume.
    if (_payload.ENFORCE_EXECUTION_WINDOW()) {
      for (uint256 i = 0; i < 7 days / 1 hours && !_payload.isWithinExecutionWindow(block.timestamp); i++) {
        vm.warp(block.timestamp + 1 hours);
      }
      assertTrue(_payload.isWithinExecutionWindow(block.timestamp), "no execution window found within a week");
    }

    assertEq(
      uint256(_governance.getProposalState(proposalId)), uint256(ProposalState.Executable), "proposal not executable"
    );

    _governance.execute(proposalId);
    assertEq(
      uint256(_governance.getProposalState(proposalId)), uint256(ProposalState.Executed), "proposal not executed"
    );
  }

  function _assertPostState(V6UpgradePayload _payload, IRegistry _registry, IGSE _gse, Snapshot memory _before)
    internal
    view
  {
    address newRollup = address(_payload.ROLLUP());

    assertEq(address(_registry.getCanonicalRollup()), newRollup, "new rollup is not canonical");
    assertEq(_registry.numberOfVersions(), _before.versions + 1, "version count did not grow by one");

    // The bonus-instance attesters follow the canonical rollup by delegation rather than by
    // re-depositing, so the new rollup should see at least everything the bonus bucket held.
    assertGe(
      _gse.getAttesterCountAtTime(newRollup, Timestamp.wrap(block.timestamp)),
      _before.bonusAttesters,
      "new rollup did not inherit the bonus instance attesters"
    );

    // Ownership must survive the upgrade: governance owns the rollup, or none of the owner-gated
    // configuration (fee margin, fee recipient, queue config) can ever be changed again.
    assertEq(Rollup(newRollup).owner(), _registry.getGovernance(), "rollup owner is not governance");

    // The hatch is installed by the payload, not the deploy, so this is the only place the
    // installation is proved before the real execution.
    assertEq(address(Rollup(newRollup).getEscapeHatch()), _payload.ESCAPE_HATCH(), "escape hatch was not installed");

    _assertRewardDistributor(_payload, _registry, _before);
    _assertFlushRewarder(_payload, _before);
  }

  /// @dev The distributor resolves the canonical rollup live, so no action moves its funds: the
  ///      implicit pool simply becomes claimable by the new rollup. Asserted against the captured
  ///      balances rather than any fixed amount.
  function _assertRewardDistributor(V6UpgradePayload _payload, IRegistry _registry, Snapshot memory _before)
    internal
    view
  {
    address newRollup = address(_payload.ROLLUP());
    IRewardDistributor distributor = _registry.getRewardDistributor();
    IERC20 rewardAsset = IERC20(Rollup(newRollup).getFeeAsset());

    assertEq(distributor.canonicalRollup(), newRollup, "distributor does not follow the new rollup");
    assertEq(
      rewardAsset.balanceOf(address(distributor)),
      _before.rewardDistributorBalance,
      "distributor balance moved during the upgrade"
    );
    assertGe(
      distributor.availableTo(newRollup),
      _before.rewardDistributorAvailableToNew,
      "new rollup cannot claim what it could before"
    );
  }

  /// @dev The replacement rewarder should gain exactly what was movable, and the outgoing one
  ///      should keep the remainder it owes to unclaimed flushers.
  function _assertFlushRewarder(V6UpgradePayload _payload, Snapshot memory _before) internal view {
    FlushRewarder oldFlush = _payload.OLD_FLUSH_REWARDER();
    if (address(oldFlush) == address(0)) {
      return;
    }

    IERC20 flushAsset = oldFlush.REWARD_ASSET();
    assertEq(
      flushAsset.balanceOf(address(_payload.NEW_FLUSH_REWARDER())),
      _before.newFlushBalance + _before.flushFundsToMove,
      "new flush rewarder did not receive the migrated funds"
    );
    assertEq(
      flushAsset.balanceOf(address(oldFlush)),
      _before.oldFlushBalance - _before.flushFundsToMove,
      "old flush rewarder did not retain exactly its unclaimed remainder"
    );
  }
}
