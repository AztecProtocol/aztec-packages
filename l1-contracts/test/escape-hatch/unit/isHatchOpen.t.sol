// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {EscapeHatchBase, EscapeHatchConfig} from "../base.sol";
import {Hatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";

contract EscapeHatchIsHatchOpenTest is EscapeHatchBase {
  function test_WhenEpochIsNotWithinACTIVE_DURATIONOfHatchStart(EscapeHatchConfig memory _config, uint256 _epoch)
    external
    givenValidConfig(_config)
  {
    // it should return (false, address(0))

    // Test epoch at ACTIVE_DURATION offset (first epoch outside active period of hatch 0)
    Epoch outsideEpoch = Epoch.wrap(bound(_epoch, config.activeDuration, config.frequency));

    (bool isOpen, address proposer) = escapeHatch.isHatchOpen(outsideEpoch);

    assertFalse(isOpen, "Hatch should not be open");
    assertEq(proposer, address(0), "Proposer should be zero address");
  }

  Epoch internal epoch;

  modifier whenEpochIsWithinACTIVE_DURATIONOfHatchStart(uint256 _epoch) {
    // This modifier is a marker for tree structure clarity.
    // Actual epoch selection is done in each test.

    epoch = Epoch.wrap(bound(_epoch, 0, config.activeDuration - 1));

    _;
  }

  function test_GivenNoProposerDesignated(EscapeHatchConfig memory _config, uint256 _epoch)
    external
    givenValidConfig(_config)
    whenEpochIsWithinACTIVE_DURATIONOfHatchStart(_epoch)
  {
    // it should return (false, address(0))

    (bool isOpen, address proposer) = escapeHatch.isHatchOpen(epoch);

    assertFalse(isOpen, "Hatch should not be open without proposer");
    assertEq(proposer, address(0), "Proposer should be zero address");
  }

  function test_GivenProposerIsDesignated(
    EscapeHatchConfig memory _config,
    uint256 _epoch,
    uint256 _outsideEpoch,
    uint256 _futureTimeJump
  ) external givenValidConfig(_config) whenEpochIsWithinACTIVE_DURATIONOfHatchStart(_epoch) {
    // it should return (true, proposer) for epochs within fuzzed ACTIVE_DURATION
    //
    // Key property: Once a hatch is prepared, the designated proposer is IMMUTABLE
    // regardless of how much time passes (fuzzed via _futureTimeJump)

    _futureTimeJump = bound(_futureTimeJump, 0, 365 days * 10);

    _joinCandidateSetWithConfig(CANDIDATE1);

    _warpForwardEpochs(config.frequency);

    // Select candidates - prepares hatch LAG_IN_HATCHES ahead
    escapeHatch.selectCandidates();

    // Get the prepared hatch
    Epoch currentEpoch = _getCurrentEpoch();
    Hatch currentHatch = escapeHatch.getHatch(currentEpoch);
    Hatch preparedHatch = currentHatch + Hatch.wrap(config.lagInHatches);
    Epoch hatchStart = escapeHatch.getFirstEpoch(preparedHatch);

    // Record the designated proposer
    address designatedProposer = escapeHatch.getDesignatedProposer(preparedHatch);
    assertEq(designatedProposer, CANDIDATE1, "Proposer should be CANDIDATE1");

    // Test all epochs within ACTIVE_DURATION - should be open
    for (uint256 i = 0; i < config.activeDuration; i++) {
      Epoch testEpoch = Epoch.wrap(Epoch.unwrap(hatchStart) + i);
      (bool isOpenAtI, address proposerAtI) = escapeHatch.isHatchOpen(testEpoch);
      assertTrue(isOpenAtI, string.concat("Hatch should be open at offset ", vm.toString(i)));
      assertEq(proposerAtI, CANDIDATE1, string.concat("Proposer mismatch at offset ", vm.toString(i)));
    }

    // First epoch outside ACTIVE_DURATION - should NOT be open
    Epoch outsideEpoch =
      Epoch.wrap(Epoch.unwrap(hatchStart) + bound(_outsideEpoch, config.activeDuration, config.frequency));
    (bool isOpenOutside, address proposerOutside) = escapeHatch.isHatchOpen(outsideEpoch);
    assertFalse(isOpenOutside, "Hatch should not be open outside active duration");
    assertEq(proposerOutside, address(0), "Proposer should be zero outside active duration");

    // ============ FUZZED TIME JUMP ============
    // Jump arbitrarily far into the future - values must remain stable and independent of current time
    vm.warp(block.timestamp + _futureTimeJump);

    // Proposer is STILL the same - time passage doesn't affect prepared hatches
    address proposerAfterTimeJump = escapeHatch.getDesignatedProposer(preparedHatch);
    assertEq(proposerAfterTimeJump, designatedProposer, "proposer changed");

    (bool isOpenAfterJump, address proposerFromIsHatchOpen) = escapeHatch.isHatchOpen(hatchStart + epoch);
    assertTrue(isOpenAfterJump, "Hatch should still be open for its epochs");
    assertEq(proposerFromIsHatchOpen, designatedProposer, "Proposer from isHatchOpen must be immutable");
  }
}
