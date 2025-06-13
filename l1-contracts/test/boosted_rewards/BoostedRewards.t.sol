// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable var-name-mixedcase
pragma solidity >=0.8.27;

import {TestBase} from "../base/Base.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {
  RewardLib, ActivityScoreLib, ActivityScore
} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {TimeLib, Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";
import {TimeCheater} from "../staking/TimeCheater.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

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

contract BoostedHelper {
  using ActivityScoreLib for ActivityScore;
  using SafeCast for uint256;

  constructor(RollupConfigInput memory _config) {
    TimeLib.initialize(block.timestamp, _config.aztecSlotDuration, _config.aztecEpochDuration);
    RewardLib.setConfig(_config.rewardConfig);
  }

  function markActive(address _prover) public {
    RewardLib.getStorage().activityScores[_prover].markActive(RewardLib.getStorage().config);
  }

  function setActivityScore(address _prover, uint256 _value) public {
    RewardLib.getStorage().activityScores[_prover].value = _value.toUint32();
    RewardLib.getStorage().activityScores[_prover].time =
      TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp));
  }

  function getActivityScore(address _prover) public view returns (ActivityScore memory) {
    return RewardLib.getActivityScore(_prover);
  }

  function toShares(address _prover) public view returns (uint256) {
    return RewardLib.toShares(_prover);
  }
}

contract BoostedRewardsTest is TestBase {
  using SafeCast for uint256;

  TestDataActvityScore public activityScoreData;
  TestDataShares public sharesData;

  BoostedHelper public helper;
  TimeCheater public timeCheater;

  constructor() {
    string memory root = vm.projectRoot();
    string memory path = string.concat(root, "/test/fixtures/boosted_rewards/activity_scores.json");
    string memory json = vm.readFile(path);
    bytes memory jsonBytes = vm.parseJson(json);
    activityScoreData = abi.decode(jsonBytes, (TestDataActvityScore));

    path = string.concat(root, "/test/fixtures/boosted_rewards/shares.json");
    json = vm.readFile(path);
    jsonBytes = vm.parseJson(json);
    sharesData = abi.decode(jsonBytes, (TestDataShares));

    assertEq(activityScoreData.config.h, sharesData.config.h, "h");
    assertEq(activityScoreData.config.pi, sharesData.config.pi, "pi");
  }

  function setUp() public {
    RollupConfigInput memory config = TestConstants.getRollupConfigInput();
    config.rewardConfig.a = sharesData.config.a.toUint32();
    config.rewardConfig.maxScore = sharesData.config.h.toUint32();
    config.rewardConfig.k = sharesData.config.k.toUint32();
    config.rewardConfig.minimum = sharesData.config.m.toUint32();
    config.rewardConfig.increment = sharesData.config.pi.toUint32();

    helper = new BoostedHelper(config);
    timeCheater = new TimeCheater(
      address(helper),
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION
    );
  }

  function test_activityDuplicateNoop() public {
    address prover = address(0x123);

    Epoch epoch = timeCheater.getCurrentEpoch();

    helper.markActive(prover);
    uint256 score = helper.getActivityScore(prover).value;

    while (epoch == timeCheater.getCurrentEpoch()) {
      helper.markActive(prover);
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
        helper.markActive(prover);
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
      assertEq(helper.toShares(prover), shares);

      emit log_named_uint("index", i);
      emit log_named_uint("activityScore", activityScore);
      emit log_named_uint("shares", shares);
      emit log_named_uint("toShares", helper.toShares(prover));
    }
  }
}
