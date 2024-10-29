// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";

contract MockFeeJuicePortal is IFeeJuicePortal {
  IERC20 public immutable UNDERLYING;
  bytes32 public constant L2_TOKEN_ADDRESS = bytes32(0);
  IRegistry public constant REGISTRY = IRegistry(address(0));

  constructor() {
    UNDERLYING = new TestERC20();
  }

  function initialize() external override {}

  function distributeFees(address, uint256) external override {}

  function depositToAztecPublic(bytes32, uint256, bytes32) external pure override returns (bytes32) {
    return bytes32(0);
  }

  function canonicalRollup() external pure override returns (address) {
    return address(0);
  }
}
