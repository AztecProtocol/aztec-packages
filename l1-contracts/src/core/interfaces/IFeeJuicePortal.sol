// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";

interface IFeeJuicePortal {
  function initialize() external;
  function distributeFees(address _to, uint256 _amount) external;
  function depositToAztecPublic(bytes32 _to, uint256 _amount, bytes32 _secretHash)
    external
    returns (bytes32);
  function underlying() external view returns (IERC20);
}
