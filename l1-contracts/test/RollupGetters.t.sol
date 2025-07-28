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

    assertNotEq(
      address(config.rewardDistributor),
      address(updated.rewardDistributor),
      "invalid reward distributor"
    );
    assertNotEq(address(config.booster), address(updated.booster), "invalid booster");
    assertEq(
      Bps.unwrap(config.sequencerBps),
      Bps.unwrap(defaultConfig.sequencerBps),
      "invalid sequencerBps"
    );
    assertEq(config.blockReward, defaultConfig.blockReward, "invalid initial blockReward");

    address owner = rollup.owner();

    vm.expectEmit(true, true, true, true);
    emit IRollupCore.RewardConfigUpdated(updated);
    vm.prank(owner);
    rollup.setRewardConfig(updated);
    config = rollup.getRewardConfig();

    assertEq(
      Bps.unwrap(config.sequencerBps), Bps.unwrap(updated.sequencerBps), "invalid sequencerBps"
    );
    assertEq(
      address(config.rewardDistributor),
      address(updated.rewardDistributor),
      "invalid reward distributor"
    );
    assertEq(address(config.booster), address(updated.booster), "invalid booster");
    assertEq(config.blockReward, updated.blockReward, "invalid blockReward");
  }
}
