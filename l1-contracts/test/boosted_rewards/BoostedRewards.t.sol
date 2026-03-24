// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable var-name-mixedcase
pragma solidity >=0.8.27;

import {TestBase} from "../base/Base.sol";
import {Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {TimeCheater} from "../staking/TimeCheater.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {EconomicsInitArgs, RewardBoostConfig, ActivityScore} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {EconomicsHarness} from "@test/harnesses/EconomicsHarness.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

struct TestDataActivityConfig {
  uint256 h;
  uint256 pi;
}

struct TestDataActvityScore {
  uint256[] activity_scores;
  TestDataActivityConfig config;
  bool[] is_proven;
}

struct TestDataSharesConfig {
  uint256 a;
  uint256 h;
  uint256 k;
  uint256 m;
  uint256 pi;
}

struct TestDataShares {
  uint256[] activity_scores;
  TestDataSharesConfig config;
  uint256[] shares;
}

contract BoostedRewardsTest is TestBase {
  using SafeCast for uint256;

  TestDataActvityScore public activityScoreData;
  TestDataShares public sharesData;

  EconomicsHarness public helper;
  TimeCheater public timeCheater;
  IValidatorSelection public rollup;

  constructor() {
    string memory root = vm.projectRoot();
    string memory path = string.concat(root, "/test/fixtures/boosted_rewards/activity_scores.json");
    // forge-lint: disable-next-line(unsafe-cheatcode)
    string memory json = vm.readFile(path);
    bytes memory jsonBytes = vm.parseJson(json);
    activityScoreData = abi.decode(jsonBytes, (TestDataActvityScore));

    path = string.concat(root, "/test/fixtures/boosted_rewards/shares.json");
    // forge-lint: disable-next-line(unsafe-cheatcode)
    json = vm.readFile(path);
    jsonBytes = vm.parseJson(json);
    sharesData = abi.decode(jsonBytes, (TestDataShares));

    assertEq(activityScoreData.config.h, sharesData.config.h, "h");
    assertEq(activityScoreData.config.pi, sharesData.config.pi, "pi");
  }

  function setUp() public {
    RewardBoostConfig memory config = TestConstants.getRewardBoostConfig();
    config.a = sharesData.config.a.toUint32();
    config.maxScore = sharesData.config.h.toUint32();
    config.k = sharesData.config.k.toUint32();
    config.minimum = sharesData.config.m.toUint32();
    config.increment = sharesData.config.pi.toUint32();

    timeCheater = new TimeCheater(
      address(0),
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );
    rollup = IValidatorSelection(address(timeCheater));
    helper = new EconomicsHarness(
      address(this),
      address(rollup),
      IERC20(address(new TestERC20("Fee Asset", "FA", address(this)))),
      EconomicsInitArgs({
        manaTarget: TestConstants.AZTEC_MANA_TARGET,
        provingCostPerMana: TestConstants.AZTEC_PROVING_COST_PER_MANA,
        initialEthPerFeeAsset: TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET,
        rewardConfig: TestConstants.getRewardConfig(),
        rewardBoostConfig: config,
        genesisTime: block.timestamp,
        aztecSlotDuration: TestConstants.AZTEC_SLOT_DURATION,
        aztecEpochDuration: TestConstants.AZTEC_EPOCH_DURATION,
        aztecProofSubmissionEpochs: TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
      })
    );
  }

  function test_activityDuplicateNoop() public {
    address prover = address(0x123);

    Epoch epoch = timeCheater.getCurrentEpoch();

    vm.prank(address(rollup));
    helper.applyBoosterUpdate(prover);
    uint256 score = helper.getActivityScore(prover).value;

    while (epoch == timeCheater.getCurrentEpoch()) {
      vm.prank(address(rollup));
      helper.applyBoosterUpdate(prover);
      assertEq(helper.getActivityScore(prover).value, score);
      timeCheater.cheat__progressSlot();
    }
  }

  function test_activityScore() public {
    address prover = address(0x123);

    for (uint256 i = 0; i < activityScoreData.activity_scores.length; i++) {
      bool isProven = activityScoreData.is_proven[i];
      uint256 activityScore = activityScoreData.activity_scores[i];

      if (isProven) {
        vm.prank(address(rollup));
        helper.applyBoosterUpdate(prover);
      }

      assertEq(helper.getActivityScore(prover).value, activityScore);

      timeCheater.cheat__progressEpoch();
    }
  }

  function test_shares() public {
    address prover = address(0x123);

    for (uint256 i = 0; i < sharesData.activity_scores.length; i++) {
      uint256 activityScore = sharesData.activity_scores[i];
      uint256 shares = sharesData.shares[i];

      helper.setActivityScore(prover, activityScore);
      assertEq(helper.getSharesFor(prover), shares);

      emit log_named_uint("index", i);
      emit log_named_uint("activityScore", activityScore);
      emit log_named_uint("shares", shares);
      emit log_named_uint("toShares", helper.getSharesFor(prover));
    }
  }
}
