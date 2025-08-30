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
 * @notice This contract is responsible for distributing rewards.
 */
contract RewardDistributor is IRewardDistributor {
  using SafeERC20 for IERC20;

  IERC20 public immutable ASSET;
  IRegistry public immutable REGISTRY;

  constructor(IERC20 _asset, IRegistry _registry) {
    ASSET = _asset;
    REGISTRY = _registry;
  }

  function claim(address _to, uint256 _amount) external override(IRewardDistributor) {
    require(msg.sender == canonicalRollup(), Errors.RewardDistributor__InvalidCaller(msg.sender, canonicalRollup()));
    ASSET.safeTransfer(_to, _amount);
  }

  function recover(address _asset, address _to, uint256 _amount) external override(IRewardDistributor) {
    address owner = Ownable(address(REGISTRY)).owner();
    require(msg.sender == owner, Errors.RewardDistributor__InvalidCaller(msg.sender, owner));
    IERC20(_asset).safeTransfer(_to, _amount);
  }

  function canonicalRollup() public view override(IRewardDistributor) returns (address) {
    return address(REGISTRY.getCanonicalRollup());
  }
}
