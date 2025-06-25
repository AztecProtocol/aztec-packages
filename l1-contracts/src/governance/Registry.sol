// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IHaveVersion, IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {RewardDistributor, IRewardDistributor} from "./RewardDistributor.sol";

struct RegistryStorage {
  mapping(uint256 version => IHaveVersion rollup) versionToRollup;
  uint256[] versions;
  IRewardDistributor rewardDistributor;
}

/**
 * @title Registry
 * @author Aztec Labs
 * @notice Keeps track of addresses of current rollup and historical addresses.
 */
contract Registry is IRegistry, Ownable {
  RegistryStorage internal $;

  constructor(address _owner, IERC20 _rewardAsset) Ownable(_owner) {
    $.rewardDistributor = IRewardDistributor(
      address(new RewardDistributor(_rewardAsset, IRegistry(address(this)), _owner))
    );
  }

  function addRollup(IHaveVersion _rollup) external override(IRegistry) onlyOwner {
    uint256 version = _rollup.getVersion();
    require(
      address($.versionToRollup[version]) == address(0),
      Errors.Registry__RollupAlreadyRegistered(address(_rollup))
    );
    $.versionToRollup[version] = _rollup;
    $.versions.push(version);

    emit InstanceAdded(address(_rollup), version);
  }

  function updateRewardDistributor(address _rewardDistributor)
    external
    override(IRegistry)
    onlyOwner
  {
    $.rewardDistributor = IRewardDistributor(_rewardDistributor);
    emit RewardDistributorUpdated(_rewardDistributor);
  }

  /**
   * @notice Returns the address of the rollup contract
   * @return The rollup address
   */
  function getCanonicalRollup() external view override(IRegistry) returns (IHaveVersion) {
    require($.versions.length > 0, Errors.Registry__NoRollupsRegistered());
    return $.versionToRollup[$.versions[$.versions.length - 1]];
  }

  function getRollup(uint256 _version) external view override(IRegistry) returns (IHaveVersion) {
    IHaveVersion rollup = $.versionToRollup[_version];
    require(address(rollup) != address(0), Errors.Registry__RollupNotRegistered(_version));
    return rollup;
  }

  function numberOfVersions() external view override(IRegistry) returns (uint256) {
    return $.versions.length;
  }

  function getVersion(uint256 _index) external view override(IRegistry) returns (uint256) {
    return $.versions[_index];
  }

  /**
   * @notice Returns the address of the governance
   * @return The governance address
   */
  function getGovernance() external view override(IRegistry) returns (address) {
    return this.owner();
  }

  function getRewardDistributor() external view override(IRegistry) returns (IRewardDistributor) {
    return $.rewardDistributor;
  }
}
