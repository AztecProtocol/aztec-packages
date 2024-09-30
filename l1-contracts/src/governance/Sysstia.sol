// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.27;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeERC20} from "@oz/token/ERC20/utils/SafeERC20.sol";

import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {ISysstia} from "@aztec/governance/interfaces/ISysstia.sol";

import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract Sysstia is ISysstia {
  using SafeERC20 for IERC20;

  // This value is pulled out my ass. Don't take it seriously
  uint256 public constant BLOCK_REWARD = 50e18;

  IERC20 public immutable TST;
  IRegistry public immutable REGISTRY;

  constructor(IERC20 _tst, IRegistry _registry) {
    TST = _tst;
    REGISTRY = _registry;
  }

  /**
   * @notice	Simple claim of a block reward
   *          Note especially that it can be called any number of times.
   *          Essentially a placeholder until more nuanced logic is designed.
   *
   * @dev     Does not check if the tokens are actually available first.
   *
   * @param _to - The address to receive the reward
   *
   * @return - the amount claimed
   */
  function claim(address _to) external override(ISysstia) returns (uint256) {
    address canonical = REGISTRY.getRollup();
    require(msg.sender == canonical, Errors.Sysstia__InvalidCaller(msg.sender, canonical));
    TST.safeTransfer(_to, BLOCK_REWARD);
    return BLOCK_REWARD;
  }
}
