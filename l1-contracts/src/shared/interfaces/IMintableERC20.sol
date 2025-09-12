// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";

interface IMintableERC20 is IERC20 {
  event MinterAdded(address indexed minter);
  event MinterRemoved(address indexed minter);

  error NotMinter(address caller);

  function mint(address _to, uint256 _amount) external;
  function addMinter(address _minter) external;
  function removeMinter(address _minter) external;
}
