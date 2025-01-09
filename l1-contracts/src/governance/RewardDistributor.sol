// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {IRewardDistributor} from "@aztec/governance/interfaces/IRewardDistributor.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

/**
 * @title RewardDistributor
 * @notice Distributes block rewards to the canonical rollup.
 * @dev This implementation is a placeholder until more nuanced logic is designed.
 */
contract RewardDistributor is IRewardDistributor, Ownable {
    using SafeERC20 for IERC20;

    /**
     * @dev The reward distributed per block.
     * This value is currently arbitrary and should be adjusted as needed.
     */
    uint256 public constant BLOCK_REWARD = 50e18;

    /// @dev The ERC20 asset used for rewards.
    IERC20 public immutable ASSET;

    /// @dev The registry used to determine the canonical rollup.
    IRegistry public registry;

    /**
     * @param _asset The ERC20 token used for rewards.
     * @param _registry The registry contract to fetch the canonical rollup address.
     * @param _owner The owner of the contract.
     */
    constructor(IERC20 _asset, IRegistry _registry, address _owner) Ownable(_owner) {
        ASSET = _asset;
        registry = _registry;
    }

    /**
     * @notice Updates the registry contract.
     * @dev Only callable by the owner.
     * @param _registry The new registry contract address.
     */
    function updateRegistry(IRegistry _registry) external override(IRewardDistributor) onlyOwner {
        registry = _registry;
        emit RegistryUpdated(_registry);
    }

    /**
     * @notice Claims the block reward for the canonical rollup.
     * @dev Only callable by the canonical rollup address.
     * @param _to The address to receive the reward.
     * @return The amount of reward claimed.
     */
    function claim(address _to) external override(IRewardDistributor) returns (uint256) {
        address rollup = canonicalRollup();
        if (msg.sender != rollup) {
            revert Errors.RewardDistributor__InvalidCaller(msg.sender, rollup);
        }

        uint256 balance = ASSET.balanceOf(address(this));
        uint256 reward = balance > BLOCK_REWARD ? BLOCK_REWARD : balance;

        if (reward > 0) {
            ASSET.safeTransfer(_to, reward);
        }

        return reward;
    }

    /**
     * @notice Returns the canonical rollup address from the registry.
     * @return The canonical rollup address.
     */
    function canonicalRollup() public view override(IRewardDistributor) returns (address) {
        return registry.getRollup();
    }
}
