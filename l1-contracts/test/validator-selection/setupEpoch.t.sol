// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {ValidatorSelectionTestBase, CheatDepositArgs} from "./ValidatorSelectionBase.sol";
import {Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";

contract SetupEpochTest is ValidatorSelectionTestBase {
  using Checkpoints for Checkpoints.Trace224;

  modifier whenTheRollupIsInGenesisState() {
    // Enforced with setup(0) modifier
    _;
  }

  function test_GivenTheRollupIsInGenesisState() external setup(0) whenTheRollupIsInGenesisState {
    // it should set the sample seed to max
    // it should set the sample seed for the next epoch
    // it should not change the current epoch

    rollup.setupEpoch();

    // Read the sample seed for epoch 0 through the rollup contract
    uint256 sampleSeed = IValidatorSelection(address(rollup)).getCurrentSampleSeed();
    assertEq(sampleSeed, type(uint224).max, "Sample seed should be max in genesis state");

    // Read the sample seed for epoch 1 through the rollup contract
    Timestamp nextEpochTimestamp = Timestamp.wrap(
      block.timestamp + TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION
    );
    uint256 nextEpochSeed = IValidatorSelection(address(rollup)).getSampleSeedAt(nextEpochTimestamp);
    assertTrue(nextEpochSeed != 0, "Next epoch seed should be set");
    assertTrue(
      nextEpochSeed != sampleSeed, "Next epoch seed should be different from current epoch seed"
    );

    // Advance into the next epoch
    vm.warp(Timestamp.unwrap(nextEpochTimestamp));

    // Read the sample seed for epoch 1 now that we are in epoch 1, it should not change
    uint256 epoch1SampleSeedInPast =
      IValidatorSelection(address(rollup)).getSampleSeedAt(nextEpochTimestamp);
    assertEq(
      epoch1SampleSeedInPast,
      nextEpochSeed,
      "Next epoch seed should be the same as the current epoch seed"
    );

    // Call setupEpoch again, from the current epoch it should not change the sample seed
    rollup.setupEpoch();
    assertEq(
      IValidatorSelection(address(rollup)).getCurrentSampleSeed(),
      nextEpochSeed,
      "Sample seed should not change"
    );

    // Seed for the next epoch should be set
    Timestamp nextEpochTimestamp2 = Timestamp.wrap(
      block.timestamp + TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION
    );
    uint256 nextEpochSeedInPast =
      IValidatorSelection(address(rollup)).getSampleSeedAt(nextEpochTimestamp2);
    assertTrue(
      nextEpochSeedInPast != nextEpochSeed,
      "Next epoch seed should not be the same as the current epoch seed"
    );
  }

  modifier whenTheRollupIsNotInGenesisState() {
    // Enforced with setup(4) modifier
    _;
  }

  function test_GivenTheSeedHasBeenSampled() external setup(4) whenTheRollupIsNotInGenesisState {
    // it should not change the sample seed
    // it should be calcaulte the same committee when looking into the past
    // it should not change the commitee even when validators are added or removed
    // it should not change the next seed

    rollup.setupEpoch();

    // Check that the initial epoch seed is set
    uint256 initialEpochSeed =
      IValidatorSelection(address(rollup)).getSampleSeedAt(Timestamp.wrap(block.timestamp));
    assertEq(initialEpochSeed, type(uint224).max, "Sample seed for initial epoch should be max");

    // Get the initial committee
    address[] memory initialCommittee =
      IValidatorSelection(address(rollup)).getCurrentEpochCommittee();

    // When setup epoch is called, nothing should change
    rollup.setupEpoch();
    uint256 initialEpochSeedAfterSetup =
      IValidatorSelection(address(rollup)).getSampleSeedAt(Timestamp.wrap(block.timestamp));
    assertEq(initialEpochSeedAfterSetup, initialEpochSeed, "Sample seed should not change");

    // Check that the committee is the same
    address[] memory committeeAfterRepeatedSetup =
      IValidatorSelection(address(rollup)).getCurrentEpochCommittee();
    assertEq(
      committeeAfterRepeatedSetup.length,
      initialCommittee.length,
      "Committee should have the same length"
    );
    assertEq(committeeAfterRepeatedSetup, initialCommittee, "Committee should be the same");

    // Add a couple of extra validators during this epoch, the sampled validator set should not change
    addNumberOfValidators(420420, 2);

    // Sample the validator set for the current epoch
    address[] memory committeeAfterAddingExtraValidators =
      IValidatorSelection(address(rollup)).getCurrentEpochCommittee();
    assertEq(committeeAfterAddingExtraValidators, initialCommittee, "Committee should be the same");

    // Jump into the future and check the committee still does not change
    uint256 savedTimestamp = block.timestamp;
    vm.warp(savedTimestamp + TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION);

    address[] memory committeeAfterJumpingIntoFuture =
      IValidatorSelection(address(rollup)).getCommitteeAt(Timestamp.wrap(savedTimestamp));
    assertEq(committeeAfterJumpingIntoFuture, initialCommittee, "Committee should be the same");
  }

  modifier whenItHasBeenALongTimeSinceTheLastSampleSeedWasSet() {
    // Enforce validator set has been changed with the setup(50) modifier
    _;
  }

  function test_WhenItHasBeenALongTimeSinceTheLastSampleSeedWasSet()
    external
    setup(50)
    whenItHasBeenALongTimeSinceTheLastSampleSeedWasSet
  {
    // it should use the most recent sample seed
    rollup.setupEpoch();

    // Check that the sample seed has been set for the next epoch
    uint256 nextEpochTimestamp =
      block.timestamp + TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION;
    uint256 nextEpochSeed =
      IValidatorSelection(address(rollup)).getSampleSeedAt(Timestamp.wrap(nextEpochTimestamp));
    assertGt(nextEpochSeed, 0, "Sample seed should be set for the next epoch");

    // Jump into the future, looking back, the returned sample seed should be the same for the next range of epochs
    uint256 savedTimestamp = block.timestamp;
    vm.warp(
      savedTimestamp + 2 * (TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION)
    );

    uint256 sampleSeedAfterJump = IValidatorSelection(address(rollup)).getCurrentSampleSeed();
    assertEq(sampleSeedAfterJump, nextEpochSeed, "Sample seed should be the same");

    // Add some validators
    addNumberOfValidators(420422, 2);

    // Jump further into the future
    vm.warp(
      savedTimestamp + 4 * (TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION)
    );

    // Check that the sample seed has not changed
    assertEq(
      IValidatorSelection(address(rollup)).getCurrentSampleSeed(),
      nextEpochSeed,
      "Sample seed should not change"
    );

    // Call setupEpoch, the sample seed should not change
    rollup.setupEpoch();
    assertEq(
      IValidatorSelection(address(rollup)).getCurrentSampleSeed(),
      nextEpochSeed,
      "Sample seed should not change"
    );

    // The sample seed for the next epoch should have changed
    uint256 nextEpochTimestamp2 =
      block.timestamp + TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION;
    uint256 nextEpochSeed2 =
      IValidatorSelection(address(rollup)).getSampleSeedAt(Timestamp.wrap(nextEpochTimestamp2));
    assertGt(nextEpochSeed2, nextEpochSeed, "Sample seed for the next epoch should have changed");
  }

  function test_WhenNewSampleSeedsAreAdded()
    external
    whenItHasBeenALongTimeSinceTheLastSampleSeedWasSet
  {
    // it should continue to use the snapshotted sample seed
    // it should calcaulte the same committee
  }

  function addNumberOfValidators(uint256 _saltStart, uint256 _numberOfValidators) internal {
    CheatDepositArgs[] memory validators = new CheatDepositArgs[](_numberOfValidators);
    for (uint256 i = 0; i < _numberOfValidators; i++) {
      validators[i] = createDepositArgs(i + _saltStart);
    }

    testERC20.mint(address(this), TestConstants.AZTEC_MINIMUM_STAKE * validators.length);
    testERC20.approve(address(rollup), TestConstants.AZTEC_MINIMUM_STAKE * validators.length);
    rollup.cheat__InitialiseValidatorSet(validators);
  }
}
