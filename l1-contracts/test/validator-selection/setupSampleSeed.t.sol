// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {ValidatorSelectionTestBase, CheatDepositArgs} from "./ValidatorSelectionBase.sol";
import {Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";

contract SetupSampleSeedTest is ValidatorSelectionTestBase {
  function test_setupSampleSeed(uint16 _epochToTest) public setup(4) {
    // Check that the epoch is not set
    _epochToTest = uint16(bound(_epochToTest, 2, type(uint16).max));

    uint256 timejump =
      _epochToTest * TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION;
    uint256 originalSampleSeed =
      rollup.getSampleSeedAt(Timestamp.wrap(block.timestamp + timejump + 1));

    // Jump to just before the epoch we are testing
    vm.warp(
      block.timestamp
        + (_epochToTest - 1) * TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION
    );
    rollup.setupSeedSnapshotForNextEpoch();

    // The sample seed should have been updated
    uint256 newSampleSeed = rollup.getSampleSeedAt(Timestamp.wrap(block.timestamp + timejump));
    assertTrue(newSampleSeed != originalSampleSeed);
  }
}
