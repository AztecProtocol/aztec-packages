// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  FeeLib,
  ManaMinFeeComponents,
  L1FeeData,
  EthPerFeeAssetE12,
  EthValue
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {RewardLib, RewardConfig} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {STFLib} from "@aztec/core/libraries/rollup/STFLib.sol";
import {Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {
  RewardBooster,
  RewardBoostConfig,
  IBoosterCore,
  IValidatorSelection
} from "@aztec/core/reward-boost/RewardBooster.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";

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

  // View wrappers - delegated from Rollup.sol to avoid inlining RewardLib into Rollup bytecode

  function getSpecificProverRewardsForEpoch(Epoch _epoch, address _prover) external view returns (uint256) {
    return RewardLib.getSpecificProverRewardsForEpoch(_epoch, _prover);
  }

  function getSharesFor(address _prover) external view returns (uint256) {
    return RewardLib.getSharesFor(_prover);
  }

  function getSequencerRewards(address _sequencer) external view returns (uint256) {
    return RewardLib.getSequencerRewards(_sequencer);
  }

  function getCollectiveProverRewardsForEpoch(Epoch _epoch) external view returns (uint256) {
    return RewardLib.getCollectiveProverRewardsForEpoch(_epoch);
  }

  function getHasSubmitted(Epoch _epoch, uint256 _length, address _prover) external view returns (bool) {
    return RewardLib.getHasSubmitted(_epoch, _length, _prover);
  }

  function getHasClaimed(address _prover, Epoch _epoch) external view returns (bool) {
    return RewardLib.getHasClaimed(_prover, _epoch);
  }

  function getCheckpointReward() external view returns (uint256) {
    return RewardLib.getCheckpointReward();
  }

  function isRewardsClaimable() external view returns (bool) {
    return RewardLib.isRewardsClaimable();
  }

  function getEarliestRewardsClaimableTimestamp() external view returns (Timestamp) {
    return RewardLib.getEarliestRewardsClaimableTimestamp();
  }

  function getRewardConfig() external view returns (RewardConfig memory) {
    return RewardLib.getStorage().config;
  }

  function getRewardDistributor() external view returns (IRewardDistributor) {
    return RewardLib.getStorage().config.rewardDistributor;
  }

  // FeeLib/STFLib/ProposeLib view wrappers - overflow from RollupOperationsExtLib

  function getManaMinFeeComponentsAt(Timestamp _timestamp, bool _inFeeAsset)
    external
    view
    returns (ManaMinFeeComponents memory)
  {
    return ProposeLib.getManaMinFeeComponentsAt(_timestamp, _inFeeAsset);
  }

  function canPruneAtTime(Timestamp _ts) external view returns (bool) {
    return STFLib.canPruneAtTime(_ts);
  }

  function getEpochForCheckpoint(uint256 _checkpointNumber) external view returns (Epoch) {
    return STFLib.getEpochForCheckpoint(_checkpointNumber);
  }

  function getL1FeesAt(Timestamp _timestamp) external view returns (L1FeeData memory) {
    return FeeLib.getL1FeesAt(_timestamp);
  }

  function getEthPerFeeAssetAtCheckpoint(uint256 _checkpointNumber) external view returns (EthPerFeeAssetE12) {
    return FeeLib.getEthPerFeeAssetAtCheckpoint(_checkpointNumber);
  }

  function getProvingCostPerMana() external view returns (EthValue) {
    return FeeLib.getProvingCostPerMana();
  }

  function getManaTarget() external view returns (uint256) {
    return FeeLib.getManaTarget();
  }

  function getManaLimit() external view returns (uint256) {
    return FeeLib.getManaLimit();
  }

  function summedMinFee(ManaMinFeeComponents memory _components) external pure returns (uint256) {
    return FeeLib.summedMinFee(_components);
  }
}
