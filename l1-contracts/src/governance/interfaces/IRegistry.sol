// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";

interface IRegistry {
  event InstanceAdded(address indexed instance, uint256 indexed version);

  // docs:start:registry_upgrade
  function upgrade(address _rollup) external returns (uint256);
  // docs:end:registry_upgrade

  // docs:start:registry_get_rollup
  function getRollup() external view returns (address);
  // docs:end:registry_get_rollup

  // docs:start:registry_get_version_for
  function getVersionFor(address _rollup) external view returns (uint256);
  // docs:end:registry_get_version_for

  // docs:start:registry_get_snapshot
  function getSnapshot(uint256 _version)
    external
    view
    returns (DataStructures.RegistrySnapshot memory);
  // docs:end:registry_get_snapshot

  // docs:start:registry_get_current_snapshot
  function getCurrentSnapshot() external view returns (DataStructures.RegistrySnapshot memory);
  // docs:end:registry_get_current_snapshot

  // docs:start:registry_number_of_versions
  function numberOfVersions() external view returns (uint256);
  // docs:end:registry_number_of_versions

  function isRollupRegistered(address _rollup) external view returns (bool);

  function getGovernance() external view returns (address);
}
