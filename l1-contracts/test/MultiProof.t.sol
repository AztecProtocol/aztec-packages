// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "./base/DecoderBase.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {IEconomics} from "@aztec/core/interfaces/IEconomics.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {ProposeArgs, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";

import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";

import {Strings} from "@oz/utils/Strings.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

import {RollupBase, IInstance} from "./base/RollupBase.sol";
import {Config, RollupBuilder} from "./builder/RollupBuilder.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";
import {ActivityScore, EconomicsInitArgs} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {EconomicsHarness} from "@test/harnesses/EconomicsHarness.sol";

// solhint-disable comprehensive-interface

/**
 * Checkpoints are generated using the `integration_l1_publisher.test.ts` tests.
 * Main use of these test is shorter cycles when updating the decoder contract.
 */
contract MultiProofTest is RollupBase {
  using stdStorage for StdStorage;
  using ProposeLib for ProposeArgs;
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;

  Registry internal registry;
  TestERC20 internal testERC20;
  FeeJuicePortal internal feeJuicePortal;
  RewardDistributor internal rewardDistributor;
  IEconomics internal rewardBooster;

  uint256 internal SLOT_DURATION;
  uint256 internal EPOCH_DURATION;

  address internal sequencer;

  constructor() {
    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );
    SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;
    EPOCH_DURATION = TestConstants.AZTEC_EPOCH_DURATION;
    sequencer = makeAddr("sequencer");
  }

  /**
   * @notice  Set up the contracts needed for the tests with time aligned to the provided checkpoint name
   */
  modifier setUpFor(string memory _name) {
    {
      DecoderBase.Full memory full = load(_name);
      uint256 slotNumber = Slot.unwrap(full.checkpoint.header.slotNumber);
      uint256 initialTime = Timestamp.unwrap(full.checkpoint.header.timestamp) - slotNumber * SLOT_DURATION;
      vm.warp(initialTime);
    }

    RollupBuilder builder = new RollupBuilder(address(this)).setTargetCommitteeSize(0);
    builder.deploy();

    rollup = IInstance(address(builder.getConfig().rollup));
    testERC20 = builder.getConfig().testERC20;

    feeJuicePortal = FeeJuicePortal(address(rollup.getFeeAssetPortal()));

    rewardBooster = IEconomics(address(_economics()));

    Config memory config = builder.getConfig();
    EconomicsHarness helper = new EconomicsHarness(
      address(this),
      address(rollup),
      testERC20,
      EconomicsInitArgs({
        manaTarget: config.rollupConfigInput.manaTarget,
        provingCostPerMana: config.rollupConfigInput.provingCostPerMana,
        initialEthPerFeeAsset: config.rollupConfigInput.initialEthPerFeeAsset,
        rewardConfig: config.rollupConfigInput.rewardConfig,
        rewardBoostConfig: config.rollupConfigInput.rewardBoostConfig,
        genesisTime: block.timestamp,
        aztecSlotDuration: config.rollupConfigInput.aztecSlotDuration,
        aztecEpochDuration: config.rollupConfigInput.aztecEpochDuration,
        aztecProofSubmissionEpochs: config.rollupConfigInput.aztecProofSubmissionEpochs
      })
    );
    vm.etch(address(rewardBooster), address(helper).code);

    _;
  }

  function warpToL2Slot(uint256 _slot) public {
    vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(Slot.wrap(_slot))));
  }

  function logStatus() public {
    uint256 provenCheckpointNumber = rollup.getProvenCheckpointNumber();
    uint256 pendingCheckpointNumber = rollup.getPendingCheckpointNumber();
    emit log_named_uint("proven checkpoint number", provenCheckpointNumber);
    emit log_named_uint("pending checkpoint number", pendingCheckpointNumber);

    address[2] memory provers = [makeAddr("alice"), makeAddr("bob")];

    emit log_named_decimal_uint("sequencer rewards", _economics().getSequencerRewards(sequencer), 18);
    emit log_named_decimal_uint("prover rewards", _economics().getCollectiveProverRewardsForEpoch(Epoch.wrap(0)), 18);

    for (uint256 i = 0; i < provers.length; i++) {
      for (uint256 j = 1; j <= provenCheckpointNumber; j++) {
        bool hasSubmitted = _economics().getHasSubmitted(Epoch.wrap(0), j, provers[i]);
        if (hasSubmitted) {
          emit log_named_string(
            string.concat("prover has submitted proof up till checkpoint ", Strings.toString(j)),
            string(abi.encode(provers[i]))
          );
        }
      }
      emit log_named_decimal_uint(
        string.concat("prover ", string(abi.encode(provers[i])), " rewards"),
        _economics().getSpecificProverRewardsForEpoch(Epoch.wrap(0), provers[i]),
        18
      );
    }
  }

  function testMultipleProvers() public setUpFor("mixed_checkpoint_1") {
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    // We need to mint some fee asset to the portal to cover the 30M mana spent.
    deal(address(testERC20), address(feeJuicePortal), 30e6 * 1e18);

    _proposeCheckpoint("mixed_checkpoint_1", 1, 15e6);
    _proposeCheckpoint("mixed_checkpoint_2", 2, 15e6);

    assertEq(rollup.getProvenCheckpointNumber(), 0, "Checkpoint already proven");

    string memory name = "mixed_checkpoint_";
    _proveCheckpoints(name, 1, 1, alice);
    _proveCheckpoints(name, 1, 1, bob);
    _proveCheckpoints(name, 1, 2, bob);

    logStatus();

    assertTrue(_economics().getHasSubmitted(Epoch.wrap(0), 1, alice));
    assertFalse(_economics().getHasSubmitted(Epoch.wrap(0), 2, alice));
    assertTrue(_economics().getHasSubmitted(Epoch.wrap(0), 1, bob));
    assertTrue(_economics().getHasSubmitted(Epoch.wrap(0), 2, bob));

    assertEq(rollup.getProvenCheckpointNumber(), 2, "Checkpoint not proven");

    {
      uint256 sequencerRewards = _economics().getSequencerRewards(sequencer);
      assertGt(sequencerRewards, 0, "Sequencer rewards is zero");
      uint256 sequencerRewardsClaimed = _economics().claimSequencerRewards(sequencer);
      assertEq(sequencerRewardsClaimed, sequencerRewards, "Sequencer rewards not claimed");
      assertEq(_economics().getSequencerRewards(sequencer), 0, "Sequencer rewards not zeroed");
      assertEq(testERC20.balanceOf(sequencer), sequencerRewards, "Sequencer rewards not transferred");
    }

    Epoch[] memory epochs = new Epoch[](1);
    epochs[0] = Epoch.wrap(0);

    {
      uint256 aliceRewards = _economics().getSpecificProverRewardsForEpoch(Epoch.wrap(0), alice);
      assertEq(aliceRewards, 0, "Alice rewards not zero");
    }

    {
      IEconomics economics = _economics();
      uint256 bobRewards = economics.getSpecificProverRewardsForEpoch(Epoch.wrap(0), bob);
      assertGt(bobRewards, 0, "Bob rewards is zero");

      Epoch deadline = TimeLib.toDeadlineEpoch(epochs[0]);

      vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NotPastDeadline.selector, deadline, Epoch.wrap(0)));
      economics.claimProverRewards(bob, epochs);

      vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(deadline.toSlots())));
      uint256 bobRewardsClaimed = economics.claimProverRewards(bob, epochs);
      assertEq(testERC20.balanceOf(bob), bobRewardsClaimed, "Bob rewards not transferred");

      assertEq(bobRewardsClaimed, bobRewards, "Bob rewards not claimed");
      assertEq(economics.getSpecificProverRewardsForEpoch(Epoch.wrap(0), bob), 0, "Bob rewards not zeroed");
      vm.record();

      economics.claimProverRewards(bob, epochs);
      (, bytes32[] memory writes) = vm.accesses(address(economics));
      // Ensure that there was no writes! We are just doing no-ops if they were already claimed.
      assertEq(writes.length, 0);
    }
  }

  function testMultipleProversBoostedRewards() public setUpFor("mixed_checkpoint_1") {
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    // We need to mint some fee asset to the portal to cover the 30M mana spent.
    deal(address(testERC20), address(feeJuicePortal), 30e6 * 1e18);

    _proposeCheckpoint("mixed_checkpoint_1", 1, 15e6);
    _proposeCheckpoint("mixed_checkpoint_2", 2, 15e6);

    assertEq(rollup.getProvenCheckpointNumber(), 0, "Checkpoint already proven");

    ActivityScore memory activityScore = rewardBooster.getActivityScore(alice);

    assertEq(_economics().getSharesFor(alice), _economics().getSharesFor(bob), "Alice shares not equal to bob shares");

    uint256 maxActivityScore = TestConstants.getRewardBoostConfig().maxScore;
    uint256 maxShares = TestConstants.getRewardBoostConfig().k;

    EconomicsHarness(address(rewardBooster)).setActivityScore(alice, maxActivityScore);

    assertGt(
      _economics().getSharesFor(alice), _economics().getSharesFor(bob), "Alice shares not greater than bob shares"
    );

    activityScore = rewardBooster.getActivityScore(alice);
    assertEq(activityScore.value, maxActivityScore, "Activity score not set");
    assertEq(_economics().getSharesFor(alice), maxShares, "Alice shares not set");

    assertEq(_economics().getSpecificProverRewardsForEpoch(Epoch.wrap(0), alice), 0, "Alice rewards not zeroed");
    assertEq(_economics().getSpecificProverRewardsForEpoch(Epoch.wrap(0), bob), 0, "Bob rewards not zeroed");

    string memory name = "mixed_checkpoint_";
    _proveCheckpoints(name, 1, 1, alice);
    _proveCheckpoints(name, 1, 1, bob);

    logStatus();

    assertTrue(_economics().getHasSubmitted(Epoch.wrap(0), 1, alice));
    assertTrue(_economics().getHasSubmitted(Epoch.wrap(0), 1, bob));
    assertEq(rollup.getProvenCheckpointNumber(), 1, "Checkpoint not proven");

    uint256 totalRewards = _economics().getCollectiveProverRewardsForEpoch(Epoch.wrap(0));
    uint256 totalShares = (_economics().getSharesFor(bob) + _economics().getSharesFor(alice));

    {
      uint256 aliceRewards = _economics().getSpecificProverRewardsForEpoch(Epoch.wrap(0), alice);
      assertEq(aliceRewards, totalRewards * _economics().getSharesFor(alice) / totalShares, "Alice rewards not correct");
    }
    {
      uint256 bobRewards = _economics().getSpecificProverRewardsForEpoch(Epoch.wrap(0), bob);
      assertEq(bobRewards, totalRewards * _economics().getSharesFor(bob) / totalShares, "Bob rewards not correct");
    }
  }

  function testNoHolesInProvenCheckpoints() public setUpFor("mixed_checkpoint_1") {
    _proposeCheckpoint("mixed_checkpoint_1", 1, 15e6);
    _proposeCheckpoint("mixed_checkpoint_2", TestConstants.AZTEC_EPOCH_DURATION + 1, 15e6);

    string memory name = "mixed_checkpoint_";
    _proveCheckpointsFail(
      name, 2, 2, makeAddr("alice"), abi.encodeWithSelector(Errors.Rollup__StartIsNotBuildingOnProven.selector)
    );
  }

  function testProofsAreInOneEpoch() public setUpFor("mixed_checkpoint_1") {
    _proposeCheckpoint("mixed_checkpoint_1", 1, 15e6);
    _proposeCheckpoint("mixed_checkpoint_2", TestConstants.AZTEC_EPOCH_DURATION + 1, 15e6);

    string memory name = "mixed_checkpoint_";
    _proveCheckpointsFail(
      name, 1, 2, makeAddr("alice"), abi.encodeWithSelector(Errors.Rollup__StartAndEndNotSameEpoch.selector, 0, 1)
    );
  }
}
