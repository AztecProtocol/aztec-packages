// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

interface IRewardDistributor {
  function claim(address _to, uint256 _amount) external;
  function recoverFrom(address _from, address _to, uint256 _amount) external;
  function recoverWrongAsset(address _asset, address _to, uint256 _amount) external;
  function subsidizeAddress(address _recipient, uint256 _amount) external;
  function canonicalRollup() external view returns (address);
  function availableTo(address _recipient) external view returns (uint256);
}
