// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Ownable} from "@oz/access/Ownable.sol";

/**
 * @title Registry
 * @notice Tracks current and historical rollup addresses.
 * @author Aztec Labs
 */
contract Registry is IRegistry, Ownable {
    uint256 public override(IRegistry) numberOfVersions;

    DataStructures.RegistrySnapshot internal currentSnapshot;
    mapping(uint256 => DataStructures.RegistrySnapshot) internal snapshots;
    mapping(address => uint256) internal rollupToVersion;

    /**
     * @notice Constructor to initialize the registry with an "empty" rollup.
     * @param _owner The owner address to set.
     */
    constructor(address _owner) Ownable(_owner) {
        _upgrade(address(0xdead)); // Initialize with a dead rollup to start versioning from 1.
    }

    /**
     * @notice Retrieves the current rollup contract address.
     * @return The rollup address.
     */
    function getRollup() external view override(IRegistry) returns (address) {
        return currentSnapshot.rollup;
    }

    /**
     * @notice Retrieves the version for a given rollup address or reverts if not registered.
     * @param _rollup The address of the rollup contract.
     * @return The version associated with the rollup.
     */
    function getVersionFor(address _rollup) external view override(IRegistry) returns (uint256) {
        (uint256 version, bool exists) = _getVersionFor(_rollup);
        if (!exists) revert Errors.Registry__RollupNotRegistered(_rollup);
        return version;
    }

    /**
     * @notice Checks if a rollup address is registered.
     * @param _rollup The address of the rollup contract.
     * @return True if registered, false otherwise.
     */
    function isRollupRegistered(address _rollup) external view override(IRegistry) returns (bool) {
        (, bool exists) = _getVersionFor(_rollup);
        return exists;
    }

    /**
     * @notice Retrieves a snapshot for a specific version.
     * @param _version The version index of the snapshot.
     * @return The registry snapshot for the given version.
     */
    function getSnapshot(uint256 _version)
        external
        view
        override(IRegistry)
        returns (DataStructures.RegistrySnapshot memory)
    {
        return snapshots[_version];
    }

    /**
     * @notice Retrieves the current snapshot of the registry.
     * @return The current registry snapshot.
     */
    function getCurrentSnapshot()
        external
        view
        override(IRegistry)
        returns (DataStructures.RegistrySnapshot memory)
    {
        return currentSnapshot;
    }

    /**
     * @notice Retrieves the governance contract address (owner).
     * @return The governance address.
     */
    function getGovernance() external view override(IRegistry) returns (address) {
        return owner();
    }

    /**
     * @notice Registers a new rollup and creates a corresponding snapshot.
     * @dev Only callable by the owner. Reverts if the rollup is already registered.
     * @param _rollup The rollup contract address.
     * @return The version of the new snapshot.
     */
    function upgrade(address _rollup) public override(IRegistry) onlyOwner returns (uint256) {
        return _upgrade(_rollup);
    }

    /**
     * @notice Internal function to handle rollup registration and snapshot creation.
     * @param _rollup The rollup contract address.
     * @return The version of the newly created snapshot.
     */
    function _upgrade(address _rollup) internal returns (uint256) {
        (uint256 version, bool exists) = _getVersionFor(_rollup);
        if (exists) revert Errors.Registry__RollupAlreadyRegistered(_rollup);

        uint256 blockNumber = block.number; // Fetch block number once.
        DataStructures.RegistrySnapshot memory newSnapshot = DataStructures.RegistrySnapshot(_rollup, blockNumber);
        currentSnapshot = newSnapshot;

        uint256 newVersion = numberOfVersions++;
        snapshots[newVersion] = newSnapshot;
        rollupToVersion[_rollup] = newVersion;

        emit InstanceAdded(_rollup, newVersion); // Emit event after state updates.

        return newVersion;
    }

    /**
     * @notice Internal function to fetch version information for a rollup.
     * @param _rollup The rollup contract address.
     * @return version The version index of the rollup.
     * @return exists True if the rollup is registered, false otherwise.
     */
    function _getVersionFor(address _rollup) internal view returns (uint256 version, bool exists) {
        version = rollupToVersion[_rollup];
        exists = version > 0 || snapshots[0].rollup == _rollup;
    }
}
