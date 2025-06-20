// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";

interface IHaveVersion {
  function getVersion() external view returns (uint256);
}

interface IRegistry {
  event InstanceAdded(address indexed instance, uint256 indexed version);
  event GovernanceUpdated(address indexed governance);
  event RewardDistributorUpdated(address indexed rewardDistributor);

  function addRollup(IHaveVersion _rollup) external;
  function updateGovernance(address _governance) external;
  function updateRewardDistributor(address _rewardDistributor) external;

  // docs:start:registry_get_canonical_rollup
  function getCanonicalRollup() external view returns (IHaveVersion);
  // docs:end:registry_get_canonical_rollup

  // docs:start:registry_get_rollup
  function getRollup(uint256 _chainId) external view returns (IHaveVersion);
  // docs:end:registry_get_rollup

  // docs:start:registry_number_of_versions
  function numberOfVersions() external view returns (uint256);
  // docs:end:registry_number_of_versions

  function getGovernance() external view returns (address);

  function getRewardDistributor() external view returns (IRewardDistributor);

  function getVersion(uint256 _index) external view returns (uint256);
}
