// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

interface IRewardDistributor {
  function claim(address _to, uint256 _amount) external;
  function recover(address _asset, address _to, uint256 _amount) external;
  function canonicalRollup() external view returns (address);
}
