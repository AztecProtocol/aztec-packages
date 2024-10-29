// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";

interface IFeeJuicePortal {
  event DepositToAztecPublic(bytes32 indexed to, uint256 amount, bytes32 secretHash, bytes32 key);
  event FeesDistributed(address indexed to, uint256 amount);

  function initialize() external;
  function distributeFees(address _to, uint256 _amount) external;
  function depositToAztecPublic(bytes32 _to, uint256 _amount, bytes32 _secretHash)
    external
    returns (bytes32);
  function canonicalRollup() external view returns (address);

  function UNDERLYING() external view returns (IERC20);
  function L2_TOKEN_ADDRESS() external view returns (bytes32);
  function REGISTRY() external view returns (IRegistry);
}
