// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.27;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {ISysstia} from "@aztec/governance/interfaces/ISysstia.sol";

import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Ownable} from "@oz/access/Ownable.sol";

contract Sysstia is ISysstia, Ownable {
  using SafeERC20 for IERC20;

  // This value is pulled out my ass. Don't take it seriously
  uint256 public constant BLOCK_REWARD = 50e18;

  IERC20 public immutable ASSET;
  IRegistry public registry;

  constructor(IERC20 _asset, IRegistry _registry, address _owner) Ownable(_owner) {
    ASSET = _asset;
    registry = _registry;
  }

  function updateRegistry(IRegistry _registry) external onlyOwner {
    registry = _registry;
    emit RegistryUpdated(_registry);
  }

  /**
   * @notice	Simple claim of a block reward
   *          Note especially that it can be called any number of times.
   *          Essentially a placeholder until more nuanced logic is designed.
   *
   * @param _to - The address to receive the reward
   *
   * @return - the amount claimed
   */
  function claim(address _to) external override(ISysstia) returns (uint256) {
    require(
      msg.sender == canonicalRollup(), Errors.Sysstia__InvalidCaller(msg.sender, canonicalRollup())
    );
    uint256 bal = ASSET.balanceOf(address(this));
    uint256 reward = bal > BLOCK_REWARD ? BLOCK_REWARD : bal;

    if (reward > 0) {
      ASSET.safeTransfer(_to, reward);
    }

    return reward;
  }

  function canonicalRollup() public view returns (address) {
    return registry.getRollup();
  }
}
