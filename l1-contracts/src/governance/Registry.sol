// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IHaveVersion, IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {RewardDistributor, IRewardDistributor} from "./RewardDistributor.sol";

struct RegistryStorage {
  /**
   * @notice Mapping from version to rollup instance
   * @dev As implemented today, the version is a truncated hash of identifiers of the rollup instance
   * See RollupCore.sol for the implementation.
   * @dev updated when a new rollup instance is added, which becomes the new canonical rollup
   */
  mapping(uint256 version => IHaveVersion rollup) versionToRollup;
  /**
   * @dev Historical versions of the canonical rollup. The last element is the current canonical rollup.
   */
  uint256[] versions;
  /**
   * @dev the Registry creates a RewardDistributor in its constructor.
   * It may be updated by the owner.
   */
  IRewardDistributor rewardDistributor;
}

/**
 * @title Registry
 * @author Aztec Labs
 * @notice Keeps track of current and historical canonical rollup instances.
 * @dev The "canonical" rollup currently has additional privileges:
 * - claim block rewards from the RewardDistributor
 * - its block proposers may put forward governance proposals via the GovernanceProposer
 */
contract Registry is IRegistry, Ownable {
  RegistryStorage internal $;

  /**
   * @dev The Owner of the registry is intended to be `Governance`.
   * In this way, only Governance can:
   * - add new rollup instances
   * - update the RewardDistributor
   * In tests, the contracts are deployed with the owner set to the deployer.
   * Then an initial rollup instance is added, which becomes the canonical rollup.
   * Then the owner is updated to Governance.
   */
  constructor(address _owner, IERC20 _rewardAsset) Ownable(_owner) {
    $.rewardDistributor = IRewardDistributor(address(new RewardDistributor(_rewardAsset, IRegistry(address(this)))));
    emit RewardDistributorUpdated(address($.rewardDistributor));
  }

  /**
   * @notice Adds a new rollup instance to the registry, which becomes the new canonical rollup
   * @param _rollup The rollup instance to add
   */
  function addRollup(IHaveVersion _rollup) external override(IRegistry) onlyOwner {
    uint256 version = _rollup.getVersion();
    require(
      address($.versionToRollup[version]) == address(0), Errors.Registry__RollupAlreadyRegistered(address(_rollup))
    );
    $.versionToRollup[version] = _rollup;
    $.versions.push(version);

    emit CanonicalRollupUpdated(address(_rollup), version);
  }

  function updateRewardDistributor(address _rewardDistributor) external override(IRegistry) onlyOwner {
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
    return owner();
  }

  function getRewardDistributor() external view override(IRegistry) returns (IRewardDistributor) {
    return $.rewardDistributor;
  }
}
