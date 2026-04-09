// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {SlashingProposerEscapeHatchTest} from "./SlashingProposerEscapeHatch.t.sol";
import {SlashingProposer} from "@aztec/core/slashing/SlashingProposer.sol";
import {SlashRound} from "@aztec/core/libraries/SlashRoundLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";

/**
 * @title SlashingProposerRetroactiveTest
 * @notice Tests that retroactively configuring an escape hatch should NOT grant slashing
 *         immunity for epochs that were normal at the time.
 *
 * @dev Inherits from SlashingProposerEscapeHatchTest to reuse all setup and helpers.
 *      setUp deploys the escape hatch and registers it. The test immediately removes it,
 *      then re-registers it later to simulate retroactive configuration.
 *
 *      CURRENTLY FAILS because _getEscapeHatchEpochFlags queries the CURRENT escape hatch
 *      (which retroactively reports historical epochs as open), granting unearned immunity.
 *
 *      After epoch-stable snapshotting, getEscapeHatchForEpoch returns address(0) for
 *      historical epochs where no escape hatch was configured, so no immunity is granted.
 */
contract SlashingProposerRetroactiveTest is SlashingProposerEscapeHatchTest {
  using stdStorage for StdStorage;

  /**
   * @notice Validators should remain slashable when escape hatch is configured after the fact
   *
   * @dev Scenario:
   *      1. Escape hatch is removed (simulating "no escape hatch during target epochs")
   *      2. Votes are cast to slash all validators
   *      3. Governance re-configures the escape hatch that covers the target epochs
   *      4. Tally is computed
   *
   *      DESIRED: All 8 validators slashable (2 epochs x 4 committee members).
   *      No immunity because no escape hatch was active during those epochs.
   */
  function test_retroactiveEscapeHatchDoesNotGrantSlashingImmunity() public {
    // Remove escape hatch so the rollup has none during target epochs.
    // The escapeHatch contract itself is preserved for re-use below.
    address rollupOwner = rollup.owner();
    vm.prank(rollupOwner);
    rollup.updateEscapeHatch(address(0));

    // Step 1: Find a round where at least one target epoch falls in the escape hatch
    //         active window (epoch % ESCAPE_FREQUENCY < ESCAPE_ACTIVE_DURATION)
    //         so that retroactive deployment would grant immunity
    uint256 targetRound = SLASH_OFFSET_IN_ROUNDS;
    bool foundProtectedEpoch = false;

    while (!foundProtectedEpoch) {
      for (uint256 i; i < ROUND_SIZE_IN_EPOCHS; i++) {
        Epoch epoch = slashingProposer.getSlashTargetEpoch(SlashRound.wrap(targetRound), i);
        if (Epoch.unwrap(epoch) % ESCAPE_FREQUENCY < ESCAPE_ACTIVE_DURATION) {
          foundProtectedEpoch = true;
          break;
        }
      }
      if (!foundProtectedEpoch) {
        ++targetRound;
      }
    }

    _jumpToSlashRound(targetRound);
    SlashRound currentRound = slashingProposer.getCurrentRound();

    // Step 2: Cast votes to slash all validators (no escape hatch active)
    uint8 slashIndex = 3;
    bytes memory voteData = _createUniformVoteData(slashIndex);
    _castVotes(QUORUM, voteData);

    // Step 3: Re-configure the escape hatch AFTER the target epochs
    vm.prank(rollupOwner);
    rollup.updateEscapeHatch(address(escapeHatch));

    // Set designated proposers for hatches covering target epochs
    for (uint256 i; i < ROUND_SIZE_IN_EPOCHS; i++) {
      Epoch epoch = slashingProposer.getSlashTargetEpoch(currentRound, i);
      if (Epoch.unwrap(epoch) % ESCAPE_FREQUENCY < ESCAPE_ACTIVE_DURATION) {
        uint256 hatchNumber = Epoch.unwrap(epoch) / ESCAPE_FREQUENCY;
        stdstore.target(address(escapeHatch)).sig("getDesignatedProposer(uint256)").with_key(hatchNumber)
          .checked_write(address(0xBEEF));
      }
    }

    // Step 4: Get tally results
    address[][] memory committees = slashingProposer.getSlashTargetCommittees(currentRound);
    SlashingProposer.SlashAction[] memory actions = slashingProposer.getTally(currentRound, committees);

    // DESIRED: All validators should be slashable (no escape hatch was active during target epochs)
    // CURRENT: Some validators have retroactive immunity - actions.length < expected
    uint256 totalValidators = ROUND_SIZE_IN_EPOCHS * COMMITTEE_SIZE;
    assertEq(
      actions.length,
      totalValidators,
      "All validators should be slashable - no escape hatch was active during target epochs"
    );
  }
}
