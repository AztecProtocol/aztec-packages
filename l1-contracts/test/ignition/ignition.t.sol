// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../base/DecoderBase.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {ProposeArgs, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";

import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";

import {Errors} from "@aztec/core/libraries/Errors.sol";

import {RollupBase, IInstance} from "../base/RollupBase.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {TimeCheater} from "../staking/TimeCheater.sol";
import {Bps, BpsLib} from "@aztec/core/libraries/rollup/RewardLib.sol";

// solhint-disable comprehensive-interface

/**
 * Checkpoints are generated using the `integration_l1_publisher.test.ts` tests.
 * Main use of these test is shorter cycles when updating the decoder contract.
 */
contract IgnitionTest is RollupBase {
  using ProposeLib for ProposeArgs;
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;

  Registry internal registry;
  TestERC20 internal testERC20;
  FeeJuicePortal internal feeJuicePortal;
  RewardDistributor internal rewardDistributor;
  TimeCheater internal timeCheater;

  uint256 internal SLOT_DURATION;
  uint256 internal EPOCH_DURATION;
  uint256 internal PROOF_SUBMISSION_EPOCHS;

  address internal sequencer = address(bytes20("sequencer"));

  constructor() {
    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );
    SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;
    EPOCH_DURATION = TestConstants.AZTEC_EPOCH_DURATION;
    PROOF_SUBMISSION_EPOCHS = TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS;
    timeCheater =
      new TimeCheater(address(this), block.timestamp, SLOT_DURATION, EPOCH_DURATION, PROOF_SUBMISSION_EPOCHS);
  }

  /**
   * @notice  Set up the contracts needed for the tests with time aligned to the provided checkpoint name
   */
  modifier setUpFor(string memory _name) {
    {
      DecoderBase.Full memory full = load(_name);
      Slot slotNumber = full.checkpoint.header.slotNumber;
      uint256 initialTime = Timestamp.unwrap(full.checkpoint.header.timestamp) - Slot.unwrap(slotNumber) * SLOT_DURATION;
      vm.warp(initialTime);
    }

    RollupBuilder builder = new RollupBuilder(address(this)).setManaTarget(0).setTargetCommitteeSize(0);
    builder.deploy();

    rollup = IInstance(address(builder.getConfig().rollup));
    testERC20 = builder.getConfig().testERC20;
    registry = builder.getConfig().registry;

    feeJuicePortal = FeeJuicePortal(address(rollup.getFeeAssetPortal()));
    rewardDistributor = RewardDistributor(address(registry.getRewardDistributor()));

    _;
  }

  function test_emptyCheckpoint() public setUpFor("empty_checkpoint_1") {
    assertEq(rollup.getFeeAsset().balanceOf(address(rollup)), 0);

    _proposeCheckpoint("empty_checkpoint_1", 1, 0);

    _proveCheckpoints("empty_checkpoint_", 1, 1, address(0xbeef));

    // The checkpoint rewards should have accumulated
    assertEq(
      rollup.getFeeAsset().balanceOf(address(rollup)), rollup.getCheckpointReward(), "no checkpoint rewards collected"
    );

    uint256 checkpointReward = rollup.getCheckpointReward();
    Bps bps = rollup.getRewardConfig().sequencerBps;
    uint256 sequencerReward = BpsLib.mul(checkpointReward, bps);

    address coinbase = address(bytes20("sequencer"));
    assertEq(rollup.getSequencerRewards(coinbase), sequencerReward, "sequencer reward not collected");
    assertEq(
      rollup.getCollectiveProverRewardsForEpoch(Epoch.wrap(0)),
      checkpointReward - sequencerReward,
      "prover reward not collected"
    );
  }

  function test_RevertNonEmptyCheckpoint() public setUpFor("empty_checkpoint_1") {
    _proposeCheckpointFail(
      "empty_checkpoint_1", 1, 1, abi.encodeWithSelector(Errors.Rollup__ManaLimitExceeded.selector)
    );
  }
}
