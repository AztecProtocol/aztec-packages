// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
pragma solidity >=0.8.27;

import {IRollupCore, BlockLog} from "@aztec/core/interfaces/IRollup.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";
import {Timestamp, Slot, Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {RewardConfig, Bps} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {ValidatorSelectionTestBase} from "./validator-selection/ValidatorSelectionBase.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {IBoosterCore} from "@aztec/core/reward-boost/RewardBooster.sol";
import {ValidatorSelectionLib} from "@aztec/core/libraries/rollup/ValidatorSelectionLib.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

/**
 * Testing the things that should be getters are not updating state!
 * Look at the `rollup.sol` with \)\s*(?:external|public)(?!\s*(?:\r?\n\s*)*(?:view|pure)\b)
 * to find the functions that should be getters. Things that are in there should be getters only.
 *
 * We have to look a bit into the `RollupCore.sol` to make sure that we are not missing anything.
 */
contract RollupShouldBeGetters is ValidatorSelectionTestBase {
  function test_getEpochCommittee(uint16 _epochToGet, bool _setup) external setup(4, 4) {
    vm.assume(_epochToGet >= 2);
    uint256 expectedSize = 4;
    Epoch e = Epoch.wrap(_epochToGet);
    Timestamp t = timeCheater.epochToTimestamp(e);

    vm.warp(Timestamp.unwrap(t));

    if (_setup) {
      rollup.setupEpoch();
    }

    vm.record();

    address[] memory committee = rollup.getEpochCommittee(e);
    address[] memory committee2 = rollup.getCommitteeAt(t);
    address[] memory committee3 = rollup.getCurrentEpochCommittee();
    (bytes32 committeeCommitment, uint256 committeeSize) = rollup.getCommitteeCommitmentAt(t);

    assertEq(committee.length, expectedSize, "invalid getEpochCommittee");
    assertEq(committee2.length, expectedSize, "invalid getCommitteeAt");
    assertEq(committee3.length, expectedSize, "invalid getCurrentEpochCommittee");
    assertEq(committeeSize, expectedSize, "invalid getCommitteeCommittmentAt size");
    assertNotEq(committeeCommitment, bytes32(0), "invalid committee commitment");

    (, bytes32[] memory writes) = vm.accesses(address(rollup));
    assertEq(writes.length, 0, "No writes should be done");
  }

  function test_getBigEpochCommittee(uint16 _epochToGet, bool _setup) external setup(49, 48) {
    vm.assume(_epochToGet >= 2);
    uint256 expectedSize = 48;
    Epoch e = Epoch.wrap(_epochToGet);
    Timestamp t = timeCheater.epochToTimestamp(e);

    vm.warp(Timestamp.unwrap(t));

    if (_setup) {
      rollup.setupEpoch();
    }

    vm.record();

    address[] memory committee = rollup.getEpochCommittee(e);
    address[] memory committee2 = rollup.getCommitteeAt(t);
    address[] memory committee3 = rollup.getCurrentEpochCommittee();
    (bytes32 committeeCommitment, uint256 committeeSize) = rollup.getCommitteeCommitmentAt(t);

    assertEq(committee.length, expectedSize, "invalid getEpochCommittee");
    assertEq(committee2.length, expectedSize, "invalid getCommitteeAt");
    assertEq(committee3.length, expectedSize, "invalid getCurrentEpochCommittee");
    assertEq(committeeSize, expectedSize, "invalid getCommitteeCommittmentAt size");
    assertNotEq(committeeCommitment, bytes32(0), "invalid committee commitment");

    (, bytes32[] memory writes) = vm.accesses(address(rollup));
    assertEq(writes.length, 0, "No writes should be done");
  }

  function test_getCurrentEpochCommitteeRecent() external setup(0, 48) {
    // This test ensures that the replacement (removal and adding of new) validators
    // which alter the size checkpoints but also the index checkpoints do not
    // impact the gas costs unexpectedly.

    timeCheater.cheat__jumpForwardEpochs(2);

    uint256 activationThreshold = rollup.getGSE().ACTIVATION_THRESHOLD();

    vm.prank(testERC20.owner());
    testERC20.mint(address(this), 10e3 * activationThreshold);
    testERC20.approve(address(rollup), type(uint256).max);

    uint256 offset = 0;

    for (uint256 i = 0; i < 50; i++) {
      rollup.deposit(vm.addr(i + 1), address(this), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), true);
      rollup.flushEntryQueue();
      timeCheater.cheat__jumpForwardEpochs(2);
    }

    uint256 gasSmall = gasleft();

    rollup.getCurrentEpochCommittee();

    gasSmall = gasSmall - gasleft();

    for (uint256 i = 0; i < 15; i++) {
      uint256 toRemove = rollup.getActiveAttesterCount();

      for (uint256 j = 0; j < toRemove; j++) {
        rollup.initiateWithdraw(vm.addr(offset + j + 1), address(this));
        timeCheater.cheat__jumpForwardEpochs(2);
      }

      offset += toRemove;

      for (uint256 j = 0; j < toRemove; j++) {
        rollup.deposit(
          vm.addr(offset + j + 1), address(this), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), true
        );
        rollup.flushEntryQueue();
        timeCheater.cheat__jumpForwardEpochs(2);
      }
    }

    timeCheater.cheat__jumpForwardEpochs(10);

    vm.record();

    uint256 gasBig = gasleft();
    rollup.getCurrentEpochCommittee();

    gasBig = gasBig - gasleft();

    (, bytes32[] memory writes) = vm.accesses(address(rollup.getGSE()));
    assertEq(writes.length, 0, "No writes should be done");

    // 16 insertions in total, so binary search should hit 4 values (3 extra).
    // Since using recent, we should only hit 2 additional at most though, so
    // we will compute the overhead as 2 extra (each 3K) for each of the members
    assertGt(gasSmall + 3e3 * 2 * 48, gasBig, "growing too quickly");
  }

  function test_getCurrentEpochCommittee() external setup(0, 48) {
    // This test ensures that the addition of a lot of new validators
    // altering the size checkpoints do not heavily impact the gas costs.
    timeCheater.cheat__jumpForwardEpochs(2);

    uint256 activationThreshold = rollup.getGSE().ACTIVATION_THRESHOLD();

    vm.prank(testERC20.owner());
    testERC20.mint(address(this), 10e3 * activationThreshold);
    testERC20.approve(address(rollup), type(uint256).max);

    // Add a bunch of attesters to
    for (uint256 i = 0; i < 200; i++) {
      rollup.deposit(vm.addr(i + 1), address(this), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), true);
      rollup.flushEntryQueue();
      timeCheater.cheat__jumpForwardEpochs(2);
    }

    uint256 gasSmall = 0;
    uint256 gasBig = 0;

    {
      emit log_string("Getting the small epoch committee");
      vm.record();
      gasSmall = gasleft();
      rollup.getCurrentEpochCommittee();
      gasSmall = gasSmall - gasleft();

      (bytes32[] memory reads, bytes32[] memory writes) = vm.accesses(address(rollup.getGSE()));
      // assertEq(writes.length, 0, "No writes should be done");
      emit log_named_uint("reads", reads.length);
      emit log_named_uint("writes", writes.length);
    }

    for (uint256 i = 0; i < 800; i++) {
      rollup.deposit(vm.addr(i + 200), address(this), BN254Lib.g1Zero(), BN254Lib.g2Zero(), BN254Lib.g1Zero(), true);
      rollup.flushEntryQueue();
      timeCheater.cheat__jumpForwardEpochs(2);
    }

    timeCheater.cheat__jumpForwardEpochs(10);

    {
      emit log_string("Getting the big epoch committee");
      vm.record();
      gasBig = gasleft();
      rollup.getCurrentEpochCommittee();
      gasBig = gasBig - gasleft();
      (bytes32[] memory reads, bytes32[] memory writes) = vm.accesses(address(rollup.getGSE()));
      assertEq(writes.length, 0, "No writes should be done");
      emit log_named_uint("reads", reads.length);
    }

    emit log_named_uint("gasSmall", gasSmall);
    emit log_named_uint("gasBig", gasBig);

    // Should not have grown by more than 10K
    assertGt(gasSmall + 1e4, gasBig, "growing too quickly");
  }

  function test_getProposerAt(uint16 _slot, bool _setup) external setup(4, 4) {
    timeCheater.cheat__jumpForwardEpochs(2);
    Slot s = Slot.wrap(timeCheater.currentSlot()) + Slot.wrap(_slot);
    Timestamp t = timeCheater.slotToTimestamp(s);

    vm.warp(Timestamp.unwrap(t));

    if (_setup) {
      rollup.setupEpoch();
    }

    vm.record();

    address proposer = rollup.getProposerAt(t);
    address proposer2 = rollup.getCurrentProposer();

    assertEq(proposer, proposer2, "proposer should be the same");

    (, bytes32[] memory writes) = vm.accesses(address(rollup));
    assertEq(writes.length, 0, "No writes should be done");
  }

  // Checks that getProposerAt yields the same result as sampling the entire committee
  // and then fetching the proposer from it given the proposer index.
  function test_getProposerFromCommittee(uint16 _slot, bool _setup) external setup(4, 4) {
    timeCheater.cheat__jumpForwardEpochs(2);
    Slot s = Slot.wrap(timeCheater.currentSlot()) + Slot.wrap(_slot);
    Timestamp t = timeCheater.slotToTimestamp(s);

    vm.warp(Timestamp.unwrap(t));

    if (_setup) {
      rollup.setupEpoch();
    }

    vm.record();

    address proposer = rollup.getProposerAt(t);

    address[] memory committee = rollup.getCommitteeAt(t);
    uint256 seed = rollup.getSampleSeedAt(t);
    Epoch epoch = rollup.getEpochAt(t);
    uint256 proposerIndex = ValidatorSelectionLib.computeProposerIndex(epoch, s, seed, 4);

    assertEq(proposer, committee[proposerIndex], "proposer should be the same");

    (, bytes32[] memory writes) = vm.accesses(address(rollup));
    assertEq(writes.length, 0, "No writes should be done");
  }

  function test_validateHeader() external setup(4, 4) {
    // Todo this one is a bit annoying here really. We need a lot of header information.
  }

  function test_canProposeAtTime(uint16 _timestamp, bool _setup) external setup(1, 1) {
    timeCheater.cheat__jumpForwardEpochs(2);

    Timestamp t = Timestamp.wrap(block.timestamp + _timestamp);

    vm.warp(Timestamp.unwrap(t));

    if (_setup) {
      rollup.setupEpoch();
    }

    address proposer = rollup.getCurrentProposer();

    BlockLog memory log = rollup.getBlock(rollup.getPendingBlockNumber());

    vm.record();

    rollup.canProposeAtTime(t, log.archive, proposer);

    (, bytes32[] memory writes) = vm.accesses(address(rollup));
    assertEq(writes.length, 0, "No writes should be done");
  }

  function test_getRewardConfig() external setup(1, 1) {
    // By default, we will be replacing the reward distributor and booster addresses
    RewardConfig memory defaultConfig = TestConstants.getRewardConfig();
    RewardConfig memory config = rollup.getRewardConfig();

    RewardConfig memory updated = RewardConfig({
      sequencerBps: Bps.wrap(1),
      rewardDistributor: IRewardDistributor(address(2)),
      booster: IBoosterCore(address(3)),
      blockReward: 100e18
    });

    assertNotEq(address(config.rewardDistributor), address(updated.rewardDistributor), "invalid reward distributor");
    assertNotEq(address(config.booster), address(updated.booster), "invalid booster");
    assertEq(Bps.unwrap(config.sequencerBps), Bps.unwrap(defaultConfig.sequencerBps), "invalid sequencerBps");
    assertEq(config.blockReward, defaultConfig.blockReward, "invalid initial blockReward");

    address owner = rollup.owner();

    vm.expectEmit(true, true, true, true);
    emit IRollupCore.RewardConfigUpdated(updated);
    vm.prank(owner);
    rollup.setRewardConfig(updated);
    config = rollup.getRewardConfig();

    assertEq(Bps.unwrap(config.sequencerBps), Bps.unwrap(updated.sequencerBps), "invalid sequencerBps");
    assertEq(address(config.rewardDistributor), address(updated.rewardDistributor), "invalid reward distributor");
    assertEq(address(config.booster), address(updated.booster), "invalid booster");
    assertEq(config.blockReward, updated.blockReward, "invalid blockReward");
  }
}
