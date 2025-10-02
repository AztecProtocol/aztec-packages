// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

interface IFlushRewarder {
  event RewardPerInsertionUpdated(uint256 rewardPerInsertion);

  error InsufficientRewardsAvailable();

  function setRewardPerInsertion(uint256 _rewardPerInsertion) external;
  function flushEntryQueue() external;
  function flushEntryQueue(uint256 _toAdd) external;
  function claimRewards() external;
  function recover(address _asset, address _to, uint256 _amount) external;

  function rewardsAvailable() external view returns (uint256);
  function rewardsOf(address _account) external view returns (uint256);
}
