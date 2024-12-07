// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IFeeJuicePortal} from "@aztec/core/interfaces/IFeeJuicePortal.sol";
import {IRegistry} from "@aztec/governance/interfaces/IRegistry.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

contract MockFeeJuicePortal is IFeeJuicePortal {
  IERC20 public immutable UNDERLYING;
  bytes32 public constant L2_TOKEN_ADDRESS = bytes32(0);
  IRegistry public constant REGISTRY = IRegistry(address(0));

  constructor() {
    UNDERLYING = new TestERC20("test", "TEST", msg.sender);
  }

  function initialize() external override(IFeeJuicePortal) {}

  function distributeFees(address, uint256) external override(IFeeJuicePortal) {}

  function depositToAztecPublic(bytes32, uint256, bytes32)
    external
    pure
    override(IFeeJuicePortal)
    returns (bytes32, uint256)
  {
    return (bytes32(0), 0);
  }

  function canonicalRollup() external pure override(IFeeJuicePortal) returns (address) {
    return address(0);
  }
}
