// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {MultiAdder} from "@aztec/mock/MultiAdder.sol";
import {IStaking} from "@aztec/core/interfaces/IStaking.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";
import {TestConstants} from "./../harnesses/TestConstants.sol";
import {ValidatorSelectionTestBase, CheatDepositArgs} from "./ValidatorSelectionBase.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

contract SetupEpochTest is ValidatorSelectionTestBase {
  using Checkpoints for Checkpoints.Trace224;
  using stdStorage for StdStorage;

  function computeSampleSeed(uint256 _epoch, uint256 _randao) internal pure returns (uint256) {
    return uint256(keccak256(abi.encode(_epoch, _randao)));
  }

  function test_WhenTheRollupDoesNotHaveTheTargetCommitteeSize() external setup(0, 48) {
    // it should not allow setting up any epoch
    // it should have the always seed set to max

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.ValidatorSelection__InsufficientValidatorSetSize.selector, 0, rollup.getTargetCommitteeSize()
      )
    );
    rollup.setupEpoch();

    // The foundry randao values are by default 0. So we lock it in here to easily use later.
    uint256 randao = 0;

    // Read the sample seed for epoch 0 through the rollup contract
    uint256 sampleSeed = IValidatorSelection(address(rollup)).getCurrentSampleSeed();
    assertEq(sampleSeed, computeSampleSeed(0, randao), "invalid sample seed for epoch0");

    // Read the sample seed for epoch 1 through the rollup contract
    Timestamp epoch1Timestamp =
      Timestamp.wrap(block.timestamp + TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION);
    uint256 epoch1Seed = IValidatorSelection(address(rollup)).getSampleSeedAt(epoch1Timestamp);
    assertEq(epoch1Seed, computeSampleSeed(1, randao), "invalid sample seed for epoch1");

    // Read the sample seed for epoch 2 through the rollup contract
    Timestamp epoch2Timestamp =
      Timestamp.wrap(block.timestamp + 2 * TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION);
    assertTrue(
      IValidatorSelection(address(rollup)).getSampleSeedAt(epoch2Timestamp) == computeSampleSeed(2, randao),
      "invalid sample seed for epoch2"
    );

    // Advance into epoch 2
    vm.warp(Timestamp.unwrap(epoch2Timestamp));

    // Read the sample seed for epoch 2 now that we are in epoch 2, it should not change
    assertEq(
      IValidatorSelection(address(rollup)).getCurrentSampleSeed(),
      computeSampleSeed(2, randao),
      "sample seed for epoch 2 should remain the same when re-reading"
    );

    // Call setupEpoch again, from the current epoch it should not change the sample seed
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.ValidatorSelection__InsufficientValidatorSetSize.selector, 0, rollup.getTargetCommitteeSize()
      )
    );
    rollup.setupEpoch();

    // Seed for the epoch 4 should be set
    Timestamp epoch4Timestamp =
      Timestamp.wrap(block.timestamp + 2 * TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION);
    assertTrue(
      IValidatorSelection(address(rollup)).getSampleSeedAt(epoch4Timestamp) == computeSampleSeed(4, randao),
      "invalid sample seed for epoch4"
    );
  }

  modifier whenTheRollupHasTheTargetCommitteeSize() {
    _;
  }

  function test_WhenTheSampleSeedHasBeenSet() external setup(4, 4) whenTheRollupHasTheTargetCommitteeSize {
    // it should not change the sample seed
    // it should calculate the same committee when looking into the past
    // it should not change the committee even when validators are added or removed
    // it should not change the next randao, but sample-seed should be updated

    Timestamp epoch2Timestamp =
      Timestamp.wrap(block.timestamp + 2 * TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION);

    vm.warp(Timestamp.unwrap(epoch2Timestamp));

    rollup.setupEpoch();

    // Check that the initial epoch seed is set
    uint256 initialEpochSeed = IValidatorSelection(address(rollup)).getSampleSeedAt(Timestamp.wrap(block.timestamp));
    assertEq(initialEpochSeed, computeSampleSeed(2, block.prevrandao), "Sample seed for initial epoch should be max");

    // Get the initial committee
    address[] memory initialCommittee = IValidatorSelection(address(rollup)).getCurrentEpochCommittee();

    // When setup epoch is called, nothing should change
    rollup.setupEpoch();
    uint256 initialEpochSeedAfterSetup =
      IValidatorSelection(address(rollup)).getSampleSeedAt(Timestamp.wrap(block.timestamp));
    assertEq(initialEpochSeedAfterSetup, initialEpochSeed, "Sample seed should not change");

    // Check that the committee is the same
    address[] memory committeeAfterRepeatedSetup = IValidatorSelection(address(rollup)).getCurrentEpochCommittee();
    assertEq(committeeAfterRepeatedSetup.length, initialCommittee.length, "Committee should have the same length");
    assertEq(committeeAfterRepeatedSetup, initialCommittee, "Committee should be the same");

    // Overwrite the flushable epoch to 0 to force our ability to add more validators this epoch
    // Now reset the next flushable epoch to 0
    stdstore.enable_packed_slots().target(address(rollup)).sig(IStaking.getNextFlushableEpoch.selector).depth(0)
      .checked_write(uint256(0));

    // Add a couple of extra validators during this epoch, the sampled validator set should not change
    addNumberOfValidators(420_420, 2);

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
    setup(50, 48)
    whenTheRollupHasTheTargetCommitteeSize
  {
    Timestamp epoch2Timestamp =
      Timestamp.wrap(block.timestamp + 2 * TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION);

    vm.warp(Timestamp.unwrap(epoch2Timestamp));

    uint256 randaoFrom2 = uint224(uint256(keccak256("make da fake randao")));
    vm.prevrandao(randaoFrom2);
    assertEq(block.prevrandao, randaoFrom2, "prevrandao should be the same as the randao from 2");

    // it should use the most recent sample seed
    rollup.setupEpoch();

    // Check that the sample seed has been set for two epochs next
    uint256 nextEpochTimestamp =
      block.timestamp + 2 * TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION;
    uint256 nextEpochSeed = IValidatorSelection(address(rollup)).getSampleSeedAt(Timestamp.wrap(nextEpochTimestamp));
    assertEq(nextEpochSeed, computeSampleSeed(4, randaoFrom2), "1 invalid sample seed for next epoch");

    // Jump into the future, looking back, the returned sample seed should be the same for the next range of epochs
    uint256 savedTimestamp = block.timestamp;
    vm.warp(savedTimestamp + 2 * (TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION));

    uint256 sampleSeedAfterJump = IValidatorSelection(address(rollup)).getCurrentSampleSeed();
    assertEq(sampleSeedAfterJump, nextEpochSeed, "2 Sample seed should be the same");

    // Add some validators
    addNumberOfValidators(420_422, 2);

    // Jump further into the future
    vm.warp(savedTimestamp + 4 * (TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION));

    // Check that the sample seed has changed
    assertEq(
      IValidatorSelection(address(rollup)).getCurrentSampleSeed(),
      computeSampleSeed(6, randaoFrom2),
      "3 sample seed haven't changed"
    );

    // Call setupEpoch, the sample seed should not change even though the randao value will change
    uint256 randaoFrom8 = 1234;
    vm.prevrandao(randaoFrom8);
    rollup.setupEpoch();
    assertEq(
      IValidatorSelection(address(rollup)).getCurrentSampleSeed(),
      computeSampleSeed(6, randaoFrom2),
      "4 Sample seed should not change"
    );

    // The sample seed for the next epoch should have changed
    uint256 nextEpochTimestamp2 =
      block.timestamp + 2 * TestConstants.AZTEC_EPOCH_DURATION * TestConstants.AZTEC_SLOT_DURATION;
    uint256 nextEpochSeed2 = IValidatorSelection(address(rollup)).getSampleSeedAt(Timestamp.wrap(nextEpochTimestamp2));
    assertEq(nextEpochSeed2, computeSampleSeed(8, randaoFrom8), "5 invalid sample seed for next epoch");
    assertNotEq(nextEpochSeed2, nextEpochSeed, "5 Sample seed for the next epoch should have changed");
  }

  function test_WhenNewSampleSeedsAreAdded() external whenItHasBeenALongTimeSinceTheLastSampleSeedWasSet {
    // it should continue to use the snapshotted sample seed
    // it should calculate the same committee
  }

  function addNumberOfValidators(uint256 _saltStart, uint256 _numberOfValidators) internal {
    CheatDepositArgs[] memory validators = new CheatDepositArgs[](_numberOfValidators);
    for (uint256 i = 0; i < _numberOfValidators; i++) {
      validators[i] = createDepositArgs(i + _saltStart);
    }

    MultiAdder multiAdder = new MultiAdder(address(rollup), address(this));
    uint256 amount = rollup.getActivationThreshold() * validators.length;
    vm.prank(testERC20.owner());
    testERC20.mint(address(multiAdder), amount);
    multiAdder.addValidators(validators);
  }
}
