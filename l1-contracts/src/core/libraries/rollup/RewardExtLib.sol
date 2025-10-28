// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RewardLib, RewardConfig} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";

import {
  RewardBooster,
  RewardBoostConfig,
  IBoosterCore,
  IValidatorSelection
} from "@aztec/core/reward-boost/RewardBooster.sol";

library RewardExtLib {
  function initialize(Timestamp _earliestRewardsClaimableTimestamp) external {
    RewardLib.initialize(_earliestRewardsClaimableTimestamp);
  }

  function setConfig(RewardConfig memory _config) external {
    RewardLib.setConfig(_config);
  }

  function setIsRewardsClaimable(bool _isRewardsClaimable) external {
    RewardLib.setIsRewardsClaimable(_isRewardsClaimable);
  }

  function claimSequencerRewards(address _sequencer) external returns (uint256) {
    return RewardLib.claimSequencerRewards(_sequencer);
  }

  function claimProverRewards(address _prover, Epoch[] memory _epochs) external returns (uint256) {
    return RewardLib.claimProverRewards(_prover, _epochs);
  }

  function deployRewardBooster(RewardBoostConfig memory _config) external returns (IBoosterCore) {
    RewardBooster booster = new RewardBooster(IValidatorSelection(address(this)), _config);
    return IBoosterCore(address(booster));
  }
}
