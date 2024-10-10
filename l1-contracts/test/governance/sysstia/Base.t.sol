// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {IMintableERC20} from "@aztec/governance/interfaces/IMintableERC20.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {Sysstia} from "@aztec/governance/Sysstia.sol";

import {TestERC20} from "@aztec/mock/TestERC20.sol";

contract SysstiaBase is Test {
  IMintableERC20 internal token;
  Registry internal registry;
  Sysstia internal sysstia;

  function setUp() public {
    token = IMintableERC20(address(new TestERC20()));
    registry = new Registry(address(this));
    sysstia = new Sysstia(token, registry);
  }
}
