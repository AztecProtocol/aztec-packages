// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {ValidatorSelectionTestBase, CheatDepositArgs} from "./ValidatorSelectionBase.sol";
import {Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";

contract SetupSampleSeedTest is ValidatorSelectionTestBase {
  function test_setupSampleSeed(uint16 _epochToTest) public setup(4, 4) {
    // Bound to a reasonable range
    _epochToTest = uint16(bound(_epochToTest, 2, 1000));

    uint256 epochDuration = TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION;
    uint256 lagInEpochs = rollup.getLagInEpochs();

    // Jump to epoch _epochToTest - this gives us enough time for the lag
    vm.warp(block.timestamp + _epochToTest * epochDuration);

    // Get sample seed for current epoch
    uint256 originalSampleSeed = rollup.getSampleSeedAt(Timestamp.wrap(block.timestamp));

    // Update randao and checkpoint it
    uint256 newRandao = uint256(keccak256(abi.encode("new randao")));
    vm.prevrandao(newRandao);
    rollup.checkpointRandao();

    // Jump to the next epoch where the update is visible
    vm.warp(block.timestamp + lagInEpochs * epochDuration);

    // The sample seed for the current epoch should now be different because we checkpointed new randao
    uint256 newSampleSeed = rollup.getSampleSeedAt(Timestamp.wrap(block.timestamp));
    assertTrue(newSampleSeed != originalSampleSeed);
  }
}
