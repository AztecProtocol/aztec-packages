// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";

interface IRegistry {
  event InstanceAdded(address indexed instance, uint256 indexed version);
  event GovernanceUpdated(address indexed governance);

  function addRollup(IRollup _rollup) external;
  function updateGovernance(address _governance) external;

  // docs:start:registry_get_canonical_rollup
  function getCanonicalRollup() external view returns (IRollup);
  // docs:end:registry_get_canonical_rollup

  // docs:start:registry_get_rollup
  function getRollup(uint256 _chainId) external view returns (IRollup);
  // docs:end:registry_get_rollup

  // docs:start:registry_number_of_versions
  function numberOfVersions() external view returns (uint256);
  // docs:end:registry_number_of_versions

  function getGovernance() external view returns (address);

  function getRewardDistributor() external view returns (IRewardDistributor);

  function getVersion(uint256 _index) external view returns (uint256);
}
