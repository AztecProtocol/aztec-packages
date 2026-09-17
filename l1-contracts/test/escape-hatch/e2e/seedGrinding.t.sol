// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchBase} from "../base.sol";
import {Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Rollup, RollupBuilder, Config} from "@test/builder/RollupBuilder.sol";
import {EscapeHatch} from "@aztec/core/EscapeHatch.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {Ownable} from "@oz/access/Ownable.sol";

/**
 * @title EscapeHatchSeedGrindingTest
 * @notice The candidate set must freeze before the entropy that selects from it is knowable.
 *
 * @dev `EscapeHatch` snapshots the candidate set at `getSetTimestamp(hatch)` and draws the
 *      designated proposer against entropy anchored at `getSeedTimestamp(hatch)`, one epoch later.
 *      If that entropy is readable while the set is still open, an attacker can read it, compute
 *      how many addresses to append so the draw lands on one of them, and join that many times --
 *      buying the hatch instead of winning it. The designated proposer is the sole permitted
 *      proposer for its window, so capturing it means being able to censor it.
 *
 *      The entropy must therefore be unreadable up to and including the freeze block, for every
 *      rollup configuration, and joins in the freeze block itself must not make the snapshot.
 */
contract EscapeHatchSeedGrindingTest is EscapeHatchBase {
  uint256 internal constant HONEST_CANDIDATES = 3;

  Hatch internal targetHatch = Hatch.wrap(3);

  /// @notice Nothing can be learned about the draw while the set is still open.
  function test_entropyIsNotReadableBeforeFreeze() public {
    vm.warp(escapeHatch.getSetTimestamp(targetHatch) - 1);
    vm.expectRevert();
    escapeHatch.getSeed(targetHatch);
  }

  /// @notice Not even in the freeze block, which joins can still land in.
  function test_entropyIsNotReadableAtFreeze() public {
    vm.warp(escapeHatch.getSetTimestamp(targetHatch));
    // Checkpointing is permissionless, so an attacker gets to try the freshest randao available.
    rollup.checkpointRandao();
    vm.expectRevert();
    escapeHatch.getSeed(targetHatch);
  }

  /// @notice The rollup's own randao lag must not leak into the hatch's entropy timing.
  /// @dev This is the property that broke: `getSampleSeedAt` re-applied `lagInEpochsForRandao` to
  ///      the timestamp it was handed, moving the entropy back into an epoch the set was open in.
  ///      Any lag creeping back in moves the revert boundary below, whatever the rollup is
  ///      configured with.
  function test_entropyTimingIsIndependentOfRollupRandaoLag() public {
    for (uint256 lag = 0; lag <= 3; lag++) {
      (Rollup freshRollup, EscapeHatch freshHatch) = _deployWithRandaoLag(lag);

      uint32 freezeTs = freshHatch.getSetTimestamp(targetHatch);
      uint32 seedTs = freshHatch.getSeedTimestamp(targetHatch);
      assertGt(seedTs, freezeTs, "seed timestamp must postdate the freeze");

      vm.warp(seedTs - 1);
      freshRollup.checkpointRandao();
      vm.expectRevert();
      freshHatch.getSeed(targetHatch);

      vm.warp(seedTs);
      freshRollup.checkpointRandao();
      freshHatch.getSeed(targetHatch);
    }
  }

  /// @notice The full grind, from the last block in which the attacker could act.
  function test_cannotGrindCandidateSetAgainstKnownSeed() public {
    _warpToSafeEpoch();
    for (uint256 i = 0; i < HONEST_CANDIDATES; i++) {
      _joinCandidateSet(makeAddr(string.concat("honest", vm.toString(i))));
    }

    uint32 freezeTs = escapeHatch.getSetTimestamp(targetHatch);

    // The attacker moves in the last block the set is open, and takes the cheapest shot going:
    // checkpoint the randao themselves, then read the draw they would be joining against.
    vm.warp(freezeTs);
    rollup.checkpointRandao();
    vm.expectRevert();
    escapeHatch.getSeed(targetHatch);

    // Joining blind is all that is left, and it does not reach the frozen set either.
    address blindJoiner = makeAddr("blindJoiner");
    _joinCandidateSet(blindJoiner);

    // Entropy is checkpointed in the seed epoch, once the set is already closed.
    vm.warp(escapeHatch.getSeedTimestamp(targetHatch));
    rollup.checkpointRandao();

    // Selection then runs, over the honest set only.
    _warpToEpoch(Epoch.unwrap(escapeHatch.getFirstEpoch(Hatch.wrap(2))));
    assertEq(
      escapeHatch.getCandidateCountForHatch(targetHatch),
      HONEST_CANDIDATES,
      "join in the freeze block reached the frozen set"
    );
    escapeHatch.selectCandidates();

    address designated = escapeHatch.getDesignatedProposer(targetHatch);
    assertNotEq(designated, blindJoiner, "freeze-block joiner was selected");
    assertNotEq(designated, address(0), "no proposer designated");
  }

  /// @notice The freeze boundary reads the same way for exits as it does for joins.
  /// @dev Snapshot lookups are inclusive of their key, so the snapshot is read one second before
  ///      the freeze. An exit in the freeze block is therefore too late to leave the frozen set,
  ///      which is what `initiateExit`'s strict comparison against the next freeze assumes.
  function test_exitInTheFreezeBlockStaysInTheFrozenSet() public {
    _warpToSafeEpoch();
    _joinCandidateSet(CANDIDATE1);
    _joinCandidateSet(CANDIDATE2);

    uint32 freezeTs = escapeHatch.getSetTimestamp(targetHatch);

    // A second before the freeze, the exit still reaches the snapshot.
    vm.warp(freezeTs - 1);
    vm.prank(CANDIDATE1);
    escapeHatch.initiateExit();

    // In the freeze block it does not.
    vm.warp(freezeTs);
    vm.prank(CANDIDATE2);
    escapeHatch.initiateExit();

    vm.warp(freezeTs + 1);
    assertEq(escapeHatch.getCandidateCountForHatch(targetHatch), 1, "freeze-block exit left the frozen set");
    assertEq(
      escapeHatch.getCandidateAtIndexForHatch(0, targetHatch), CANDIDATE2, "wrong candidate left in the frozen set"
    );
  }

  /// @notice Without a randao checkpointed after the freeze, the hatch stays shut.
  /// @dev The alternative -- drawing against the older checkpoint `upperLookup` falls back to --
  ///      would be drawing against entropy that predates the freeze, which is the original bug.
  function test_hatchStaysClosedWithoutCheckpointedRandaoForSeedEpoch() public {
    _warpToSafeEpoch();
    for (uint256 i = 0; i < HONEST_CANDIDATES; i++) {
      _joinCandidateSet(makeAddr(string.concat("honest", vm.toString(i))));
    }

    // Nobody checkpoints during the seed epoch, so no entropy postdating the freeze exists.
    _warpToEpoch(Epoch.unwrap(escapeHatch.getFirstEpoch(Hatch.wrap(2))));
    assertEq(escapeHatch.getCandidateCountForHatch(targetHatch), HONEST_CANDIDATES, "expected a non-empty frozen set");

    escapeHatch.selectCandidates();

    assertEq(escapeHatch.getDesignatedProposer(targetHatch), address(0), "hatch opened without fresh entropy");
  }

  function _deployWithRandaoLag(uint256 _lag) internal returns (Rollup, EscapeHatch) {
    RollupBuilder builder = new RollupBuilder(address(this)).setSlashingQuorum(1).setSlashingRoundSize(1)
      .setEpochDuration(4).setSlotDuration(12).setLagInEpochsForValidatorSet(3).setLagInEpochsForRandao(_lag);
    builder.deploy();

    Rollup freshRollup = builder.getConfig().rollup;
    EscapeHatch freshHatch = new EscapeHatch(
      address(freshRollup),
      address(bondToken),
      DEFAULT_BOND_SIZE,
      DEFAULT_WITHDRAWAL_TAX,
      DEFAULT_FAILED_HATCH_PUNISHMENT,
      DEFAULT_FREQUENCY,
      DEFAULT_ACTIVE_DURATION,
      DEFAULT_LAG_IN_HATCHES,
      DEFAULT_PROPOSING_EXIT_DELAY
    );

    vm.prank(Ownable(address(freshRollup)).owner());
    freshRollup.setEscapeHatch(address(freshHatch));

    return (freshRollup, freshHatch);
  }
}
