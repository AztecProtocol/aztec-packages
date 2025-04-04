// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

interface IRewardDistributor {
  function claim(address _to) external returns (uint256);
  function claimBlockRewards(address _to, uint256 _amount) external returns (uint256);
  function canonicalRollup() external view returns (address);
}
