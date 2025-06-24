// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
pragma solidity >=0.8.27;

import {IRollupCore, BlockLog} from "@aztec/core/interfaces/IRollup.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";
import {Timestamp, Slot, Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {RewardConfig, Bps} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {ValidatorSelectionTestBase} from "./validator-selection/ValidatorSelectionBase.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";

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

    vm.prank(proposer);
    rollup.canProposeAtTime(t, log.archive);

    (, bytes32[] memory writes) = vm.accesses(address(rollup));
    assertEq(writes.length, 0, "No writes should be done");
  }

  function test_getRewardConfig() external setup(1, 1) {
    RewardConfig memory defaultConfig = TestConstants.getRewardConfig();

    RewardConfig memory config = rollup.getRewardConfig();

    assertEq(
      Bps.unwrap(config.sequencerBps),
      Bps.unwrap(defaultConfig.sequencerBps),
      "invalid sequencerBps"
    );
    assertEq(config.increment, defaultConfig.increment, "in--valid increment");
    assertEq(config.maxScore, defaultConfig.maxScore, "invalid maxScore");
    assertEq(config.a, defaultConfig.a, "invalid a");
    assertEq(config.k, defaultConfig.k, "invalid k");
    assertEq(config.minimum, defaultConfig.minimum, "invalid minimum");

    RewardConfig memory updated = RewardConfig({
      sequencerBps: Bps.wrap(1),
      increment: 2,
      maxScore: 3,
      a: 4,
      k: 5,
      minimum: 6,
      rewardDistributor: IRewardDistributor(address(0))
    });

    address owner = rollup.owner();

    vm.expectEmit(true, true, true, true);
    emit IRollupCore.RewardConfigUpdated(updated);
    vm.prank(owner);
    rollup.setRewardConfig(updated);
    config = rollup.getRewardConfig();

    assertEq(
      Bps.unwrap(config.sequencerBps), Bps.unwrap(updated.sequencerBps), "invalid sequencerBps"
    );
    assertEq(config.increment, updated.increment, "invalid increment");
    assertEq(config.maxScore, updated.maxScore, "invalid maxScore");
    assertEq(config.a, updated.a, "invalid a");
    assertEq(config.k, updated.k, "invalid k");
    assertEq(config.minimum, updated.minimum, "invalid minimum");
  }
}
