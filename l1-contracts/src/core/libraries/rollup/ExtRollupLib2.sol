// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
// solhint-disable imports-order
pragma solidity >=0.8.27;

import {Epoch, Slot, Timestamp, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {StakingLib} from "./StakingLib.sol";
import {ValidatorSelectionLib} from "./ValidatorSelectionLib.sol";
import {
  RewardBooster,
  RewardBoostConfig,
  IBoosterCore,
  IValidatorSelection
} from "@aztec/core/reward-boost/RewardBooster.sol";
import {Slasher, ISlasher} from "@aztec/core/slashing/Slasher.sol";

library ExtRollupLib2 {
  using TimeLib for Timestamp;

  function deployRewardBooster(RewardBoostConfig memory _config) external returns (IBoosterCore) {
    RewardBooster booster = new RewardBooster(IValidatorSelection(address(this)), _config);
    return IBoosterCore(address(booster));
  }

  function deploySlasher(
    uint256 _slashingQuorum,
    uint256 _slashingRoundSize,
    uint256 _slashingLifetimeInRounds,
    uint256 _slashingExecutionDelayInRounds,
    address _slashingVetoer
  ) external returns (ISlasher) {
    Slasher slasher = new Slasher(
      _slashingQuorum,
      _slashingRoundSize,
      _slashingLifetimeInRounds,
      _slashingExecutionDelayInRounds,
      _slashingVetoer
    );
    return ISlasher(address(slasher));
  }

  function setSlasher(address _slasher) external {
    StakingLib.setSlasher(_slasher);
  }

  function vote(uint256 _proposalId) external {
    StakingLib.vote(_proposalId);
  }

  function deposit(address _attester, address _withdrawer, bool _moveWithLatestRollup) external {
    StakingLib.deposit(_attester, _withdrawer, _moveWithLatestRollup);
  }

  function flushEntryQueue(uint256 _maxAddableValidators) external {
    StakingLib.flushEntryQueue(_maxAddableValidators);
  }

  function initiateWithdraw(address _attester, address _recipient) external returns (bool) {
    return StakingLib.initiateWithdraw(_attester, _recipient);
  }

  function initializeValidatorSelection(uint256 _targetCommitteeSize) external {
    ValidatorSelectionLib.initialize(_targetCommitteeSize);
  }

  function setupEpoch() external {
    Epoch currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
    ValidatorSelectionLib.setupEpoch(currentEpoch);
  }

  function setupSeedSnapshotForNextEpoch() external {
    Epoch currentEpoch = Timestamp.wrap(block.timestamp).epochFromTimestamp();
    ValidatorSelectionLib.setSampleSeedForNextEpoch(currentEpoch);
  }

  function updateStakingQueueConfig(StakingQueueConfig memory _config) external {
    StakingLib.updateStakingQueueConfig(_config);
  }

  function getCommitteeAt(Epoch _epoch) external returns (address[] memory) {
    return ValidatorSelectionLib.getCommitteeAt(_epoch);
  }

  function getProposerAt(Slot _slot) external returns (address) {
    return ValidatorSelectionLib.getProposerAt(_slot);
  }

  function getCommitteeCommitmentAt(Epoch _epoch) external returns (bytes32, uint256) {
    return ValidatorSelectionLib.getCommitteeCommitmentAt(_epoch);
  }

  function getSampleSeedAt(Epoch _epoch) external view returns (uint256) {
    return ValidatorSelectionLib.getSampleSeed(_epoch);
  }

  function getTargetCommitteeSize() external view returns (uint256) {
    return ValidatorSelectionLib.getStorage().targetCommitteeSize;
  }

  function getEntryQueueFlushSize() external view returns (uint256) {
    return StakingLib.getEntryQueueFlushSize();
  }
}
